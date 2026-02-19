/* eslint-disable no-var */
/**
 * OpenCV Web Worker — runs document detection in a background thread.
 * The main thread is NEVER blocked, so buttons always respond.
 */

var cvReady = false;
var cv = null;

var Module = {
  onRuntimeInitialized: function () {
    // OpenCV.js sets cv differently depending on environment
    // In a Worker: try self.cv, then Module itself
    cv = self.cv || self.Module || Module;

    if (cv && typeof cv.Mat === 'function') {
      cvReady = true;
      postMessage({ type: 'ready' });
    } else {
      postMessage({ type: 'error', message: 'OpenCV loaded but cv.Mat not found' });
    }
  },
};

try {
  importScripts('https://docs.opencv.org/4.9.0/opencv.js');
  // Some builds set cv synchronously after importScripts
  if (!cvReady && !cv) {
    cv = self.cv || self.Module || Module;
    if (cv && typeof cv.Mat === 'function') {
      cvReady = true;
      postMessage({ type: 'ready' });
    }
  }
} catch (e) {
  postMessage({ type: 'error', message: 'importScripts failed: ' + e.message });
}

onmessage = function (e) {
  if (e.data.type !== 'detect') return;

  if (!cvReady || !cv) {
    postMessage({ type: 'result', detected: false, debug: 'cv not ready' });
    return;
  }

  try {
    var pixels = e.data.pixels;
    var width = e.data.width;
    var height = e.data.height;

    if (!pixels || !pixels.length) {
      postMessage({ type: 'result', detected: false, debug: 'no pixel data received' });
      return;
    }

    var expectedLen = width * height * 4;
    if (pixels.length !== expectedLen) {
      postMessage({ type: 'result', detected: false, debug: 'pixel length mismatch: got ' + pixels.length + ' expected ' + expectedLen });
      return;
    }

    var result = detectAndCrop(pixels, width, height);
    if (result) {
      postMessage(
        { type: 'result', detected: true, pixels: result.pixels, width: result.width, height: result.height, debug: result.debug },
        [result.pixels.buffer]
      );
    } else {
      postMessage({ type: 'result', detected: false, debug: 'no document found' });
    }
  } catch (err) {
    postMessage({ type: 'result', detected: false, debug: 'error: ' + err.message });
  }
};

// ============================================================
// Detection + perspective correction pipeline
// ============================================================

function detectAndCrop(pixels, width, height) {
  var imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  var src = cv.matFromImageData(imageData);

  try {
    var corners = findDocumentCorners(src, width, height);
    if (!corners) return null;
    var corrected = perspectiveCorrect(src, corners.points);
    if (corrected) {
      corrected.debug = 'detected: contours=' + corners.contourCount + ' area=' + Math.round(corners.bestArea);
    }
    return corrected;
  } finally {
    src.delete();
  }
}

function findDocumentCorners(src, width, height) {
  var scale = Math.min(1, 320 / width);
  var sw = Math.round(width * scale);
  var sh = Math.round(height * scale);

  var small = new cv.Mat();
  var gray = new cv.Mat();
  var blurred = new cv.Mat();
  var edges = new cv.Mat();

  try {
    cv.resize(src, small, new cv.Size(sw, sh));
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Try multiple Canny threshold pairs (more tolerant on second pass)
    var thresholds = [
      [50, 150],
      [30, 100],
      [75, 200],
    ];

    var totalContours = 0;

    for (var t = 0; t < thresholds.length; t++) {
      cv.Canny(blurred, edges, thresholds[t][0], thresholds[t][1]);

      var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edges, edges, kernel);
      kernel.delete();

      var contours = new cv.MatVector();
      var hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      var bestContour = null;
      var bestArea = 0;
      var minArea = sw * sh * 0.05; // Lowered to 5% (was 10%)
      totalContours += contours.size();

      for (var i = 0; i < contours.size(); i++) {
        var contour = contours.get(i);
        var area = cv.contourArea(contour);
        if (area < minArea) continue;

        var peri = cv.arcLength(contour, true);
        var approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        if (approx.rows === 4 && area > bestArea) {
          if (bestContour) bestContour.delete();
          bestContour = approx;
          bestArea = area;
        } else {
          approx.delete();
        }
      }

      contours.delete();
      hierarchy.delete();

      if (bestContour) {
        var points = [];
        for (var j = 0; j < 4; j++) {
          points.push({
            x: bestContour.data32S[j * 2] / scale,
            y: bestContour.data32S[j * 2 + 1] / scale,
          });
        }
        bestContour.delete();
        return { points: orderCorners(points), contourCount: totalContours, bestArea: bestArea };
      }
    }

    return null;
  } finally {
    small.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
}

function perspectiveCorrect(src, corners) {
  var widthTop = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y);
  var widthBottom = Math.hypot(corners.bottomRight.x - corners.bottomLeft.x, corners.bottomRight.y - corners.bottomLeft.y);
  var heightLeft = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y);
  var heightRight = Math.hypot(corners.bottomRight.x - corners.topRight.x, corners.bottomRight.y - corners.topRight.y);

  var outW = Math.round(Math.max(widthTop, widthBottom));
  var outH = Math.round(Math.max(heightLeft, heightRight));

  if (outW < 50 || outH < 50) return null;

  var srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.topLeft.x, corners.topLeft.y,
    corners.topRight.x, corners.topRight.y,
    corners.bottomRight.x, corners.bottomRight.y,
    corners.bottomLeft.x, corners.bottomLeft.y,
  ]);

  var dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ]);

  var M = cv.getPerspectiveTransform(srcPts, dstPts);
  var dst = new cv.Mat();

  try {
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));
    var resultPixels = new Uint8ClampedArray(dst.data);
    return { pixels: resultPixels, width: outW, height: outH };
  } finally {
    dst.delete();
    M.delete();
    srcPts.delete();
    dstPts.delete();
  }
}

function orderCorners(points) {
  var bySum = points.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
  var topLeft = bySum[0];
  var bottomRight = bySum[3];

  var byDiff = points.slice().sort(function (a, b) { return (a.x - a.y) - (b.x - b.y); });
  var topRight = byDiff[3];
  var bottomLeft = byDiff[0];

  return { topLeft: topLeft, topRight: topRight, bottomRight: bottomRight, bottomLeft: bottomLeft };
}

/* eslint-disable no-var */
/**
 * OpenCV Web Worker — runs document detection in a background thread.
 * The main thread is NEVER blocked, so buttons always respond.
 *
 * Protocol:
 *   Main → Worker: { type: 'detect', pixels: Uint8ClampedArray, width, height }
 *   Worker → Main: { type: 'ready' }
 *   Worker → Main: { type: 'result', detected: true, pixels, width, height }
 *   Worker → Main: { type: 'result', detected: false }
 */

var cvReady = false;

var Module = {
  onRuntimeInitialized: function () {
    cvReady = true;
    postMessage({ type: 'ready' });
  },
};

try {
  importScripts('https://docs.opencv.org/4.9.0/opencv.js');
} catch (e) {
  postMessage({ type: 'error', message: 'Failed to load OpenCV: ' + e.message });
}

onmessage = function (e) {
  if (e.data.type !== 'detect') return;

  if (!cvReady) {
    postMessage({ type: 'result', detected: false });
    return;
  }

  try {
    var result = detectAndCrop(e.data.pixels, e.data.width, e.data.height);
    if (result) {
      postMessage(
        { type: 'result', detected: true, pixels: result.pixels, width: result.width, height: result.height },
        [result.pixels.buffer]
      );
    } else {
      postMessage({ type: 'result', detected: false });
    }
  } catch (err) {
    postMessage({ type: 'result', detected: false, error: err.message });
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
    return perspectiveCorrect(src, corners);
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
    cv.Canny(blurred, edges, 50, 150);

    var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    var bestContour = null;
    var bestArea = 0;
    var minArea = sw * sh * 0.1;

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

    if (!bestContour) return null;

    var points = [];
    for (var j = 0; j < 4; j++) {
      points.push({
        x: bestContour.data32S[j * 2] / scale,
        y: bestContour.data32S[j * 2 + 1] / scale,
      });
    }
    bestContour.delete();

    return orderCorners(points);
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

  if (outW < 100 || outH < 100) return null;

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

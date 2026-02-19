/* eslint-disable no-var */
/**
 * OpenCV Web Worker — runs document detection in a background thread.
 * The main thread is NEVER blocked, so buttons always respond.
 *
 * Detection strategies (tried in order until one works):
 * 1. Canny edge detection (3 threshold pairs)
 * 2. Adaptive threshold (local contrast)
 * 3. Otsu threshold (global contrast)
 *
 * Each strategy tries multiple approxPolyDP tolerances (2%–6% of perimeter).
 */

var cvReady = false;
var cv = null;

var Module = {
  onRuntimeInitialized: function () {
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
      postMessage({ type: 'result', detected: false, debug: result === null ? 'no quad found' : 'detection failed' });
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
      corrected.debug = corners.debug;
    }
    return corrected;
  } finally {
    src.delete();
  }
}

// ============================================================
// Multi-strategy document corner detection
// ============================================================

function findDocumentCorners(src, width, height) {
  // Work at a reasonable resolution (higher = more accurate, slower)
  var scale = Math.min(1, 640 / Math.max(width, height));
  var sw = Math.round(width * scale);
  var sh = Math.round(height * scale);

  var small = new cv.Mat();
  var gray = new cv.Mat();
  var blurred = new cv.Mat();

  try {
    cv.resize(src, small, new cv.Size(sw, sh));
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    var minArea = sw * sh * 0.04; // 4% of image area
    var debugParts = [];

    // ---- Strategy 1: Canny edge detection (3 threshold pairs) ----
    var cannyThresholds = [
      [50, 150],
      [30, 100],
      [75, 200],
    ];

    for (var ct = 0; ct < cannyThresholds.length; ct++) {
      var edges = new cv.Mat();
      try {
        cv.Canny(blurred, edges, cannyThresholds[ct][0], cannyThresholds[ct][1]);

        // Morphological closing to connect broken edges
        var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, kernel);
        cv.erode(edges, edges, kernel);
        // Extra dilation to fill gaps
        cv.dilate(edges, edges, kernel);
        kernel.delete();

        var result = findBestQuad(edges, minArea, scale);
        if (result) {
          result.debug = 'canny[' + cannyThresholds[ct].join(',') + '] eps=' + result.epsilon + ' area=' + Math.round(result.bestArea) + ' contours=' + result.contourCount;
          return result;
        }
        debugParts.push('canny[' + cannyThresholds[ct].join(',') + ']:' + (result ? '' : 'no quad'));
      } finally {
        edges.delete();
      }
    }

    // ---- Strategy 2: Adaptive threshold (excellent for document on any background) ----
    var adaptiveTypes = [
      { blockSize: 15, C: 5 },
      { blockSize: 25, C: 8 },
      { blockSize: 11, C: 3 },
    ];

    for (var at = 0; at < adaptiveTypes.length; at++) {
      var thresh = new cv.Mat();
      try {
        cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, adaptiveTypes[at].blockSize, adaptiveTypes[at].C);

        var kernel2 = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel2);
        cv.dilate(thresh, thresh, kernel2);
        kernel2.delete();

        var result2 = findBestQuad(thresh, minArea, scale);
        if (result2) {
          result2.debug = 'adaptive[b=' + adaptiveTypes[at].blockSize + ',C=' + adaptiveTypes[at].C + '] eps=' + result2.epsilon + ' area=' + Math.round(result2.bestArea);
          return result2;
        }
        debugParts.push('adapt[' + adaptiveTypes[at].blockSize + ',' + adaptiveTypes[at].C + ']:no quad');
      } finally {
        thresh.delete();
      }
    }

    // ---- Strategy 3: Otsu threshold (global, good for high-contrast documents) ----
    var otsu = new cv.Mat();
    try {
      cv.threshold(blurred, otsu, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

      var kernel3 = cv.Mat.ones(5, 5, cv.CV_8U);
      cv.morphologyEx(otsu, otsu, cv.MORPH_CLOSE, kernel3);
      cv.dilate(otsu, otsu, kernel3);
      kernel3.delete();

      var result3 = findBestQuad(otsu, minArea, scale);
      if (result3) {
        result3.debug = 'otsu eps=' + result3.epsilon + ' area=' + Math.round(result3.bestArea);
        return result3;
      }
      debugParts.push('otsu:no quad');
    } finally {
      otsu.delete();
    }

    // ---- Strategy 4: Strong blur + Canny (for noisy/textured backgrounds) ----
    var heavyBlur = new cv.Mat();
    try {
      cv.GaussianBlur(gray, heavyBlur, new cv.Size(11, 11), 0);
      var edges2 = new cv.Mat();
      try {
        cv.Canny(heavyBlur, edges2, 40, 120);
        var kernel4 = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.dilate(edges2, edges2, kernel4);
        cv.erode(edges2, edges2, kernel4);
        cv.dilate(edges2, edges2, kernel4);
        kernel4.delete();

        var result4 = findBestQuad(edges2, minArea, scale);
        if (result4) {
          result4.debug = 'heavyBlur+canny eps=' + result4.epsilon + ' area=' + Math.round(result4.bestArea);
          return result4;
        }
        debugParts.push('heavyBlur:no quad');
      } finally {
        edges2.delete();
      }
    } finally {
      heavyBlur.delete();
    }

    return null;
  } finally {
    small.delete();
    gray.delete();
    blurred.delete();
  }
}

/**
 * Given a binary/edge image, find the best quadrilateral contour.
 * Tries multiple approxPolyDP epsilon values (2%–6% of perimeter).
 * Returns { points, bestArea, contourCount, epsilon } or null.
 */
function findBestQuad(binaryMat, minArea, scale) {
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();

  try {
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    var count = contours.size();
    if (count === 0) return null;

    // Sort contours by area (largest first), only keep top 10
    var contourInfos = [];
    for (var i = 0; i < count; i++) {
      var contour = contours.get(i);
      var area = cv.contourArea(contour);
      if (area >= minArea) {
        contourInfos.push({ index: i, area: area });
      }
    }
    contourInfos.sort(function (a, b) { return b.area - a.area; });
    if (contourInfos.length > 10) contourInfos = contourInfos.slice(0, 10);

    if (contourInfos.length === 0) return null;

    // Try multiple epsilon values for polygon approximation
    var epsilons = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];

    var bestResult = null;
    var bestArea = 0;
    var bestEps = 0;

    for (var e = 0; e < epsilons.length; e++) {
      for (var ci = 0; ci < contourInfos.length; ci++) {
        var contour2 = contours.get(contourInfos[ci].index);
        var peri = cv.arcLength(contour2, true);
        var approx = new cv.Mat();

        try {
          cv.approxPolyDP(contour2, approx, epsilons[e] * peri, true);

          if (approx.rows === 4 && contourInfos[ci].area > bestArea) {
            // Check that it's convex
            if (!cv.isContourConvex(approx)) {
              continue;
            }

            // Check angles (each should be between 45° and 135°)
            var points = [];
            for (var j = 0; j < 4; j++) {
              points.push({
                x: approx.data32S[j * 2],
                y: approx.data32S[j * 2 + 1],
              });
            }

            if (hasReasonableAngles(points)) {
              bestResult = points.map(function (p) {
                return { x: p.x / scale, y: p.y / scale };
              });
              bestArea = contourInfos[ci].area;
              bestEps = epsilons[e];
            }
          }
        } finally {
          approx.delete();
        }
      }

      // If we found something at this epsilon, no need to try looser ones
      if (bestResult) break;
    }

    if (bestResult) {
      return {
        points: orderCorners(bestResult),
        bestArea: bestArea,
        contourCount: count,
        epsilon: bestEps,
      };
    }

    return null;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Check that all 4 interior angles of the quadrilateral are between 45° and 135°.
 * This filters out non-rectangular shapes.
 */
function hasReasonableAngles(pts) {
  for (var i = 0; i < 4; i++) {
    var p1 = pts[i];
    var p2 = pts[(i + 1) % 4];
    var p3 = pts[(i + 2) % 4];

    var v1x = p1.x - p2.x;
    var v1y = p1.y - p2.y;
    var v2x = p3.x - p2.x;
    var v2y = p3.y - p2.y;

    var dot = v1x * v2x + v1y * v2y;
    var mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    var mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (mag1 < 1 || mag2 < 1) return false;

    var cos = dot / (mag1 * mag2);
    cos = Math.max(-1, Math.min(1, cos));
    var angle = Math.acos(cos) * (180 / Math.PI);

    if (angle < 45 || angle > 135) return false;
  }
  return true;
}

// ============================================================
// Perspective correction
// ============================================================

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
  // Sort by sum (x+y): smallest = topLeft, largest = bottomRight
  var bySum = points.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
  var topLeft = bySum[0];
  var bottomRight = bySum[3];

  // Sort by diff (x-y): largest = topRight, smallest = bottomLeft
  var byDiff = points.slice().sort(function (a, b) { return (a.x - a.y) - (b.x - b.y); });
  var topRight = byDiff[3];
  var bottomLeft = byDiff[0];

  return { topLeft: topLeft, topRight: topRight, bottomRight: bottomRight, bottomLeft: bottomLeft };
}

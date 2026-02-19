/* eslint-disable no-var */
/**
 * OpenCV Web Worker — runs document detection in a background thread.
 * The main thread is NEVER blocked, so buttons always respond.
 *
 * Detection strategies (tried in order until one works):
 * 1. Canny edge detection (3 threshold pairs)
 * 2. Adaptive threshold (local contrast)
 * 3. Otsu threshold (global contrast)
 * 4. Heavy blur + Canny (textured backgrounds)
 *
 * Scoring: instead of picking the LARGEST quad, candidates are scored by:
 * - Proximity to image center (camera points at document)
 * - Size in ideal range (10-75% of image, not the whole table)
 * - Aspect ratio close to paper formats (A4, Letter)
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
      postMessage({ type: 'result', detected: false, debug: 'no pixel data' });
      return;
    }

    var expectedLen = width * height * 4;
    if (pixels.length !== expectedLen) {
      postMessage({ type: 'result', detected: false, debug: 'pixel mismatch' });
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

    var minArea = sw * sh * 0.04;
    var imgCx = sw / 2;
    var imgCy = sh / 2;
    var imgArea = sw * sh;

    // Collect ALL candidate quads from all strategies, then pick the best
    var allCandidates = [];

    // ---- Strategy 1: Canny edge detection ----
    var cannyThresholds = [[50, 150], [30, 100], [75, 200]];
    for (var ct = 0; ct < cannyThresholds.length; ct++) {
      var edges = new cv.Mat();
      try {
        cv.Canny(blurred, edges, cannyThresholds[ct][0], cannyThresholds[ct][1]);
        var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, kernel);
        cv.erode(edges, edges, kernel);
        cv.dilate(edges, edges, kernel);
        kernel.delete();
        collectQuads(edges, minArea, allCandidates, 'canny[' + cannyThresholds[ct].join(',') + ']');
      } finally {
        edges.delete();
      }
    }

    // ---- Strategy 2: Adaptive threshold ----
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
        collectQuads(thresh, minArea, allCandidates, 'adapt[' + adaptiveTypes[at].blockSize + ']');
      } finally {
        thresh.delete();
      }
    }

    // ---- Strategy 3: Otsu threshold ----
    var otsu = new cv.Mat();
    try {
      cv.threshold(blurred, otsu, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      var kernel3 = cv.Mat.ones(5, 5, cv.CV_8U);
      cv.morphologyEx(otsu, otsu, cv.MORPH_CLOSE, kernel3);
      cv.dilate(otsu, otsu, kernel3);
      kernel3.delete();
      collectQuads(otsu, minArea, allCandidates, 'otsu');
    } finally {
      otsu.delete();
    }

    // ---- Strategy 4: Heavy blur + Canny ----
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
        collectQuads(edges2, minArea, allCandidates, 'heavyBlur');
      } finally {
        edges2.delete();
      }
    } finally {
      heavyBlur.delete();
    }

    if (allCandidates.length === 0) return null;

    // ---- Score all candidates and pick the best ----
    var bestCandidate = null;
    var bestScore = -Infinity;

    for (var c = 0; c < allCandidates.length; c++) {
      var cand = allCandidates[c];
      var score = scoreCandidate(cand.points, cand.area, imgCx, imgCy, imgArea);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    if (!bestCandidate) return null;

    // Scale points back to original resolution
    var scaledPoints = bestCandidate.points.map(function (p) {
      return { x: p.x / scale, y: p.y / scale };
    });

    return {
      points: orderCorners(scaledPoints),
      debug: bestCandidate.strategy + ' score=' + Math.round(bestScore) + ' area=' + Math.round(bestCandidate.area / imgArea * 100) + '%',
    };
  } finally {
    small.delete();
    gray.delete();
    blurred.delete();
  }
}

/**
 * Find all valid quadrilaterals in a binary image and add them to candidates array.
 */
function collectQuads(binaryMat, minArea, candidates, strategyName) {
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();

  try {
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    var count = contours.size();
    if (count === 0) return;

    // Get top 15 contours by area
    var contourInfos = [];
    for (var i = 0; i < count; i++) {
      var contour = contours.get(i);
      var area = cv.contourArea(contour);
      if (area >= minArea) {
        contourInfos.push({ index: i, area: area });
      }
    }
    contourInfos.sort(function (a, b) { return b.area - a.area; });
    if (contourInfos.length > 15) contourInfos = contourInfos.slice(0, 15);

    var epsilons = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];

    for (var ci = 0; ci < contourInfos.length; ci++) {
      for (var e = 0; e < epsilons.length; e++) {
        var contour2 = contours.get(contourInfos[ci].index);
        var peri = cv.arcLength(contour2, true);
        var approx = new cv.Mat();

        try {
          cv.approxPolyDP(contour2, approx, epsilons[e] * peri, true);

          if (approx.rows === 4) {
            if (!cv.isContourConvex(approx)) continue;

            var points = [];
            for (var j = 0; j < 4; j++) {
              points.push({
                x: approx.data32S[j * 2],
                y: approx.data32S[j * 2 + 1],
              });
            }

            if (hasReasonableAngles(points)) {
              candidates.push({
                points: points,
                area: contourInfos[ci].area,
                strategy: strategyName + '/eps=' + epsilons[e],
              });
            }
          }
        } finally {
          approx.delete();
        }
      }
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Score a candidate quadrilateral. Higher = better document candidate.
 *
 * Criteria:
 * 1. Center proximity: quad center should be near image center (user aims camera at doc)
 * 2. Size sweet spot: 10-70% of image area is ideal for a document
 * 3. Aspect ratio: close to paper formats (A4 = 1.414, Letter = 1.294)
 */
function scoreCandidate(points, area, imgCx, imgCy, imgArea) {
  var score = 0;

  // --- 1. Center proximity (0-40 points) ---
  // Centroid of the quad
  var cx = 0, cy = 0;
  for (var i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= 4;
  cy /= 4;

  // Distance from image center, normalized to half-diagonal
  var halfDiag = Math.sqrt(imgCx * imgCx + imgCy * imgCy);
  var dist = Math.sqrt((cx - imgCx) * (cx - imgCx) + (cy - imgCy) * (cy - imgCy));
  var centerScore = Math.max(0, 1 - dist / halfDiag) * 40;
  score += centerScore;

  // --- 2. Size sweet spot (0-35 points) ---
  var areaRatio = area / imgArea;
  // Ideal range: 10% to 70%. Peak around 25-45%.
  if (areaRatio >= 0.10 && areaRatio <= 0.70) {
    // Peak score at 35% of image
    var sizeDist = Math.abs(areaRatio - 0.35);
    score += (1 - sizeDist / 0.35) * 35;
  } else if (areaRatio > 0.70) {
    // Penalize very large quads (probably the table/background)
    score += Math.max(0, (1 - (areaRatio - 0.70) / 0.30)) * 10;
  } else {
    // Too small
    score += (areaRatio / 0.10) * 15;
  }

  // --- 3. Aspect ratio close to paper (0-25 points) ---
  var ordered = orderCorners(points);
  var w = Math.max(
    Math.hypot(ordered.topRight.x - ordered.topLeft.x, ordered.topRight.y - ordered.topLeft.y),
    Math.hypot(ordered.bottomRight.x - ordered.bottomLeft.x, ordered.bottomRight.y - ordered.bottomLeft.y)
  );
  var h = Math.max(
    Math.hypot(ordered.bottomLeft.x - ordered.topLeft.x, ordered.bottomLeft.y - ordered.topLeft.y),
    Math.hypot(ordered.bottomRight.x - ordered.topRight.x, ordered.bottomRight.y - ordered.topRight.y)
  );

  if (w > 0 && h > 0) {
    var aspect = Math.max(w, h) / Math.min(w, h); // Always >= 1
    // Common paper: A4=1.414, Letter=1.294, A5=1.414, Legal=1.647
    // Best score at 1.35-1.45, acceptable from 1.0 to 2.0
    var paperTargets = [1.414, 1.294, 1.0]; // A4, Letter, Square
    var bestAspectDist = 999;
    for (var t = 0; t < paperTargets.length; t++) {
      var d = Math.abs(aspect - paperTargets[t]);
      if (d < bestAspectDist) bestAspectDist = d;
    }
    var aspectScore = Math.max(0, 1 - bestAspectDist / 0.8) * 25;
    score += aspectScore;
  }

  return score;
}

/**
 * Check that all 4 interior angles are between 45° and 135°.
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
  var bySum = points.slice().sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
  var topLeft = bySum[0];
  var bottomRight = bySum[3];

  var byDiff = points.slice().sort(function (a, b) { return (a.x - a.y) - (b.x - b.y); });
  var topRight = byDiff[3];
  var bottomLeft = byDiff[0];

  return { topLeft: topLeft, topRight: topRight, bottomRight: bottomRight, bottomLeft: bottomLeft };
}

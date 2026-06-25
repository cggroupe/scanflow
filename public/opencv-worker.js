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

// Prefer a self-hosted /opencv.js (works offline + tighter CSP); fall back to the
// CDN if it isn't present. To self-host, drop opencv.js 4.9.0 into public/.
function loadOpenCv() {
  try {
    importScripts('/opencv.js');
    return true;
  } catch (eLocal) {
    try {
      importScripts('https://docs.opencv.org/4.9.0/opencv.js');
      return true;
    } catch (eCdn) {
      postMessage({ type: 'error', message: 'importScripts failed: ' + eCdn.message });
      return false;
    }
  }
}

if (loadOpenCv() && !cvReady && !cv) {
  cv = self.cv || self.Module || Module;
  if (cv && typeof cv.Mat === 'function') {
    cvReady = true;
    postMessage({ type: 'ready' });
  }
}

onmessage = function (e) {
  var msgType = e.data.type;

  if (msgType !== 'detect' && msgType !== 'detect-live' && msgType !== 'crop-with-corners') return;

  if (!cvReady || !cv) {
    postMessage({ type: msgType === 'detect-live' ? 'live-result' : 'result', detected: false, debug: 'cv not ready' });
    return;
  }

  try {
    var pixels = e.data.pixels;
    var width = e.data.width;
    var height = e.data.height;

    if (!pixels || !pixels.length) {
      postMessage({ type: msgType === 'detect-live' ? 'live-result' : 'result', detected: false, debug: 'no pixel data' });
      return;
    }

    var expectedLen = width * height * 4;
    if (pixels.length !== expectedLen) {
      postMessage({ type: msgType === 'detect-live' ? 'live-result' : 'result', detected: false, debug: 'pixel mismatch' });
      return;
    }

    // ---- detect-live: corners (normalized) + sharpness, with ROI tracking ----
    if (msgType === 'detect-live') {
      var imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
      var src = cv.matFromImageData(imageData);
      try {
        var sharpness = computeSharpness(src);
        var det = detectLiveTracked(src, width, height, e.data.prevQuad || null);
        if (det) {
          postMessage({ type: 'live-result', detected: true, quad: det.quad, sharpness: sharpness, tracked: det.tracked, debug: det.debug });
        } else {
          postMessage({ type: 'live-result', detected: false, sharpness: sharpness });
        }
      } finally {
        src.delete();
      }
      return;
    }

    // ---- detect-corners: one-shot high-res corner detection (no crop) ----
    if (msgType === 'detect-corners') {
      var imageDataC = new ImageData(new Uint8ClampedArray(pixels), width, height);
      var srcC = cv.matFromImageData(imageDataC);
      try {
        var cornersC = findDocumentCorners(srcC, width, height, { live: false, maxDim: 1280 });
        if (cornersC) {
          var quadC = {
            topLeft:     { x: cornersC.points.topLeft.x / width,     y: cornersC.points.topLeft.y / height },
            topRight:    { x: cornersC.points.topRight.x / width,    y: cornersC.points.topRight.y / height },
            bottomRight: { x: cornersC.points.bottomRight.x / width, y: cornersC.points.bottomRight.y / height },
            bottomLeft:  { x: cornersC.points.bottomLeft.x / width,  y: cornersC.points.bottomLeft.y / height },
          };
          postMessage({ type: 'corners-result', detected: true, quad: quadC, debug: cornersC.debug });
        } else {
          postMessage({ type: 'corners-result', detected: false, debug: 'no document found' });
        }
      } finally {
        srcC.delete();
      }
      return;
    }

    // ---- crop-with-corners: perspective correct with given corners ----
    if (msgType === 'crop-with-corners') {
      var cornersInput = e.data.corners; // { topLeft, topRight, bottomRight, bottomLeft } in pixel coords
      var imageData2 = new ImageData(new Uint8ClampedArray(pixels), width, height);
      var src2 = cv.matFromImageData(imageData2);
      try {
        var corrected = perspectiveCorrect(src2, cornersInput);
        if (corrected) {
          postMessage(
            { type: 'result', detected: true, pixels: corrected.pixels, width: corrected.width, height: corrected.height, debug: 'manual-crop' },
            [corrected.pixels.buffer]
          );
        } else {
          postMessage({ type: 'result', detected: false, debug: 'perspective correction failed' });
        }
      } finally {
        src2.delete();
      }
      return;
    }

    // ---- detect: original behavior (detect + perspective correct) ----
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
    postMessage({ type: msgType === 'detect-live' ? 'live-result' : 'result', detected: false, debug: 'error: ' + err.message });
  }
};

// ============================================================
// Detection + perspective correction pipeline
// ============================================================

function detectAndCrop(pixels, width, height) {
  var imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  var src = cv.matFromImageData(imageData);

  try {
    var corners = findDocumentCorners(src, width, height, { live: false, maxDim: 1280 });
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

/**
 * Gradient-magnitude (Sobel) fallback. Amplifies faint borders that Canny misses
 * on low-contrast scenes (white sheet on a light desk), then reuses collectQuads
 * so only valid convex quads are produced.
 */
function collectGradientQuads(grayMat, minArea, candidates, epsilons) {
  var gradX = new cv.Mat();
  var gradY = new cv.Mat();
  var absX = new cv.Mat();
  var absY = new cv.Mat();
  var grad = new cv.Mat();
  var edges = new cv.Mat();
  try {
    cv.Sobel(grayMat, gradX, cv.CV_16S, 1, 0, 3);
    cv.Sobel(grayMat, gradY, cv.CV_16S, 0, 1, 3);
    cv.convertScaleAbs(gradX, absX);
    cv.convertScaleAbs(gradY, absY);
    cv.addWeighted(absX, 0.5, absY, 0.5, 0, grad);
    cv.threshold(grad, edges, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    cv.erode(edges, edges, kernel);
    cv.dilate(edges, edges, kernel);
    kernel.delete();
    collectQuads(edges, minArea, candidates, 'gradient', epsilons);
  } finally {
    gradX.delete();
    gradY.delete();
    absX.delete();
    absY.delete();
    grad.delete();
    edges.delete();
  }
}

// ============================================================
// Engine v2: live tracking + sharpness
// ============================================================

var TRACK_MARGIN = 0.14; // ROI expansion around the previous quad (fraction)

function normQuad(points, width, height) {
  return {
    topLeft:     { x: points.topLeft.x / width,     y: points.topLeft.y / height },
    topRight:    { x: points.topRight.x / width,    y: points.topRight.y / height },
    bottomRight: { x: points.bottomRight.x / width, y: points.bottomRight.y / height },
    bottomLeft:  { x: points.bottomLeft.x / width,  y: points.bottomLeft.y / height },
  };
}

function quadInUnit(q) {
  var ks = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  for (var i = 0; i < ks.length; i++) {
    var p = q[ks[i]];
    if (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02) return false;
  }
  return true;
}

/** Variance of the Laplacian — higher = sharper (lower = motion-blurred). */
function computeSharpness(src) {
  var gray = new cv.Mat();
  var lap = new cv.Mat();
  var mean = new cv.Mat();
  var std = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, std);
    var s = std.doubleAt(0, 0);
    return s * s;
  } catch (e) {
    return 0;
  } finally {
    gray.delete();
    lap.delete();
    mean.delete();
    std.delete();
  }
}

/**
 * Detect the document quad. When a previous quad is known, search only a ROI
 * around it (fast + stable frame-to-frame tracking); otherwise scan the full
 * frame. Always falls back to a full scan if ROI tracking finds nothing valid.
 */
function detectLiveTracked(src, width, height, prevQuad) {
  if (prevQuad) {
    var minx = Math.min(prevQuad.topLeft.x, prevQuad.bottomLeft.x);
    var maxx = Math.max(prevQuad.topRight.x, prevQuad.bottomRight.x);
    var miny = Math.min(prevQuad.topLeft.y, prevQuad.topRight.y);
    var maxy = Math.max(prevQuad.bottomLeft.y, prevQuad.bottomRight.y);
    var ew = (maxx - minx) * TRACK_MARGIN;
    var eh = (maxy - miny) * TRACK_MARGIN;
    var rx = Math.max(0, Math.floor((minx - ew) * width));
    var ry = Math.max(0, Math.floor((miny - eh) * height));
    var rw = Math.min(width - rx, Math.ceil((maxx - minx + 2 * ew) * width));
    var rh = Math.min(height - ry, Math.ceil((maxy - miny + 2 * eh) * height));

    if (rw > 40 && rh > 40 && (rw < width || rh < height)) {
      var roi = src.roi(new cv.Rect(rx, ry, rw, rh));
      try {
        var rc = findDocumentCorners(roi, rw, rh, { live: true });
        if (rc) {
          var mapped = {
            topLeft:     { x: rc.points.topLeft.x + rx,     y: rc.points.topLeft.y + ry },
            topRight:    { x: rc.points.topRight.x + rx,    y: rc.points.topRight.y + ry },
            bottomRight: { x: rc.points.bottomRight.x + rx, y: rc.points.bottomRight.y + ry },
            bottomLeft:  { x: rc.points.bottomLeft.x + rx,  y: rc.points.bottomLeft.y + ry },
          };
          var nq = normQuad(mapped, width, height);
          if (quadInUnit(nq)) {
            return { quad: nq, tracked: true, debug: 'track ' + rc.debug };
          }
        }
      } finally {
        roi.delete();
      }
    }
  }

  var fc = findDocumentCorners(src, width, height, { live: true });
  if (!fc) return null;
  return { quad: normQuad(fc.points, width, height), tracked: false, debug: fc.debug };
}

// ============================================================
// Multi-strategy document corner detection
// ============================================================

function findDocumentCorners(src, width, height, opts) {
  opts = opts || {};
  var live = !!opts.live;
  var maxDim = opts.maxDim || 640; // one-shot capture passes a higher value for sharper corners

  var scale = Math.min(1, maxDim / Math.max(width, height));
  var sw = Math.round(width * scale);
  var sh = Math.round(height * scale);

  var small = new cv.Mat();
  var gray = new cv.Mat();
  var blurred = new cv.Mat();

  try {
    cv.resize(src, small, new cv.Size(sw, sh));
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    var minArea = sw * sh * 0.02;
    var imgCx = sw / 2;
    var imgCy = sh / 2;
    var imgArea = sw * sh;

    // Collect ALL candidate quads from all strategies, then pick the best
    var allCandidates = [];

    // Live mode runs fewer strategies/epsilons and exits early once a strong quad
    // is found — keeps the ~400ms loop cheap on mid-range mobiles (was 9 strategies
    // x 6 epsilons every frame). One-shot capture runs the full pipeline.
    var eps = live ? [0.02, 0.04, 0.06] : [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];
    var EARLY_EXIT = 82;
    var done = false;
    function bestScoreSoFar() {
      var b = -Infinity;
      for (var k = 0; k < allCandidates.length; k++) {
        var s = scoreCandidate(allCandidates[k].points, allCandidates[k].area, imgCx, imgCy, imgArea, sw, sh);
        if (s > b) b = s;
      }
      return b;
    }

    // ---- Strategy 1: Canny edge detection ----
    var cannyThresholds = live ? [[50, 150]] : [[50, 150], [30, 100], [75, 200]];
    for (var ct = 0; ct < cannyThresholds.length; ct++) {
      var edges = new cv.Mat();
      try {
        cv.Canny(blurred, edges, cannyThresholds[ct][0], cannyThresholds[ct][1]);
        var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, kernel);
        cv.erode(edges, edges, kernel);
        cv.dilate(edges, edges, kernel);
        kernel.delete();
        collectQuads(edges, minArea, allCandidates, 'canny[' + cannyThresholds[ct].join(',') + ']', eps);
      } finally {
        edges.delete();
      }
    }
    if (live && bestScoreSoFar() >= EARLY_EXIT) done = true;

    // ---- Strategy 2: Adaptive threshold ----
    if (!done) {
      var adaptiveTypes = live ? [{ blockSize: 15, C: 5 }] : [
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
          collectQuads(thresh, minArea, allCandidates, 'adapt[' + adaptiveTypes[at].blockSize + ']', eps);
        } finally {
          thresh.delete();
        }
      }
      if (live && bestScoreSoFar() >= EARLY_EXIT) done = true;
    }

    // ---- Strategy 3: Otsu threshold ----
    if (!done) {
      var otsu = new cv.Mat();
      try {
        cv.threshold(blurred, otsu, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        var kernel3 = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(otsu, otsu, cv.MORPH_CLOSE, kernel3);
        cv.dilate(otsu, otsu, kernel3);
        kernel3.delete();
        collectQuads(otsu, minArea, allCandidates, 'otsu', eps);
      } finally {
        otsu.delete();
      }
      if (live && bestScoreSoFar() >= EARLY_EXIT) done = true;
    }

    // ---- Strategies 4 & 5: full pipeline only (too costly for the live loop) ----
    if (!live && !done) {
      // Strategy 4: Heavy blur + Canny (textured backgrounds)
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
          collectQuads(edges2, minArea, allCandidates, 'heavyBlur', eps);
        } finally {
          edges2.delete();
        }
      } finally {
        heavyBlur.delete();
      }

      // Strategy 5: Histogram equalization + Canny (uneven lighting)
      var eqHist = new cv.Mat();
      try {
        cv.equalizeHist(gray, eqHist);
        var eqBlurred = new cv.Mat();
        try {
          cv.GaussianBlur(eqHist, eqBlurred, new cv.Size(5, 5), 0);
          var eqEdges = new cv.Mat();
          try {
            cv.Canny(eqBlurred, eqEdges, 50, 150);
            var kernel5 = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.dilate(eqEdges, eqEdges, kernel5);
            cv.erode(eqEdges, eqEdges, kernel5);
            cv.dilate(eqEdges, eqEdges, kernel5);
            kernel5.delete();
            collectQuads(eqEdges, minArea, allCandidates, 'eqHist', eps);
          } finally {
            eqEdges.delete();
          }
        } finally {
          eqBlurred.delete();
        }
      } finally {
        eqHist.delete();
      }
    }

    // ---- Last-resort fallback: gradient-magnitude edges for low-contrast scenes
    //      (white paper on a light desk where Canny finds no border). Reuses
    //      collectQuads, so it can only ADD valid convex quads — runs only when
    //      every other strategy came up empty, so it can't degrade working cases. ----
    if (allCandidates.length === 0) {
      collectGradientQuads(gray, minArea, allCandidates, eps);
    }

    if (allCandidates.length === 0) return null;

    // ---- Score all candidates and pick the best ----
    var bestCandidate = null;
    var bestScore = -Infinity;

    for (var c = 0; c < allCandidates.length; c++) {
      var cand = allCandidates[c];
      var score = scoreCandidate(cand.points, cand.area, imgCx, imgCy, imgArea, sw, sh);
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
function collectQuads(binaryMat, minArea, candidates, strategyName, epsilons) {
  epsilons = epsilons || [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];
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
      contour.delete(); // FIX: every contours.get() allocates a WASM Mat that must be freed
      if (area >= minArea) {
        contourInfos.push({ index: i, area: area });
      }
    }
    contourInfos.sort(function (a, b) { return b.area - a.area; });
    if (contourInfos.length > 15) contourInfos = contourInfos.slice(0, 15);

    for (var ci = 0; ci < contourInfos.length; ci++) {
      // FIX: fetch the contour Mat ONCE per contour (not per epsilon) and free it
      // in finally. Previously contours.get() was called 6x/contour and never freed,
      // leaking ~90 WASM Mats per collectQuads call (9 calls/detection, every ~400ms).
      var contour2 = contours.get(contourInfos[ci].index);
      var peri = cv.arcLength(contour2, true);

      try {
        for (var e = 0; e < epsilons.length; e++) {
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
      } finally {
        contour2.delete();
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
function scoreCandidate(points, area, imgCx, imgCy, imgArea, imgW, imgH) {
  var score = 0;

  // --- 1. Center proximity (0-35 points) ---
  var cx = 0, cy = 0;
  for (var i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= 4;
  cy /= 4;

  var halfDiag = Math.sqrt(imgCx * imgCx + imgCy * imgCy);
  var dist = Math.sqrt((cx - imgCx) * (cx - imgCx) + (cy - imgCy) * (cy - imgCy));
  var centerScore = Math.max(0, 1 - dist / halfDiag) * 35;
  score += centerScore;

  // --- 2. Size sweet spot (0-30 points) ---
  var areaRatio = area / imgArea;
  // Ideal range: 5% to 80%. Peak around 20-40%.
  if (areaRatio >= 0.05 && areaRatio <= 0.80) {
    // Peak score at 25% of image
    var sizeDist = Math.abs(areaRatio - 0.25);
    score += Math.max(0, 1 - sizeDist / 0.55) * 30;
  } else if (areaRatio > 0.80) {
    // Heavy penalty for very large quads (table/background)
    score += Math.max(0, (1 - (areaRatio - 0.80) / 0.20)) * 5;
  } else {
    // Too small
    score += (areaRatio / 0.05) * 10;
  }

  // --- 3. Aspect ratio close to paper (0-20 points) ---
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
    var aspect = Math.max(w, h) / Math.min(w, h);
    var paperTargets = [1.414, 1.294, 1.0, 1.647]; // A4, Letter, Square, Legal
    var bestAspectDist = 999;
    for (var t = 0; t < paperTargets.length; t++) {
      var d2 = Math.abs(aspect - paperTargets[t]);
      if (d2 < bestAspectDist) bestAspectDist = d2;
    }
    var aspectScore = Math.max(0, 1 - bestAspectDist / 0.8) * 20;
    score += aspectScore;
  }

  // --- 4. Edge proximity penalty (-20 points) ---
  // Quads whose corners touch the image edges are likely the table/frame
  if (imgW > 0 && imgH > 0) {
    var edgeMargin = 0.03; // 3% of image
    var xMin = imgW * edgeMargin;
    var yMin = imgH * edgeMargin;
    var xMax = imgW * (1 - edgeMargin);
    var yMax = imgH * (1 - edgeMargin);

    var cornersOnEdge = 0;
    for (var ei = 0; ei < points.length; ei++) {
      if (points[ei].x < xMin || points[ei].x > xMax || points[ei].y < yMin || points[ei].y > yMax) {
        cornersOnEdge++;
      }
    }
    // Penalize: -5 per corner on edge
    score -= cornersOnEdge * 5;

    // Bonus for well-inset quads (all corners > 8% from edge)
    if (cornersOnEdge === 0) {
      var insetMargin = 0.08;
      var allInset = true;
      for (var ii = 0; ii < points.length; ii++) {
        if (points[ii].x < imgW * insetMargin || points[ii].x > imgW * (1 - insetMargin) ||
            points[ii].y < imgH * insetMargin || points[ii].y > imgH * (1 - insetMargin)) {
          allInset = false;
          break;
        }
      }
      if (allInset) score += 15;
    }
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
  // Expand the quad slightly (1.5%) so we don't clip the document edge, clamped to
  // the image bounds so warpPerspective never samples outside (no black border).
  var MARGIN = 0.015;
  var maxX = src.cols - 1;
  var maxY = src.rows - 1;
  var ccx = (corners.topLeft.x + corners.topRight.x + corners.bottomRight.x + corners.bottomLeft.x) / 4;
  var ccy = (corners.topLeft.y + corners.topRight.y + corners.bottomRight.y + corners.bottomLeft.y) / 4;
  function expand(p) {
    return {
      x: Math.max(0, Math.min(maxX, p.x + (p.x - ccx) * MARGIN)),
      y: Math.max(0, Math.min(maxY, p.y + (p.y - ccy) * MARGIN)),
    };
  }
  var tl = expand(corners.topLeft);
  var tr = expand(corners.topRight);
  var br = expand(corners.bottomRight);
  var bl = expand(corners.bottomLeft);

  var widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  var widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  var heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  var heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);

  var outW = Math.round(Math.max(widthTop, widthBottom));
  var outH = Math.round(Math.max(heightLeft, heightRight));

  if (outW < 50 || outH < 50) return null;

  // Snap the aspect ratio to A4 / US-Letter when it's close, so a near-A4 scan
  // comes out cleanly proportioned instead of subtly skewed.
  var longSide = Math.max(outW, outH);
  var shortSide = Math.min(outW, outH);
  var aspect = longSide / shortSide;
  var targets = [1.41421, 1.29412]; // A4, Letter
  for (var ti = 0; ti < targets.length; ti++) {
    if (Math.abs(aspect - targets[ti]) < 0.06) {
      shortSide = Math.round(longSide / targets[ti]);
      break;
    }
  }
  if (outH >= outW) { outH = longSide; outW = shortSide; }
  else { outW = longSide; outH = shortSide; }

  var srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    br.x, br.y,
    bl.x, bl.y,
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
  // Sort the 4 corners clockwise by angle around their centroid, then rotate the
  // list to start at the top-left-most point. Robust to document rotation/skew
  // (the old sum/diff method mislabels corners once the doc is tilted > ~30deg).
  var cx = 0, cy = 0;
  for (var i = 0; i < points.length; i++) { cx += points[i].x; cy += points[i].y; }
  cx /= points.length;
  cy /= points.length;

  var ordered = points.slice().sort(function (a, b) {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });

  var startIdx = 0, minSum = Infinity;
  for (var j = 0; j < ordered.length; j++) {
    var s = ordered[j].x + ordered[j].y;
    if (s < minSum) { minSum = s; startIdx = j; }
  }
  var r = ordered.slice(startIdx).concat(ordered.slice(0, startIdx));

  return { topLeft: r[0], topRight: r[1], bottomRight: r[2], bottomLeft: r[3] };
}

import { useEffect, useState, useCallback } from 'react'
import { loadOpenCV, isOpenCVReady } from '@/lib/opencv-loader'

export interface DocumentCorners {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
}

interface UseDocumentDetectionOptions {
  enabled: boolean
}

/**
 * Hook that loads OpenCV lazily and exposes a one-shot detectAndCrop function.
 *
 * NO real-time detection loop — OpenCV is too heavy for mobile main thread.
 * Instead: always show the A4 guide frame, and at capture time, run OpenCV
 * once to detect document edges and auto-crop with perspective correction.
 */
export function useDocumentDetection({ enabled }: UseDocumentDetectionOptions) {
  const [cvReady, setCvReady] = useState(isOpenCVReady())

  // Load OpenCV LAZILY — only when camera is active, with 2s delay
  useEffect(() => {
    if (!enabled || cvReady) return

    const timer = setTimeout(() => {
      loadOpenCV()
        .then(() => setCvReady(true))
        .catch(() => {}) // silent fail → A4 crop fallback
    }, 2000)

    return () => clearTimeout(timer)
  }, [enabled, cvReady])

  /**
   * Detect document in a video frame and return a perspective-corrected canvas.
   * Returns null if no document found (caller should fall back to A4 crop).
   * Runs synchronously — call only at capture time, not in a loop.
   */
  const detectAndCrop = useCallback(
    (video: HTMLVideoElement): HTMLCanvasElement | null => {
      if (!isOpenCVReady()) return null

      try {
        const corners = detectDocument(video)
        if (!corners) return null
        return applyPerspectiveCorrection(video, corners)
      } catch {
        return null
      }
    },
    [],
  )

  return { cvReady, detectAndCrop }
}

// --- Internal detection pipeline ---

function detectDocument(video: HTMLVideoElement): DocumentCorners | null {
  const cv = window.cv

  // Scale down to 320px wide for fast processing
  const scale = Math.min(1, 320 / video.videoWidth)
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)

  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 50, 150)

    // Dilate to close gaps in edges
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
    cv.dilate(edges, edges, kernel)
    kernel.delete()

    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let bestContour: any = null
    let bestArea = 0
    const minArea = w * h * 0.1

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area < minArea) continue

      const peri = cv.arcLength(contour, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(contour, approx, 0.02 * peri, true)

      if (approx.rows === 4 && area > bestArea) {
        if (bestContour) bestContour.delete()
        bestContour = approx
        bestArea = area
      } else {
        approx.delete()
      }
    }

    contours.delete()
    hierarchy.delete()

    if (!bestContour) return null

    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 4; i++) {
      points.push({
        x: bestContour.data32S[i * 2] / scale,
        y: bestContour.data32S[i * 2 + 1] / scale,
      })
    }
    bestContour.delete()

    return orderCorners(points)
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
  }
}

function orderCorners(points: Array<{ x: number; y: number }>): DocumentCorners {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const topLeft = bySum[0]
  const bottomRight = bySum[3]

  const byDiff = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y))
  const topRight = byDiff[3]
  const bottomLeft = byDiff[0]

  return { topLeft, topRight, bottomRight, bottomLeft }
}

function applyPerspectiveCorrection(
  video: HTMLVideoElement,
  corners: DocumentCorners,
): HTMLCanvasElement {
  const cv = window.cv

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = video.videoWidth
  srcCanvas.height = video.videoHeight
  srcCanvas.getContext('2d')!.drawImage(video, 0, 0)
  const src = cv.imread(srcCanvas)

  const widthTop = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y)
  const widthBottom = Math.hypot(corners.bottomRight.x - corners.bottomLeft.x, corners.bottomRight.y - corners.bottomLeft.y)
  const heightLeft = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y)
  const heightRight = Math.hypot(corners.bottomRight.x - corners.topRight.x, corners.bottomRight.y - corners.topRight.y)

  const outW = Math.round(Math.max(widthTop, widthBottom))
  const outH = Math.round(Math.max(heightLeft, heightRight))

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.topLeft.x, corners.topLeft.y,
    corners.topRight.x, corners.topRight.y,
    corners.bottomRight.x, corners.bottomRight.y,
    corners.bottomLeft.x, corners.bottomLeft.y,
  ])

  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ])

  const M = cv.getPerspectiveTransform(srcPts, dstPts)
  const dst = new cv.Mat()
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH))

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = outW
  outputCanvas.height = outH
  cv.imshow(outputCanvas, dst)

  src.delete()
  dst.delete()
  M.delete()
  srcPts.delete()
  dstPts.delete()

  return outputCanvas
}

import { useRef, useEffect, useState, useCallback } from 'react'

interface UseDocumentDetectionOptions {
  enabled: boolean
}

interface DetectResult {
  canvas: HTMLCanvasElement | null
  debug: string
}

export interface QuadCorners {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
}

// ---- Temporal smoothing of the live quad (anti-jitter / anti-flicker) ----
// Without this the detection frame is redrawn raw every cycle (it trembles) and
// is cleared the instant one frame fails to detect (it flickers). CamScanner's
// signature is a rock-steady frame; this layer reproduces that behaviour.
const EMA_ALPHA = 0.4 // weight of the freshly detected quad in the moving average
const MAX_MISSES = 3 // keep the last quad for N missed cycles before clearing it
const SNAP_DIST = 0.12 // normalized corner jump above which we snap (fast move)

type Point = { x: number; y: number }

function maxCornerDelta(a: QuadCorners, b: QuadCorners): number {
  const corners: [Point, Point][] = [
    [a.topLeft, b.topLeft],
    [a.topRight, b.topRight],
    [a.bottomRight, b.bottomRight],
    [a.bottomLeft, b.bottomLeft],
  ]
  let max = 0
  for (const [p, q] of corners) {
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d > max) max = d
  }
  return max
}

function emaQuad(prev: QuadCorners, next: QuadCorners, alpha: number): QuadCorners {
  const blend = (p: Point, n: Point): Point => ({
    x: p.x * (1 - alpha) + n.x * alpha,
    y: p.y * (1 - alpha) + n.y * alpha,
  })
  return {
    topLeft: blend(prev.topLeft, next.topLeft),
    topRight: blend(prev.topRight, next.topRight),
    bottomRight: blend(prev.bottomRight, next.bottomRight),
    bottomLeft: blend(prev.bottomLeft, next.bottomLeft),
  }
}

/**
 * Hook that runs OpenCV document detection in a Web Worker.
 *
 * The Worker loads OpenCV.js (8MB) in a background thread — the main thread
 * is NEVER blocked, so buttons always respond on mobile.
 *
 * Supports:
 * - detectAndCrop: one-shot detect + perspective correction
 * - startLiveDetection / stopLiveDetection: continuous quad detection (~400ms)
 * - cropCanvasWithCorners: perspective correction with given corner points
 */
export function useDocumentDetection({ enabled }: UseDocumentDetectionOptions) {
  const [cvReady, setCvReady] = useState(false)
  const [liveQuad, setLiveQuad] = useState<QuadCorners | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<((result: DetectResult) => void) | null>(null)
  const pendingCornersRef = useRef<((quad: QuadCorners | null) => void) | null>(null)
  const liveLoopRef = useRef<number | null>(null)
  const liveBusyRef = useRef(false)
  const lastLiveTimeRef = useRef(0)
  const smoothedQuadRef = useRef<QuadCorners | null>(null)
  const missCountRef = useRef(0)
  const sharpnessRef = useRef(0)

  // Spawn worker when camera is active, terminate when not
  useEffect(() => {
    if (!enabled) return

    let terminated = false

    const worker = new Worker('/opencv-worker.js')
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      if (terminated) return

      if (e.data.type === 'ready') {
        setCvReady(true)
      } else if (e.data.type === 'error') {
        console.warn('[OpenCV Worker]', e.data.message)
      } else if (e.data.type === 'live-result') {
        liveBusyRef.current = false
        sharpnessRef.current = typeof e.data.sharpness === 'number' ? e.data.sharpness : 0
        if (e.data.detected && e.data.quad) {
          const detected = e.data.quad as QuadCorners
          const prev = smoothedQuadRef.current
          // First detection or large intentional move → snap so the frame tracks
          // fast repositioning; otherwise blend (EMA) to absorb detector jitter.
          const smoothed =
            !prev || maxCornerDelta(prev, detected) > SNAP_DIST
              ? detected
              : emaQuad(prev, detected, EMA_ALPHA)
          smoothedQuadRef.current = smoothed
          missCountRef.current = 0
          setLiveQuad(smoothed)
        } else if (smoothedQuadRef.current && missCountRef.current < MAX_MISSES) {
          // Missed frame: hold the last quad a few cycles to prevent flicker.
          missCountRef.current += 1
          setLiveQuad(smoothedQuadRef.current)
        } else {
          smoothedQuadRef.current = null
          missCountRef.current = 0
          setLiveQuad(null)
        }
      } else if (e.data.type === 'corners-result') {
        const resolve = pendingCornersRef.current
        if (!resolve) return
        pendingCornersRef.current = null
        resolve(e.data.detected && e.data.quad ? (e.data.quad as QuadCorners) : null)
      } else if (e.data.type === 'result') {
        const resolve = pendingRef.current
        if (!resolve) return
        pendingRef.current = null

        const debug = e.data.debug || ''

        if (e.data.detected && e.data.pixels) {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = e.data.width
            canvas.height = e.data.height
            const ctx = canvas.getContext('2d')!
            const imgData = new ImageData(
              new Uint8ClampedArray(e.data.pixels),
              e.data.width,
              e.data.height,
            )
            ctx.putImageData(imgData, 0, 0)
            resolve({ canvas, debug })
          } catch {
            resolve({ canvas: null, debug: 'canvas reconstruction failed' })
          }
        } else {
          resolve({ canvas: null, debug })
        }
      }
    }

    worker.onerror = (err) => {
      console.warn('[OpenCV Worker error]', err.message)
    }

    return () => {
      terminated = true
      worker.terminate()
      workerRef.current = null
      pendingRef.current = null
      pendingCornersRef.current = null
      liveBusyRef.current = false
      smoothedQuadRef.current = null
      missCountRef.current = 0
      if (liveLoopRef.current) {
        cancelAnimationFrame(liveLoopRef.current)
        liveLoopRef.current = null
      }
      setCvReady(false)
      setLiveQuad(null)
    }
  }, [enabled])

  /**
   * Start continuous live detection on the video element.
   * Sends a downscaled frame to the worker every ~400ms.
   */
  const startLiveDetection = useCallback(
    (videoRef: React.RefObject<HTMLVideoElement | null>) => {
      if (liveLoopRef.current) {
        cancelAnimationFrame(liveLoopRef.current)
        liveLoopRef.current = null
      }

      const THROTTLE_MS = 140 // ~7 fps target; ROI tracking keeps each detection cheap
      const MAX_LIVE_WIDTH = 480

      const loop = () => {
        liveLoopRef.current = requestAnimationFrame(loop)

        const worker = workerRef.current
        const video = videoRef.current
        if (!worker || !cvReady || !video || video.readyState < 2) return

        const now = performance.now()
        if (now - lastLiveTimeRef.current < THROTTLE_MS) return
        lastLiveTimeRef.current = now

        if (liveBusyRef.current) return

        const vw = video.videoWidth
        const vh = video.videoHeight
        if (vw === 0 || vh === 0) return

        const scale = Math.min(1, MAX_LIVE_WIDTH / vw)
        const sw = Math.round(vw * scale)
        const sh = Math.round(vh * scale)

        const canvas = document.createElement('canvas')
        canvas.width = sw
        canvas.height = sh
        canvas.getContext('2d')!.drawImage(video, 0, 0, sw, sh)
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, sw, sh)
        const pixelsCopy = new Uint8ClampedArray(imageData.data)

        liveBusyRef.current = true
        worker.postMessage(
          { type: 'detect-live', pixels: pixelsCopy, width: sw, height: sh, prevQuad: smoothedQuadRef.current },
          [pixelsCopy.buffer],
        )
      }

      liveLoopRef.current = requestAnimationFrame(loop)
    },
    [cvReady],
  )

  const stopLiveDetection = useCallback(() => {
    if (liveLoopRef.current) {
      cancelAnimationFrame(liveLoopRef.current)
      liveLoopRef.current = null
    }
    liveBusyRef.current = false
    smoothedQuadRef.current = null
    missCountRef.current = 0
    setLiveQuad(null)
  }, [])

  /**
   * Send a video frame to the Worker for detection + perspective correction.
   */
  const detectAndCrop = useCallback(
    (video: HTMLVideoElement): Promise<DetectResult> => {
      return new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker || !cvReady) {
          resolve({ canvas: null, debug: 'worker not ready' })
          return
        }

        const w = video.videoWidth
        const h = video.videoHeight
        if (w === 0 || h === 0) {
          resolve({ canvas: null, debug: 'video has no dimensions' })
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, w, h)
        const pixelsCopy = new Uint8ClampedArray(imageData.data)

        pendingRef.current = resolve

        worker.postMessage(
          { type: 'detect', pixels: pixelsCopy, width: w, height: h },
          [pixelsCopy.buffer],
        )

        setTimeout(() => {
          if (pendingRef.current === resolve) {
            pendingRef.current = null
            resolve({ canvas: null, debug: 'timeout (5s)' })
          }
        }, 5000)
      })
    },
    [cvReady],
  )

  /**
   * Perspective-correct a canvas using given corner points (pixel coordinates).
   */
  const cropCanvasWithCorners = useCallback(
    (sourceCanvas: HTMLCanvasElement, corners: QuadCorners): Promise<DetectResult> => {
      return new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker || !cvReady) {
          resolve({ canvas: null, debug: 'worker not ready' })
          return
        }

        const w = sourceCanvas.width
        const h = sourceCanvas.height
        const imageData = sourceCanvas.getContext('2d')!.getImageData(0, 0, w, h)
        const pixelsCopy = new Uint8ClampedArray(imageData.data)

        pendingRef.current = resolve

        worker.postMessage(
          { type: 'crop-with-corners', pixels: pixelsCopy, width: w, height: h, corners },
          [pixelsCopy.buffer],
        )

        setTimeout(() => {
          if (pendingRef.current === resolve) {
            pendingRef.current = null
            resolve({ canvas: null, debug: 'timeout (5s)' })
          }
        }, 5000)
      })
    },
    [cvReady],
  )

  /**
   * One-shot high-resolution corner detection on a captured canvas (no crop).
   * Used at capture time to refine the live (480p) quad into sharper corners.
   * Resolves null if detection fails (caller falls back to the live quad).
   */
  const detectCorners = useCallback(
    (sourceCanvas: HTMLCanvasElement): Promise<QuadCorners | null> => {
      return new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker || !cvReady) { resolve(null); return }

        const w = sourceCanvas.width
        const h = sourceCanvas.height
        const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) { resolve(null); return }
        const imageData = ctx.getImageData(0, 0, w, h)
        const pixelsCopy = new Uint8ClampedArray(imageData.data)

        pendingCornersRef.current = resolve

        worker.postMessage(
          { type: 'detect-corners', pixels: pixelsCopy, width: w, height: h },
          [pixelsCopy.buffer],
        )

        setTimeout(() => {
          if (pendingCornersRef.current === resolve) {
            pendingCornersRef.current = null
            resolve(null)
          }
        }, 4000)
      })
    },
    [cvReady],
  )

  return {
    cvReady,
    liveQuad,
    sharpnessRef,
    detectAndCrop,
    detectCorners,
    cropCanvasWithCorners,
    startLiveDetection,
    stopLiveDetection,
  }
}

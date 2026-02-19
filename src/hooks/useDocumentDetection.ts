import { useRef, useEffect, useState, useCallback } from 'react'

interface UseDocumentDetectionOptions {
  enabled: boolean
}

interface DetectResult {
  canvas: HTMLCanvasElement | null
  debug: string
}

/**
 * Hook that runs OpenCV document detection in a Web Worker.
 *
 * The Worker loads OpenCV.js (8MB) in a background thread — the main thread
 * is NEVER blocked, so buttons always respond on mobile.
 */
export function useDocumentDetection({ enabled }: UseDocumentDetectionOptions) {
  const [cvReady, setCvReady] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<((result: DetectResult) => void) | null>(null)

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
        // OpenCV load failed — log debug but don't crash
        console.warn('[OpenCV Worker]', e.data.message)
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
      setCvReady(false)
    }
  }, [enabled])

  /**
   * Send a video frame to the Worker for detection + perspective correction.
   * Returns { canvas, debug } where canvas is the corrected image (or null).
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

        // Capture video frame NOW (synchronous)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, w, h)

        // Copy pixels before transferring (ensures clean transfer)
        const pixelsCopy = new Uint8ClampedArray(imageData.data)

        pendingRef.current = resolve

        // Send copied pixel data to worker (transfer the copy's buffer)
        worker.postMessage(
          { type: 'detect', pixels: pixelsCopy, width: w, height: h },
          [pixelsCopy.buffer],
        )

        // Safety timeout
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

  return { cvReady, detectAndCrop }
}

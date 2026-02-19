import { useRef, useEffect, useState, useCallback } from 'react'

interface UseDocumentDetectionOptions {
  enabled: boolean
}

/**
 * Hook that runs OpenCV document detection in a Web Worker.
 *
 * The Worker loads OpenCV.js (8MB) in a background thread — the main thread
 * is NEVER blocked, so buttons always respond on mobile.
 *
 * Exposes detectAndCrop(video) which sends a video frame to the Worker,
 * waits for detection + perspective correction, and returns a canvas.
 */
export function useDocumentDetection({ enabled }: UseDocumentDetectionOptions) {
  const [cvReady, setCvReady] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<((canvas: HTMLCanvasElement | null) => void) | null>(null)

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
      } else if (e.data.type === 'result') {
        const resolve = pendingRef.current
        if (!resolve) return
        pendingRef.current = null

        if (e.data.detected && e.data.pixels) {
          // Reconstruct canvas from pixel data returned by worker
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
          resolve(canvas)
        } else {
          resolve(null)
        }
      }
    }

    worker.onerror = () => {
      // OpenCV failed to load — silent fail, A4 crop fallback
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
   * Returns a corrected canvas, or null if no document found.
   * The video frame is captured synchronously, then processing is async in the Worker.
   */
  const detectAndCrop = useCallback(
    (video: HTMLVideoElement): Promise<HTMLCanvasElement | null> => {
      return new Promise((resolve) => {
        const worker = workerRef.current
        if (!worker || !cvReady) {
          resolve(null)
          return
        }

        // Capture video frame NOW (synchronous — before any async gap)
        const w = video.videoWidth
        const h = video.videoHeight
        if (w === 0 || h === 0) {
          resolve(null)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        const imageData = canvas.getContext('2d')!.getImageData(0, 0, w, h)

        // Register callback for when worker responds
        pendingRef.current = resolve

        // Send pixel data to worker (transferable = zero-copy)
        worker.postMessage(
          { type: 'detect', pixels: imageData.data, width: w, height: h },
          [imageData.data.buffer],
        )

        // Safety timeout — if worker doesn't respond in 5s, fall back to A4 crop
        setTimeout(() => {
          if (pendingRef.current === resolve) {
            pendingRef.current = null
            resolve(null)
          }
        }, 5000)
      })
    },
    [cvReady],
  )

  return { cvReady, detectAndCrop }
}

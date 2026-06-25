// Client for the filter worker. Sends pixels off-thread for processing and falls
// back to synchronous processing if the worker is unavailable, errors, or hangs.
import { applyFilter, type Filter, type Adjustments } from '@/lib/imageFilters'

interface WorkerResult { id: number; pixels: ArrayBuffer; width: number; height: number }

let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const pending = new Map<number, (out: WorkerResult) => void>()

function getWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/filter.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResult>) => {
      const resolve = pending.get(e.data.id)
      if (resolve) { pending.delete(e.data.id); resolve(e.data) }
    }
    worker.onerror = () => { workerBroken = true } // next calls use the sync fallback
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** Synchronous filter on the main thread (small previews + fallback). */
export function filterToCanvasSync(source: HTMLCanvasElement, filter: Filter, adj: Adjustments): HTMLCanvasElement {
  const w = source.width, h = source.height
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const img = ctx.getImageData(0, 0, w, h)
  applyFilter(img.data, w, h, filter, adj)
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Off-thread filter (used for full-resolution capture / save). Always resolves. */
export function filterToCanvas(source: HTMLCanvasElement, filter: Filter, adj: Adjustments): Promise<HTMLCanvasElement> {
  const w = source.width, h = source.height
  const srcCtx = source.getContext('2d', { willReadFrequently: true })
  const wk = getWorker()
  if (!wk || !srcCtx) return Promise.resolve(filterToCanvasSync(source, filter, adj))

  const img = srcCtx.getImageData(0, 0, w, h)
  const id = nextId++

  return new Promise((resolve) => {
    let settled = false
    const finish = (canvas: HTMLCanvasElement) => { if (!settled) { settled = true; resolve(canvas) } }

    const timeout = setTimeout(() => {
      pending.delete(id)
      finish(filterToCanvasSync(source, filter, adj))
    }, 6000)

    pending.set(id, (out) => {
      clearTimeout(timeout)
      const canvas = document.createElement('canvas')
      canvas.width = out.width; canvas.height = out.height
      canvas.getContext('2d')!.putImageData(
        new ImageData(new Uint8ClampedArray(out.pixels), out.width, out.height), 0, 0,
      )
      finish(canvas)
    })

    const buf = img.data.buffer
    wk.postMessage({ id, pixels: buf, width: w, height: h, filter, adj }, [buf])
  })
}

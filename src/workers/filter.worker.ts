// Dedicated filter worker: runs the (heavy) Magic Color / grayscale / B&W +
// sharpen pixel pass off the main thread so the UI never freezes on capture.
import { applyFilter, type Filter, type Adjustments } from '@/lib/imageFilters'

interface FilterRequest {
  id: number
  pixels: ArrayBuffer
  width: number
  height: number
  filter: Filter
  adj: Adjustments
}

// Avoid depending on the WebWorker lib types — narrow `self` to what we use.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (msg: unknown, transfer?: Transferable[]) => void
}

ctx.onmessage = (e: MessageEvent) => {
  const { id, pixels, width, height, filter, adj } = e.data as FilterRequest
  const data = new Uint8ClampedArray(pixels)
  applyFilter(data, width, height, filter, adj)
  ctx.postMessage({ id, pixels: data.buffer, width, height }, [data.buffer])
}

// Pure, DOM-free image filters — the single source of truth shared by the main
// thread (preview / fallback) and the filter worker. No canvas/document access
// here so this module can run inside a Web Worker.

export type Filter = 'magicColor' | 'original' | 'grayscale' | 'bw'

export interface Adjustments {
  brightness: number // -60..60
  contrast: number   // -30..100
  sharpness: number  // 0..100
}

export const DEFAULT_ADJ: Adjustments = { brightness: 0, contrast: 0, sharpness: 50 }
export const DEFAULT_FILTER: Filter = 'magicColor'

/** Separable 3-tap box blur on RGB (alpha preserved). Returns a blurred copy. */
function boxBlur3(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(src.length)
  const out = new Uint8ClampedArray(src.length)
  // horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const i0 = x > 0 ? i - 4 : i
      const i2 = x < width - 1 ? i + 4 : i
      tmp[i] = (src[i0] + src[i] + src[i2]) / 3
      tmp[i + 1] = (src[i0 + 1] + src[i + 1] + src[i2 + 1]) / 3
      tmp[i + 2] = (src[i0 + 2] + src[i + 2] + src[i2 + 2]) / 3
      tmp[i + 3] = src[i + 3]
    }
  }
  // vertical pass
  const row = width * 4
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const i0 = y > 0 ? i - row : i
      const i2 = y < height - 1 ? i + row : i
      out[i] = (tmp[i0] + tmp[i] + tmp[i2]) / 3
      out[i + 1] = (tmp[i0 + 1] + tmp[i + 1] + tmp[i2 + 1]) / 3
      out[i + 2] = (tmp[i0 + 2] + tmp[i + 2] + tmp[i2 + 2]) / 3
      out[i + 3] = tmp[i + 3]
    }
  }
  return out
}

/** Unsharp mask (in place). amount 0..1. */
function sharpenInPlace(d: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0) return
  const blurred = boxBlur3(d, width, height)
  const strength = amount * 2
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = Math.max(0, Math.min(255, d[i + c] + Math.round((d[i + c] - blurred[i + c]) * strength)))
    }
  }
}

/**
 * Apply a scan filter to RGBA pixel data IN PLACE.
 * Magic Color = CamScanner-style per-channel percentile stretch + gamma + S-curve
 * + soft white boost; plus grayscale (percentile) and B&W (Otsu) variants.
 */
export function applyFilter(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  filter: Filter,
  adj: Adjustments,
): void {
  if (filter === 'original' && adj.brightness === 0 && adj.contrast === 0 && adj.sharpness === 0) return

  const totalPixels = width * height

  if (filter === 'magicColor') {
    const histR = new Uint32Array(256)
    const histG = new Uint32Array(256)
    const histB = new Uint32Array(256)
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4
      histR[d[idx]]++
      histG[d[idx + 1]]++
      histB[d[idx + 2]]++
    }

    const histPercentile = (hist: Uint32Array, p: number): number => {
      const target = Math.floor(totalPixels * p)
      let sum = 0
      for (let i = 0; i < 256; i++) {
        sum += hist[i]
        if (sum >= target) return i
      }
      return 255
    }

    // Clip 2%–98% (preserves the brightest 2-4% — faint pencil/highlighter survive).
    const lows = [histPercentile(histR, 0.02), histPercentile(histG, 0.02), histPercentile(histB, 0.02)]
    const highs = [histPercentile(histR, 0.98), histPercentile(histG, 0.98), histPercentile(histB, 0.98)]

    const gamma = 0.7
    const builtInContrast = 1.4
    const brightOff = adj.brightness / 200
    const userContPow = adj.contrast !== 0 ? 1 + adj.contrast / 50 : 1

    const luts: Uint8Array[] = []
    for (let ch = 0; ch < 3; ch++) {
      const lut = new Uint8Array(256)
      const lo = lows[ch]
      const range = Math.max(1, highs[ch] - lo)
      for (let v = 0; v < 256; v++) {
        let n = Math.max(0, Math.min(1, (v - lo) / range))
        n = Math.pow(n, gamma)
        n = n < 0.5
          ? 0.5 * Math.pow(2 * n, builtInContrast)
          : 1 - 0.5 * Math.pow(2 * (1 - n), builtInContrast)
        if (n > 0.85) {
          n = 0.85 + (n - 0.85) * 1.4
          n = Math.min(1, n)
        }
        n += brightOff
        n = Math.max(0, Math.min(1, n))
        if (userContPow !== 1) {
          n = n < 0.5
            ? 0.5 * Math.pow(2 * n, userContPow)
            : 1 - 0.5 * Math.pow(2 * (1 - n), userContPow)
        }
        lut[v] = Math.round(Math.max(0, Math.min(1, n)) * 255)
      }
      luts.push(lut)
    }

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4
      d[idx] = luts[0][d[idx]]
      d[idx + 1] = luts[1][d[idx + 1]]
      d[idx + 2] = luts[2][d[idx + 2]]
    }
  } else if (filter === 'original') {
    const brightnessOff = adj.brightness * 0.4
    const contrastPow = 1 + adj.contrast / 100
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = d[i + c] + brightnessOff
        v = Math.max(0, Math.min(1, v / 255))
        if (contrastPow !== 1) {
          v = v < 0.5
            ? 0.5 * Math.pow(2 * v, contrastPow)
            : 1 - 0.5 * Math.pow(2 * (1 - v), contrastPow)
        }
        d[i + c] = Math.round(v * 255)
      }
    }
  } else if (filter === 'grayscale') {
    const step = Math.max(1, Math.floor(totalPixels / 5000)) * 4
    const samples: number[] = []
    for (let i = 0; i < d.length; i += step) {
      samples.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    }
    samples.sort((a, b) => a - b)
    const pLow = samples[Math.floor(samples.length * 0.03)] ?? 0
    const pHigh = samples[Math.floor(samples.length * 0.97)] ?? 255
    const range = Math.max(1, pHigh - pLow)
    for (let i = 0; i < d.length; i += 4) {
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      gray = ((gray - pLow) / range) * 255 + adj.brightness * 0.4
      gray = Math.max(0, Math.min(255, gray))
      d[i] = d[i + 1] = d[i + 2] = Math.round(gray)
    }
  } else if (filter === 'bw') {
    const histogram = new Array(256).fill(0)
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      histogram[gray]++
    }
    let sumAll = 0
    for (let t = 0; t < 256; t++) sumAll += t * histogram[t]
    let sumB = 0, wB = 0, maxVariance = 0, bestThreshold = 128
    for (let t = 0; t < 256; t++) {
      wB += histogram[t]
      if (wB === 0) continue
      const wF = totalPixels - wB
      if (wF === 0) break
      sumB += t * histogram[t]
      const meanB = sumB / wB
      const meanF = (sumAll - sumB) / wF
      const variance = wB * wF * (meanB - meanF) * (meanB - meanF)
      if (variance > maxVariance) {
        maxVariance = variance
        bestThreshold = t
      }
    }
    const threshAdj = bestThreshold - adj.brightness * 0.5
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const val = gray > threshAdj ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = val
    }
  }

  if (adj.sharpness > 0) sharpenInPlace(d, width, height, adj.sharpness / 100)
}

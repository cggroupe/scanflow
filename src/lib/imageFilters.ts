// Pure, DOM-free image filters — the single source of truth shared by the main
// thread (preview / fallback) and the filter worker. No canvas/document access
// here so this module can run inside a Web Worker.
//
// Magic Color v4 = local ILLUMINATION NORMALIZATION (the technique that gives the
// "photocopier" look): estimate the paper background locally, divide the image by
// it so the paper becomes uniformly white WITHOUT washing out content (logos, faint
// text), then a gentle contrast + saturation. Far better than a global histogram
// stretch, which crushed light/colored elements to white.

export type Filter = 'magicColor' | 'original' | 'grayscale' | 'bw'

export interface Adjustments {
  brightness: number // -60..60
  contrast: number   // -30..100
  sharpness: number  // 0..100
}

export const DEFAULT_ADJ: Adjustments = { brightness: 0, contrast: 0, sharpness: 50 }
export const DEFAULT_FILTER: Filter = 'magicColor'

// --- Magic Color tuning (adjust on device) ---
const MC_WHITE_POINT = 0.97 // pixels at >=97% of local paper brightness -> white
const MC_CONTRAST = 1.25    // gentle S-curve to deepen text (1 = none)
const MC_SATURATION = 1.18  // mild vividness boost for colored logos
const GRAY_CONTRAST = 1.12
const BG_CELL_DIV = 18      // background cell size = min(w,h)/BG_CELL_DIV

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

interface Background {
  gw: number
  gh: number
  cell: number
  bgR: Float32Array
  bgG: Float32Array
  bgB: Float32Array
}

/**
 * Estimate the paper illumination as a low-res, per-channel background built from
 * the BRIGHTER pixels of each cell (so dark text/logos don't drag it down), then
 * smoothed. This is the key to even, shadow-free white paper.
 */
function computeBackground(d: Uint8ClampedArray, width: number, height: number): Background {
  const cell = Math.max(10, Math.floor(Math.min(width, height) / BG_CELL_DIV))
  const gw = Math.ceil(width / cell)
  const gh = Math.ceil(height / cell)
  const n = gw * gh

  const sumL = new Float64Array(n)
  const cntL = new Float64Array(n)
  for (let y = 0; y < height; y++) {
    const gy = (y / cell) | 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      sumL[gy * gw + ((x / cell) | 0)] += L
      cntL[gy * gw + ((x / cell) | 0)] += 1
    }
  }
  const meanL = new Float64Array(n)
  for (let g = 0; g < n; g++) meanL[g] = cntL[g] ? sumL[g] / cntL[g] : 255

  const sR = new Float64Array(n), sG = new Float64Array(n), sB = new Float64Array(n), c2 = new Float64Array(n)
  for (let y = 0; y < height; y++) {
    const gy = (y / cell) | 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const g = gy * gw + ((x / cell) | 0)
      if (L >= meanL[g]) { sR[g] += d[i]; sG[g] += d[i + 1]; sB[g] += d[i + 2]; c2[g] += 1 }
    }
  }

  const rawR = new Float32Array(n), rawG = new Float32Array(n), rawB = new Float32Array(n)
  for (let g = 0; g < n; g++) {
    if (c2[g]) { rawR[g] = sR[g] / c2[g]; rawG[g] = sG[g] / c2[g]; rawB[g] = sB[g] / c2[g] }
    else { rawR[g] = 255; rawG[g] = 255; rawB[g] = 255 }
  }

  const smooth = (src: Float32Array): Float32Array => {
    const o = new Float32Array(n)
    for (let yy = 0; yy < gh; yy++) {
      for (let xx = 0; xx < gw; xx++) {
        let s = 0, c = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = yy + dy, nx = xx + dx
            if (ny >= 0 && ny < gh && nx >= 0 && nx < gw) { s += src[ny * gw + nx]; c++ }
          }
        }
        o[yy * gw + xx] = s / c
      }
    }
    return o
  }

  return { gw, gh, cell, bgR: smooth(rawR), bgG: smooth(rawG), bgB: smooth(rawB) }
}

/** Bilinear sample of a background grid at pixel (x, y). */
function sampleBg(grid: Float32Array, gw: number, gh: number, cell: number, x: number, y: number): number {
  const fx = x / cell - 0.5
  const fy = y / cell - 0.5
  const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)))
  const x1 = Math.min(gw - 1, x0 + 1)
  const y1 = Math.min(gh - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  const a = grid[y0 * gw + x0], b = grid[y0 * gw + x1], c = grid[y1 * gw + x0], e = grid[y1 * gw + x1]
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + e * tx * ty
}

/** Map a (pixel / local-paper) ratio to a 0..255 tone with white point + S-curve contrast. */
function tone(ratio: number, contrast: number, brightOff: number): number {
  let n = ratio / MC_WHITE_POINT
  if (n > 1) n = 1
  if (n < 0) n = 0
  n = n < 0.5 ? 0.5 * Math.pow(2 * n, contrast) : 1 - 0.5 * Math.pow(2 * (1 - n), contrast)
  n += brightOff
  return n * 255
}

/** Separable 3-tap box blur on RGB (alpha preserved). Returns a blurred copy. */
function boxBlur3(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(src.length)
  const out = new Uint8ClampedArray(src.length)
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

/** Fill d with illumination-normalized GRAYSCALE (used by grayscale + bw). */
function normalizeToGray(d: Uint8ClampedArray, width: number, height: number, bg: Background, contrast: number, brightOff: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const br = Math.max(40, sampleBg(bg.bgR, bg.gw, bg.gh, bg.cell, x, y))
      const bgc = Math.max(40, sampleBg(bg.bgG, bg.gw, bg.gh, bg.cell, x, y))
      const bb = Math.max(40, sampleBg(bg.bgB, bg.gw, bg.gh, bg.cell, x, y))
      const bgL = 0.299 * br + 0.587 * bgc + 0.114 * bb
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = clamp255(tone(L / bgL, contrast, brightOff))
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
}

/**
 * Apply a scan filter to RGBA pixel data IN PLACE.
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
    const bg = computeBackground(d, width, height)
    const contrast = MC_CONTRAST + (adj.contrast !== 0 ? adj.contrast / 100 : 0)
    const brightOff = adj.brightness / 255
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const br = Math.max(40, sampleBg(bg.bgR, bg.gw, bg.gh, bg.cell, x, y))
        const bgc = Math.max(40, sampleBg(bg.bgG, bg.gw, bg.gh, bg.cell, x, y))
        const bb = Math.max(40, sampleBg(bg.bgB, bg.gw, bg.gh, bg.cell, x, y))
        let r = tone(d[i] / br, contrast, brightOff)
        let g = tone(d[i + 1] / bgc, contrast, brightOff)
        let b = tone(d[i + 2] / bb, contrast, brightOff)
        // Mild saturation boost so colored logos stay vivid.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        r = lum + (r - lum) * MC_SATURATION
        g = lum + (g - lum) * MC_SATURATION
        b = lum + (b - lum) * MC_SATURATION
        d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b)
      }
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
    const bg = computeBackground(d, width, height)
    normalizeToGray(d, width, height, bg, GRAY_CONTRAST + adj.contrast / 100, adj.brightness / 255)
  } else if (filter === 'bw') {
    // Normalize illumination first (removes shadows) then Otsu-threshold for a clean B&W.
    const bg = computeBackground(d, width, height)
    normalizeToGray(d, width, height, bg, 1, 0)
    const histogram = new Array(256).fill(0)
    for (let i = 0; i < d.length; i += 4) histogram[d[i]]++
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
      if (variance > maxVariance) { maxVariance = variance; bestThreshold = t }
    }
    const threshAdj = bestThreshold - adj.brightness * 0.5
    for (let i = 0; i < d.length; i += 4) {
      const val = d[i] > threshAdj ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = val
    }
  }

  if (adj.sharpness > 0) sharpenInPlace(d, width, height, adj.sharpness / 100)
}

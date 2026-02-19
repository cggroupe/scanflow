import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist'
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib'

// --- pdf.js worker setup ---
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.mjs`

/** Helper: convert Uint8Array to Blob (avoids TS strict ArrayBuffer issues). */
function toBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  const copy = new Uint8Array(bytes)
  return new Blob([copy], { type })
}

export { toBlob }

// ---------------------------------------------------------------------------
// Rendering helpers (pdfjs-dist)
// ---------------------------------------------------------------------------

/** Render the first page of a PDF as a data-URL thumbnail. */
export async function generatePdfThumbnail(file: File, width = 200): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const page = await pdf.getPage(1)
  const unscaled = page.getViewport({ scale: 1 })
  const scale = width / unscaled.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
  const url = canvas.toDataURL('image/jpeg', 0.75)
  pdf.destroy()
  return url
}

/** Render a specific page of a PDF at the given width. Returns canvas. */
export async function renderPdfPage(file: File, pageNum: number, width: number): Promise<HTMLCanvasElement> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const page = await pdf.getPage(pageNum)
  const unscaled = page.getViewport({ scale: 1 })
  const scale = width / unscaled.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
  pdf.destroy()
  return canvas
}

/** Get total number of pages. */
export async function getPdfPageCount(file: File): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const n = pdf.numPages
  pdf.destroy()
  return n
}

/** Get page dimensions (in PDF points) for each page. */
export async function getPdfPageSizes(file: File): Promise<Array<{ width: number; height: number }>> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  return src.getPages().map((p) => p.getSize())
}

// ---------------------------------------------------------------------------
// PDF manipulation helpers (pdf-lib)
// ---------------------------------------------------------------------------

/** Merge multiple PDFs into one. */
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const file of files) {
    const src = await PDFDocument.load(await file.arrayBuffer())
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  return merged.save()
}

/** Split a PDF into individual single-page PDFs. */
export async function splitPdf(file: File): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  const results: Uint8Array[] = []
  for (let i = 0; i < src.getPageCount(); i++) {
    const doc = await PDFDocument.create()
    const [page] = await doc.copyPages(src, [i])
    doc.addPage(page)
    results.push(await doc.save())
  }
  return results
}

/** Split a PDF into groups of pages. groups is an array of 0-based index arrays. */
export async function splitPdfByGroups(file: File, groups: number[][]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  const results: Uint8Array[] = []
  for (const group of groups) {
    const doc = await PDFDocument.create()
    const pages = await doc.copyPages(src, group)
    pages.forEach((p) => doc.addPage(p))
    results.push(await doc.save())
  }
  return results
}

/** Rotate every page by the given angle (90, 180, 270). */
export async function rotatePdf(file: File, angle: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  pdf.getPages().forEach((p) => p.setRotation(degrees(p.getRotation().angle + angle)))
  return pdf.save()
}

/** Remove pages at the given 0-based indices. */
export async function deletePages(file: File, indices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  const keep = src.getPageIndices().filter((i) => !indices.includes(i))
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(src, keep)
  pages.forEach((p) => doc.addPage(p))
  return doc.save()
}

/** Extract only the pages at the given 0-based indices. */
export async function extractPages(file: File, indices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(src, indices)
  pages.forEach((p) => doc.addPage(p))
  return doc.save()
}

/** Re-save the PDF with object streams (basic compression). */
export async function compressPdf(file: File): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  return pdf.save({ useObjectStreams: true })
}

/** Convert images (JPEG / PNG / WebP) into a single PDF. */
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const file of files) {
    const buf = await file.arrayBuffer()
    let image
    if (file.type === 'image/jpeg') {
      image = await pdf.embedJpg(buf)
    } else if (file.type === 'image/png') {
      image = await pdf.embedPng(buf)
    } else {
      const bitmap = await createImageBitmap(new Blob([buf], { type: file.type }))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
      const pngBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      image = await pdf.embedPng(await pngBlob.arrayBuffer())
    }
    const page = pdf.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  return pdf.save()
}

/** Render every page of a PDF as JPEG blobs. */
export async function pdfToImages(file: File): Promise<Blob[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const blobs: Blob[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92))
    blobs.push(blob)
  }
  pdf.destroy()
  return blobs
}

/** Add page numbers (centered at the bottom of each page). */
export async function addPageNumbers(file: File): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()
  pages.forEach((page, i) => {
    const { width } = page.getSize()
    const text = `${i + 1} / ${pages.length}`
    const tw = font.widthOfTextAtSize(text, 10)
    page.drawText(text, { x: (width - tw) / 2, y: 20, size: 10, font, color: rgb(0.5, 0.5, 0.5) })
  })
  return pdf.save()
}

/** Add a diagonal text watermark to every page. */
export async function addWatermark(file: File, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.HelveticaBold)
  pdf.getPages().forEach((page) => {
    const { width, height } = page.getSize()
    const fontSize = Math.min(width, height) * 0.08
    const tw = font.widthOfTextAtSize(text, fontSize)
    page.drawText(text, {
      x: (width - tw) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(0.75, 0.75, 0.75),
      opacity: 0.35,
      rotate: degrees(45),
    })
  })
  return pdf.save()
}

/** Remove restrictions from a PDF (owner-password only). */
export async function unlockPdf(file: File): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
  return pdf.save()
}

/** Reorder pages. newOrder is an array of 0-based indices. */
export async function reorderPages(file: File, newOrder: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(await file.arrayBuffer())
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(src, newOrder)
  pages.forEach((p) => doc.addPage(p))
  return doc.save()
}

/** Crop all pages to the given rectangle (in PDF points). */
export async function cropPdf(
  file: File,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  pdf.getPages().forEach((page) => {
    page.setCropBox(rect.x, rect.y, rect.width, rect.height)
  })
  return pdf.save()
}

/** Embed a PNG signature image on a specific page. */
export async function addSignatureToPdf(
  file: File,
  signaturePng: ArrayBuffer,
  pageIndex: number,
  pos: { x: number; y: number; width: number; height: number },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const image = await pdf.embedPng(signaturePng)
  const page = pdf.getPages()[pageIndex]
  page.drawImage(image, { x: pos.x, y: pos.y, width: pos.width, height: pos.height })
  return pdf.save()
}

/** Apply text and drawing annotations to a PDF. */
export interface TextAnnotation {
  type: 'text'
  pageIndex: number
  x: number // PDF coords (from left)
  y: number // PDF coords (from bottom)
  text: string
  fontSize: number
  color: { r: number; g: number; b: number }
}

export interface DrawAnnotation {
  type: 'draw'
  pageIndex: number
  points: Array<{ x: number; y: number }> // PDF coords
  color: { r: number; g: number; b: number }
  lineWidth: number
}

export type Annotation = TextAnnotation | DrawAnnotation

export async function applyAnnotations(file: File, annotations: Annotation[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()

  for (const ann of annotations) {
    const page = pages[ann.pageIndex]
    if (!page) continue

    if (ann.type === 'text') {
      page.drawText(ann.text, {
        x: ann.x,
        y: ann.y,
        size: ann.fontSize,
        font,
        color: rgb(ann.color.r, ann.color.g, ann.color.b),
      })
    } else if (ann.type === 'draw' && ann.points.length >= 2) {
      for (let i = 1; i < ann.points.length; i++) {
        page.drawLine({
          start: { x: ann.points[i - 1].x, y: ann.points[i - 1].y },
          end: { x: ann.points[i].x, y: ann.points[i].y },
          thickness: ann.lineWidth,
          color: rgb(ann.color.r, ann.color.g, ann.color.b),
        })
      }
    }
  }

  return pdf.save()
}

// ---------------------------------------------------------------------------
// Multi-signature with metadata (timestamp, location)
// ---------------------------------------------------------------------------

export interface SignaturePlacement {
  imageBuffer: ArrayBuffer
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  metadataText?: string
}

export async function addSignaturesWithMetadata(
  file: File,
  signatures: SignaturePlacement[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  for (const sig of signatures) {
    const image = await pdf.embedPng(new Uint8Array(sig.imageBuffer))
    const page = pdf.getPages()[sig.pageIndex]
    if (!page) continue
    page.drawImage(image, { x: sig.x, y: sig.y, width: sig.width, height: sig.height })

    if (sig.metadataText) {
      const lines = sig.metadataText.split('\n')
      let textY = sig.y - 9
      for (const line of lines) {
        page.drawText(line, {
          x: sig.x,
          y: textY,
          size: 6.5,
          font,
          color: rgb(0.4, 0.4, 0.4),
        })
        textY -= 8
      }
    }
  }

  return pdf.save()
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

export function parsePageRanges(input: string, pageCount: number): number[] {
  const indices = new Set<number>()
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
    if (match) {
      const start = Math.max(1, parseInt(match[1]))
      const end = Math.min(pageCount, parseInt(match[2]))
      for (let i = start; i <= end; i++) indices.add(i - 1)
    } else {
      const n = parseInt(trimmed)
      if (n >= 1 && n <= pageCount) indices.add(n - 1)
    }
  }
  return Array.from(indices).sort((a, b) => a - b)
}

/** Parse semicolon-separated page groups "1-2;3-4" into arrays of 0-based indices. */
export function parsePageGroups(input: string, pageCount: number): number[][] {
  return input
    .split(';')
    .map((g) => parsePageRanges(g, pageCount))
    .filter((g) => g.length > 0)
}

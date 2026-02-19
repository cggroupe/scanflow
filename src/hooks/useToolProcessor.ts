import { useState, useCallback } from 'react'
import {
  mergePdfs,
  splitPdfByGroups,
  rotatePdf,
  deletePages,
  extractPages,
  compressPdf,
  imagesToPdf,
  pdfToImages,
  addPageNumbers,
  addWatermark,
  unlockPdf,
  parsePageRanges,
  parsePageGroups,
  getPdfPageCount,
  toBlob,
} from '@/lib/pdf'

export type ProcessingState = 'idle' | 'processing' | 'done' | 'error'

export interface SingleResult {
  type: 'single'
  blob: Blob
  fileName: string
  originalSize: number
}

export interface MultiResult {
  type: 'multi'
  files: Array<{ blob: Blob; fileName: string }>
  originalSize: number
}

export type ProcessingResult = SingleResult | MultiResult

interface ToolOptions {
  rotateAngle?: number
  pageRanges?: string
  watermarkText?: string
  splitPagesPerGroup?: number
  splitCustomGroups?: string
}

/** Set of tool IDs that can be processed client-side. */
export const supportedTools = new Set([
  'merge', 'split', 'rotate', 'delete-pages', 'extract-pages',
  'compress', 'jpg-to-pdf', 'pdf-to-jpg', 'page-numbers', 'watermark', 'unlock',
])

/** Tools routed to dedicated pages (not handled by generic ToolPage). */
export const dedicatedTools = new Set(['sign', 'crop', 'edit', 'organize'])

/** Tools that need multiple file input. */
export const multiFileTools = new Set(['merge', 'jpg-to-pdf'])

/** Tools that accept images instead of PDFs. */
export const imageInputTools = new Set(['jpg-to-pdf'])

/** Tools that require an options field. */
export const toolsWithOptions = new Set([
  'rotate', 'delete-pages', 'extract-pages', 'watermark', 'split',
])

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

export function useToolProcessor() {
  const [state, setState] = useState<ProcessingState>('idle')
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setResult(null)
    setError(null)
  }, [])

  const process = useCallback(async (toolId: string, files: File[], options: ToolOptions = {}) => {
    setState('processing')
    setError(null)
    setResult(null)

    try {
      const file = files[0]
      const originalSize = files.reduce((sum, f) => sum + f.size, 0)
      let bytes: Uint8Array

      switch (toolId) {
        case 'merge':
          bytes = await mergePdfs(files)
          break

        case 'split': {
          const pageCount = await getPdfPageCount(file)
          const name = baseName(file.name)
          let groups: number[][]

          if (options.splitCustomGroups) {
            groups = parsePageGroups(options.splitCustomGroups, pageCount)
          } else {
            const perGroup = options.splitPagesPerGroup ?? 1
            groups = []
            for (let i = 0; i < pageCount; i += perGroup) {
              const group: number[] = []
              for (let j = i; j < Math.min(i + perGroup, pageCount); j++) group.push(j)
              groups.push(group)
            }
          }

          if (groups.length === 0) throw new Error('No page groups defined')

          const pdfs = await splitPdfByGroups(file, groups)
          setState('done')
          setResult({
            type: 'multi',
            files: pdfs.map((p, i) => ({
              blob: toBlob(p),
              fileName: `${name}_part_${i + 1}.pdf`,
            })),
            originalSize,
          })
          return
        }

        case 'rotate':
          bytes = await rotatePdf(file, options.rotateAngle ?? 90)
          break

        case 'delete-pages': {
          const pageCount = await getPdfPageCount(file)
          const indices = parsePageRanges(options.pageRanges ?? '', pageCount)
          if (indices.length === 0) throw new Error('No pages selected')
          bytes = await deletePages(file, indices)
          break
        }

        case 'extract-pages': {
          const pc = await getPdfPageCount(file)
          const idx = parsePageRanges(options.pageRanges ?? '', pc)
          if (idx.length === 0) throw new Error('No pages selected')
          bytes = await extractPages(file, idx)
          break
        }

        case 'compress':
          bytes = await compressPdf(file)
          break

        case 'jpg-to-pdf':
          bytes = await imagesToPdf(files)
          break

        case 'pdf-to-jpg': {
          const blobs = await pdfToImages(file)
          const name = baseName(file.name)
          setState('done')
          setResult({
            type: 'multi',
            files: blobs.map((b, i) => ({
              blob: b,
              fileName: `${name}_page_${i + 1}.jpg`,
            })),
            originalSize,
          })
          return
        }

        case 'page-numbers':
          bytes = await addPageNumbers(file)
          break

        case 'watermark':
          bytes = await addWatermark(file, options.watermarkText ?? 'WATERMARK')
          break

        case 'unlock':
          bytes = await unlockPdf(file)
          break

        default:
          throw new Error(`Unsupported tool: ${toolId}`)
      }

      const suffixMap: Record<string, string> = {
        merge: 'merged', rotate: 'rotated', 'delete-pages': 'pages-removed',
        'extract-pages': 'extracted', compress: 'compressed', 'jpg-to-pdf': 'images',
        'page-numbers': 'numbered', watermark: 'watermarked', unlock: 'unlocked',
      }
      const suffix = suffixMap[toolId] ?? 'processed'
      const outName = toolId === 'merge' || toolId === 'jpg-to-pdf'
        ? `${suffix}.pdf`
        : `${baseName(file.name)}_${suffix}.pdf`

      setState('done')
      setResult({ type: 'single', blob: toBlob(bytes), fileName: outName, originalSize })
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Processing failed')
    }
  }, [])

  return { state, result, error, process, reset }
}

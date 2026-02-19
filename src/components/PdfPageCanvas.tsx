import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { renderPdfPage } from '@/lib/pdf'

interface PdfPageCanvasProps {
  readonly file: File
  readonly pageNum: number
  readonly width?: number
  readonly className?: string
  readonly onLoad?: (dimensions: { width: number; height: number }) => void
}

export interface PdfPageCanvasHandle {
  canvas: HTMLCanvasElement | null
}

const PdfPageCanvas = forwardRef<PdfPageCanvasHandle, PdfPageCanvasProps>(
  function PdfPageCanvas({ file, pageNum, width = 350, className = '', onLoad }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [dataUrl, setDataUrl] = useState<string | null>(null)
    const [dims, setDims] = useState<{ width: number; height: number } | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useImperativeHandle(ref, () => ({ canvas: canvasRef.current }))

    useEffect(() => {
      let cancelled = false
      renderPdfPage(file, pageNum, width).then((canvas) => {
        if (cancelled) return
        canvasRef.current = canvas
        setDataUrl(canvas.toDataURL('image/jpeg', 0.9))
        const d = { width: canvas.width, height: canvas.height }
        setDims(d)
        onLoad?.(d)
      })
      return () => { cancelled = true }
    }, [file, pageNum, width, onLoad])

    if (!dataUrl || !dims) {
      return (
        <div className={`flex items-center justify-center bg-gray-100 ${className}`} style={{ width, height: width * 1.4 }}>
          <span className="material-symbols-outlined animate-spin text-gray-400">progress_activity</span>
        </div>
      )
    }

    return (
      <div ref={containerRef} className={className}>
        <img src={dataUrl} alt={`Page ${pageNum}`} width={dims.width} height={dims.height} className="w-full" />
      </div>
    )
  },
)

export default PdfPageCanvas

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import FileUploader from '@/components/FileUploader/FileUploader'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import { renderPdfPage, getPdfPageSizes, cropPdf, toBlob } from '@/lib/pdf'

type Phase = 'upload' | 'crop' | 'processing' | 'done' | 'error'

export default function CropPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('upload')
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageImg, setPageImg] = useState<HTMLCanvasElement | null>(null)
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([])

  // Crop rect in normalized coords (0..1)
  const [crop, setCrop] = useState({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 })
  const dragging = useRef<string | null>(null)

  const handleFilesChange = useCallback((f: File[]) => setFiles(f), [])

  async function goToCrop() {
    if (files.length === 0) return
    const sizes = await getPdfPageSizes(files[0])
    setPageSizes(sizes)
    const rendered = await renderPdfPage(files[0], 1, 350)
    setPageImg(rendered)
    setCrop({ left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 })
    setPhase('crop')
  }

  // Draw the page + crop overlay
  useEffect(() => {
    if (!pageImg || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = pageImg.width
    canvas.height = pageImg.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(pageImg, 0, 0)

    // Darken outside crop area
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    const cl = crop.left * canvas.width
    const ct = crop.top * canvas.height
    const cr = crop.right * canvas.width
    const cb = crop.bottom * canvas.height
    ctx.fillRect(0, 0, canvas.width, ct) // top
    ctx.fillRect(0, cb, canvas.width, canvas.height - cb) // bottom
    ctx.fillRect(0, ct, cl, cb - ct) // left
    ctx.fillRect(cr, ct, canvas.width - cr, cb - ct) // right

    // Crop border
    ctx.strokeStyle = '#2db9ad'
    ctx.lineWidth = 2
    ctx.strokeRect(cl, ct, cr - cl, cb - ct)

    // Corner handles
    const handleSize = 10
    ctx.fillStyle = '#2db9ad'
    for (const [x, y] of [[cl, ct], [cr, ct], [cl, cb], [cr, cb]]) {
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize)
    }
  }, [pageImg, crop])

  function getPointerNorm(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    const p = getPointerNorm(e)
    const threshold = 0.04

    // Check which handle is closest
    if (Math.abs(p.x - crop.left) < threshold && Math.abs(p.y - crop.top) < threshold) dragging.current = 'tl'
    else if (Math.abs(p.x - crop.right) < threshold && Math.abs(p.y - crop.top) < threshold) dragging.current = 'tr'
    else if (Math.abs(p.x - crop.left) < threshold && Math.abs(p.y - crop.bottom) < threshold) dragging.current = 'bl'
    else if (Math.abs(p.x - crop.right) < threshold && Math.abs(p.y - crop.bottom) < threshold) dragging.current = 'br'
    else if (p.x > crop.left && p.x < crop.right && p.y > crop.top && p.y < crop.bottom) dragging.current = 'move'
    else dragging.current = null
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    const p = getPointerNorm(e)
    setCrop((prev) => {
      const next = { ...prev }
      switch (dragging.current) {
        case 'tl': next.left = Math.min(p.x, prev.right - 0.05); next.top = Math.min(p.y, prev.bottom - 0.05); break
        case 'tr': next.right = Math.max(p.x, prev.left + 0.05); next.top = Math.min(p.y, prev.bottom - 0.05); break
        case 'bl': next.left = Math.min(p.x, prev.right - 0.05); next.bottom = Math.max(p.y, prev.top + 0.05); break
        case 'br': next.right = Math.max(p.x, prev.left + 0.05); next.bottom = Math.max(p.y, prev.top + 0.05); break
        case 'move': {
          const w = prev.right - prev.left
          const h = prev.bottom - prev.top
          const dx = p.x - (prev.left + w / 2)
          const dy = p.y - (prev.top + h / 2)
          next.left = Math.max(0, Math.min(1 - w, prev.left + dx))
          next.top = Math.max(0, Math.min(1 - h, prev.top + dy))
          next.right = next.left + w
          next.bottom = next.top + h
          break
        }
      }
      return next
    })
  }

  function onPointerUp() { dragging.current = null }

  async function handleApply() {
    if (files.length === 0 || pageSizes.length === 0) return
    setPhase('processing')
    setError(null)
    try {
      const size = pageSizes[0]
      const rect = {
        x: crop.left * size.width,
        y: (1 - crop.bottom) * size.height,
        width: (crop.right - crop.left) * size.width,
        height: (crop.bottom - crop.top) * size.height,
      }
      const bytes = await cropPdf(files[0], rect)
      setResultBlob(toBlob(bytes))
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setPhase('error')
    }
  }

  function handleReset() {
    setPhase('upload')
    setFiles([])
    setResultBlob(null)
  }

  const header = (
    <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
      <div className="flex items-center gap-3">
        {phase === 'upload' ? (
          <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
        ) : (
          <button onClick={() => setPhase('upload')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </button>
        )}
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.crop')}</h1>
      </div>
    </header>
  )

  if (phase === 'done' && resultBlob) {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        {header}
        <div className="flex-1 px-4 pb-24 pt-4">
          <ResultScreen fileName="cropped.pdf" originalSize={files[0]?.size ?? 0} resultSize={resultBlob.size} resultBlob={resultBlob} onViewInLibrary={() => navigate('/documents')} />
          <button onClick={handleReset} className="mt-4 w-full rounded-lg border border-gray-300 py-3 font-medium text-text-primary">{t('resultScreen.processAnother')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {header}
      <div className="flex-1 px-4 pb-24">
        {phase === 'upload' && (
          <>
            <div className="mt-4">
              <FileUploader accept={['application/pdf']} maxSizeBytes={100 * 1024 * 1024} maxFiles={1} onFilesChange={handleFilesChange} />
            </div>
            <button onClick={goToCrop} disabled={files.length === 0} className="mt-6 w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md disabled:opacity-50">
              {t('cropPage.startCrop')}
            </button>
          </>
        )}

        {phase === 'crop' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-text-secondary">{t('cropPage.dragCorners')}</p>
            <div className="mx-auto w-fit overflow-hidden rounded-lg shadow-md">
              <canvas
                ref={canvasRef}
                className="w-full max-w-[350px] touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
            <button onClick={handleApply} className="w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md">
              {t('cropPage.apply')}
            </button>
          </div>
        )}

        {phase === 'processing' && (
          <div className="mt-16 flex flex-col items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p className="text-sm text-text-secondary">{t('toolPage.processing')}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
            <button onClick={() => setPhase('crop')} className="w-full rounded-lg border py-3 font-medium">{t('common.retry')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import FileUploader from '@/components/FileUploader/FileUploader'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import {
  renderPdfPage,
  getPdfPageCount,
  getPdfPageSizes,
  applyAnnotations,
  toBlob,
  type Annotation,
} from '@/lib/pdf'

type Phase = 'upload' | 'editing' | 'processing' | 'done' | 'error'
type Tool = 'text' | 'draw'

const COLORS = [
  { label: 'Black', value: { r: 0, g: 0, b: 0 }, hex: '#000000' },
  { label: 'Red', value: { r: 0.85, g: 0.1, b: 0.1 }, hex: '#d91a1a' },
  { label: 'Blue', value: { r: 0.1, g: 0.2, b: 0.85 }, hex: '#1a33d9' },
  { label: 'Green', value: { r: 0.1, g: 0.6, b: 0.2 }, hex: '#1a9933' },
]

export default function EditPdfPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('upload')
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([])
  const [canvasDims, setCanvasDims] = useState({ width: 350, height: 500 })

  const [tool, setTool] = useState<Tool>('draw')
  const [colorIdx, setColorIdx] = useState(0)
  const [lineWidth, setLineWidth] = useState(3)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // Drawing state
  const drawing = useRef(false)
  const currentPoints = useRef<Array<{ x: number; y: number }>>([])

  // Text input state
  const [textInput, setTextInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [textPos, setTextPos] = useState({ x: 0, y: 0 })

  const handleFilesChange = useCallback((f: File[]) => setFiles(f), [])

  async function goToEdit() {
    if (files.length === 0) return
    const count = await getPdfPageCount(files[0])
    const sizes = await getPdfPageSizes(files[0])
    setPageCount(count)
    setPageSizes(sizes)
    setCurrentPage(1)
    setAnnotations([])
    setPhase('editing')
  }

  // Render current page
  useEffect(() => {
    if (phase !== 'editing' || files.length === 0) return
    let cancelled = false
    renderPdfPage(files[0], currentPage, 350).then((rendered) => {
      if (cancelled || !canvasRef.current) return
      canvasRef.current.width = rendered.width
      canvasRef.current.height = rendered.height
      canvasRef.current.getContext('2d')!.drawImage(rendered, 0, 0)
      setCanvasDims({ width: rendered.width, height: rendered.height })

      // Setup overlay
      if (overlayRef.current) {
        overlayRef.current.width = rendered.width
        overlayRef.current.height = rendered.height
        redrawOverlay()
      }
    })
    return () => { cancelled = true }
  }, [phase, files, currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  function redrawOverlay() {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const pageAnns = annotations.filter((a) => a.pageIndex === currentPage - 1)
    const pageSize = pageSizes[currentPage - 1]
    if (!pageSize) return

    const scaleX = canvas.width / pageSize.width
    const scaleY = canvas.height / pageSize.height

    for (const ann of pageAnns) {
      if (ann.type === 'text') {
        ctx.font = `${ann.fontSize * scaleY}px Helvetica, sans-serif`
        ctx.fillStyle = `rgb(${ann.color.r * 255},${ann.color.g * 255},${ann.color.b * 255})`
        const canvasX = ann.x * scaleX
        const canvasY = canvas.height - ann.y * scaleY
        ctx.fillText(ann.text, canvasX, canvasY)
      } else if (ann.type === 'draw' && ann.points.length >= 2) {
        ctx.strokeStyle = `rgb(${ann.color.r * 255},${ann.color.g * 255},${ann.color.b * 255})`
        ctx.lineWidth = ann.lineWidth * scaleX
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(ann.points[0].x * scaleX, canvas.height - ann.points[0].y * scaleY)
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x * scaleX, canvas.height - ann.points[i].y * scaleY)
        }
        ctx.stroke()
      }
    }
  }

  useEffect(() => { redrawOverlay() }, [annotations, currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  function canvasToPdf(clientX: number, clientY: number) {
    const rect = overlayRef.current!.getBoundingClientRect()
    const canvasX = (clientX - rect.left) * (overlayRef.current!.width / rect.width)
    const canvasY = (clientY - rect.top) * (overlayRef.current!.height / rect.height)
    const pageSize = pageSizes[currentPage - 1]
    const scaleX = pageSize.width / overlayRef.current!.width
    const scaleY = pageSize.height / overlayRef.current!.height
    return {
      x: canvasX * scaleX,
      y: pageSize.height - canvasY * scaleY,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    overlayRef.current!.setPointerCapture(e.pointerId)

    if (tool === 'text') {
      const pdfPos = canvasToPdf(e.clientX, e.clientY)
      setTextPos(pdfPos)
      setTextInput('')
      setShowTextInput(true)
      return
    }

    drawing.current = true
    currentPoints.current = [canvasToPdf(e.clientX, e.clientY)]
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current || tool !== 'draw') return
    const pt = canvasToPdf(e.clientX, e.clientY)
    currentPoints.current.push(pt)

    // Live preview
    const ctx = overlayRef.current!.getContext('2d')!
    const points = currentPoints.current
    if (points.length < 2) return
    const pageSize = pageSizes[currentPage - 1]
    const scaleX = overlayRef.current!.width / pageSize.width
    const scaleY = overlayRef.current!.height / pageSize.height
    const prev = points[points.length - 2]
    const curr = points[points.length - 1]
    ctx.strokeStyle = COLORS[colorIdx].hex
    ctx.lineWidth = lineWidth * scaleX
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(prev.x * scaleX, overlayRef.current!.height - prev.y * scaleY)
    ctx.lineTo(curr.x * scaleX, overlayRef.current!.height - curr.y * scaleY)
    ctx.stroke()
  }

  function onPointerUp() {
    if (!drawing.current) return
    drawing.current = false
    if (currentPoints.current.length >= 2) {
      setAnnotations((prev) => [
        ...prev,
        {
          type: 'draw',
          pageIndex: currentPage - 1,
          points: [...currentPoints.current],
          color: COLORS[colorIdx].value,
          lineWidth,
        },
      ])
    }
    currentPoints.current = []
  }

  function confirmText() {
    if (textInput.trim()) {
      setAnnotations((prev) => [
        ...prev,
        {
          type: 'text',
          pageIndex: currentPage - 1,
          x: textPos.x,
          y: textPos.y,
          text: textInput.trim(),
          fontSize: 14,
          color: COLORS[colorIdx].value,
        },
      ])
    }
    setShowTextInput(false)
  }

  function undoLast() {
    setAnnotations((prev) => {
      const pageAnns = prev.filter((a) => a.pageIndex === currentPage - 1)
      if (pageAnns.length === 0) return prev
      const lastAnn = pageAnns[pageAnns.length - 1]
      return prev.filter((a) => a !== lastAnn)
    })
  }

  async function handleSave() {
    if (files.length === 0) return
    setPhase('processing')
    setError(null)
    try {
      const bytes = await applyAnnotations(files[0], annotations)
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
    setAnnotations([])
    setResultBlob(null)
  }

  const header = (
    <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-5 dark:bg-[#1a2b2a]">
      <div className="flex items-center gap-3">
        {phase === 'upload' ? (
          <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"><span className="material-symbols-outlined text-slate-600">arrow_back</span></Link>
        ) : (
          <button onClick={handleReset} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"><span className="material-symbols-outlined text-slate-600">arrow_back</span></button>
        )}
        <h1 className="flex-1 text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.editPdf')}</h1>
        {phase === 'editing' && (
          <button onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
            {t('editPdf.save')}
          </button>
        )}
      </div>
    </header>
  )

  if (phase === 'done' && resultBlob) {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        {header}
        <div className="flex-1 px-4 pb-24 pt-4">
          <ResultScreen fileName="edited.pdf" originalSize={files[0]?.size ?? 0} resultSize={resultBlob.size} resultBlob={resultBlob} onViewInLibrary={() => navigate('/documents')} />
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
            <button onClick={goToEdit} disabled={files.length === 0} className="mt-6 w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md disabled:opacity-50">
              {t('editPdf.startEditing')}
            </button>
          </>
        )}

        {phase === 'editing' && (
          <div className="mt-3 space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm dark:bg-[#1a2b2a]">
              <button onClick={() => setTool('draw')} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${tool === 'draw' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-gray-100'}`}>
                <span className="material-symbols-outlined text-sm">draw</span> {t('editPdf.draw')}
              </button>
              <button onClick={() => setTool('text')} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${tool === 'text' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-gray-100'}`}>
                <span className="material-symbols-outlined text-sm">text_fields</span> {t('editPdf.text')}
              </button>
              <div className="mx-1 h-5 w-px bg-gray-200" />
              {COLORS.map((c, i) => (
                <button key={c.hex} onClick={() => setColorIdx(i)} className={`h-6 w-6 rounded-full border-2 ${i === colorIdx ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: c.hex }} />
              ))}
              <div className="mx-1 h-5 w-px bg-gray-200" />
              <select value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="rounded border px-1 py-0.5 text-xs">
                <option value={1}>S</option>
                <option value={3}>M</option>
                <option value={6}>L</option>
              </select>
              <button onClick={undoLast} className="ml-auto rounded-lg p-2 text-text-secondary hover:bg-gray-100" title="Undo">
                <span className="material-symbols-outlined text-sm">undo</span>
              </button>
            </div>

            {/* Page navigation */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-30"><span className="material-symbols-outlined text-sm">chevron_left</span></button>
                <span className="text-sm font-medium">{currentPage} / {pageCount}</span>
                <button disabled={currentPage >= pageCount} onClick={() => setCurrentPage((p) => p + 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-30"><span className="material-symbols-outlined text-sm">chevron_right</span></button>
              </div>
            )}

            {/* Canvas */}
            <div className="relative mx-auto w-fit overflow-hidden rounded-lg shadow-md">
              <canvas ref={canvasRef} className="w-full max-w-[350px]" style={{ aspectRatio: `${canvasDims.width}/${canvasDims.height}` }} />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full max-w-[350px] touch-none"
                style={{ aspectRatio: `${canvasDims.width}/${canvasDims.height}` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>

            {/* Text input modal */}
            {showTextInput && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
                <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-[#1a2b2a]">
                  <p className="mb-3 text-sm font-medium text-text-primary">{t('editPdf.enterText')}</p>
                  <input
                    autoFocus
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmText()}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setShowTextInput(false)} className="flex-1 rounded-lg border py-2 text-sm font-medium">{t('common.cancel')}</button>
                    <button onClick={confirmText} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white">{t('common.save')}</button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-text-secondary">
              {tool === 'text' ? t('editPdf.tapToAddText') : t('editPdf.drawOnPage')}
            </p>
          </div>
        )}

        {phase === 'processing' && (
          <div className="mt-16 flex flex-col items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
            <button onClick={() => setPhase('editing')} className="w-full rounded-lg border py-3 font-medium">{t('common.retry')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

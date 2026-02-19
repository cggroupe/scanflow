import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import FileUploader from '@/components/FileUploader/FileUploader'
import SignaturePad from '@/components/SignaturePad'
import PdfPageCanvas from '@/components/PdfPageCanvas'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import { useDocumentStore } from '@/stores/documentStore'
import {
  getPdfPageCount,
  getPdfPageSizes,
  addSignaturesWithMetadata,
  toBlob,
  type SignaturePlacement,
} from '@/lib/pdf'

type Phase = 'upload' | 'draw' | 'place' | 'processing' | 'done' | 'error'

interface DrawnSignature {
  id: string
  label: string
  dataUrl: string
  blob: Blob
}

interface PlacedSignature {
  id: string
  signatureId: string
  pageIndex: number
  x: number // normalized 0..1, center
  y: number // normalized 0..1, center
  scale: number // 1 = 25% of page width
}

function formatTimestamp(): string {
  const now = new Date()
  return now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function SignPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const pendingFile = useDocumentStore((s) => s.pendingFile)
  const setPendingFile = useDocumentStore((s) => s.setPendingFile)

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('upload')
  const pendingConsumed = useRef(false)
  const [pageCount, setPageCount] = useState(0)
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Signatures
  const [drawnSignatures, setDrawnSignatures] = useState<DrawnSignature[]>([])
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null)
  const [placedSignatures, setPlacedSignatures] = useState<PlacedSignature[]>([])
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null)

  // Location
  const [location, setLocation] = useState<string | null>(null)

  // Resize state
  const resizing = useRef<{ id: string; startX: number; startScale: number } | null>(null)

  const handleFilesChange = useCallback((f: File[]) => setFiles(f), [])

  // Auto-load pending file from Scanner/other pages
  useEffect(() => {
    if (pendingFile && !pendingConsumed.current) {
      pendingConsumed.current = true
      setFiles([pendingFile])
      setPendingFile(null)
      // Auto-advance to draw phase
      ;(async () => {
        const count = await getPdfPageCount(pendingFile)
        const sizes = await getPdfPageSizes(pendingFile)
        setPageCount(count)
        setPageSizes(sizes)
        setPhase('draw')
      })()
    }
  }, [pendingFile, setPendingFile])

  // Get geolocation on mount
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}°`)
      },
      () => {} // silently fail
    )
  }, [])

  async function goToDraw() {
    if (files.length === 0) return
    const count = await getPdfPageCount(files[0])
    const sizes = await getPdfPageSizes(files[0])
    setPageCount(count)
    setPageSizes(sizes)
    setPhase('draw')
  }

  function handleNewSignature(blob: Blob) {
    const id = `sig_${Date.now()}`
    const label = `${t('signPage.signer')} ${drawnSignatures.length + 1}`
    const dataUrl = URL.createObjectURL(blob)
    const newSig: DrawnSignature = { id, label, dataUrl, blob }
    setDrawnSignatures((prev) => [...prev, newSig])
    setActiveSignatureId(id)
    setPhase('place')
  }

  function handlePageTap(e: React.PointerEvent<HTMLDivElement>) {
    if (!activeSignatureId) return
    // Don't place if tapping on an existing signature
    if ((e.target as HTMLElement).closest('[data-placed-sig]')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    const id = `placed_${Date.now()}`
    setPlacedSignatures((prev) => [
      ...prev,
      { id, signatureId: activeSignatureId, pageIndex: currentPage - 1, x, y, scale: 1 },
    ])
    setSelectedPlacedId(id)
  }

  function selectPlacedSignature(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    setSelectedPlacedId(id)
  }

  function removePlacedSignature(id: string) {
    setPlacedSignatures((prev) => prev.filter((s) => s.id !== id))
    if (selectedPlacedId === id) setSelectedPlacedId(null)
  }

  // Resize handling
  function startResize(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    e.preventDefault()
    const sig = placedSignatures.find((s) => s.id === id)
    if (!sig) return
    resizing.current = { id, startX: e.clientX, startScale: sig.scale }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizing.current) return
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 350
    const dx = e.clientX - resizing.current.startX
    const deltaScale = (dx / containerWidth) * 4
    const newScale = Math.max(0.3, Math.min(3, resizing.current.startScale + deltaScale))
    setPlacedSignatures((prev) =>
      prev.map((s) => (s.id === resizing.current!.id ? { ...s, scale: newScale } : s)),
    )
  }

  function onResizeEnd() {
    resizing.current = null
  }

  function getSignatureDataUrl(signatureId: string): string {
    return drawnSignatures.find((s) => s.id === signatureId)?.dataUrl ?? ''
  }

  async function handleApply() {
    if (files.length === 0 || placedSignatures.length === 0) return
    setPhase('processing')
    setError(null)

    try {
      const file = files[0]
      const timestamp = formatTimestamp()
      const metaLines = [`${t('signPage.signed')} ${timestamp}`]
      if (location) metaLines.push(`${t('signPage.location')} ${location}`)
      const metadataText = metaLines.join('\n')

      const placements: SignaturePlacement[] = []

      for (const placed of placedSignatures) {
        const drawn = drawnSignatures.find((s) => s.id === placed.signatureId)
        if (!drawn) continue
        const pageSize = pageSizes[placed.pageIndex]
        if (!pageSize) continue

        const sigW = pageSize.width * 0.25 * placed.scale
        const sigH = sigW * 0.5
        const pdfX = placed.x * pageSize.width - sigW / 2
        const pdfY = pageSize.height - placed.y * pageSize.height - sigH / 2

        placements.push({
          imageBuffer: await drawn.blob.arrayBuffer(),
          pageIndex: placed.pageIndex,
          x: Math.max(0, pdfX),
          y: Math.max(0, pdfY),
          width: sigW,
          height: sigH,
          metadataText,
        })
      }

      const bytes = await addSignaturesWithMetadata(file, placements)
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
    setDrawnSignatures([])
    setPlacedSignatures([])
    setSelectedPlacedId(null)
    setResultBlob(null)
  }

  // Current page placed signatures
  const currentPageSigs = placedSignatures.filter((s) => s.pageIndex === currentPage - 1)

  // --- Header ---
  function goBack() {
    if (phase === 'place' && drawnSignatures.length > 0) setPhase('draw')
    else if (phase === 'draw') setPhase('upload')
    else setPhase('upload')
  }

  const header = (
    <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
      <div className="flex items-center gap-3">
        {phase === 'upload' ? (
          <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
        ) : (
          <button onClick={goBack} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </button>
        )}
        <h1 className="flex-1 text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.sign')}</h1>
        {phase === 'place' && placedSignatures.length > 0 && (
          <button onClick={handleApply} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
            {t('signPage.apply')}
          </button>
        )}
      </div>
    </header>
  )

  // --- Result ---
  if (phase === 'done' && resultBlob) {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        {header}
        <div className="flex-1 px-4 pb-24 pt-4">
          <ResultScreen
            fileName="signed.pdf"
            originalSize={files[0]?.size ?? 0}
            resultSize={resultBlob.size}
            resultBlob={resultBlob}
            onViewInLibrary={() => navigate('/documents')}
          />
          <button onClick={handleReset} className="mt-4 w-full rounded-lg border border-gray-300 py-3 font-medium text-text-primary hover:bg-gray-50">
            {t('resultScreen.processAnother')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {header}
      <div className="flex-1 px-4 pb-24">
        {/* ==================== UPLOAD ==================== */}
        {phase === 'upload' && (
          <>
            <div className="mt-4">
              <FileUploader accept={['application/pdf']} maxSizeBytes={100 * 1024 * 1024} maxFiles={1} onFilesChange={handleFilesChange} />
            </div>
            <button
              onClick={goToDraw}
              disabled={files.length === 0}
              className="mt-6 w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md disabled:opacity-50"
            >
              {t('signPage.next')}
            </button>
          </>
        )}

        {/* ==================== DRAW SIGNATURE ==================== */}
        {phase === 'draw' && (
          <div className="mt-4 space-y-4">
            {/* Previously drawn signatures */}
            {drawnSignatures.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {t('signPage.existingSignatures')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {drawnSignatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`flex flex-shrink-0 flex-col items-center rounded-lg border-2 p-2 ${
                        activeSignatureId === sig.id ? 'border-primary bg-primary/5' : 'border-gray-200'
                      }`}
                    >
                      <img src={sig.dataUrl} alt={sig.label} className="h-10 w-20 object-contain" />
                      <span className="mt-1 text-[10px] text-text-secondary">{sig.label}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setPhase('place')}
                  className="w-full rounded-lg bg-primary py-3 font-bold text-white"
                >
                  {t('signPage.goToPlacement')}
                </button>
              </div>
            )}

            {/* Signature pad */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {drawnSignatures.length > 0 ? t('signPage.addAnotherSigner') : t('signPage.drawSignature')}
              </p>
              <SignaturePad onSignature={handleNewSignature} />
            </div>
          </div>
        )}

        {/* ==================== PLACE SIGNATURES ==================== */}
        {phase === 'place' && (
          <div className="mt-3 space-y-3">
            {/* Signature selector */}
            <div className="flex items-center gap-2 overflow-x-auto rounded-xl bg-white p-2 shadow-sm dark:bg-[#1a2b2a]">
              <span className="flex-shrink-0 text-[10px] font-bold uppercase text-gray-400">{t('signPage.active')}:</span>
              {drawnSignatures.map((sig) => (
                <button
                  key={sig.id}
                  onClick={() => setActiveSignatureId(sig.id)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
                    activeSignatureId === sig.id ? 'border-primary bg-primary/10' : 'border-gray-200'
                  }`}
                >
                  <img src={sig.dataUrl} alt="" className="h-6 w-12 object-contain" />
                  <span className="text-[10px] text-text-secondary">{sig.label}</span>
                </button>
              ))}
              <button
                onClick={() => setPhase('draw')}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-primary/40 px-2 py-1.5 text-[10px] font-medium text-primary"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
            </div>

            <p className="text-sm text-text-secondary">{t('signPage.tapToPlace')}</p>

            {/* Page navigation */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-30">
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="text-sm font-medium">{currentPage} / {pageCount}</span>
                <button disabled={currentPage >= pageCount} onClick={() => setCurrentPage((p) => p + 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-30">
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            )}

            {/* PDF page with placed signatures overlay */}
            <div
              ref={containerRef}
              className="relative mx-auto w-fit overflow-hidden rounded-lg shadow-md"
              onPointerDown={handlePageTap}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              onPointerCancel={onResizeEnd}
            >
              <PdfPageCanvas file={files[0]} pageNum={currentPage} width={350} />

              {/* Placed signatures on current page */}
              {currentPageSigs.map((sig) => (
                <div
                  key={sig.id}
                  data-placed-sig
                  className={`absolute cursor-pointer ${selectedPlacedId === sig.id ? 'z-10' : ''}`}
                  style={{
                    left: `${sig.x * 100}%`,
                    top: `${sig.y * 100}%`,
                    width: `${sig.scale * 25}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={(e) => selectPlacedSignature(e, sig.id)}
                >
                  <img
                    src={getSignatureDataUrl(sig.signatureId)}
                    alt="signature"
                    className={`pointer-events-none w-full border ${
                      selectedPlacedId === sig.id ? 'border-primary' : 'border-transparent'
                    }`}
                    style={{ opacity: 0.85 }}
                  />
                  {/* Metadata preview */}
                  <p className="pointer-events-none mt-0.5 truncate text-[5px] leading-tight text-gray-500">
                    {t('signPage.signed')} {formatTimestamp()}
                  </p>

                  {/* Resize handle (selected only) */}
                  {selectedPlacedId === sig.id && (
                    <>
                      <div
                        className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded-full border-2 border-white bg-primary shadow touch-none"
                        onPointerDown={(e) => startResize(e, sig.id)}
                      />
                      {/* Delete button */}
                      <button
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow"
                        onPointerDown={(e) => { e.stopPropagation(); removePlacedSignature(sig.id) }}
                      >
                        <span className="material-symbols-outlined text-xs">close</span>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Counter */}
            <p className="text-center text-xs text-text-secondary">
              {placedSignatures.length} {t('signPage.signatureCount')}
            </p>
          </div>
        )}

        {/* ==================== PROCESSING ==================== */}
        {phase === 'processing' && (
          <div className="mt-16 flex flex-col items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p className="text-sm text-text-secondary">{t('toolPage.processing')}</p>
          </div>
        )}

        {/* ==================== ERROR ==================== */}
        {phase === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
            <button onClick={() => setPhase('place')} className="w-full rounded-lg border py-3 font-medium">{t('common.retry')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

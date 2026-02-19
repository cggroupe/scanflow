import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import FileUploader from '@/components/FileUploader/FileUploader'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import { getPdfPageCount, reorderPages, toBlob } from '@/lib/pdf'

type Phase = 'upload' | 'organizing' | 'processing' | 'done' | 'error'

export default function OrganizePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<Phase>('upload')
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFilesChange = useCallback((f: File[]) => setFiles(f), [])

  async function goToOrganize() {
    if (files.length === 0) return
    setLoading(true)
    const count = await getPdfPageCount(files[0])
    const order = Array.from({ length: count }, (_, i) => i)
    setPageOrder(order)
    setSelectedIdx(null)
    setPhase('organizing')
    setLoading(false)
  }

  // Generate thumbnails when entering organize mode or when order changes
  useEffect(() => {
    if (phase !== 'organizing' || files.length === 0 || pageOrder.length === 0) return
    let cancelled = false

    // Generate thumbnails for all pages (by their original index)
    async function gen() {
      const thumbs: string[] = []
      for (let i = 0; i < pageOrder.length; i++) {
        if (cancelled) return
        // We need to generate thumbnail for the original page index
        // But generatePdfThumbnail only does page 1. Let me use renderPdfPage.
        const { renderPdfPage } = await import('@/lib/pdf')
        const canvas = await renderPdfPage(files[0], pageOrder[i] + 1, 100)
        thumbs.push(canvas.toDataURL('image/jpeg', 0.7))
      }
      if (!cancelled) setThumbnails(thumbs)
    }
    gen()
    return () => { cancelled = true }
  }, [phase, files, pageOrder])

  function moveUp(idx: number) {
    if (idx <= 0) return
    setPageOrder((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
    setSelectedIdx(idx - 1)
  }

  function moveDown(idx: number) {
    if (idx >= pageOrder.length - 1) return
    setPageOrder((prev) => {
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
    setSelectedIdx(idx + 1)
  }

  async function handleApply() {
    if (files.length === 0) return
    setPhase('processing')
    setError(null)
    try {
      const bytes = await reorderPages(files[0], pageOrder)
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
    setThumbnails([])
  }

  const header = (
    <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
      <div className="flex items-center gap-3">
        {phase === 'upload' ? (
          <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"><span className="material-symbols-outlined text-slate-600">arrow_back</span></Link>
        ) : (
          <button onClick={() => setPhase('upload')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"><span className="material-symbols-outlined text-slate-600">arrow_back</span></button>
        )}
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('tools.organizePages')}</h1>
      </div>
    </header>
  )

  if (phase === 'done' && resultBlob) {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        {header}
        <div className="flex-1 px-4 pb-24 pt-4">
          <ResultScreen fileName="organized.pdf" originalSize={files[0]?.size ?? 0} resultSize={resultBlob.size} resultBlob={resultBlob} onViewInLibrary={() => navigate('/documents')} />
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
            <button onClick={goToOrganize} disabled={files.length === 0 || loading} className="mt-6 w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md disabled:opacity-50">
              {loading ? t('common.loading') : t('organizePage.startOrganize')}
            </button>
          </>
        )}

        {phase === 'organizing' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-text-secondary">{t('organizePage.tapToSelect')}</p>

            <div className="grid grid-cols-3 gap-3">
              {pageOrder.map((origIdx, displayIdx) => (
                <button
                  key={`${origIdx}-${displayIdx}`}
                  onClick={() => setSelectedIdx(selectedIdx === displayIdx ? null : displayIdx)}
                  className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                    selectedIdx === displayIdx ? 'border-primary shadow-md' : 'border-gray-200'
                  }`}
                >
                  {thumbnails[displayIdx] ? (
                    <img src={thumbnails[displayIdx]} alt={`Page ${origIdx + 1}`} className="w-full" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-gray-100">
                      <span className="material-symbols-outlined animate-spin text-sm text-gray-400">progress_activity</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {origIdx + 1}
                  </span>
                </button>
              ))}
            </div>

            {/* Move controls */}
            {selectedIdx !== null && (
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => moveUp(selectedIdx)}
                  disabled={selectedIdx <= 0}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  {t('organizePage.moveLeft')}
                </button>
                <button
                  onClick={() => moveDown(selectedIdx)}
                  disabled={selectedIdx >= pageOrder.length - 1}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-30"
                >
                  {t('organizePage.moveRight')}
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            )}

            <button onClick={handleApply} className="w-full rounded-lg bg-primary py-4 font-bold text-white shadow-md">
              {t('organizePage.apply')}
            </button>
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
            <button onClick={() => setPhase('organizing')} className="w-full rounded-lg border py-3 font-medium">{t('common.retry')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

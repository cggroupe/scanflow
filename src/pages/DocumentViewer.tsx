import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDocumentStore, formatFileSize, formatRelativeDate } from '@/stores/documentStore'
import { getBlob } from '@/lib/blobStore'
import { getPdfPageCount } from '@/lib/pdf'
import PdfPageCanvas from '@/components/PdfPageCanvas'

type Status = 'loading' | 'ready' | 'missing'

export default function DocumentViewer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const documents = useDocumentStore((s) => s.documents)
  const removeDocument = useDocumentStore((s) => s.removeDocument)

  const doc = documents.find((d) => d.id === id)

  const [blob, setBlob] = useState<Blob | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!id || !doc) return
    let cancelled = false
    let objectUrl: string | null = null

    void (async () => {
      const found = await getBlob(id)
      if (cancelled) return
      if (!found) { setStatus('missing'); return }
      setBlob(found)

      if (doc.type === 'jpg') {
        objectUrl = URL.createObjectURL(found)
        setImageUrl(objectUrl)
        setStatus('ready')
      } else {
        const f = new File([found], doc.title, { type: 'application/pdf' })
        try {
          const count = await getPdfPageCount(f)
          if (cancelled) return
          setFile(f)
          setPageCount(count)
          setStatus('ready')
        } catch {
          if (!cancelled) setStatus('missing')
        }
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, doc])

  function handleDownload() {
    if (!blob || !doc) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.title
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleShare() {
    if (!blob || !doc) return
    try {
      const f = new File([blob], doc.title, { type: blob.type || 'application/pdf' })
      if (navigator.share) await navigator.share({ files: [f], title: doc.title })
    } catch { /* user cancelled / unsupported */ }
  }

  function handleDelete() {
    if (!doc) return
    removeDocument(doc.id)
    navigate('/documents')
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center dark:bg-[#131f1e]">
        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">error</span>
        <p className="text-sm text-slate-500">{t('viewer.notFound')}</p>
        <button onClick={() => navigate('/documents')} className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white">
          {t('viewer.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-white px-3 pb-3 pt-6 shadow-sm dark:bg-[#1a2b2a]">
        <button onClick={() => navigate('/documents')} aria-label={t('viewer.back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{doc.title}</h1>
          <p className="truncate text-xs text-slate-500">{formatRelativeDate(doc.createdAt)} &bull; {formatFileSize(doc.size)}</p>
        </div>
        <button onClick={handleDownload} aria-label={t('viewer.download')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <span className="material-symbols-outlined">download</span>
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button onClick={handleShare} aria-label={t('viewer.share')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined">share</span>
          </button>
        )}
        <button onClick={handleDelete} aria-label={t('viewer.delete')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
          <span className="material-symbols-outlined">delete</span>
        </button>
      </header>

      <div className="flex-1 px-3 py-4">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p className="text-sm text-slate-500">{t('viewer.loading')}</p>
          </div>
        )}

        {status === 'missing' && (
          <div className="flex flex-col items-center justify-center gap-3 pt-20 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">cloud_off</span>
            <p className="text-sm text-slate-500">{t('viewer.unavailable')}</p>
          </div>
        )}

        {status === 'ready' && imageUrl && (
          <img src={imageUrl} alt={doc.title} className="mx-auto max-w-3xl rounded-lg shadow-md" />
        )}

        {status === 'ready' && file && (
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
            {Array.from({ length: pageCount }, (_, i) => (
              <PdfPageCanvas key={i} file={file} pageNum={i + 1} width={800}
                className="w-full overflow-hidden rounded-lg bg-white shadow-md" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

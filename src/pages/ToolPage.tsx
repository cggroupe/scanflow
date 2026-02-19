import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { toolCategories } from '@/data/mockData'
import FileUploader from '@/components/FileUploader/FileUploader'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import { useDocumentStore } from '@/stores/documentStore'
import {
  useToolProcessor,
  supportedTools,
  multiFileTools,
  imageInputTools,
  toolsWithOptions,
} from '@/hooks/useToolProcessor'

function findTool(toolId: string) {
  for (const cat of toolCategories) {
    const tool = cat.tools.find((t) => t.path === `/tools/${toolId}`)
    if (tool) return { tool, category: cat }
  }
  return null
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ToolPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toolId } = useParams<{ toolId: string }>()
  const result = toolId ? findTool(toolId) : null

  const toolName = result ? t(result.tool.i18nKey) : toolId
  const toolColor = result?.tool.color ?? '#2db9ad'
  const isSupported = toolId ? supportedTools.has(toolId) : false
  const isMultiFile = toolId ? multiFileTools.has(toolId) : false
  const isImageInput = toolId ? imageInputTools.has(toolId) : false
  const needsOptions = toolId ? toolsWithOptions.has(toolId) : false

  const addDocument = useDocumentStore((s) => s.addDocument)
  const savedRef = useRef(false)

  const [files, setFiles] = useState<File[]>([])
  const { state, result: processResult, error, process, reset } = useToolProcessor()

  // Save processed document to store
  useEffect(() => {
    if (state === 'done' && processResult && !savedRef.current) {
      savedRef.current = true
      if (processResult.type === 'single') {
        addDocument({
          id: `doc_${Date.now()}`,
          title: processResult.fileName,
          type: 'pdf',
          size: processResult.blob.size,
          createdAt: new Date().toISOString(),
          blobUrl: URL.createObjectURL(processResult.blob),
        })
      } else {
        processResult.files.forEach((f, i) => {
          addDocument({
            id: `doc_${Date.now()}_${i}`,
            title: f.fileName,
            type: f.fileName.endsWith('.jpg') ? 'jpg' : 'pdf',
            size: f.blob.size,
            createdAt: new Date().toISOString(),
            blobUrl: URL.createObjectURL(f.blob),
          })
        })
      }
    }
    if (state === 'idle') savedRef.current = false
  }, [state, processResult, addDocument])

  // Tool options
  const [rotateAngle, setRotateAngle] = useState(90)
  const [pageRanges, setPageRanges] = useState('')
  const [watermarkText, setWatermarkText] = useState('')
  const [splitMode, setSplitMode] = useState<'perGroup' | 'custom'>('perGroup')
  const [splitPagesPerGroup, setSplitPagesPerGroup] = useState(2)
  const [splitCustomGroups, setSplitCustomGroups] = useState('')

  const handleFilesChange = useCallback((f: File[]) => setFiles(f), [])

  async function handleProcess() {
    if (!toolId || files.length === 0) return
    await process(toolId, files, {
      rotateAngle,
      pageRanges,
      watermarkText,
      splitPagesPerGroup,
      splitCustomGroups: splitMode === 'custom' ? splitCustomGroups : undefined,
    })
  }

  function handleProcessAnother() {
    reset()
    setFiles([])
  }

  const acceptTypes = isImageInput
    ? ['image/jpeg', 'image/png', 'image/webp']
    : ['application/pdf']
  const maxFiles = isMultiFile ? 20 : 1

  // --- Result screen ---
  if (state === 'done' && processResult) {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
          <div className="flex items-center gap-3">
            <button onClick={handleProcessAnother} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{toolName}</h1>
          </div>
        </header>

        <div className="flex-1 px-4 pb-24 pt-6">
          {processResult.type === 'single' ? (
            <ResultScreen
              fileName={processResult.fileName}
              originalSize={processResult.originalSize}
              resultSize={processResult.blob.size}
              resultBlob={processResult.blob}
              onViewInLibrary={() => navigate('/documents')}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <span className="material-symbols-outlined text-3xl text-success">check_circle</span>
                </div>
                <h2 className="text-xl font-bold text-text-primary">{t('resultScreen.success')}</h2>
                <p className="text-sm text-text-secondary">
                  {processResult.files.length} {t('toolPage.filesGenerated')}
                </p>
              </div>

              <div className="space-y-2">
                {processResult.files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{f.fileName}</p>
                      <p className="text-xs text-text-secondary">{(f.blob.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => downloadBlob(f.blob, f.fileName)}
                      className="ml-3 flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                      {t('resultScreen.download')}
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleProcessAnother}
                className="mt-4 w-full rounded-lg border border-gray-300 py-3 font-medium text-text-primary hover:bg-gray-50"
              >
                {t('resultScreen.processAnother')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Processing / Upload screen ---
  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
        <div className="flex items-center gap-3">
          <Link to="/tools" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{toolName}</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 pb-24">
        {/* Tool icon + description */}
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-white p-6 shadow-sm dark:bg-[#1a2b2a]">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${toolColor}15` }}
          >
            <span className="material-symbols-outlined text-4xl" style={{ color: toolColor }}>
              build
            </span>
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">{toolName}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            {isSupported ? t('toolPage.description') : t('toolPage.comingSoon')}
          </p>
        </div>

        {isSupported ? (
          <>
            {/* File upload area */}
            <div className="mt-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {t('toolPage.selectFiles')}
              </p>
              <FileUploader
                accept={acceptTypes}
                maxSizeBytes={100 * 1024 * 1024}
                maxFiles={maxFiles}
                multiple={isMultiFile}
                onFilesChange={handleFilesChange}
              />
            </div>

            {/* Tool-specific options */}
            {needsOptions && files.length > 0 && (
              <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-[#1a2b2a]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {t('toolPage.options')}
                </p>

                {toolId === 'rotate' && (
                  <div className="flex gap-2">
                    {[90, 180, 270].map((angle) => (
                      <button
                        key={angle}
                        onClick={() => setRotateAngle(angle)}
                        className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                          rotateAngle === angle
                            ? 'bg-primary text-white'
                            : 'border border-gray-200 text-text-primary hover:bg-gray-50'
                        }`}
                      >
                        {angle}°
                      </button>
                    ))}
                  </div>
                )}

                {(toolId === 'delete-pages' || toolId === 'extract-pages') && (
                  <input
                    type="text"
                    value={pageRanges}
                    onChange={(e) => setPageRanges(e.target.value)}
                    placeholder={t('toolPage.pageRangesPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
                  />
                )}

                {toolId === 'watermark' && (
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder={t('toolPage.watermarkPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
                  />
                )}

                {toolId === 'split' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button onClick={() => setSplitMode('perGroup')} className={`flex-1 rounded-lg py-2 text-sm font-medium ${splitMode === 'perGroup' ? 'bg-primary text-white' : 'border border-gray-200 text-text-primary'}`}>
                        {t('toolPage.splitEveryN')}
                      </button>
                      <button onClick={() => setSplitMode('custom')} className={`flex-1 rounded-lg py-2 text-sm font-medium ${splitMode === 'custom' ? 'bg-primary text-white' : 'border border-gray-200 text-text-primary'}`}>
                        {t('toolPage.splitCustom')}
                      </button>
                    </div>
                    {splitMode === 'perGroup' ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-secondary">{t('toolPage.pagesPerPart')}</span>
                        <select value={splitPagesPerGroup} onChange={(e) => setSplitPagesPerGroup(Number(e.target.value))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200">
                          {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={splitCustomGroups}
                        onChange={(e) => setSplitCustomGroups(e.target.value)}
                        placeholder={t('toolPage.splitCustomPlaceholder')}
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary dark:border-slate-700 dark:bg-[#131f1e] dark:text-slate-200"
                      />
                    )}
                  </div>
                )}

              </div>
            )}

            {/* Error */}
            {state === 'error' && error && (
              <div className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Action button */}
            <button
              onClick={handleProcess}
              disabled={files.length === 0 || state === 'processing'}
              className="mt-6 w-full rounded-lg py-4 font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-50"
              style={{ backgroundColor: toolColor }}
            >
              {state === 'processing' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                  {t('toolPage.processing')}
                </span>
              ) : (
                t('toolPage.process')
              )}
            </button>
          </>
        ) : (
          /* Coming soon placeholder */
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <span className="material-symbols-outlined text-6xl text-gray-300">construction</span>
            <p className="text-sm text-text-secondary">{t('toolPage.comingSoonDescription')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

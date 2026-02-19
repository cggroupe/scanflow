import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ResultScreen from '@/components/ResultScreen/ResultScreen'
import { useDocumentDetection } from '@/hooks/useDocumentDetection'
import { imagesToPdf, toBlob } from '@/lib/pdf'
import { useDocumentStore } from '@/stores/documentStore'

// ================================================================
// Types
// ================================================================

type Phase = 'home' | 'camera' | 'review' | 'editPage' | 'processing' | 'done'
type Filter = 'original' | 'enhance' | 'grayscale' | 'highContrast'

interface Adjustments {
  brightness: number // -60..60
  contrast: number   // -30..100
  sharpness: number  // 0..100
}

interface ScannedPage {
  id: string
  rawCanvas: HTMLCanvasElement   // original cropped capture (full-res)
  filter: Filter
  adjustments: Adjustments
  processedFile: File            // processed JPEG
  thumbnailUrl: string           // object URL of processed
}

const DEFAULT_ADJ: Adjustments = { brightness: 10, contrast: 35, sharpness: 50 }
const DEFAULT_FILTER: Filter = 'enhance'

// ================================================================
// Image processing (same pipeline as before)
// ================================================================

function getFrameCropRect(video: HTMLVideoElement, container: HTMLElement) {
  const cW = container.clientWidth
  const cH = container.clientHeight
  const vW = video.videoWidth
  const vH = video.videoHeight
  if (vW === 0 || vH === 0 || cW === 0 || cH === 0) return { sx: 0, sy: 0, sw: vW, sh: vH }

  const cAspect = cW / cH
  const vAspect = vW / vH

  let renderW: number, renderH: number, offX: number, offY: number
  if (vAspect > cAspect) {
    renderH = cH; renderW = cH * vAspect
    offX = (renderW - cW) / 2; offY = 0
  } else {
    renderW = cW; renderH = cW / vAspect
    offX = 0; offY = (renderH - cH) / 2
  }
  const scale = vW / renderW

  const fW = cW * 0.80
  const fH = fW * (297 / 210)
  const fX = (cW - fW) / 2
  const fY = (cH - fH) / 2

  let sx = (fX + offX) * scale
  let sy = (fY + offY) * scale
  let sw = fW * scale
  let sh = fH * scale

  sx = Math.max(0, Math.min(vW, sx))
  sy = Math.max(0, Math.min(vH, sy))
  sw = Math.min(sw, vW - sx)
  sh = Math.min(sh, vH - sy)

  return { sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh) }
}

function processDocumentScan(source: HTMLCanvasElement, filter: Filter, adj: Adjustments): HTMLCanvasElement {
  const w = source.width, h = source.height
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)

  if (filter === 'original' && adj.brightness === 0 && adj.contrast === 0 && adj.sharpness === 0) return canvas

  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data

  // Auto-levels
  const step = Math.max(1, Math.floor(d.length / 4 / 5000)) * 4
  const samples: number[] = []
  for (let i = 0; i < d.length; i += step) {
    samples.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
  }
  samples.sort((a, b) => a - b)
  const pLow = samples[Math.floor(samples.length * 0.03)] ?? 0
  const pHigh = samples[Math.floor(samples.length * 0.97)] ?? 255
  const range = Math.max(1, pHigh - pLow)

  const doAutoLevels = filter !== 'original'
  const brightnessOff = adj.brightness * 0.4
  const contrastPow = 1 + adj.contrast / 100
  const gamma = filter === 'original' ? 1.0 : 0.78

  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = d[i + c]
      if (doAutoLevels) v = ((v - pLow) / range) * 255
      v += brightnessOff
      v = Math.max(0, Math.min(1, v / 255))
      if (gamma !== 1) v = Math.pow(v, gamma)
      if (contrastPow !== 1) {
        v = v < 0.5
          ? 0.5 * Math.pow(2 * v, contrastPow)
          : 1 - 0.5 * Math.pow(2 * (1 - v), contrastPow)
      }
      d[i + c] = Math.round(v * 255)
    }

    if (filter === 'grayscale' || filter === 'highContrast') {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      if (filter === 'highContrast') {
        const val = gray > 135 ? 255 : 0
        d[i] = d[i + 1] = d[i + 2] = val
      } else {
        d[i] = d[i + 1] = d[i + 2] = Math.round(gray)
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  if (adj.sharpness > 0) sharpenCanvas(canvas, adj.sharpness / 100)

  return canvas
}

function sharpenCanvas(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')!
  const original = ctx.getImageData(0, 0, w, h)

  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = w; blurCanvas.height = h
  const blurCtx = blurCanvas.getContext('2d')!
  try { blurCtx.filter = 'blur(1px)' } catch { return }
  blurCtx.drawImage(canvas, 0, 0)
  const blurred = blurCtx.getImageData(0, 0, w, h)

  const strength = amount * 2
  const od = original.data, bd = blurred.data
  for (let i = 0; i < od.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      od[i + c] = Math.max(0, Math.min(255, od[i + c] + Math.round((od[i + c] - bd[i + c]) * strength)))
    }
  }
  ctx.putImageData(original, 0, 0)
}

/** Process a raw canvas and return a File + thumbnail URL (async, used by edit/import) */
function processAndCreateFile(raw: HTMLCanvasElement, filter: Filter, adj: Adjustments): Promise<{ file: File; url: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Processing timeout')), 5000)
    try {
      const processed = processDocumentScan(raw, filter, adj)
      processed.toBlob((blob) => {
        clearTimeout(timeout)
        if (!blob) { reject(new Error('Blob creation failed')); return }
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
        resolve({ file, url: URL.createObjectURL(blob) })
      }, 'image/jpeg', 0.92)
    } catch (err) {
      clearTimeout(timeout)
      reject(err)
    }
  })
}

/** Convert a canvas to a File synchronously via toDataURL (works on ALL browsers) */
function canvasToFileSync(canvas: HTMLCanvasElement, quality = 0.92): { file: File; thumbnailUrl: string } {
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const parts = dataUrl.split(',')
  const byteStr = atob(parts[1])
  const arr = new Uint8Array(byteStr.length)
  for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
  const file = new File([arr], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
  return { file, thumbnailUrl: dataUrl }
}

// ================================================================
// Slider sub-component
// ================================================================

function SliderRow({ icon, label, value, min, max, onChange }: {
  icon: string; label: string; value: number; min: number; max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-lg text-white/60">{icon}</span>
      <span className="w-20 text-[11px] text-white/70">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-8 text-right text-[10px] text-white/50">{value}</span>
    </div>
  )
}

// ================================================================
// Component
// ================================================================

export default function Scanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const addDocument = useDocumentStore((s) => s.addDocument)
  const setPendingFile = useDocumentStore((s) => s.setPendingFile)

  const [searchParams] = useSearchParams()

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)
  const autoOpenDone = useRef(false)

  const [phase, setPhase] = useState<Phase>('home')
  const [pages, setPages] = useState<ScannedPage[]>([])
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showFlash, setShowFlash] = useState(false)

  // Per-page editing state
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editFilter, setEditFilter] = useState<Filter>(DEFAULT_FILTER)
  const [editAdj, setEditAdj] = useState<Adjustments>(DEFAULT_ADJ)
  const [editPreviewUrl, setEditPreviewUrl] = useState('')

  // OpenCV runs in a Web Worker — loads in background, never blocks the UI
  const { cvReady, detectAndCrop } = useDocumentDetection({
    enabled: phase === 'camera',
  })

  // Cleanup on unmount
  useEffect(() => () => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }, [])

  // Editing page reference
  const editingPage = pages.find((p) => p.id === editingPageId) ?? null

  // Preview canvas for edit mode (smaller for performance)
  const editPreviewCanvas = useMemo(() => {
    if (!editingPage) return null
    const raw = editingPage.rawCanvas
    const maxW = 600
    if (raw.width <= maxW) return raw
    const s = maxW / raw.width
    const c = document.createElement('canvas')
    c.width = Math.round(raw.width * s)
    c.height = Math.round(raw.height * s)
    c.getContext('2d')!.drawImage(raw, 0, 0, c.width, c.height)
    return c
  }, [editingPage])

  // Live preview when editing filter/sliders change
  useEffect(() => {
    if (phase !== 'editPage' || !editPreviewCanvas) return
    const processed = processDocumentScan(editPreviewCanvas, editFilter, editAdj)
    setEditPreviewUrl(processed.toDataURL('image/jpeg', 0.85))
  }, [phase, editPreviewCanvas, editFilter, editAdj])

  // ---- Camera ----
  const openCamera = useCallback(async () => {
    setCameraError(null)

    // Clean up any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream

      // Set phase first to trigger render of <video> element
      setPhase('camera')

      // Wait for React to mount the video element, then attach stream
      const attachStream = async (retries = 20): Promise<void> => {
        const video = videoRef.current
        if (!video) {
          if (retries > 0) {
            await new Promise((r) => setTimeout(r, 50))
            return attachStream(retries - 1)
          }
          throw new Error('Video element not found')
        }

        video.srcObject = stream

        // Wait for metadata to load
        const v = video // capture non-null reference
        await new Promise<void>((resolve, reject) => {
          if (v.readyState >= 1) { resolve(); return }
          const onLoaded = () => { cleanup(); resolve() }
          const onError = () => { cleanup(); reject(new Error('Video load error')) }
          const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')) }, 5000)
          function cleanup() {
            v.removeEventListener('loadedmetadata', onLoaded)
            v.removeEventListener('error', onError)
            clearTimeout(timeout)
          }
          v.addEventListener('loadedmetadata', onLoaded, { once: true })
          v.addEventListener('error', onError, { once: true })
        })

        await video.play()
      }

      await attachStream()
    } catch {
      // If stream was acquired but video failed, clean up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop())
        streamRef.current = null
      }
      setPhase('home')
      setCameraError(t('scanner.cameraError'))
    }
  }, [t])

  // Auto-open camera if ?mode=camera (placed AFTER openCamera definition)
  useEffect(() => {
    if (!autoOpenDone.current && searchParams.get('mode') === 'camera' && phase === 'home') {
      autoOpenDone.current = true
      openCamera()
    }
  }, [searchParams, phase, openCamera])

  function stopCamera() {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }

  // ---- Capture: flash is sync, detection runs in Web Worker ----
  async function capturePhoto() {
    // Flash FIRST — user sees feedback immediately
    setShowFlash(true)
    setTimeout(() => setShowFlash(false), 200)

    const video = videoRef.current
    const container = videoContainerRef.current
    if (!video || !container) {
      setCameraError('Camera not ready')
      setTimeout(() => setCameraError(null), 3000)
      return
    }

    try {
      // Try auto-detect via Web Worker (runs in background thread, non-blocking)
      let rawCanvas: HTMLCanvasElement
      if (cvReady) {
        const detected = await detectAndCrop(video)
        rawCanvas = detected ?? cropFrame(video, container)
      } else {
        rawCanvas = cropFrame(video, container)
      }

      const processed = processDocumentScan(rawCanvas, DEFAULT_FILTER, DEFAULT_ADJ)
      const { file, thumbnailUrl } = canvasToFileSync(processed)

      const id = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      setPages((prev) => [...prev, {
        id,
        rawCanvas,
        filter: DEFAULT_FILTER,
        adjustments: { ...DEFAULT_ADJ },
        processedFile: file,
        thumbnailUrl,
      }])
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : t('scanner.cameraError'))
      setTimeout(() => setCameraError(null), 5000)
    }
  }

  /** Crop video to the A4 frame area, with fallback for 0-dimension edge cases */
  function cropFrame(video: HTMLVideoElement, container: HTMLElement): HTMLCanvasElement {
    const vw = video.videoWidth
    const vh = video.videoHeight

    if (vw > 0 && vh > 0) {
      const { sx, sy, sw, sh } = getFrameCropRect(video, container)
      const w = Math.max(1, sw)
      const h = Math.max(1, sh)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
      return canvas
    }

    // Fallback: video dimensions unavailable, capture at display size
    const w = container.clientWidth || 1080
    const h = container.clientHeight || 1920
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
    return canvas
  }

  function handleCameraDone() {
    stopCamera()
    if (pages.length > 0) setPhase('review')
    else setPhase('home')
  }

  // ---- Import ----
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    e.target.value = ''

    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue

      const img = new Image()
      const objUrl = URL.createObjectURL(file)
      img.onload = async () => {
        const rawCanvas = document.createElement('canvas')
        rawCanvas.width = img.naturalWidth; rawCanvas.height = img.naturalHeight
        rawCanvas.getContext('2d')!.drawImage(img, 0, 0)
        URL.revokeObjectURL(objUrl)

        const { file: pFile, url } = await processAndCreateFile(rawCanvas, DEFAULT_FILTER, DEFAULT_ADJ)
        const id = `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        setPages((prev) => [...prev, {
          id,
          rawCanvas,
          filter: DEFAULT_FILTER,
          adjustments: { ...DEFAULT_ADJ },
          processedFile: pFile,
          thumbnailUrl: url,
        }])
      }
      img.src = objUrl
    }

    if (phase === 'home') {
      // Will transition to review once pages are added (via effect below)
      setTimeout(() => setPhase('review'), 300)
    }
  }

  // ---- Per-page editing ----
  function openPageEditor(pageId: string) {
    const page = pages.find((p) => p.id === pageId)
    if (!page) return
    setEditingPageId(pageId)
    setEditFilter(page.filter)
    setEditAdj({ ...page.adjustments })
    setPhase('editPage')
  }

  async function savePageEdit() {
    if (!editingPage) return
    const { file, url } = await processAndCreateFile(editingPage.rawCanvas, editFilter, editAdj)

    // Revoke old thumbnail
    URL.revokeObjectURL(editingPage.thumbnailUrl)

    setPages((prev) => prev.map((p) =>
      p.id === editingPageId
        ? { ...p, filter: editFilter, adjustments: { ...editAdj }, processedFile: file, thumbnailUrl: url }
        : p
    ))
    setEditingPageId(null)
    setPhase('review')
  }

  function cancelPageEdit() {
    setEditingPageId(null)
    setPhase('review')
  }

  // ---- Page management ----
  function removePage(id: string) {
    setPages((prev) => {
      const page = prev.find((p) => p.id === id)
      if (page) URL.revokeObjectURL(page.thumbnailUrl)
      const next = prev.filter((p) => p.id !== id)
      if (next.length === 0 && phase === 'review') setTimeout(() => setPhase('home'), 0)
      return next
    })
  }

  // ---- PDF creation ----
  async function handleCreatePdf() {
    if (pages.length === 0) return
    setPhase('processing')
    setProcessError(null)
    try {
      const bytes = await imagesToPdf(pages.map((p) => p.processedFile))
      const blob = toBlob(bytes)
      setResultBlob(blob)

      // Save to document store for persistence
      const fileName = `scan_${new Date().toISOString().slice(0, 10)}.pdf`
      addDocument({
        id: `doc_${Date.now()}`,
        title: fileName,
        type: 'scan',
        size: blob.size,
        createdAt: new Date().toISOString(),
        blobUrl: URL.createObjectURL(blob),
      })

      setPhase('done')
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Processing failed')
      setPhase('review')
    }
  }

  function handleReset() {
    pages.forEach((p) => URL.revokeObjectURL(p.thumbnailUrl))
    setPhase('home'); setPages([]); setResultBlob(null)
    setProcessError(null); setEditingPageId(null)
  }

  // ==============================================================
  // EDIT PAGE SCREEN (per-page adjustments from review)
  // ==============================================================
  if (phase === 'editPage' && editingPage) {
    const pageIndex = pages.findIndex((p) => p.id === editingPageId)
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-2 pt-6">
          <button onClick={cancelPageEdit} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white/80 active:text-white">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {t('common.cancel')}
          </button>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
            Page {pageIndex + 1}/{pages.length}
          </span>
          <button onClick={savePageEdit} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white active:bg-primary/80">
            {t('common.save')}
          </button>
        </div>

        {/* Preview image */}
        <div className="flex flex-1 items-center justify-center px-4 py-2">
          {editPreviewUrl ? (
            <img src={editPreviewUrl} alt="" className="max-h-full max-w-full rounded-xl shadow-2xl" />
          ) : (
            <span className="material-symbols-outlined animate-spin text-3xl text-white/50">progress_activity</span>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-2">
          {(['enhance', 'original', 'grayscale', 'highContrast'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setEditFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                editFilter === f ? 'scale-105 bg-primary text-white' : 'bg-white/15 text-white/80'
              }`}
            >
              {t(`scanner.filter_${f}`)}
            </button>
          ))}
        </div>

        {/* Adjustment sliders */}
        <div className="space-y-2 bg-gray-900/80 px-5 pb-8 pt-3">
          <SliderRow icon="brightness_6" label={t('scanner.brightness')} value={editAdj.brightness} min={-60} max={60}
            onChange={(v) => setEditAdj((a) => ({ ...a, brightness: v }))} />
          <SliderRow icon="contrast" label={t('scanner.contrast')} value={editAdj.contrast} min={-30} max={100}
            onChange={(v) => setEditAdj((a) => ({ ...a, contrast: v }))} />
          <SliderRow icon="deblur" label={t('scanner.sharpness')} value={editAdj.sharpness} min={0} max={100}
            onChange={(v) => setEditAdj((a) => ({ ...a, sharpness: v }))} />
        </div>
      </div>
    )
  }

  // ==============================================================
  // CAMERA SCREEN — continuous shooting, stay here
  // ==============================================================
  if (phase === 'camera') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div ref={videoContainerRef} className="relative flex-1 overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

          {/* A4 guide frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="relative"
              style={{ width: '80%', aspectRatio: '210 / 297', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)', borderRadius: '8px' }}
            >
              <div className="absolute inset-0 rounded-lg border border-white/50" />
              <div className="absolute -left-px -top-px h-7 w-7 rounded-tl-lg border-l-[3px] border-t-[3px] border-primary" />
              <div className="absolute -right-px -top-px h-7 w-7 rounded-tr-lg border-r-[3px] border-t-[3px] border-primary" />
              <div className="absolute -bottom-px -left-px h-7 w-7 rounded-bl-lg border-b-[3px] border-l-[3px] border-primary" />
              <div className="absolute -bottom-px -right-px h-7 w-7 rounded-br-lg border-b-[3px] border-r-[3px] border-primary" />
            </div>
          </div>

          {/* Flash */}
          <div className={`pointer-events-none absolute inset-0 z-10 bg-white transition-opacity duration-200 ease-out ${showFlash ? 'opacity-70' : 'opacity-0'}`} />

          {/* Page counter badge */}
          {pages.length > 0 && (
            <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 shadow-lg">
              <span className="material-symbols-outlined text-sm text-white">description</span>
              <span className="text-sm font-bold text-white">{pages.length}</span>
            </div>
          )}

          {/* Error message (shows briefly on capture failure) */}
          {cameraError && (
            <div className="absolute left-3 right-3 top-14 z-30 rounded-lg bg-red-600/90 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
              {cameraError}
            </div>
          )}

          {/* Guide text */}
          <div className="absolute bottom-3 left-0 right-0 z-20 text-center">
            <span className="rounded-full bg-black/50 px-4 py-1.5 text-xs font-medium text-white/90">
              {cvReady ? t('scanner.autoDetectReady') : t('scanner.alignDocument')}
            </span>
          </div>
        </div>

        {/* Thumbnail strip — shows captured pages */}
        {pages.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto bg-black/90 px-3 py-2">
            {pages.map((page, i) => (
              <div key={page.id} className="relative flex-shrink-0">
                <img src={page.thumbnailUrl} alt="" className="h-14 w-auto rounded border border-white/30 object-cover" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">{i + 1}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom controls */}
        <div className="flex items-center justify-between bg-black px-5 pb-8 pt-4">
          <button onClick={() => { stopCamera(); setPhase(pages.length > 0 ? 'review' : 'home') }} className="min-w-[64px] rounded-lg px-2 py-2 text-sm font-medium text-white/80">
            {t('common.cancel')}
          </button>
          <button
            onClick={capturePhoto}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[4px] border-white shadow-lg transition-transform active:scale-90"
          >
            <div className="pointer-events-none h-[56px] w-[56px] rounded-full bg-white" />
          </button>
          {pages.length > 0 ? (
            <button onClick={handleCameraDone} className="min-w-[64px] rounded-lg bg-primary/20 px-3 py-2 text-sm font-bold text-primary active:bg-primary/30">
              {t('scanner.done')} ({pages.length})
            </button>
          ) : (
            <div className="min-w-[64px]" />
          )}
        </div>
      </div>
    )
  }

  // ==============================================================
  // PROCESSING
  // ==============================================================
  if (phase === 'processing') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background dark:bg-[#131f1e]">
        <span className="material-symbols-outlined animate-spin text-5xl text-primary">progress_activity</span>
        <p className="mt-4 text-sm font-medium text-text-secondary">{t('scanner.creatingPdf')}</p>
        <p className="mt-1 text-xs text-text-secondary/60">{pages.length} page{pages.length > 1 ? 's' : ''}</p>
      </div>
    )
  }

  // ==============================================================
  // RESULT
  // ==============================================================
  if (phase === 'done' && resultBlob) {
    const fileName = `scan_${new Date().toISOString().slice(0, 10)}.pdf`
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('scanner.title')}</h1>
          </div>
        </header>
        <div className="flex-1 px-4 pb-24 pt-4">
          <ResultScreen fileName={fileName} originalSize={pages.reduce((s, p) => s + p.processedFile.size, 0)} resultSize={resultBlob.size} resultBlob={resultBlob} onViewInLibrary={() => navigate('/documents')} />
          <div className="mt-6">
            <p className="mb-2 text-center text-xs font-medium text-text-secondary">{t('scanner.editBeforeSaving')}</p>
            <div className="flex gap-2">
              <button onClick={() => {
                if (resultBlob) {
                  setPendingFile(new File([resultBlob], `scan_${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' }))
                }
                navigate('/tools/edit')
              }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2.5 text-xs font-medium text-text-primary shadow-sm hover:bg-gray-50 dark:border-slate-700 dark:bg-[#1a2b2a]">
                <span className="material-symbols-outlined text-base text-blue-500">edit</span>{t('tools.editPdf')}
              </button>
              <button onClick={() => {
                if (resultBlob) {
                  setPendingFile(new File([resultBlob], `scan_${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' }))
                }
                navigate('/tools/sign')
              }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2.5 text-xs font-medium text-text-primary shadow-sm hover:bg-gray-50 dark:border-slate-700 dark:bg-[#1a2b2a]">
                <span className="material-symbols-outlined text-base text-green-600">draw</span>{t('tools.sign')}
              </button>
            </div>
          </div>
          <button onClick={handleReset} className="mt-4 w-full rounded-lg border border-gray-300 py-3 font-medium text-text-primary hover:bg-gray-50 dark:border-slate-700">{t('scanner.scanMore')}</button>
        </div>
      </div>
    )
  }

  // ==============================================================
  // REVIEW SCREEN — all pages, tap to edit, reorder
  // ==============================================================
  if (phase === 'review') {
    return (
      <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
        <input ref={importRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImport} />
        <header className="sticky top-0 z-10 bg-white px-4 pb-3 pt-6 dark:bg-[#1a2b2a]">
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
            </button>
            <h1 className="flex-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {pages.length} page{pages.length > 1 ? 's' : ''} {t('scanner.scanned')}
            </h1>
          </div>
          <p className="mt-1 pl-[52px] text-xs text-text-secondary">{t('scanner.tapToEdit')}</p>
        </header>
        <div className="flex-1 px-4 pb-24">
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {pages.map((page, i) => (
              <div
                key={page.id}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-transform active:scale-95 dark:border-slate-700 dark:bg-[#1a2b2a]"
                onClick={() => openPageEditor(page.id)}
              >
                <img src={page.thumbnailUrl} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-black/60 px-2 pb-1.5 pt-4">
                  <span className="text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="material-symbols-outlined text-sm text-white/80">tune</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removePage(page.id) }}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={openCamera} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/40 py-3.5 text-sm font-medium text-primary active:bg-primary/5">
              <span className="material-symbols-outlined text-lg">photo_camera</span>{t('scanner.addPage')}
            </button>
            <button onClick={() => importRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 py-3.5 text-sm font-medium text-text-secondary active:bg-gray-50 dark:border-slate-600">
              <span className="material-symbols-outlined text-lg">upload_file</span>{t('scanner.importFile')}
            </button>
          </div>
          {processError && <div className="mt-3 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{processError}</div>}
          <button onClick={handleCreatePdf} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]">
            <span className="material-symbols-outlined">picture_as_pdf</span>{t('scanner.createPdf')}
          </button>
        </div>
      </div>
    )
  }

  // ==============================================================
  // HOME SCREEN
  // ==============================================================
  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-[#131f1e]">
      <input ref={importRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleImport} />
      <header className="sticky top-0 z-10 bg-white px-4 pb-4 pt-6 dark:bg-[#1a2b2a]">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('scanner.title')}</h1>
        </div>
      </header>
      <div className="flex-1 px-4 pb-24">
        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-[#1a2b2a]">
          <div className="flex flex-col items-center px-6 py-12">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-6xl text-primary">document_scanner</span>
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-slate-100">{t('scanner.scanDocument')}</h2>
            <p className="mt-2 max-w-[260px] text-center text-sm text-slate-500 dark:text-slate-400">{t('scanner.homeDescription')}</p>
            <div className="mt-8 flex gap-4">
              <button onClick={openCamera} className="flex flex-col items-center gap-2.5 rounded-2xl bg-primary px-8 py-5 font-semibold text-white shadow-lg shadow-primary/25 transition-transform active:scale-95">
                <span className="material-symbols-outlined text-3xl">photo_camera</span>
                <span className="text-sm">{t('scanner.takePhoto')}</span>
              </button>
              <button onClick={() => importRef.current?.click()} className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-primary/30 px-8 py-5 font-semibold text-primary transition-transform active:scale-95 hover:bg-primary/5 dark:hover:bg-primary/10">
                <span className="material-symbols-outlined text-3xl">upload_file</span>
                <span className="text-sm">{t('scanner.importFile')}</span>
              </button>
            </div>
            {cameraError && <p className="mt-4 text-sm text-danger">{cameraError}</p>}
          </div>
        </div>
        <div className="mt-5 rounded-xl bg-primary/5 p-4 dark:bg-primary/10">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 text-lg text-primary">lightbulb</span>
            <div>
              <p className="text-xs font-semibold text-text-primary dark:text-slate-200">{t('scanner.tipTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary dark:text-slate-400">{t('scanner.tipText')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

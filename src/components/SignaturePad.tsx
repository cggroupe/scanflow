import { useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SignaturePadProps {
  readonly width?: number
  readonly height?: number
  readonly onSignature: (pngBlob: Blob) => void
}

export default function SignaturePad({ width = 360, height = 180, onSignature }: SignaturePadProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    setDrawing(true)
    lastPoint.current = getPos(e)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing || !lastPoint.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPoint.current = pos
    setHasStrokes(true)
  }

  function onPointerUp() {
    setDrawing(false)
    lastPoint.current = null
  }

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }, [])

  function handleConfirm() {
    const canvas = canvasRef.current!
    canvas.toBlob((blob) => {
      if (blob) onSignature(blob)
    }, 'image/png')
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-primary">{t('signPage.drawSignature')}</p>
      <div className="overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none"
          style={{ aspectRatio: `${width}/${height}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50"
        >
          {t('signPage.clear')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasStrokes}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('signPage.confirm')}
        </button>
      </div>
    </div>
  )
}

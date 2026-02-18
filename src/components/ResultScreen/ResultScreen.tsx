import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import FileSizeCompare from './FileSizeCompare'
import ActionButtons from './ActionButtons'

interface ResultScreenProps {
  readonly fileName: string
  readonly originalSize?: number
  readonly resultSize: number
  readonly resultBlob: Blob
  readonly onShare?: () => void
  readonly onViewInLibrary?: () => void
  readonly className?: string
}

export default function ResultScreen({
  fileName,
  originalSize,
  resultSize,
  resultBlob,
  onShare,
  onViewInLibrary,
  className = '',
}: ResultScreenProps) {
  const { t } = useTranslation()

  function handleDownload() {
    const url = URL.createObjectURL(resultBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleShare() {
    if (navigator.share) {
      const file = new File([resultBlob], fileName, { type: resultBlob.type })
      navigator.share({ files: [file] }).catch(() => {})
    }
    onShare?.()
  }

  return (
    <div className={`mx-auto max-w-md space-y-6 text-center ${className}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">{t('resultScreen.success')}</h2>
        <p className="text-sm text-text-secondary">{fileName}</p>
      </div>

      {originalSize != null && (
        <FileSizeCompare originalSize={originalSize} resultSize={resultSize} />
      )}

      <ActionButtons
        onDownload={handleDownload}
        onShare={'share' in navigator ? handleShare : undefined}
        onViewInLibrary={onViewInLibrary}
      />
    </div>
  )
}

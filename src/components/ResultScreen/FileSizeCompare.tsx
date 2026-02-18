import { useTranslation } from 'react-i18next'

interface FileSizeCompareProps {
  readonly originalSize: number
  readonly resultSize: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileSizeCompare({ originalSize, resultSize }: FileSizeCompareProps) {
  const { t } = useTranslation()
  const reduction = Math.round(((originalSize - resultSize) / originalSize) * 100)
  const isReduced = resultSize < originalSize

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{t('resultScreen.originalSize')}</span>
        <span className="font-medium text-text-primary">{formatSize(originalSize)}</span>
      </div>

      {/* Visual bar comparison */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-gray-300" />
        <div
          className={`h-2 rounded-full ${isReduced ? 'bg-success' : 'bg-warning'}`}
          style={{ width: `${Math.min((resultSize / originalSize) * 100, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{t('resultScreen.resultSize')}</span>
        <span className="font-medium text-text-primary">{formatSize(resultSize)}</span>
      </div>

      {isReduced && (
        <div className="text-center">
          <span className="inline-block rounded-full bg-success/10 px-3 py-1 text-sm font-semibold text-success">
            {t('resultScreen.reduction', { percent: reduction })}
          </span>
        </div>
      )}
    </div>
  )
}

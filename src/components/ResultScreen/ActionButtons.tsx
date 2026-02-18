import { useTranslation } from 'react-i18next'
import { Download, Share2, Library } from 'lucide-react'

interface ActionButtonsProps {
  readonly onDownload: () => void
  readonly onShare?: () => void
  readonly onViewInLibrary?: () => void
}

export default function ActionButtons({ onDownload, onShare, onViewInLibrary }: ActionButtonsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
      <button
        type="button"
        onClick={onDownload}
        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
      >
        <Download className="h-4 w-4" />
        {t('resultScreen.download')}
      </button>

      {onShare && (
        <button
          type="button"
          onClick={onShare}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-text-primary hover:bg-gray-50"
        >
          <Share2 className="h-4 w-4" />
          {t('resultScreen.share')}
        </button>
      )}

      {onViewInLibrary && (
        <button
          type="button"
          onClick={onViewInLibrary}
          className="flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <Library className="h-4 w-4" />
          {t('resultScreen.viewInLibrary')}
        </button>
      )}
    </div>
  )
}

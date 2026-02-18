import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'

interface DropZoneProps {
  readonly isDragging: boolean
  readonly onOpenFilePicker: () => void
  readonly accept?: string[]
  readonly multiple?: boolean
  readonly maxSizeLabel?: string
  readonly dropZoneProps: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}

export default function DropZone({
  isDragging,
  onOpenFilePicker,
  maxSizeLabel,
  dropZoneProps,
}: DropZoneProps) {
  const { t } = useTranslation()

  return (
    <div
      {...dropZoneProps}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-gray-300 bg-gray-50 hover:border-primary/50'
      }`}
    >
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
        isDragging ? 'bg-primary/10' : 'bg-gray-100'
      }`}>
        <Upload className={`h-6 w-6 ${isDragging ? 'text-primary' : 'text-text-secondary'}`} />
      </div>

      <p className="text-sm font-medium text-text-primary">
        {t('fileUploader.dragHere')}
      </p>
      <p className="my-2 text-xs text-text-secondary">{t('fileUploader.or')}</p>
      <button
        type="button"
        onClick={onOpenFilePicker}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        {t('fileUploader.selectFiles')}
      </button>

      {maxSizeLabel && (
        <p className="mt-3 text-xs text-text-secondary">
          {t('fileUploader.maxSize', { size: maxSizeLabel })}
        </p>
      )}
    </div>
  )
}

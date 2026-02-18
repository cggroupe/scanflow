import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileUpload } from '@/hooks/useFileUpload'
import DropZone from './DropZone'
import FilePreview from './FilePreview'

interface FileUploaderProps {
  readonly accept?: string[]
  readonly maxFiles?: number
  readonly maxSizeBytes?: number
  readonly multiple?: boolean
  readonly onFilesChange: (files: File[]) => void
  readonly maxSizeLabel?: string
  readonly className?: string
}

export default function FileUploader({
  accept,
  maxFiles = 1,
  maxSizeBytes = 50 * 1024 * 1024,
  multiple = false,
  onFilesChange,
  maxSizeLabel = '50 MB',
  className = '',
}: FileUploaderProps) {
  const { t } = useTranslation()
  const {
    files,
    isDragging,
    error,
    addFiles,
    removeFile,
    clearFiles,
    inputRef,
    openFilePicker,
    dropZoneProps,
  } = useFileUpload({ accept, maxFiles, maxSizeBytes, multiple })

  useEffect(() => {
    onFilesChange(files)
  }, [files, onFilesChange])

  const errorMessages: Record<string, string> = {
    invalidType: t('fileUploader.invalidType'),
    tooLarge: t('fileUploader.tooLarge', { max: maxSizeLabel }),
    tooMany: t('fileUploader.tooMany', { max: String(maxFiles) }),
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept?.join(',')}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {files.length === 0 ? (
        <DropZone
          isDragging={isDragging}
          onOpenFilePicker={openFilePicker}
          accept={accept}
          multiple={multiple}
          maxSizeLabel={maxSizeLabel}
          dropZoneProps={dropZoneProps}
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {files.map((file, i) => (
              <FilePreview
                key={`${file.name}-${file.size}`}
                file={file}
                index={i}
                onRemove={removeFile}
                showDragHandle={multiple && files.length > 1}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {multiple && files.length < maxFiles && (
              <button
                type="button"
                onClick={openFilePicker}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50"
              >
                + {t('fileUploader.selectFiles')}
              </button>
            )}
            <button
              type="button"
              onClick={clearFiles}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5"
            >
              {t('common.delete')}
            </button>
          </div>

          <p className="text-xs text-text-secondary">
            {t('fileUploader.fileCount', { count: files.length })}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger">{errorMessages[error] ?? error}</p>
      )}
    </div>
  )
}

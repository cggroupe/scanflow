import { FileText, X, GripVertical } from 'lucide-react'

interface FilePreviewProps {
  readonly file: File
  readonly index: number
  readonly onRemove: (index: number) => void
  readonly showDragHandle?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FilePreview({ file, index, onRemove, showDragHandle = false }: FilePreviewProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-surface p-3">
      {showDragHandle && (
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-secondary" />
      )}

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger/10">
        <FileText className="h-5 w-5 text-danger" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
        <p className="text-xs text-text-secondary">{formatFileSize(file.size)}</p>
      </div>

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="shrink-0 rounded-lg p-1.5 hover:bg-gray-100"
        aria-label="Remove"
      >
        <X className="h-4 w-4 text-text-secondary" />
      </button>
    </div>
  )
}

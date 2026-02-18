import { useState, useRef, useCallback } from 'react'

interface UseFileUploadOptions {
  readonly accept?: string[]
  readonly maxFiles?: number
  readonly maxSizeBytes?: number
  readonly multiple?: boolean
}

interface UseFileUploadReturn {
  files: File[]
  isDragging: boolean
  error: string | null
  addFiles: (newFiles: FileList | File[]) => void
  removeFile: (index: number) => void
  reorderFiles: (fromIndex: number, toIndex: number) => void
  clearFiles: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  openFilePicker: () => void
  dropZoneProps: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    accept,
    maxFiles = 1,
    maxSizeBytes = 50 * 1024 * 1024,
    multiple = false,
  } = options

  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragCounter = useRef(0)

  const validateFile = useCallback((file: File): string | null => {
    if (accept && accept.length > 0) {
      const matches = accept.some((type) => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.replace('/*', '/'))
        }
        return file.type === type || file.name.endsWith(type)
      })
      if (!matches) return 'invalidType'
    }
    if (file.size > maxSizeBytes) return 'tooLarge'
    return null
  }, [accept, maxSizeBytes])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(newFiles)

    for (const file of fileArray) {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setFiles((prev) => {
      const effectiveMax = multiple ? maxFiles : 1
      const combined = multiple ? [...prev, ...fileArray] : fileArray.slice(0, 1)
      if (combined.length > effectiveMax) {
        setError('tooMany')
        return combined.slice(0, effectiveMax)
      }
      return combined
    })
  }, [validateFile, maxFiles, multiple])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setError(null)
  }, [])

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    setFiles((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
    setError(null)
  }, [])

  const openFilePicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const dropZoneProps = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current++
      setIsDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current--
      if (dragCounter.current === 0) setIsDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
  }

  return {
    files,
    isDragging,
    error,
    addFiles,
    removeFile,
    reorderFiles,
    clearFiles,
    inputRef,
    openFilePicker,
    dropZoneProps,
  }
}

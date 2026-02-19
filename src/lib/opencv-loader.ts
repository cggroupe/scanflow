declare global {
  interface Window {
    cv: any
    Module: any
  }
}

let loadPromise: Promise<any> | null = null

export function loadOpenCV(): Promise<any> {
  if (window.cv && window.cv.Mat) return Promise.resolve(window.cv)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    // Safety timeout — reject if OpenCV doesn't initialize within 30s
    const timeout = setTimeout(() => {
      loadPromise = null
      reject(new Error('OpenCV load timeout'))
    }, 30000)

    window.Module = {
      onRuntimeInitialized: () => {
        clearTimeout(timeout)
        resolve(window.cv)
      },
    }

    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.9.0/opencv.js'
    script.async = true
    script.onerror = () => {
      clearTimeout(timeout)
      loadPromise = null
      reject(new Error('Failed to load OpenCV.js'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

export function isOpenCVReady(): boolean {
  return !!(window.cv && window.cv.Mat)
}

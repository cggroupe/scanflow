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
    window.Module = {
      onRuntimeInitialized: () => resolve(window.cv),
    }

    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.9.0/opencv.js'
    script.async = true
    script.onerror = () => {
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

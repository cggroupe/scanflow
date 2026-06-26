import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// NOTE: the service worker is intentionally NOT registered anymore. A previous
// cache-first SW kept serving stale builds during iteration. public/sw.js is now a
// self-destruct worker (clears caches + unregisters) so any client that still has
// the old SW recovers to a fresh, network-loaded app. A clean SW can be re-added
// later once the app stabilizes.

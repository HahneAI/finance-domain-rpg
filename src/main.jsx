import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Service worker registration — does NOT auto-reload the page on a new deploy
// (see vite.config.js registerType comment). Instead, surface an update prompt
// the user can act on; App.jsx's UpdateAvailableBanner calls window.__pwaUpdateSW()
// when they choose to refresh.
window.__pwaUpdateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("pwa-update-available"));
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

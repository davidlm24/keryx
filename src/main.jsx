import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/fonts.css'
import '@/index.css'

// Desktop: Ctrl+wheel (a precision touchpad's pinch too) never zooms a page
// freely (audit C-91): the console steps its saved zoom instead (Console.jsx,
// src/lib/wheelZoom.js) and the outputs never zoom. A browser (a network
// screen, the preview) keeps its own zoom.
if (typeof window !== 'undefined' && window.keryxDesktop) {
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault() }, { passive: false })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

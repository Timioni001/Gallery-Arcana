import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Demo builds (VITE_DEMO=1) answer the API inside the browser; normal builds never load it.
if (import.meta.env.VITE_DEMO === '1') await (await import('./demo/server')).installDemoServer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

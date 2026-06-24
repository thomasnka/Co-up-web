import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { runSmokeTests } from './smokeTest.js'

// Clean OAuth hash fragment immediately (Supabase implicit flow puts token in #hash)
// This runs before React renders so URL is clean right away
if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// Run smoke tests async after mount (không block render)
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    runSmokeTests().catch(e => console.error('[SMOKE] Fatal:', e));
  }, { once: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'


// Clean OAuth hash fragment immediately (Supabase implicit flow puts token in #hash)
// This runs before React renders so URL is clean right away
if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

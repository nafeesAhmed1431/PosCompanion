import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from '@/lib/auth-context'
import './assets/app.css'

// HashRouter, not BrowserRouter — a file:// / custom-scheme production
// Electron load has no server to resolve deep-link paths on refresh.
// AuthProvider wraps the router (not the other way round) since login.jsx's
// useNavigate call and its useAuth call both need to fire from the same
// render tree without either one being outside the other's context.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)

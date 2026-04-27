// Browser entry point. Vite reads this file from index.html, mounts the React
// tree into the #root element, and hot-reloads on source changes during
// development. StrictMode intentionally double-invokes lifecycle methods in
// dev to surface accidental side effects — this is a dev-only helper and has
// no effect on production builds.
//
// The app is wrapped in ToastProvider here (rather than inside App.tsx) so
// that any future top-level component — including error boundaries — can
// also call `useToast()`.

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/toast/ToastProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)

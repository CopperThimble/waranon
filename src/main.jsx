import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './refined.css'
import './field.css'
import App from './App.jsx'
import { startAnalytics } from './lib/analytics'

startAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

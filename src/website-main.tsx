import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './website.css'
import { WebsiteApp } from './website/WebsiteApp'

createRoot(document.getElementById('website-root')!).render(
  <StrictMode>
    <WebsiteApp />
  </StrictMode>,
)

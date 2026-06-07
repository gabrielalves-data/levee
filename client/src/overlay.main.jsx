import React from 'react'
import ReactDOM from 'react-dom/client'
import Overlay from './overlay'
import './index.css'
import { initToken } from './api'

initToken().then(() => {
  ReactDOM.createRoot(document.getElementById('overlay-root')).render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>
  )
})

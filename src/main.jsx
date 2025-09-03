import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // ⬅ Certifique-se de que a importação tem .jsx
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

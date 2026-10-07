import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// No StrictMode: it double-invokes effects in dev, which would boot the WebGL scene twice.
createRoot(document.getElementById('root')).render(<App />)

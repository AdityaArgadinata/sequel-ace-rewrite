import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'

document.documentElement.classList.toggle('mac-desktop', /Mac/.test(navigator.platform));
document.documentElement.classList.toggle('native-vibrancy', /Mac/.test(navigator.platform) && 'runtime' in window);

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)

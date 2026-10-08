import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './index.css'

const hour = 60 * 60 * 1000

function watchForUpdates(swUrl: string, registration: ServiceWorkerRegistration) {
  async function check() {
    if (registration.installing || !navigator.onLine) return
    try {
      const response = await fetch(swUrl, { cache: 'no-store' })
      if (response.ok) await registration.update()
    } catch {
      // オフラインのときは次回の表示時にやり直す
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, hour)
}

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (registration) watchForUpdates(swUrl, registration)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

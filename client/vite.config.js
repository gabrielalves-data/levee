import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Production runs from file:// where Electron's onHeadersReceived CSP handler
// never fires (no HTTP response headers), so inject a strict CSP meta tag at
// build time only. Dev keeps the header-based CSP, which is looser to allow
// Vite HMR. connect-src is loopback-wildcard: it forbids every external host
// (the privacy guarantee) while tolerating whatever port the server binds.
const PROD_CSP = [
  "default-src 'self'",
  "connect-src http://127.0.0.1:* http://localhost:*",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

function cspMetaPlugin() {
  return {
    name: 'inject-prod-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
      )
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [react(), cspMetaPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
})

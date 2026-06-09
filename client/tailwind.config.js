import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Terminal / "Matrix multi-tone" theme ──────────────────────────────────────
// Re-skins the whole UI by remapping the Tailwind palettes the components already
// use (slate / indigo / blue / purple / violet / emerald / amber / red) onto a
// black-base, phosphor-green look with cyan + magenta accents. Fonts are a LOCAL
// monospace stack only — no web-font CDN, to honour the zero-outbound rule.

// Green-tinted neutral ramp: low = dark (backgrounds), high = light (text).
const slate = {
  50:  '#eafff0',
  100: '#d3ffe0',
  200: '#bff7cf',
  300: '#93dca5',
  400: '#6aa97f',
  500: '#4a7659',
  600: '#33503d',
  700: '#1d2a1d',
  800: '#0f160f',
  900: '#0a0f0a',
  950: '#050805',
}

// Primary accent — phosphor green. 600/700 stay dark enough for white button text.
const indigo = {
  300: '#7dffbd',
  400: '#3dffa0',
  500: '#10c97d',
  600: '#0a7a4a',
  700: '#075c38',
}

const emerald = { 300: '#7dffb0', 400: '#00ff9c', 500: '#10d98a' }
const amber   = { 300: '#ffd24d', 400: '#ffb000', 500: '#e09a00' }
const red     = { 300: '#ff8a8a', 400: '#ff5c5c', 500: '#e23b3b' }

// Category accents — cyan / magenta / pink for the multi-tone feel.
const blue    = { 300: '#7df0ff', 500: '#00d0ff' } // cloud
const purple  = { 300: '#ff9bf0', 500: '#e040d8' } // ai_model
const violet  = { 300: '#ffa6d8', 500: '#ff4fb0' } // ai_api

const sharp = {
  none: '0', sm: '0', DEFAULT: '2px', md: '2px',
  lg: '2px', xl: '2px', '2xl': '2px', '3xl': '2px', full: '2px',
}

const mono = [
  '"Cascadia Code"', '"Cascadia Mono"', '"JetBrains Mono"',
  '"Fira Code"', 'Consolas', '"Courier New"', 'monospace',
]

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    resolve(__dir, 'index.html'),
    resolve(__dir, 'src/**/*.{js,jsx}'),
  ],
  theme: {
    extend: {
      fontFamily: { sans: mono, mono },
      colors: { slate, indigo, emerald, amber, red, blue, purple, violet },
      borderRadius: sharp,
    },
  },
  plugins: [],
}

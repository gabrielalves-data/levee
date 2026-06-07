import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    resolve(__dir, 'index.html'),
    resolve(__dir, 'src/**/*.{js,jsx}'),
  ],
  theme: { extend: {} },
  plugins: [],
}

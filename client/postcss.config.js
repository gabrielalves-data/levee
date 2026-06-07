import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: {
    tailwindcss: { config: resolve(__dir, 'tailwind.config.js') },
    autoprefixer: {},
  },
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

// base ต้องตรงกับชื่อ repo บน GitHub Pages: https://<user>.github.io/cords-app/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: '/cords-app/',
  build: { outDir: 'docs', emptyOutDir: true },
})

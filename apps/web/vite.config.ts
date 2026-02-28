import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@earno/shared': path.resolve(__dirname, '../../src/shared'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '../../src')],
    },
  },
})

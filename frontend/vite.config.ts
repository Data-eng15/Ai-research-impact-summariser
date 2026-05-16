/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, forward /_/backend/* to the local FastAPI server
      // This mirrors the Firebase App Hosting production route exactly
      '/_/backend': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/_\/backend/, ''),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
})


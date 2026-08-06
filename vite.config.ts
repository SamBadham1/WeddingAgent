import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend runs on 5173 and proxies API calls to the Express server on 3001.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})

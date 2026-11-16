import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The backend (src/server/server.js). In production it serves the built
      // site itself, so the front end always calls /api on its own address.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/adam': {
        target: 'https://bioinformatics.cs.ntou.edu.tw',
        changeOrigin: true,
        secure: false,   // bypass SSL like we did in the scraper
      }
    }
  }
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/adam': {
        target: 'https://bioinformatics.cs.ntou.edu.tw',
        changeOrigin: true,
        secure: false,   // bypass SSL like we did in the scraper
      }
    }
  }
})
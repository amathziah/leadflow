import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Lets the app be served from one origin in development, so the browser
      // never needs a CORS preflight to reach the API.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/screenshots': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})

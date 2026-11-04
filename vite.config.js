import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NC_BUILD_TARGET === 'android' ? './' : '/nightcrossing/',
  // Local PHP server only. Production requests stay on the website's origin.
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    proxy: {
      '/nightcrossing/api/': { target: 'http://127.0.0.1:8099', rewrite: path => path.replace(/^\/nightcrossing/, '') },
    },
  },
})

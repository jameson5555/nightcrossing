import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isAndroidBuild = process.env.NC_BUILD_TARGET === 'android'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'nightcrossing-web-analytics',
    apply: 'build',
    transformIndexHtml() {
      if (isAndroidBuild) return
      return [
        {
          tag: 'script',
          attrs: { async: true, src: 'https://www.googletagmanager.com/gtm.js?id=GTM-K2RBF57H' },
          injectTo: 'head-prepend',
        },
        {
          tag: 'script',
          children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }],
  base: isAndroidBuild ? './' : '/nightcrossing/',
  // Local PHP server only. Production requests stay on the website's origin.
  server: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    proxy: {
      '/nightcrossing/api/': { target: 'http://127.0.0.1:8099', rewrite: path => path.replace(/^\/nightcrossing/, '') },
    },
  },
})

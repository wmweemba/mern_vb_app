import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000/api'
  // Build a regex that matches the API origin for Workbox runtime caching
  const apiOrigin = apiUrl.replace(/\/api\/?$/, '')
  const apiCachePattern = new RegExp(`^${apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/`)

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon.ico'],
        manifest: {
          name: 'Chama360',
          short_name: 'Chama360',
          start_url: '/',
          display: 'standalone',
          background_color: '#F0EDE8',
          theme_color: '#C8501A',
          description: 'Village banking group management — savings, loans, and reports.',
          icons: [
            {
              src: '/icon-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: '/icon-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: '/icon-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ],
          shortcuts: [
            {
              name: 'Add Loan',
              short_name: 'Loan',
              url: '/loans',
              icons: [{ src: '/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' }]
            },
            {
              name: 'View Reports',
              short_name: 'Reports',
              url: '/reports',
              icons: [{ src: '/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' }]
            }
          ]
        },
        workbox: {
          // Serve index.html for all navigation requests the SW intercepts —
          // mirrors the nginx try_files fix so the installed PWA handles routes correctly
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: apiCachePattern,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 50, maxAgeSeconds: 86400 }
              }
            }
          ]
        }
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:5000',
      },
    },
  }
})

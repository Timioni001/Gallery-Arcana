import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The API rejects mutations whose Origin differs from its PUBLIC_ORIGIN. In
// development the browser talks to Vite, so the proxy presents the API's own
// origin. Production should serve web/dist from the same origin as the API.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = env.ARCANA_API ?? 'http://localhost:8080'
  const proxy = {
    target: api,
    changeOrigin: true,
    configure: (p: { on: (e: 'proxyReq', cb: (req: { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void }) => void) => void }) => {
      p.on('proxyReq', (req) => {
        req.setHeader('origin', new URL(api).origin)
        req.removeHeader('sec-fetch-site')
      })
    },
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
        // The audited client SDK is compiled from source so web and API share one implementation.
        '@arcana/client-crypto': path.resolve(import.meta.dirname, '../packages/client-crypto/src/index.ts'),
        '@hpke/core': path.resolve(import.meta.dirname, './node_modules/@hpke/core'),
      },
    },
    server: { proxy: { '/api': proxy, '/previews': proxy } },
  }
})

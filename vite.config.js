/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
// Carimbo do build: o sha do commit quando a Vercel o expoe, senao o instante
// da compilacao. Nao aparece na interface — serve para o QA e para os testes
// poderem afirmar QUAL build a tela esta executando, em vez de deduzir pela
// aparencia.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.GIT_SHA?.slice(0, 7) ||
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (em vez do generateSW padrao): o Service Worker
      // passa a ter codigo PROPRIO (src/sw.js) para os eventos `push` e
      // `notificationclick` — o generateSW nao permite anexar listeners
      // customizados. Precache continua automatico via precacheAndRoute.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-512-maskable.png',
      ],
      devOptions: { enabled: false },
      manifest: {
        // Identidade estavel do app (evita reinstalacao duplicada quando o
        // manifest muda) — exigido por engines mais recentes de PWA install.
        id: '/',
        name: 'Agenda Inteligente 360',
        short_name: 'Agenda 360',
        description:
          'Calendario, Kanban semanal, gestor de tarefas, central de links e assistente de produtividade com IA.',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['productivity', 'business', 'lifestyle'],
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Separa dependencias grandes em chunks proprios (melhor cache no mobile).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          datefns: ['date-fns'],
        },
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      devOptions: { enabled: false },
      manifest: {
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
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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

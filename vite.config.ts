import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          supabase: ['@supabase/supabase-js'],
        }
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'lovable-uploads/*.png', 'robots.txt'],
      manifest: {
        name: 'RIDO Driver Portal',
        short_name: 'RIDO',
        description: 'Portal kierowcy RIDO - zarządzanie rozliczeniami i dokumentami',
        theme_color: '#6C4AE2',
        background_color: '#6C4AE2',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Portal Kierowcy',
            short_name: 'Kierowca',
            description: 'Panel kierowcy',
            url: '/driver',
            icons: [{ src: '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png', sizes: '96x96' }]
          },
          {
            name: 'Panel Floty',
            short_name: 'Flota',
            description: 'Panel zarządzania flotą',
            url: '/fleet/dashboard',
            icons: [{ src: '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png', sizes: '96x96' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

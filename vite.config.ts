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
    proxy: {
      // Generator PDF to czysty PHP (Dompdf) z katalogu public/, więc lokalny dev
      // serwer go nie uruchamia i „Pobierz PDF" nie miało czym wyrenderować pliku.
      // W dev kierujemy to żądanie na produkcyjny endpoint — bezstanowy przelicznik
      // HTML → PDF, ten sam, którego używa aplikacja po wdrożeniu. Dzięki temu
      // pobrany plik jest lokalnie identyczny z tym, co widać w podglądzie.
      '/invoice-pdf.php': {
        target: 'https://getrido.pl',
        changeOrigin: true,
      },
    },
  },
  // SECFIX4: w buildzie produkcyjnym wycinamy WSZYSTKIE console.* i debugger —
  // sweep całej klasy wycieków do konsoli przeglądarki (ID, e-maile, wyniki
  // SMS itp.). Dev (build:dev / npm run dev) zachowuje logi do debugowania.
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          supabase: ['@supabase/supabase-js'],
          // PERF C1: recharts ma 5 konsumentów w różnych lazy-chunkach
          // (raporty warsztatu, rozliczenia kierowcy, faktury, AI, marketing)
          // — jeden współdzielony chunk zamiast kopii/dublowania zależności.
          charts: ['recharts'],
        }
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png', 'pwa-icon-black.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'GetRido – Portal Ogłoszeń i Usług',
        short_name: 'GetRido',
        description: 'GetRido – inteligentny portal ogłoszeń nieruchomości, motoryzacji i usług z AI',
        theme_color: '#6C4AE2',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-icon-black.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-icon-black.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['business', 'shopping', 'lifestyle']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // 30 MB limit
        // Nawigacje do endpointów PHP i crm-import muszą iść na serwer —
        // bez tego SW serwowałby index.html zamiast np. invoice-pdf.php
        // (te same ścieżki, które .htaccess przepuszcza obok React Routera).
        navigateFallbackDenylist: [/\.php(\?|$)/, /^\/crm-import\//, /^\/foto-proxy/],
        // SECURITY: odpowiedzi Supabase zawierają dane zależne od JWT i tenanta.
        // Nie wolno umieszczać ich we wspólnym Cache Storage. Prywatny offline
        // pozostaje fail-closed; precache obejmuje wyłącznie statyczne assety.
        runtimeCaching: []
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

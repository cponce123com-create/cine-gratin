import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import compression from "vite-plugin-compression";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Marca de compilacion (base 36). Se usa dos veces:
 * - Como carpeta de los assets: `assets/<marca>/...`. Todas las URLs (script,
 *   estilos y chunks) cambian en cada despliegue, de modo que ni la cache del
 *   navegador ni la del service worker pueden servir un fichero antiguo (por
 *   ejemplo, uno guardado con cabeceras obsoletas).
 * - Como valor de `__BUILD_TIME__`, para poder identificar el despliegue
 *   Loaded en el DOM.
 */
const BUILD_TIME = Date.now().toString(36);

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    compression({ algorithm: "gzip", ext: ".gz" }),
    compression({ algorithm: "brotliCompress", ext: ".br" }),
    VitePWA({
      // Service worker propio: hace falta controlar como se sirve el shell
      // (siempre desde la red, con el ultimo shell como reserva) en lugar de
      // servir la copia pre-cacheada, que puede ser de otro despliegue.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Cine Gratin",
        short_name: "CineGratin",
        description: "Plataforma de streaming self-hosted",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,svg,png,jpg,jpeg,gif,webp,woff2}"],
        // The HLS player (345 kB) is only needed on the live TV and sports
        // pages: precaching it would download it on the first visit.
        globIgnores: ["**/hls.light.min-*.js"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    // Todos los assets se publican en una carpeta con la marca de compilacion:
    // en cada despliegue cambian las URLs de los scripts, los estilos y los
    // chunks, y las caches (navegador y service worker) dejan de poder
    // devolver ficheros antiguos.
    assetsDir: `assets/${BUILD_TIME}`,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          player: ["hls.js"],
        },
      },
    },
  },
});

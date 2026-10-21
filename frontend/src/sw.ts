/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { findShell, SHELL_CACHE, storeShell } from "./lib/shell-cache";

declare let self: ServiceWorkerGlobalScope & {
  /** Manifiesto de pre-cache inyectado por vite-plugin-pwa durante el build. */
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const ORIGIN = self.location.origin;

/**
 * Los scripts, los estilos y los iconos de este despliegue se guardan por
 * adelantado. El shell (index.html) no se pre-cachea a proposito: la copia
 * pre-cacheada corresponde a un despliegue anterior y sus URLs de assets
 * pueden estar obsoletas (fue la causa de que el sitio se quedara en blanco
 * tras un despliegue).
 */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// El service worker nuevo toma el control de inmediato: la pagina se recarga
// sola con los assets del despliegue actual.
self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * El shell se pide siempre a la red para no servir el de un despliegue
 * anterior. Si no hay conexion o el servidor falla, se responde con el ultimo
 * shell conocido, de modo que la aplicacion siga abriendo (los datos, no:
 * requieren la API).
 */
registerRoute(
  ({ request }) => request.mode === "navigate",
  async ({ request }) => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await storeShell(cache, request, response, ORIGIN);
        return response;
      }
      // El servidor no puede servir la pagina (por ejemplo, un 502 durante
      // un reinicio): es preferible el ultimo shell conocido.
      const cache = await caches.open(SHELL_CACHE);
      const cached = await findShell(cache, request, ORIGIN);
      return cached ?? response;
    } catch (error) {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await findShell(cache, request, ORIGIN);
      if (cached) return cached;
      throw error;
    }
  },
);

/**
 * Imagenes de terceros (TMDB): se guardan para no volver a pedirlas en cada
 * visita. Las imagenes de este origen ya estan en el pre-cache.
 */
registerRoute(
  ({ url }) => /^https:\/\/.*\.(png|jpg|jpeg|svg|webp)$/.test(url.href),
  new CacheFirst({
    cacheName: "images-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
      }),
    ],
  }),
);

/* PERFMASTER — service worker de mise à jour et cache sécurisé */
const CACHE_PREFIX = 'perfmaster-cache-';
const CACHE_VERSION = '2026-11-10-v1';
const CURRENT_CACHE = CACHE_PREFIX + CACHE_VERSION;

self.addEventListener('install', (event) => {
  // Active immédiatement la nouvelle version pour remplacer l'ancien worker.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CURRENT_CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ne touche ni aux requêtes externes, ni aux API, ni aux écritures.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Toujours demander la dernière page HTML au serveur : évite de garder
  // une ancienne interface après une mise à jour du site.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CURRENT_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('PERFMASTER est temporairement hors ligne. Vérifiez votre connexion.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Pour les ressources locales, privilégie le réseau et conserve une copie
  // hors ligne sans bloquer les mises à jour.
  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(async (response) => {
        if (response && response.ok) {
          const cache = await caches.open(CURRENT_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);
      return (await network) || cached || Response.error();
    })());
  }
});

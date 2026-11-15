const PM_CACHE = 'perfmaster-cache-20261115-r8';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('perfmaster-cache-') && k !== PM_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isDocument = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  event.respondWith((async () => {
    const cache = await caches.open(PM_CACHE);
    if (isDocument) {
      try {
        const fresh = await fetch(new Request(req, { cache: 'no-store' }));
        if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
      }
    }
    const cached = await cache.match(req);
    const update = fetch(req).then(async response => {
      if (response && response.ok) await cache.put(req, response.clone());
      return response;
    });
    return cached || update;
  })());
});


const CACHE_NAME = 'perfmaster-server-ready-v2';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './service-worker.js',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('perfmaster-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);

        if (res.ok) {
          const copy = res.clone();
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('./index.html', copy);
          } catch (e) {}
        }

        return res;
      } catch (e) {
        return await caches.match('./index.html');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;

    const res = await fetch(req);

    if (res.ok) {
      const copy = res.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, copy);
      } catch (e) {}
    }

    return res;
  })());
});

self.addEventListener('push', event => {
  let data = {
    title: 'PERFMASTER',
    body: 'Vous avez un rappel.',
    url: './'
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    try {
      data.body = event.data.text();
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'PERFMASTER', {
      body: data.body || 'Vous avez un rappel.',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: data.tag || 'perfmaster-push',
      renotify: false,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target = event.notification.data?.url || './';

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of list) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});

const CACHE_NAME = 'training-dashboard-v33';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];
// API endpoints that use stale-while-revalidate (instant response + background refresh)
const API_HOSTS = ['script.google.com', 'script.googleusercontent.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function handleApiRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(async response => {
    if (!response || !response.ok) return response;
    const forCache = response.clone();
    const forCompare = response.clone();
    await cache.put(request, forCache);
    if (cached) {
      const [newText, oldText] = await Promise.all([
        forCompare.text(),
        cached.clone().text()
      ]);
      if (newText !== oldText) {
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({type: 'swr-update', url: request.url}));
      }
    }
    return response;
  }).catch(() => cached || new Response('[]', {headers:{'Content-Type':'application/json'}}));

  // Return cached instantly if we have it; otherwise wait for network.
  return cached || networkPromise;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (API_HOSTS.some(d => url.includes(d))) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});

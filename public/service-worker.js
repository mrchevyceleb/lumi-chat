
const CACHE_VERSION = 'v6';
const APP_SHELL_CACHE = `lumi-chat-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lumi-chat-runtime-${CACHE_VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const isApiRequest = (url) => (
  url.hostname.includes('supabase.co') ||
  url.hostname.includes('googleapis.com') ||
  url.hostname.includes('goog') ||
  url.pathname.includes('/rest/v1/') ||
  url.pathname.includes('/functions/v1/') || // Edge Functions
  url.pathname.includes('/auth/v1/') || // Auth endpoints
  url.pathname.includes('/storage/v1/') || // Storage endpoints
  url.pathname.includes('/realtime/') // Realtime/websocket
);

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();

  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch(err => console.warn('Cache addAll error:', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Preload navigation requests where supported
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (err) {
          console.warn('Navigation preload enable failed:', err);
        }
      }

      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(err => {
        console.error('API fetch failed:', err);
        return new Response(JSON.stringify({ error: 'Network request failed' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  // Only handle same-origin assets below
  if (url.origin !== self.location.origin) return;

  // Cache-first for built assets/icons
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale-while-revalidate for other GET requests (e.g., images)
  event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigationRequest(event) {
  const cache = await caches.open(APP_SHELL_CACHE);

  // Use any preloaded response first
  try {
    const preload = await event.preloadResponse;
    if (preload) {
      cache.put('/index.html', preload.clone());
      return preload;
    }
  } catch (err) {
    console.warn('Navigation preload failed:', err);
  }

  // Network first with offline fallback
  try {
    const response = await fetch(event.request);
    cache.put('/index.html', response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match('/index.html');
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cached || Promise.reject(error);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || networkFetch;
}

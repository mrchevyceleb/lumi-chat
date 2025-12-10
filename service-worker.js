
const CACHE_VERSION = 'v7';
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

// Listen for messages from the app (e.g., to clear cache on auth errors)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('Received CLEAR_CACHE message, clearing all caches...');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      console.log('All caches cleared');
      // Notify the client
      if (event.source) {
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      }
    });
  }
  
  if (event.data && event.data.type === 'FORCE_REFRESH') {
    console.log('Received FORCE_REFRESH message, clearing caches and reloading...');
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      console.log('All caches cleared for force refresh');
      // Notify clients to reload
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'RELOAD_REQUIRED' });
        });
      });
    });
  }
  
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request).then(response => {
        // If we get a 401 or 403, the auth token is invalid
        // Notify all clients so they can handle re-authentication
        if (response.status === 401 || response.status === 403) {
          console.warn('Auth error detected (', response.status, '), notifying clients...');
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({ 
                type: 'AUTH_ERROR', 
                status: response.status,
                url: event.request.url 
              });
            });
          });
        }
        return response;
      }).catch(err => {
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
    if (preload && preload.ok) {
      cache.put('/index.html', preload.clone());
      return preload;
    }
  } catch (err) {
    console.warn('Navigation preload failed:', err);
  }

  // Network first with offline fallback
  try {
    const response = await fetch(event.request);
    
    // Only cache successful responses (200-299)
    // For 401/403, clear cache and notify clients of auth error
    if (response.ok) {
      cache.put('/index.html', response.clone());
      return response;
    } else if (response.status === 401 || response.status === 403) {
      console.warn('Auth error on navigation (', response.status, '), clearing cache...');
      
      // Clear all caches to prevent caching the error page
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      
      // Notify all clients about auth error
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({ 
          type: 'AUTH_ERROR', 
          status: response.status,
          url: event.request.url 
        });
      });
      
      return response;
    } else {
      // For other errors, don't cache but return the response
      return response;
    }
  } catch (err) {
    // Network failed, try to serve from cache
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

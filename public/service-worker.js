
const CACHE_NAME = 'lumi-chat-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // We try to cache what we can, but don't fail if external resources block CORS opaque responses
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('Cache addAll error (likely CORS):', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL FIX: Explicitly pass through API calls to the network.
  // Using return; without respondWith() can cause failures on mobile browsers and PWAs.
  // We must explicitly call respondWith(fetch()) for these requests.
  const isApiCall = (
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('googleapis.com') || 
    url.hostname.includes('goog') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/functions/v1/') || // Edge Functions
    url.pathname.includes('/auth/v1/') || // Auth endpoints
    url.pathname.includes('/storage/v1/') || // Storage endpoints
    url.pathname.includes('/realtime/') // Realtime/websocket
  );

  if (isApiCall) {
    // Explicitly pass through to network - this works correctly on all browsers
    event.respondWith(
      fetch(event.request).catch(err => {
        console.error('API fetch failed:', err);
        return new Response(JSON.stringify({ error: 'Network request failed' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // STRATEGY: Stale-While-Revalidate for HTML (Navigation)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => cachedResponse); // Fallback to cache on network failure
        
        // Return cached response immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // STRATEGY: Cache-First for Assets (Images, Fonts, Scripts)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Return a fallback for images if offline
        if (event.request.destination === 'image') {
          return new Response('', { status: 404 });
        }
      });
    })
  );
});

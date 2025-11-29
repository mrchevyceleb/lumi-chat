
const CACHE_NAME = 'lumi-chat-v3';
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

  // CRITICAL FIX: Bypass Service Worker for API calls.
  // Intercepting these can cause CORS/Offline errors in some environments.
  if (
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('googleapis.com') || 
    url.hostname.includes('goog') ||
    url.pathname.includes('/rest/v1/') // Specific Supabase REST path check
  ) {
    return; // Fallback to network directly (bypass SW)
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
        });
        // Return cached response immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // STRATEGY: Cache-First for Assets (Images, Fonts, Scripts)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

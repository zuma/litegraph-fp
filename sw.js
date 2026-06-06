const CACHE_NAME = 'litegraph-fp-v1';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // Cache-first or network-fallback strategy for clean offline loading
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(err => {
                    if (cachedResponse) return cachedResponse;
                    throw err;
                });

                return cachedResponse || fetchPromise;
            });
        })
    );
});

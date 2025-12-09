// キャッシュ名のバージョンを更新 (変更があるたびにバージョンを上げてください)
const CACHE_NAME = 'dmplayer-v2.5'; 

// キャッシュ名のバージョンを更新 (変更があるたびにバージョンを上げてください)
const CACHE_NAME = 'dmplayer-v2.5';
const RUNTIME_CACHE = 'dmplayer-runtime-v1';

// オフラインで使用したいリソースのリスト（アプリシェル）
const urlsToCache = [
    './', // index.html
    './manifest.json',
    './',
    './icon-192x192.png',
    './icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js'
];

self.addEventListener('install', (event) => {
    // すぐにコントロールを奪う
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // 古いキャッシュを削除
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => {
                if (name !== CACHE_NAME && name !== RUNTIME_CACHE) return caches.delete(name);
            }));
            await self.clients.claim();
        })()
    );
});

// Utility: respond with cache-first for app shell, network-first for CDN, fallback to cache for navigation
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Navigation requests -> serve app shell (index.html) from cache first
    if (req.mode === 'navigate') {
        event.respondWith(
            caches.match('./').then(resp => resp || fetch(req).catch(() => caches.match('./')))
        );
        return;
    }

    // CDN (jsdelivr) -> network-first then cache
    if (url.origin !== location.origin && url.hostname.includes('jsdelivr.net')) {
        event.respondWith(
            fetch(req).then(networkRes => {
                return caches.open(RUNTIME_CACHE).then(cache => {
                    cache.put(req, networkRes.clone());
                    return networkRes;
                });
            }).catch(() => caches.match(req))
        );
        return;
    }

    // For same-origin static assets -> cache-first
    event.respondWith(
        caches.match(req).then(cached => cached || fetch(req).then(networkRes => {
            // runtime cache for fetched assets (small files)
            return caches.open(RUNTIME_CACHE).then(cache => {
                try { cache.put(req, networkRes.clone()); } catch (e) { /* ignore */ }
                return networkRes;
            });
        }).catch(() => {
            // if request is for an image, return a transparent 1x1 PNG fallback (optional)
            if (req.destination === 'image') {
                return new Response('', { status: 404 });
            }
            return caches.match('./');
        }))
    );
});

// Allow clients to message the SW (e.g. to trigger skipWaiting)
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

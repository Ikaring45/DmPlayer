// キャッシュ名のバージョンを更新 (変更があるたびにバージョンを上げてください)
const CACHE_NAME = 'dmplayer-v3.0'; 
const RUNTIME_CACHE = 'dmplayer-runtime-v1';

// オフラインで使用したいリソースのリスト（アプリシェル）
const urlsToCache = [
    '/', // root path (for scope: /)
    '/index.html', // index.htmlを明示的に追加
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js'
];

self.addEventListener('install', (event) => {
    // すぐにコントロールを奪う
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).catch((err) => {
                console.error('Failed to pre-cache some assets:', err);
            });
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
            // クライアントの制御を要求 (即座に新しい Service Worker を有効化)
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Skip non-GET requests
    if (req.method !== 'GET') return;

    // 1. Navigation Request (HTMLページ) の処理: index.html を返す
    if (req.mode === 'navigate' && url.pathname.startsWith('/')) {
        event.respondWith(
            caches.match('/index.html').then(cached => cached || fetch(req).catch(() => caches.match('/index.html')))
        );
        return;
    }

    // 2. App-shell assets (Cache-First) - Absolute paths only
    if (urlsToCache.some(cacheUrl => url.pathname === cacheUrl || url.pathname === cacheUrl.slice(1) && cacheUrl.startsWith('/'))) {
         event.respondWith(
            caches.match(req).then(cached => cached || fetch(req).catch(() => caches.match('/index.html'))) // フォールバックは /index.html に
        );
        return;
    }
    
    // 3. CDN (jsdelivr) -> network-first then cache
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

    // 4. Other same-origin static assets -> cache-first/runtime-caching
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
                return new Response(null, { status: 404 });
            }
            // For other failing same-origin requests, return index.html as a last resort fallback
            return caches.match('/index.html');
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


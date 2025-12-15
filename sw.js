// キャッシュ名のバージョンを更新 (変更があるたびにバージョンを上げてください)
const CACHE_NAME = 'dmplayer-v2.0.16'; // ⭐ バージョンを上げて、新しいService Workerを強制的にインストールさせる
const RUNTIME_CACHE = 'dmplayer-runtime-v1';

// ⭐【修正箇所】GitHub Pagesのプロジェクトパスを定義
const REPO_PATH = '/dmplayer45.github.io/';
// ⭐【修正箇所】メインHTMLファイル名
const MAIN_HTML_FILE = 'index.html';
// 最終的なフォールバックHTMLのキャッシュキー（リポジトリパス/HTMLファイル名）
const FALLBACK_HTML_PATH = REPO_PATH + MAIN_HTML_FILE;


// オフラインで使用したいリソースのリスト（アプリシェル）
const urlsToCache = [
    // ⭐ 修正: すべての同居ファイルに REPO_PATH を付加
    REPO_PATH, // https://ikaring45.github.io/dmplayer45.github.io/ のルートを指す
    FALLBACK_HTML_PATH, // /dmplayer45.github.io/index.html
    REPO_PATH + 'manifest.json',
    REPO_PATH + 'icon-192x192.png',
    REPO_PATH + 'icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js'
    // 必要に応じて、CSSファイルなども REPO_PATH + 'style.css' の形式で追加してください
];

self.addEventListener('install', (event) => {
    // すぐにコントロールを奪う
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).catch((err) => {
                console.error('Failed to pre-cache some assets (Check REPO_PATH and file names!):', err);
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

    // 1. Navigation Request (HTMLページ) の処理: FALLBACK_HTML_PATH を返す
    // index.htmlなど、アプリのHTMLへのアクセス全てをカバー
    if (req.mode === 'navigate') {
        // ⭐ 修正: フォールバックを FALLBACK_HTML_PATH に統一
        event.respondWith(
            caches.match(FALLBACK_HTML_PATH).then(cached => cached || fetch(req).catch(() => caches.match(FALLBACK_HTML_PATH)))
        );
        return;
    }

    // 2. App-shell assets (Cache-First) - Absolute paths only
    // キャッシュ済みのアプリシェルリソースはキャッシュ優先
    if (urlsToCache.includes(url.pathname) || urlsToCache.includes(url.href)) {
         event.respondWith(
            caches.match(req).then(cached => cached || fetch(req).catch(() => caches.match(FALLBACK_HTML_PATH))) // フォールバックは FALLBACK_HTML_PATH に
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
            // For other failing same-origin requests, return FALLBACK_HTML_PATH as a last resort fallback
            return caches.match(FALLBACK_HTML_PATH);
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

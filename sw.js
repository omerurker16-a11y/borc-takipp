const CACHE_VERSION = 'borc-takip-v7';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Cache'lenmemesi gereken URL'ler (Supabase ve diğer API'lar)
const NEVER_CACHE_PATTERNS = [
  'supabase.co',
  'supabase.io',
  'googleapis.com',
  'cloudflare.com',
  'jsdelivr.net',
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Cache'lenecek CDN kaynakları (statik JS/CSS)
const CACHEABLE_CDN_PATTERNS = [
  'font-awesome',
  'fontawesome',
  'Inter'
];

const shouldNeverCache = (url) => {
  try {
    const parsed = new URL(url);
    // Supabase ve API istekleri asla cache'lenmesin
    return NEVER_CACHE_PATTERNS.some(pattern => 
      parsed.hostname.includes(pattern) || url.includes(pattern)
    );
  } catch {
    return false;
  }
};

const isSameOrigin = (url) => {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
};

const isCacheableCDN = (url) => {
  return CACHEABLE_CDN_PATTERNS.some(pattern => url.includes(pattern));
};

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v7...');
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v7...');
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = request.url;

  // ⚡ Supabase ve API isteklerini ASLA engelleme, direkt ağa gönder
  if (shouldNeverCache(requestUrl)) {
    // Cache'lemeden direkt fetch et
    event.respondWith(
      fetch(request).catch(err => {
        console.warn('[SW] API request failed (offline?):', requestUrl, err);
        return new Response(
          JSON.stringify({ error: 'Çevrimdışısınız. İnternet bağlantınızı kontrol edin.' }),
          { 
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // GET olmayan istekleri geç (POST, PUT, DELETE vb.)
  if (request.method !== 'GET') {
    return; // Service worker müdahale etmesin
  }

  // ============================================================
  // Sayfa navigasyonu (HTML istekleri)
  // ============================================================
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          // Önce ağdan dene
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put('./index.html', networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Ağ yoksa cache'den sun
          console.warn('[SW] Navigate offline, serving cache');
          const cached =
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match('./index.html', { ignoreSearch: true })) ||
            (await caches.match('./index.html', { ignoreSearch: true }));
          
          if (cached) return cached;
          
          // Cache de yoksa basit offline sayfası
          return new Response(
            `<!DOCTYPE html>
            <html lang="tr">
            <head><meta charset="UTF-8"><title>Çevrimdışı</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; 
                     min-height: 100vh; margin: 0; background: #f8fafc; }
              .box { text-align: center; padding: 2rem; }
              h1 { color: #6366f1; }
              p { color: #64748b; }
              button { background: #6366f1; color: white; border: none; padding: 0.75rem 1.5rem; 
                       border-radius: 0.5rem; cursor: pointer; font-size: 1rem; }
            </style>
            </head>
            <body>
              <div class="box">
                <h1>📱 Çevrimdışısınız</h1>
                <p>İnternet bağlantınız yok. Lütfen bağlantınızı kontrol edin.</p>
                <button onclick="location.reload()">🔄 Tekrar Dene</button>
              </div>
            </body>
            </html>`,
            { 
              status: 200, 
              headers: { 'Content-Type': 'text/html; charset=utf-8' } 
            }
          );
        }
      })()
    );
    return;
  }

  // ============================================================
  // Aynı origin dosyaları (CSS, JS, SVG, icon vb.)
  // ============================================================
  if (isSameOrigin(requestUrl)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        
        // Cache-first stratejisi
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) {
          // Arka planda güncelle
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
            })
            .catch(() => null);
          return cached;
        }
        
        // Cache'de yoksa ağdan al
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          console.warn('[SW] Same-origin fetch failed:', requestUrl);
          throw new Error('offline');
        }
      })()
    );
    return;
  }

  // ============================================================
  // CDN kaynakları (Font Awesome, Google Fonts vb.)
  // ============================================================
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      
      // Cache'de var mı?
      const cached = await cache.match(request);
      if (cached) {
        // Stale-while-revalidate: cache'den sun, arka planda güncelle
        fetch(request)
          .then(response => {
            if (response && (response.ok || response.type === 'opaque')) {
              cache.put(request, response.clone());
            }
          })
          .catch(() => null);
        return cached;
      }

      // Cache'de yoksa ağdan al
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          // Sadece cache'lenebilir CDN kaynaklarını sakla
          if (isCacheableCDN(requestUrl)) {
            cache.put(request, networkResponse.clone());
          }
        }
        return networkResponse;
      } catch {
        console.warn('[SW] CDN fetch failed:', requestUrl);
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    })()
  );
});

// ============================================================
// MESSAGE (Cache temizleme komutu için)
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      return Promise.all(keys.map(k => caches.delete(k)));
    }).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});

// cache version bump v7

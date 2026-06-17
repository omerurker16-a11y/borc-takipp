// sw.js - v10 - Tüm hatalar düzeltildi

const CACHE_VERSION = 'borc-takip-v10';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg'
];

const NEVER_CACHE = [
    'supabase.co',
    'supabase.io',
    'cdn.jsdelivr.net/npm/@supabase',
    'tailwindcss.com'
];

const RUNTIME_CACHEABLE = [
    'cdn.jsdelivr.net/npm/chart.js',
    'cdnjs.cloudflare.com/ajax/libs/font-awesome',
    'cdnjs.cloudflare.com/ajax/libs/pdf.js',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.tailwindcss.com'
];

const shouldNeverCache = (url) => NEVER_CACHE.some(p => url.includes(p));
const shouldRuntimeCache = (url) => RUNTIME_CACHEABLE.some(p => url.includes(p));

const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0);

// DÜZELTME: index.html ile aynı nextPayDate mantığı
const nextPayDate = (loanDateStr, total, remaining) => {
    if (!loanDateStr) return new Date();
    const d = new Date(loanDateStr);
    const paid = Math.max(0, total - remaining);
    d.setMonth(d.getMonth() + paid + 1);
    return d;
};

// ================================================================
// Offline Fallback HTML
// ================================================================
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Çevrimdışı - Borç Takip</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
        body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px}
        .card{background:white;border-radius:24px;padding:48px 32px;text-align:center;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.08);border:1px solid #f1f5f9}
        .icon{width:80px;height:80px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px;box-shadow:0 8px 24px rgba(99,102,241,.3)}
        h1{font-size:22px;font-weight:700;color:#1e293b;margin-bottom:8px}
        p{color:#64748b;font-size:14px;line-height:1.6;margin-bottom:24px}
        .badge{display:inline-flex;align-items:center;gap:6px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:6px 14px;border-radius:20px;border:1px solid #fde68a;margin-bottom:28px}
        .btn{display:block;background:#6366f1;color:white;border:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;width:100%;transition:background .2s}
        .btn:hover{background:#4f46e5}
        .info{margin-top:20px;padding:14px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0}
        .info p{font-size:12px;color:#94a3b8;margin:0}
        .dot{width:8px;height:8px;background:#f59e0b;border-radius:50%;display:inline-block;animation:pulse 1.5s infinite}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.9)}}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">💼</div>
        <h1>Çevrimdışısınız</h1>
        <p>İnternet bağlantınız yok.<br>Bağlantı geldiğinde otomatik senkronize olur.</p>
        <div class="badge"><span class="dot"></span>Bağlantı bekleniyor...</div>
        <button class="btn" onclick="window.location.reload()">🔄 Tekrar Dene</button>
        <div class="info"><p>📦 Uygulama önbelleği mevcut.<br>Verileriniz yerel olarak korunuyor.</p></div>
    </div>
    <script>
        window.addEventListener('online', () => setTimeout(() => window.location.reload(), 800));
    </script>
</body>
</html>`;

// ================================================================
// INSTALL
// ================================================================
self.addEventListener('install', event => {
    console.log('[SW] Installing:', CACHE_VERSION);
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => caches.open(STATIC_CACHE))
            .then(cache => cache.put(
                new Request('/__offline'),
                new Response(OFFLINE_HTML, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                })
            ))
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch(err => console.error('[SW] Install error:', err))
    );
});

// ================================================================
// ACTIVATE
// ================================================================
self.addEventListener('activate', event => {
    console.log('[SW] Activating:', CACHE_VERSION);
    event.waitUntil(
        Promise.all([
            caches.keys().then(keys =>
                Promise.all(
                    keys
                        .filter(k => !k.startsWith(CACHE_VERSION))
                        .map(k => {
                            console.log('[SW] Deleting old cache:', k);
                            return caches.delete(k);
                        })
                )
            ),
            registerPeriodicSync()
        ])
        .then(() => {
            console.log('[SW] Activate complete');
            return self.clients.claim();
        })
    );
});

async function registerPeriodicSync() {
    try {
        if ('periodicSync' in self.registration) {
            await self.registration.periodicSync.register('payment-check', {
                minInterval: 12 * 60 * 60 * 1000
            });
            console.log('[SW] Periodic sync registered');
        }
    } catch (err) {
        console.log('[SW] Periodic sync not available:', err.message);
    }
}

// ================================================================
// FETCH - DÜZELTME: clone() sırası düzeltildi
// ================================================================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = request.url;

    if (request.method !== 'GET') return;
    if (url.startsWith('chrome-extension://')) return;
    if (url.startsWith('moz-extension://')) return;

    // Hiç cache'lenmeyecekler
    if (shouldNeverCache(url)) {
        event.respondWith(
            fetch(request).catch(() =>
                new Response(
                    JSON.stringify({ error: 'offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
        return;
    }

    // Sayfa navigasyonu
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    // CDN runtime cache
    if (shouldRuntimeCache(url)) {
        event.respondWith(handleRuntimeCacheRequest(request));
        return;
    }

    // Standart
    event.respondWith(handleStandardRequest(request));
});

// DÜZELTME: Response clone sırası düzeltildi
async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // Önce clone al, sonra her ikisini kullan
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then(cache => {
                cache.put('./index.html', responseClone);
            });
        }
        return networkResponse; // orijinali dön
    } catch (err) {
        console.warn('[SW] Navigation offline, using cache');
        const cached =
            await caches.match('./index.html') ||
            await caches.match('./') ||
            await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match('/__offline');
        return offline || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

async function handleRuntimeCacheRequest(request) {
    const cached = await caches.match(request);
    if (cached) {
        // Arka planda güncelle
        fetch(request).then(response => {
            if (response && response.ok) {
                caches.open(RUNTIME_CACHE).then(cache => {
                    cache.put(request, response);
                });
            }
        }).catch(() => {});
        return cached;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // DÜZELTME: clone al, cache'e at, orijinali dön
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(request, responseClone);
            });
        }
        return networkResponse;
    } catch {
        return new Response('', { status: 503 });
    }
}

async function handleStandardRequest(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // DÜZELTME: clone al, cache'e at, orijinali dön
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then(cache => {
                cache.put(request, responseClone);
            });
        }
        return networkResponse;
    } catch {
        return new Response('', { status: 503 });
    }
}

// ================================================================
// MESSAGE
// ================================================================
self.addEventListener('message', event => {
    const { data } = event;
    if (!data?.type) return;
    console.log('[SW] Message:', data.type);

    switch (data.type) {
        case 'SCHEDULE_CHECK':
            if (data.loans) {
                saveLoanDataToCache(data.loans);
                checkAndNotify(data.loans);
            }
            break;
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
        case 'CACHE_LOANS':
            if (data.loans) saveLoanDataToCache(data.loans);
            break;
        case 'GET_VERSION':
            event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
            break;
        case 'CLEAR_CACHE':
            caches.keys()
                .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                .then(() => event.ports?.[0]?.postMessage({ success: true }));
            break;
    }
});

async function saveLoanDataToCache(loans) {
    try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(
            new Request('/__loans-data'),
            new Response(
                JSON.stringify({ loans, savedAt: new Date().toISOString() }),
                { headers: { 'Content-Type': 'application/json' } }
            )
        );
    } catch (err) {
        console.warn('[SW] saveLoanDataToCache error:', err.message);
    }
}

// ================================================================
// PERIODIC SYNC
// ================================================================
self.addEventListener('periodicsync', event => {
    console.log('[SW] Periodic sync:', event.tag);
    if (event.tag === 'payment-check') {
        event.waitUntil(checkFromCache());
    }
});

// ================================================================
// PUSH
// ================================================================
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data?.json() || {}; }
    catch { data = { title: 'Borç Takip', body: event.data?.text() || 'Bildirim' }; }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Borç Takip', {
            body: data.body || 'Ödeme hatırlatması',
            icon: './icon.svg',
            badge: './icon.svg',
            tag: data.tag || `push-${Date.now()}`,
            data: { url: './', ...data },
            vibrate: [200, 100, 200],
            requireInteraction: data.requireInteraction || false,
            actions: [
                { action: 'open', title: '📋 Görüntüle' },
                { action: 'dismiss', title: '✕ Kapat' }
            ]
        })
    );
});

// ================================================================
// NOTIFICATION CLICK
// ================================================================
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification click:', event.action, event.notification.tag);
    event.notification.close();
    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || './';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            tag: event.notification.tag,
                            data: event.notification.data
                        });
                        return;
                    }
                }
                if (clients.openWindow) return clients.openWindow(urlToOpen);
            })
    );
});

self.addEventListener('notificationclose', event => {
    console.log('[SW] Notification closed:', event.notification.tag);
});

// ================================================================
// Cache'den Kredi Verisi Oku ve Bildirim Kontrol Et
// ================================================================
async function checkFromCache() {
    try {
        const cache = await caches.open(STATIC_CACHE);
        const response = await cache.match('/__loans-data');
        if (!response) return;

        const { loans, savedAt } = await response.json();
        const age = Date.now() - new Date(savedAt).getTime();
        if (age > 24 * 60 * 60 * 1000) {
            console.log('[SW] Loan data stale, skipping');
            return;
        }
        await checkAndNotify(loans || []);
    } catch (err) {
        console.warn('[SW] checkFromCache error:', err.message);
    }
}

// ================================================================
// Bildirim Kontrolü
// ================================================================
async function checkAndNotify(loans) {
    if (!loans?.length) return;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    for (const loan of loans) {
        if (loan.isEarlyClosed || !loan.remainingInstallments || loan.remainingInstallments <= 0) continue;

        let nd;
        try {
            nd = nextPayDate(loan.loanDate, loan.totalInstallments, loan.remainingInstallments);
        } catch { continue; }

        const diffDays = Math.ceil((nd.getTime() - now.getTime()) / 86400000);
        if (![7, 3, 1, 0].includes(diffDays)) continue;

        const notifKey = `notif-${loan.bankName}-${diffDays}-${todayKey}`;
        const alreadyShown = await checkNotifShown(notifKey);
        if (alreadyShown) continue;

        const { title, body, requireInteraction, vibrate } = buildNotifContent(loan, diffDays);

        try {
            await self.registration.showNotification(title, {
                body,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: notifKey,
                vibrate,
                requireInteraction,
                data: { url: './', loanName: loan.bankName, diffDays, amount: loan.monthlyPayment },
                actions: [
                    { action: 'open', title: '📋 Görüntüle' },
                    { action: 'dismiss', title: '✕ Kapat' }
                ]
            });
            await markNotifShown(notifKey);
            console.log('[SW] Notification shown:', notifKey);
        } catch (err) {
            console.warn('[SW] showNotification error:', err.message);
        }
    }
}

function buildNotifContent(loan, diffDays) {
    const amount = fmt(loan.monthlyPayment);
    const name = loan.bankName;
    const configs = {
        7: { title: '📅 Ödeme Hatırlatması',  body: `${name} taksiti (${amount}) 7 gün sonra.`,        requireInteraction: false, vibrate: [200, 100, 200] },
        3: { title: '⚠️ 3 Gün Kaldı!',        body: `${name} taksiti (${amount}) 3 gün sonra!`,         requireInteraction: false, vibrate: [300, 100, 300, 100, 300] },
        1: { title: '🚨 YARIN Ödeme Var!',     body: `${name}: ${amount} — Yarın son gün!`,              requireInteraction: true,  vibrate: [500, 200, 500, 200, 500] },
        0: { title: '🔴 BUGÜN Ödeme Günü!',    body: `${name}: ${amount} — BUGÜN ödemeyi unutma!`,       requireInteraction: true,  vibrate: [1000, 500, 1000, 500, 1000] }
    };
    return configs[diffDays] || { title: 'Borç Takip', body: `${name}: ${amount}`, requireInteraction: false, vibrate: [200] };
}

// ================================================================
// Duplicate Bildirim Kontrolü
// ================================================================
async function checkNotifShown(key) {
    try {
        const cache = await caches.open(`${CACHE_VERSION}-notifs`);
        const match = await cache.match(`/__notif-${key}`);
        return !!match;
    } catch { return false; }
}

async function markNotifShown(key) {
    try {
        const cache = await caches.open(`${CACHE_VERSION}-notifs`);
        await cache.put(
            new Request(`/__notif-${key}`),
            new Response('1', {
                headers: {
                    'Content-Type': 'text/plain',
                    'sw-notif-time': new Date().toISOString()
                }
            })
        );
        await cleanOldNotifKeys(cache);
    } catch {}
}

async function cleanOldNotifKeys(cache) {
    try {
        const keys = await cache.keys();
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
        for (const req of keys) {
            const resp = await cache.match(req);
            const timeStr = resp?.headers?.get('sw-notif-time');
            if (timeStr && new Date(timeStr).getTime() < cutoff) {
                await cache.delete(req);
            }
        }
    } catch {}
}

// ================================================================
// ERROR HANDLING
// ================================================================
self.addEventListener('error', event => {
    console.error('[SW] Error:', event.message);
});

self.addEventListener('unhandledrejection', event => {
    console.error('[SW] Unhandled rejection:', event.reason);
    event.preventDefault();
});

// sw.js - Tam Geliştirilmiş Versiyon

const CACHE_VERSION = 'borc-takip-v9';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// ================================================================
// Cache'e alınacak statik dosyalar
// ================================================================
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg'
];

// ================================================================
// Asla cache'lenmeyecek domain'ler (API, CDN, dış servisler)
// ================================================================
const NEVER_CACHE = [
    'supabase.co',
    'supabase.io',
    'jsdelivr.net',
    'tailwindcss.com',
    'cloudflare.com',
    'googleapis.com',
    'gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// Runtime'da cache'lenebilir ama static'e alınmayacak
const RUNTIME_CACHEABLE = [
    'cdn.jsdelivr.net/npm/chart.js',
    'cdnjs.cloudflare.com/ajax/libs/font-awesome',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// ================================================================
// Yardımcı Fonksiyonlar
// ================================================================
const shouldNeverCache = (url) => NEVER_CACHE.some(p => url.includes(p));
const shouldRuntimeCache = (url) => RUNTIME_CACHEABLE.some(p => url.includes(p));

const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0);

// Bir sonraki ödeme tarihini hesapla (index.html ile aynı mantık - düzeltilmiş)
const nextPayDate = (loanDateStr, total, remaining) => {
    if (!loanDateStr) return new Date();
    const d = new Date(loanDateStr);
    const paid = Math.max(0, total - remaining);
    d.setMonth(d.getMonth() + paid + 1);
    return d;
};

// Tarih string'ini türkçe formatla
const fmtDateShort = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return '-';
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
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
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, sans-serif; }
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            padding: 20px;
        }
        .card {
            background: white;
            border-radius: 24px;
            padding: 48px 32px;
            text-align: center;
            max-width: 360px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.08);
            border: 1px solid #f1f5f9;
        }
        .icon {
            width: 80px; height: 80px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 36px;
            box-shadow: 0 8px 24px rgba(99,102,241,0.3);
        }
        h1 { font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
        p { color: #64748b; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #fef3c7;
            color: #92400e;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 14px;
            border-radius: 20px;
            border: 1px solid #fde68a;
            margin-bottom: 28px;
        }
        .btn {
            display: block;
            background: #6366f1;
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: background 0.2s;
            text-decoration: none;
        }
        .btn:hover { background: #4f46e5; }
        .info {
            margin-top: 20px;
            padding: 14px;
            background: #f8fafc;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
        }
        .info p {
            font-size: 12px;
            color: #94a3b8;
            margin: 0;
        }
        .dot { width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; display: inline-block; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.9)} }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">💼</div>
        <h1>Çevrimdışısınız</h1>
        <p>İnternet bağlantınız yok.<br>Bağlantı geldiğinde otomatik olarak senkronize olacaksınız.</p>
        <div class="badge">
            <span class="dot"></span>
            Bağlantı bekleniyor...
        </div>
        <button class="btn" onclick="window.location.reload()">🔄 Tekrar Dene</button>
        <div class="info">
            <p>📦 Uygulama önbelleği mevcut.<br>Borç verileriniz yerel olarak korunuyor.</p>
        </div>
    </div>
    <script>
        // Bağlantı gelince otomatik yönlendir
        window.addEventListener('online', () => {
            setTimeout(() => window.location.reload(), 800);
        });
    </script>
</body>
</html>`;

// ================================================================
// INSTALL - Statik Dosyaları Cache'e Al
// ================================================================
self.addEventListener('install', event => {
    console.log('[SW] Installing version:', CACHE_VERSION);
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Offline sayfasını da cache'e al
                return caches.open(STATIC_CACHE).then(cache =>
                    cache.put(
                        new Request('/__offline'),
                        new Response(OFFLINE_HTML, {
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Install complete, skipping waiting');
                return self.skipWaiting();
            })
            .catch(err => console.error('[SW] Install error:', err))
    );
});

// ================================================================
// ACTIVATE - Eski Cache'leri Temizle
// ================================================================
self.addEventListener('activate', event => {
    console.log('[SW] Activating version:', CACHE_VERSION);
    event.waitUntil(
        Promise.all([
            // Eski cache versiyonlarını sil
            caches.keys().then(keys => {
                return Promise.all(
                    keys
                        .filter(key => !key.startsWith(CACHE_VERSION))
                        .map(key => {
                            console.log('[SW] Deleting old cache:', key);
                            return caches.delete(key);
                        })
                );
            }),
            // Periodic sync kaydet (destekleniyorsa)
            registerPeriodicSync()
        ])
        .then(() => {
            console.log('[SW] Activate complete, claiming clients');
            return self.clients.claim();
        })
    );
});

// ================================================================
// Periodic Sync Kaydı
// ================================================================
async function registerPeriodicSync() {
    try {
        if ('periodicSync' in self.registration) {
            await self.registration.periodicSync.register('payment-check', {
                minInterval: 12 * 60 * 60 * 1000 // 12 saatte bir
            });
            console.log('[SW] Periodic sync registered');
        }
    } catch (err) {
        console.log('[SW] Periodic sync not supported or permission denied:', err.message);
    }
}

// ================================================================
// FETCH - Ağ İsteklerini Yönet
// ================================================================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = request.url;

    // POST/PUT/DELETE gibi metodları atla
    if (request.method !== 'GET') return;

    // Chrome extension isteklerini atla
    if (url.startsWith('chrome-extension://')) return;

    // Asla cache'lenmeyecekler - direkt ağa git
    if (shouldNeverCache(url)) {
        event.respondWith(
            fetch(request)
                .then(response => response)
                .catch(() => new Response(
                    JSON.stringify({ error: 'Çevrimdışı - bu istek önbelleğe alınamaz' }),
                    {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    }
                ))
        );
        return;
    }

    // Sayfa navigasyonu - Network First, sonra cache
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    // Runtime cache'lenebilir kaynaklar (CDN kütüphaneleri) - Cache First
    if (shouldRuntimeCache(url)) {
        event.respondWith(handleRuntimeCacheRequest(request));
        return;
    }

    // Diğer GET istekleri - Stale While Revalidate
    event.respondWith(handleStandardRequest(request));
});

// ================================================================
// Fetch Stratejileri
// ================================================================

// Sayfa navigasyonu: Network First
async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            // index.html'yi cache'e kaydet
            cache.put('./index.html', networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        console.warn('[SW] Navigation fetch failed, using cache:', err.message);
        // Cache'den bul
        const cached = await caches.match('./index.html') ||
                        await caches.match('./') ||
                        await caches.match(request);
        if (cached) return cached;

        // Hiçbiri yoksa offline sayfası
        const offlinePage = await caches.match('/__offline');
        return offlinePage || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

// CDN kütüphaneleri: Cache First (uzun süreli cache)
async function handleRuntimeCacheRequest(request) {
    const cached = await caches.match(request);
    if (cached) {
        // Arka planda güncelle
        updateCacheInBackground(request);
        return cached;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        console.warn('[SW] Runtime cache fetch failed:', request.url);
        return new Response('', { status: 503 });
    }
}

// Standart istekler: Stale While Revalidate
async function handleStandardRequest(request) {
    const cached = await caches.match(request);
    const networkPromise = fetch(request)
        .then(response => {
            if (response.ok) {
                caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
            }
            return response;
        })
        .catch(() => null);

    return cached || await networkPromise || new Response('', { status: 503 });
}

// Arka planda cache güncelleme
async function updateCacheInBackground(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response);
        }
    } catch {}
}

// ================================================================
// MESSAGE - Ana Sayfadan Mesajları Dinle
// ================================================================
self.addEventListener('message', event => {
    const { data } = event;
    if (!data?.type) return;

    console.log('[SW] Message received:', data.type);

    switch (data.type) {
        case 'SCHEDULE_CHECK':
            // index.html'den gelen kredi verisiyle bildirim kontrolü
            if (data.loans) {
                // Veriyi cache'e kaydet (gelecekteki periodicsync için)
                saveLoanDataToCache(data.loans);
                checkAndNotify(data.loans);
            }
            break;

        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_LOANS':
            // Sadece veri kaydetme
            if (data.loans) {
                saveLoanDataToCache(data.loans);
            }
            break;

        case 'GET_VERSION':
            // Cache versiyonunu client'a gönder
            event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
            break;

        case 'CLEAR_CACHE':
            // Tüm cache'i temizle (debug için)
            caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
                .then(() => event.ports?.[0]?.postMessage({ success: true }));
            break;
    }
});

// ================================================================
// Loan Verisini Cache'e Kaydet (Periodicsync için)
// ================================================================
async function saveLoanDataToCache(loans) {
    try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(
            new Request('/__loans-data'),
            new Response(JSON.stringify({ loans, savedAt: new Date().toISOString() }), {
                headers: { 'Content-Type': 'application/json' }
            })
        );
    } catch (err) {
        console.warn('[SW] Could not save loan data to cache:', err.message);
    }
}

// ================================================================
// PERIODIC SYNC - Arka Plan Kontrol
// ================================================================
self.addEventListener('periodicsync', event => {
    console.log('[SW] Periodic sync triggered:', event.tag);
    if (event.tag === 'payment-check') {
        event.waitUntil(checkFromCache());
    }
});

// ================================================================
// PUSH - Backend'den Push Bildirimi (Gelecek için hazır)
// ================================================================
self.addEventListener('push', event => {
    console.log('[SW] Push received');
    let data = {};
    try {
        data = event.data?.json() || {};
    } catch {
        data = { title: 'Borç Takip', body: event.data?.text() || 'Yeni bildirim' };
    }

    const options = {
        body: data.body || 'Ödeme hatırlatması',
        icon: './icon.svg',
        badge: './icon.svg',
        tag: data.tag || `push-${Date.now()}`,
        data: { url: data.url || './', ...data },
        vibrate: [200, 100, 200],
        requireInteraction: data.requireInteraction || false,
        actions: [
            { action: 'open', title: '📋 Görüntüle', icon: './icon.svg' },
            { action: 'dismiss', title: '✕ Kapat' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Borç Takip', options)
    );
});

// ================================================================
// NOTIFICATION CLICK - Bildirime Tıklama
// ================================================================
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification click:', event.action, event.notification.tag);
    event.notification.close();

    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || './';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Zaten açık bir pencere var mı?
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        // Sayfaya mesaj gönder (belirli bir krediye odaklan)
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            tag: event.notification.tag,
                            data: event.notification.data
                        });
                        return;
                    }
                }
                // Yeni pencere aç
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// ================================================================
// NOTIFICATION CLOSE - Bildirim Kapatıldı
// ================================================================
self.addEventListener('notificationclose', event => {
    console.log('[SW] Notification closed:', event.notification.tag);
    // İsteğe bağlı: analytics veya state güncellemesi
});

// ================================================================
// Bildirim Kontrolü - Cache'den Veri Al
// ================================================================
async function checkFromCache() {
    try {
        const cache = await caches.open(STATIC_CACHE);
        const response = await cache.match('/__loans-data');
        if (!response) {
            console.log('[SW] No loan data in cache for periodic sync');
            return;
        }
        const { loans, savedAt } = await response.json();

        // 24 saatten eski veriyi kullanma
        const age = Date.now() - new Date(savedAt).getTime();
        if (age > 24 * 60 * 60 * 1000) {
            console.log('[SW] Loan data too old, skipping notification check');
            return;
        }

        console.log('[SW] Running notification check for', loans?.length, 'loans');
        await checkAndNotify(loans || []);
    } catch (err) {
        console.warn('[SW] checkFromCache error:', err.message);
    }
}

// ================================================================
// Ana Bildirim Kontrolü
// ================================================================
async function checkAndNotify(loans) {
    if (!loans?.length) return;

    const now = new Date();
    // Bugünün başlangıcı (duplicate kontrolü için)
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    for (const loan of loans) {
        if (loan.isEarlyClosed || !loan.remainingInstallments || loan.remainingInstallments <= 0) continue;

        let nd;
        try {
            nd = nextPayDate(loan.loanDate, loan.totalInstallments, loan.remainingInstallments);
        } catch {
            continue;
        }

        const diffDays = Math.ceil((nd.getTime() - now.getTime()) / 86400000);

        // Sadece belirlenen günlerde bildirim gönder
        const notifyDays = [7, 3, 1, 0];
        if (!notifyDays.includes(diffDays)) continue;

        // Duplicate kontrol: Aynı gün aynı kredi için tekrar gösterme
        const notifKey = `notif-${loan.bankName}-${diffDays}-${todayKey}`;
        const alreadyShown = await checkNotifShown(notifKey);
        if (alreadyShown) continue;

        // Bildirim içeriği
        const { title, body, requireInteraction, vibrate } = buildNotifContent(loan, diffDays);

        try {
            await self.registration.showNotification(title, {
                body,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: notifKey,
                vibrate,
                requireInteraction,
                data: {
                    url: './',
                    loanName: loan.bankName,
                    diffDays,
                    amount: loan.monthlyPayment
                },
                actions: [
                    { action: 'open', title: '📋 Görüntüle' },
                    { action: 'dismiss', title: '✕ Kapat' }
                ]
            });
            // Gösterildi olarak işaretle
            await markNotifShown(notifKey);
            console.log('[SW] Notification shown:', notifKey);
        } catch (err) {
            console.warn('[SW] showNotification error:', err.message);
        }
    }
}

// ================================================================
// Bildirim İçeriği Oluştur
// ================================================================
function buildNotifContent(loan, diffDays) {
    const amount = fmt(loan.monthlyPayment);
    const name = loan.bankName;

    const configs = {
        7: {
            title: '📅 Ödeme Hatırlatması',
            body: `${name} taksiti (${amount}) 7 gün sonra. Hazırlıklı olun!`,
            requireInteraction: false,
            vibrate: [200, 100, 200]
        },
        3: {
            title: '⚠️ 3 Gün Kaldı!',
            body: `${name} taksiti (${amount}) 3 gün sonra. Bakiyenizi kontrol edin.`,
            requireInteraction: false,
            vibrate: [300, 100, 300, 100, 300]
        },
        1: {
            title: '🚨 YARIN Ödeme Var!',
            body: `${name}: ${amount} — Yarın ödeme günü! Unutmayın.`,
            requireInteraction: true,
            vibrate: [500, 200, 500, 200, 500]
        },
        0: {
            title: '🔴 BUGÜN Ödeme Günü!',
            body: `${name}: ${amount} — BUGÜN öde! Son gün.`,
            requireInteraction: true,
            vibrate: [1000, 500, 1000, 500, 1000]
        }
    };

    return configs[diffDays] || {
        title: 'Borç Takip Hatırlatması',
        body: `${name}: ${amount}`,
        requireInteraction: false,
        vibrate: [200]
    };
}

// ================================================================
// Bildirim Duplicate Kontrol (IndexedDB - Cache API'dan daha güvenilir)
// ================================================================
async function checkNotifShown(key) {
    try {
        // Cache API ile basit key-value store
        const cache = await caches.open(`${CACHE_VERSION}-notifs`);
        const match = await cache.match(`/__notif-${key}`);
        return !!match;
    } catch {
        return false;
    }
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
        // Eski bildirimleri temizle (7 günden eski)
        await cleanOldNotifKeys(cache);
    } catch {}
}

async function cleanOldNotifKeys(cache) {
    try {
        const keys = await cache.keys();
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 gün
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
    console.error('[SW] Unhandled error:', event.message, event.filename, event.lineno);
});

self.addEventListener('unhandledrejection', event => {
    console.error('[SW] Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

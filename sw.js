const CACHE_VERSION = 'borc-takip-v8';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STATIC_ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

const NEVER_CACHE = ['supabase.co', 'supabase.io', 'jsdelivr.net', 'tailwindcss.com', 'cloudflare.com', 'googleapis.com', 'gstatic.com'];

const shouldSkip = (url) => NEVER_CACHE.some(p => url.includes(p));

// ================================================================
// INSTALL
// ================================================================
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(STATIC_CACHE)
            .then(c => c.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ================================================================
// ACTIVATE
// ================================================================
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// ================================================================
// FETCH
// ================================================================
self.addEventListener('fetch', e => {
    const url = e.request.url;
    if (shouldSkip(url)) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
        return;
    }
    if (e.request.method !== 'GET') return;

    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then(r => { caches.open(STATIC_CACHE).then(c => c.put('./index.html', r.clone())); return r; })
                .catch(async () => {
                    const c = await caches.open(STATIC_CACHE);
                    return await c.match('./index.html') || new Response('<h1>Çevrimdışı</h1>', { headers: { 'Content-Type': 'text/html' } });
                })
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            const net = fetch(e.request).then(r => {
                if (r.ok) caches.open(STATIC_CACHE).then(c => c.put(e.request, r.clone()));
                return r;
            }).catch(() => null);
            return cached || net;
        })
    );
});

// ================================================================
// BİLDİRİM - Zamanlayıcı Kontrolü
// ================================================================
self.addEventListener('message', e => {
    if (e.data?.type === 'SCHEDULE_CHECK') {
        checkAndNotify(e.data.loans);
    }
    if (e.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Periyodik sync (destekleniyorsa)
self.addEventListener('periodicsync', e => {
    if (e.tag === 'payment-check') {
        e.waitUntil(checkFromDB());
    }
});

// Push bildirimi (gelecekte backend eklenirse)
self.addEventListener('push', e => {
    const data = e.data?.json() || {};
    e.waitUntil(
        self.registration.showNotification(data.title || 'Borç Takip', {
            body: data.body || 'Ödeme hatırlatması',
            icon: './icon.svg',
            badge: './icon.svg',
            tag: data.tag || 'payment',
            data: data,
            actions: [
                { action: 'view', title: '📋 Görüntüle' },
                { action: 'dismiss', title: '✕ Kapat' }
            ]
        })
    );
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    if (e.action === 'dismiss') return;
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(cls => {
            if (cls.length) { cls[0].focus(); return; }
            clients.openWindow('./');
        })
    );
});

async function checkAndNotify(loans) {
    if (!loans?.length) return;

    const now = new Date();
    const today = now.getDate();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    for (const loan of loans) {
        if (loan.isEarlyClosed || loan.remainingInstallments <= 0) continue;

        const loanDate = new Date(loan.loanDate);
        const paid = loan.totalInstallments - loan.remainingInstallments;
        const nextDate = new Date(loanDate);
        nextDate.setMonth(nextDate.getMonth() + paid + 1);

        const diffDays = Math.ceil((nextDate - now) / 86400000);

        // 7 gün kala
        if (diffDays === 7) {
            await self.registration.showNotification('📅 Ödeme Hatırlatması - 7 Gün', {
                body: `${loan.bankName} için ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(loan.monthlyPayment)} taksit ödemesi 7 gün sonra!`,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: `loan-7-${loan.bankName}`,
                vibrate: [200, 100, 200],
                data: { url: './' }
            });
        }

        // 3 gün kala
        if (diffDays === 3) {
            await self.registration.showNotification('⚠️ Ödeme Hatırlatması - 3 Gün', {
                body: `${loan.bankName} taksiti 3 gün sonra! Tutar: ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(loan.monthlyPayment)}`,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: `loan-3-${loan.bankName}`,
                vibrate: [300, 100, 300],
                data: { url: './' }
            });
        }

        // 1 gün kala
        if (diffDays === 1) {
            await self.registration.showNotification('🚨 YARIN Ödeme Var!', {
                body: `${loan.bankName}: ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(loan.monthlyPayment)} - YARIN son gün!`,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: `loan-1-${loan.bankName}`,
                vibrate: [500, 200, 500, 200, 500],
                data: { url: './' }
            });
        }

        // Bugün ödeme günü
        if (diffDays === 0) {
            await self.registration.showNotification('🔴 BUGÜN Ödeme Günü!', {
                body: `${loan.bankName}: ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(loan.monthlyPayment)} - BUGÜN ödemeyi unutma!`,
                icon: './icon.svg',
                badge: './icon.svg',
                tag: `loan-today-${loan.bankName}`,
                vibrate: [1000, 500, 1000],
                data: { url: './' },
                requireInteraction: true
            });
        }
    }
}

async function checkFromDB() {
    try {
        const cache = await caches.open(STATIC_CACHE);
        const backup = await cache.match('bt-loans-data');
        if (backup) {
            const data = await backup.json();
            await checkAndNotify(data.loans || []);
        }
    } catch(e) {
        console.warn('checkFromDB error:', e);
    }
}

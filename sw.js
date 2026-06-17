// sw.js - Sadece handleNavigationRequest fonksiyonunu değiştir
// SORUN: networkResponse hem cache.put hem return'de kullanılıyor
// ÇÖZÜM: clone() sırası düzeltilmeli

// ESKİ (HATALI):
async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put('./index.html', networkResponse.clone()); // clone sonra kullanılıyor
        }
        return networkResponse; // body zaten okunmuş!
    }
}

// YENİ (DOĞRU):
async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            const responseToCache = networkResponse.clone(); // önce clone al
            cache.put('./index.html', responseToCache); // clone'u cache'e at
        }
        return networkResponse; // orijinali dön - body hâlâ kullanılabilir
    } catch (err) {
        console.warn('[SW] Navigation fetch failed:', err.message);
        const cached = await caches.match('./index.html') ||
                       await caches.match('./') ||
                       await caches.match(request);
        if (cached) return cached;
        const offlinePage = await caches.match('/__offline');
        return offlinePage || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

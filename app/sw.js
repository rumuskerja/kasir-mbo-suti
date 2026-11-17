// Service worker: simpan file aplikasi supaya tetap bisa dibuka saat offline.
const VERSION = 'kasir-v1.0.0';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'printer.js', 'config.js', 'manifest.webmanifest',
  'vendor/xlsx.full.min.js', 'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  // Jaringan dulu (supaya update cepat sampai), cadangan dari cache saat offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

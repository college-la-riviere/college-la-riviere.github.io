/* racines.ia — démarrage hors ligne (les données restent sur Supabase) */
const CACHE = 'racine-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/racine-192.png', '/racine-512.png', '/ecole/', '/ecole/index.html', '/ecole/shim.js', '/ecole/config.js', '/ecole/icon-192-v3.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === location.origin && !u.pathname.endsWith('.apk');
  const lib = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if (!same && !lib) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match(u.pathname.startsWith('/ecole/') ? '/ecole/index.html' : '/index.html') : undefined))));
});

const CACHE = 'seed-mobile-shell-v5';
const FILES = ['./', './index.html', './style.css', './app.mjs', './core.mjs', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('seed-mobile-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Installed PWA shares stay in the worker; never send the shared text to Pages.
  if (event.request.method === 'POST' && url.href === new URL('./share', self.registration.scope).href) {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const data = Object.fromEntries(['title', 'text', 'url'].map(key => [key, String(form.get(key) || '').slice(0, 20000)]));
      const target = new URL('./', self.registration.scope);
      target.hash = 'share=' + encodeURIComponent(JSON.stringify(data));
      return Response.redirect(target.href, 303);
    })());
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/__local/')) return;
  // Share redirects use the same offline app shell. Never cache private snapshots.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./index.html', self.registration.scope).href)));
    return;
  }
  if (FILES.some(file => new URL(file, self.registration.scope).pathname === url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

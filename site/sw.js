/* Incrémenter VERSION à chaque publication, même pour un changement CSS. */
'use strict';
const VERSION = '1.0.0';
const PREFIX = 'fr-identite-apple:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
const FILES = [
  './', 'index.html', 'style.css', 'appearance.css', 'motion.css', 'iphone.css',
  'appearance.js', 'app.js', 'motion.js', 'transitions.js', 'vault-crypto.js', 'iphone-vault.js',
  'emblem.png', 'logo.png', 'PublicSans.ttf', 'FONT-LICENSE.txt', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // L'installation échoue si une seule ressource manque : pas de faux « prêt hors ligne ».
    await cache.addAll(urls.map(url => new Request(url, {cache:'reload'})));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Le cache ne contient que les fichiers publics. Le coffre reste chiffré dans IndexedDB.
    const cached = await cache.match(request, {ignoreSearch:true});
    if (cached) return cached;
    if (request.mode === 'navigate') return await cache.match(new URL('index.html', scope).href) || fetch(request);
    return fetch(request);
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'ACTIVATE_UPDATE') { self.skipWaiting(); return; }
  if (event.data && event.data.type === 'CHECK_OFFLINE' && event.ports[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const responses = await Promise.all(urls.map(url => cache.match(url)));
      event.ports[0].postMessage({ready:responses.every(Boolean), version:VERSION});
    })());
  }
});

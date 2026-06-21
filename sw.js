var CACHE_NAME = 'jreycash-v1';
var urlsToCache = [
  '/JREYCASH/',
  '/JREYCASH/index.html',
  '/JREYCASH/styles.css',
  '/JREYCASH/app.js',
  '/JREYCASH/store.html',
  '/JREYCASH/assets/jreycash-hero.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

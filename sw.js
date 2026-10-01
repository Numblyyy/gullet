/* GULLET service worker — cache-first app shell, fully offline after first load. */
var CACHE = 'gullet-v2';
var SHELL = [
  './index.html',
  './gullet-a.js',
  './gullet-b.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/splash-1290.png'
];
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k !== CACHE) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e){
  /* mobile M10: only GET is cacheable; non-GET passes through untouched */
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(hit){
      if(hit) return hit;
      return fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        return res;
      }).catch(function(){
        /* offline fallback: one corrupted entry must never brick the app */
        return caches.match('./index.html');
      });
    })
  );
});

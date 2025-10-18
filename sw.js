// sw.js
const CACHE = 'rkb-app-v2.14'; // bump version
const RAW_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/auth.js',
  './js/app.js',
  './js/pages/inbox.js',
  './js/pages/rkb/rkb_form.js',
  './js/pages/rkb/rkb_list.js',
  './js/pages/rkb/rkb_approvals_askep.js',
  './js/pages/rkb/rkb_approvals_manager.js',
  './js/pages/pdo/pdo_form.js',
  './js/pages/pdo/pdo_list.js',
  './js/pages/pdo/pdo_approvals_askep.js',
  './js/pages/pdo/pdo_approvals_manager.js',
  './js/pages/pdo/ktu_rekap_pdo.js',
  './js/pages/rkh/rkh_form.js',
  './js/pages/rkh/rkh_list.js',
  './js/pages/ktu.js',
  // <<< PERBAIKAN: jangan pakai path root
  './js/pages/master/settings.master.js',
  './js/pages/master/settings.upload.js',
  './js/pages/master/settings.reset.js',
  './js/pages/master/settings.maintenance.js',
  './icons/icon-192x192.png',
  './manifest.json'
];

// normalisasi: ubah semua ke URL absolut di origin yg sama & dalam scope SW
function normalizeAssets(list){
  const base = self.registration.scope; // scope SW, aman utk relative
  const out = [];
  for (const p of list){
    try{
      const u = new URL(p, base);
      // pastikan same-origin saja yang dicache
      if (u.origin === self.location.origin) out.push(u.href);
    }catch(_){ /* skip */ }
  }
  // unik
  return [...new Set(out)];
}

self.addEventListener('install', (e)=>{
  const ASSETS = normalizeAssets(RAW_ASSETS);
  e.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    for (const url of ASSETS){
      try{
        // bikin request 'no-cors' supaya file static yang tidak punya CORS header tidak bikin error
        await cache.add(new Request(url, { mode:'no-cors' }));
      }catch(err){
        // jangan gagalkan instalasi hanya karena 1 asset gagal
        console.warn('[SW] skip cache:', url, err && err.message);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE) && caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;

  // Cache-first utk file GET same-origin
  if (req.method === 'GET' && new URL(req.url).origin === self.location.origin){
    // untuk navigasi halaman, fallback ke index.html (SPA)
    if (req.mode === 'navigate'){
      e.respondWith((async ()=>{
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try{
          const fresh = await fetch(req);
          cache.put(req, fresh.clone());
          return fresh;
        }catch(_){
          return cache.match('./index.html');
        }
      })());
      return;
    }

    // selain navigasi: cache-first biasa
    e.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try{
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      }catch(_){
        // kalau gagal jaringan & tidak ada di cache, biarkan errornya bubble up
        return fetch(req);
      }
    })());
  }
});

const CACHE = 'rkb-app-v1.22';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/auth.js',
  './js/app.js',
  './js/pages/inbox.js',
  './js/pages/rkb_form.js',
  './js/pages/rkb_list.js',
  './js/pages/approvals_askep.js',
  './js/pages/approvals_manager.js',
  './js/pages/ktu.js',
  '/js/pages/settings.master.js',
  '/js/pages/settings.upload.js',
  '/js/pages/settings.reset.js',
  '/js/pages/settings.maintenance.js',
  './icons/icon-192x192.png',
  './manifest.json'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k))))
  );
});

self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(res=> res || fetch(e.request).catch(()=>caches.match('./index.html')))
  );
});

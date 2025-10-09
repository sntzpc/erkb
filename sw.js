const CACHE = 'rkb-app-v2.00';
const ASSETS = [
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
  '/js/pages/master/settings.master.js',
  '/js/pages/master/settings.upload.js',
  '/js/pages/master/settings.reset.js',
  '/js/pages/master/settings.maintenance.js',
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

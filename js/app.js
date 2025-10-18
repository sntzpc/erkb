// js/app.js
window.addEventListener('DOMContentLoaded', () => {

  
  const root = U.qs('#app-root');
  const btnLogout = U.qs('#btn-logout');
  const btnTheme = U.qs('#btn-theme');
  const activeUser = U.qs('#active-user');

  function renderLogin(){
    root.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h4 class="mb-3">Masuk</h4>
            <div class="mb-2"><label class="form-label">Username</label>
              <input id="login-username" class="form-control" placeholder="admin" />
            </div>
            <div class="mb-3"><label class="form-label">Password</label>
              <input id="login-password" type="password" class="form-control" placeholder="user123" />
            </div>
            <div class="d-flex gap-2">
              <button id="btn-login" class="btn btn-primary">
                <span class="spinner-border spinner-border-sm d-none" id="login-spin"></span>
                Login
              </button>
              <button id="btn-fill" class="btn btn-outline-secondary">Isi default</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    U.qs('#btn-fill').onclick = ()=>{
      U.qs('#login-username').value='admin';
      U.qs('#login-password').value='user123';
    };
    U.qs('#btn-login').onclick = async ()=>{
      const u = U.qs('#login-username').value.trim();
      const p = U.qs('#login-password').value;
      const spin = U.qs('#login-spin'); U.safe.remove(spin, 'd-none');
      try{
        const r = await API.call('login', {username:u, password:p});
        if(r.ok){
          SESSION.set({ token:r.token, profile:r.profile, expiresAt:r.expiresAt });
          buildMenu(); routeTo('#/');
          U.toast('Login berhasil.','success');
        }else{
          U.toast(r.error||'Login gagal.','danger');
        }
      }catch(e){ U.toast(e.message,'danger'); }
      finally{ U.safe.add(spin, 'd-none'); }
    };
  }

  // === MENU & ROUTING BARU (group + submenu) ===
  function buildMenu(){
  const m = U.qs('#main-menu'); m.innerHTML='';
  const s = SESSION.get();
  U.safe.text(activeUser, s ? `${s.profile.username} · ${s.profile.role}` : '-');
  U.safe.toggle(btnLogout, 'd-none', !s);

  // === helper link biasa
  const addItem = (hash, label) => {
    const li = document.createElement('li'); li.className = 'nav-item';
    li.innerHTML = `<a class="nav-link" href="${hash}">${label}</a>`;
    m.appendChild(li);
    li.querySelector('a').addEventListener('click', ()=>{
      const nav = document.getElementById('navContent');
      if (nav) { const bs = bootstrap.Collapse.getInstance(nav); if (bs) bs.hide(); }
    });
  };

  // === helper dropdown (dengan dukungan submenu/dropend)
  const addDropdown = (title, innerHtml) => {
    const li = document.createElement('li'); li.className = 'nav-item dropdown';
    li.innerHTML = `
      <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">${title}</a>
      <ul class="dropdown-menu" data-bs-auto-close="outside">${innerHtml}</ul>
    `;
    m.appendChild(li);

    // tutup navbar collapse setelah klik salah satu item
    li.querySelectorAll('a.dropdown-item').forEach(a=>{
      a.addEventListener('click', ()=>{
        const nav = document.getElementById('navContent');
        if (nav) { const bs = bootstrap.Collapse.getInstance(nav); if (bs) bs.hide(); }
      });
    });

    // enable nested submenu (Bootstrap 5 tidak native)
    li.querySelectorAll('.dropend').forEach(node=>{
      const toggle  = node.querySelector('.dropdown-toggle');
      const subMenu = node.querySelector('.dropdown-menu');
      if (!toggle || !subMenu) return;

      // hover (desktop)
      node.addEventListener('mouseenter', ()=>{
        try{ bootstrap.Dropdown.getOrCreateInstance(toggle, {autoClose:false}).show(); }catch(_){}
      });
      node.addEventListener('mouseleave', ()=>{
        try{ bootstrap.Dropdown.getOrCreateInstance(toggle).hide(); }catch(_){}
      });

      // click (mobile)
      toggle.addEventListener('click', (e)=>{
        e.preventDefault(); e.stopPropagation();
        const dd = bootstrap.Dropdown.getOrCreateInstance(toggle, {autoClose:false});
        const shown = subMenu.classList.contains('show');
        if (shown) dd.hide(); else dd.show();
      });
    });
  };

  // ===== belum login → hanya Beranda + Login
  if(!s){
    addItem('#/','Beranda');
    addItem('#/login','Login');
    return;
  }

  // ===== normalisasi role ke lowercase
  const roleRaw = s.profile.role || '';
  const role = (()=>{
    const x = String(roleRaw).trim().toLowerCase();
    if (x==='em' || x==='estate manager' || x==='estate-manager') return 'manager';
    return x; // 'asisten','askep','manager','admin','ktu', ...
  })();

  // 1) Beranda (semua user)
  addItem('#/','Beranda');

  // 2) RKB (Form, Draft, Approval, Rekap RKB)
  {
    let html = '';

    // Form & Draft (Asisten, Admin)
    if(role==='asisten' || role==='admin'){
      html += `
        <li><a class="dropdown-item" href="#/rkb/form">Form</a></li>
        <li><a class="dropdown-item" href="#/rkb/draft">Draft</a></li>
      `;
    }

    // Approval (Askep, Manager, Admin) → submenu
    if(role==='askep' || role==='manager' || role==='admin'){
      html += `
        <li><hr class="dropdown-divider"></li>
        <li class="dropend">
          <a class="dropdown-item dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Approval</a>
          <ul class="dropdown-menu">
            ${ (role==='askep'   || role==='admin')   ? `<li><a class="dropdown-item" href="#/rkb/approvals/askep">Askep</a></li>` : '' }
            ${ (role==='manager' || role==='admin')   ? `<li><a class="dropdown-item" href="#/rkb/approvals/manager">Manager</a></li>` : '' }
          </ul>
        </li>
      `;
    }

    // Rekap RKB (KTU, Admin)
    if(role==='ktu' || role==='admin'){
      html += `
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="#/ktu/rekap-rkb">Rekap RKB</a></li>
      `;
    }

    if(html.trim()) addDropdown('RKB', html);
  }

  // 3) PDO (Form, Draft, Approval, Rekap PDO)
  {
    let html = '';

    if(role==='asisten' || role==='admin'){
      html += `
        <li><a class="dropdown-item" href="#/pdo/form">Form</a></li>
        <li><a class="dropdown-item" href="#/pdo/draft">Draft</a></li>
      `;
    }

    if(role==='askep' || role==='manager' || role==='admin'){
      html += `
        <li><hr class="dropdown-divider"></li>
        <li class="dropend">
          <a class="dropdown-item dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Approval</a>
          <ul class="dropdown-menu">
            ${ (role==='askep'   || role==='admin')   ? `<li><a class="dropdown-item" href="#/pdo/approvals/askep">Askep</a></li>` : '' }
            ${ (role==='manager' || role==='admin')   ? `<li><a class="dropdown-item" href="#/pdo/approvals/manager">Manager</a></li>` : '' }
          </ul>
        </li>
      `;
    }

    if(role==='ktu' || role==='admin'){
      html += `
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="#/ktu/rekap-pdo">Rekap PDO</a></li>
      `;
    }

    if(html.trim()) addDropdown('PDO', html);
  }

  // 4) RKH (Form & Draft untuk Asisten/Admin)
  if(role==='asisten' || role==='admin'){
    addDropdown('RKH', `
      <li><a class="dropdown-item" href="#/rkh/form">Form</a></li>
      <li><a class="dropdown-item" href="#/rkh/draft">Draft</a></li>
    `);
  }

  // 5) Outbox (tetap) — kalau perlu gabungkan nanti
  if(role==='asisten' || role==='admin'){
    addItem('#/outbox','Outbox');
  }

  // 6) Pesan (tetap)
  if(role==='asisten' || role==='admin'){
    addItem('#/inbox', `Pesan <span id="badge-inbox" class="badge rounded-pill text-bg-danger ms-1 d-none">0</span>`);
  }

  // 7) Setting
  if(role==='admin'){
    addDropdown('Setting', `
      <li><a class="dropdown-item" href="#/settings/master">Master Data</a></li>
      <li><a class="dropdown-item" href="#/settings/upload">Upload Data</a></li>
      <li><a class="dropdown-item" href="#/settings/reset">Reset Password</a></li>
      <li><a class="dropdown-item" href="#/settings/maintenance">Pemeliharaan Data</a></li>
    `);
  } else if(role==='asisten'){
    addDropdown('Setting', `
      <li><a class="dropdown-item" href="#/settings/master">Master Data (yrate)</a></li>
    `);
  }

  // Badge inbox
  updateInboxBadge();
}



  // === Badge Pesan (gunakan id lama: #badge-inbox) ===
  function updateInboxBadge(){
    const b = document.getElementById('badge-inbox');
    if(!b) return;

    // 1) coba pakai counter cache dulu (instan)
    const cached = STORE.getCounter && STORE.getCounter('inboxUnread');
    if (cached !== null) {
      b.textContent = cached;
      b.classList.toggle('d-none', (Number(cached)||0) <= 0);
    }

    // 2) fallback: tanya server (supaya tetap akurat bila berubah)
    (async () => {
      try{
        const r = await API.call('inboxUnreadCount', {});
        const n = (r && r.ok && typeof r.count === 'number') ? r.count : 0;
        b.textContent = n;
        b.classList.toggle('d-none', n <= 0);
        // simpan ke counter cache agar halaman lain cepat
        STORE.setCounter && STORE.setCounter('inboxUnread', n);
      }catch(_){
        if (cached == null) b.classList.add('d-none');
      }
    })();
  }
  // penting: ekspor ke global supaya bisa dipanggil dari Pages.inbox()
  window.updateInboxBadge = updateInboxBadge;

  function routeTo(hash){
    location.hash = hash;
    router();
  }

  // === Router baru (dengan fallback dari hash lama) ===
  async function router(){
    U.updateOnlineBadge();

    const s = SESSION.isActive() ? SESSION.get() : null;
    let hash = location.hash || '#/';

    // jika belum login → paksa ke login
    if(!s && hash !== '#/login'){ renderLogin(); return; }

    // --- Normalisasi & redirect hash lama -> baru ---
    const mapOldToNew = {
    '#/rkb-form':          '#/rkb/form',
    '#/rkb-draft':         '#/rkb/draft',
    '#/approval-askep':    '#/rkb/approvals/askep',
    '#/approval-manager':  '#/rkb/approvals/manager',
    '#/ktu':               '#/ktu/rekap-rkb',
    '#/settings':          '#/settings/master',
    // RKH lama → baru (kalau ada link/bookmark lama)
    '#/rkh-form':          '#/rkh/form',
    '#/rkh-draft':         '#/rkh/draft',
    // PDO lama → baru (jaga-jaga)
    '#/pdo-form':          '#/pdo/form',
    '#/pdo-draft':         '#/pdo/draft'
    };

    hash = hash.replace(/\/+$/, '');
    if (mapOldToNew[hash]) {
        location.replace(mapOldToNew[hash]);
        hash = mapOldToNew[hash];
    }

    switch(true){
        case hash==='#/login':                    renderLogin(); break;
        case hash==='#/':                         renderHome(); break;

        // RKB
        case hash==='#/rkb/form':                 Pages.rkbForm(); break;
        case hash==='#/rkb/draft':                Pages.rkbList('draft'); break;
        case hash==='#/rkb/approvals/askep':      Pages.rkbApprovalsAskep(); break;
        case hash==='#/rkb/approvals/manager':    Pages.rkbApprovalsManager(); break;

        // PDO
        case hash==='#/pdo/form':                 Pages.pdoForm(); break;
        case hash==='#/pdo/draft':                Pages.pdoList('draft'); break;
        case hash==='#/pdo/approvals/askep':      Pages.pdoApprovalsAskep(); break;
        case hash==='#/pdo/approvals/manager':    Pages.pdoApprovalsManager(); break;

        // RKH
        case hash==='#/rkh/form':                 Pages.rkhForm(); break;
        case hash==='#/rkh/draft':                Pages.rkhList('draft'); break;

        // Kotak keluar & pesan
        case hash==='#/outbox':                   Pages.rkbList('outbox'); break;
        case hash==='#/inbox':                    Pages.inbox(); break;

        // KTU
        case hash==='#/ktu/rekap-rkb':            Pages.ktu(); break;
        case hash==='#/ktu/rekap-pdo':            Pages.ktuRekapPDO(); break;

        // Settings
        case hash==='#/settings/master':          Pages.settingsMaster(); break;
        case hash==='#/settings/upload':          Pages.settingsUpload(); break;
        case hash==='#/settings/reset':           Pages.settingsReset(); break;
        case hash==='#/settings/maintenance':     Pages.settingsMaintenance(); break;

        default:
            renderHome();
    }
}


  // ===== Helpers global reset lokal =====
  async function appHardResetAll() {
    try{
      // 1) clear localStorage & sessionStorage
      try{ localStorage.clear(); }catch(_){}
      try{ sessionStorage.clear(); }catch(_){}

      // 2) hapus Cache Storage (PWA) jika ada
      try{
        if ('caches' in window && typeof caches.keys === 'function') {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n)));
        }
      }catch(_){}

      // 3) hapus IndexedDB (best-effort)
      try{
        if (window.indexedDB && typeof indexedDB.databases === 'function') {
          const dbs = await indexedDB.databases();
          await Promise.all((dbs||[]).map(db=>{
            if (!db || !db.name) return Promise.resolve();
            return new Promise((resolve)=> {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = req.onerror = req.onblocked = ()=> resolve();
            });
          }));
        }
        // kalau browser belum support indexedDB.databases(), abaikan (best-effort)
      }catch(_){}

      // 4) unregister service worker (kalau ada)
      try{
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      }catch(_){}

      // 5) clear session app (kalau objectnya masih ada)
      try{ SESSION.clear && SESSION.clear(); }catch(_){}
    }finally{
      // tidak ada
    }
  }

  // Soft reset: hapus cache aplikasi tapi TIDAK logout (dipakai di halaman Home)
  function appSoftResetCache(){
    const APP_PREFIXES = [
      'kpl.master.', 'kpl.actual.', 'kpl.counter.', 'kpl.cache.',
      'rkb.', 'pdo.', 'rkh.', 'ktu.', 'inbox.', 'outbox.', 'settings.',
    ];
    const APP_EXACT = [
      'kpl.cache.ts',
      'pdo.form.buffer','pdo.form.readonly','kpl.actual.pdo_draft',
      'rkb.form.buffer','rkb.form.readonly',
      'rkh.form.buffer','rkh.form.readonly'
    ];
    const removeKeys = (shouldRemoveFn) => {
      const keys = Object.keys(localStorage);
      for (const k of keys) { try{ if (shouldRemoveFn(k)) localStorage.removeItem(k); }catch(_){ } }
    };
    removeKeys((k)=> APP_EXACT.includes(k) || APP_PREFIXES.some(p=> k.startsWith(p)));
  }

  // Ekspos ke global bila perlu dipanggil dari modul lain
  window.AppLocal = { hardReset: appHardResetAll, softReset: appSoftResetCache };


  function renderHome(){
    const div = document.createElement('div');
    div.className='card shadow-sm';
    div.innerHTML=`<div class="card-body">
      <h4 class="mb-2">Selamat datang</h4>
      <p class="text-muted">Gunakan menu di atas untuk mulai bekerja.</p>

      <div class="d-flex flex-wrap gap-2 mb-3">
        <button id="btn-home-pull" class="btn btn-primary">Tarik Master & Data Aktual</button>
        <button id="btn-home-clear" class="btn btn-outline-danger">Hapus Data Lokal</button>
      </div>

      <!-- STATUS CACHE: ditulis dinamis di JS -->
      <div id="home-cache-status" class="mb-3"></div>

      <div class="small text-muted">Master & data aktual akan ditarik sesuai otorisasi akun.</div>
      <div id="home-pull-log" class="small mt-2 text-muted"></div>

      <hr/>
      <h5 class="mb-2">Ubah Password</h5>
      <div class="row g-2 align-items-end">
        <div class="col-sm-4">
          <label class="form-label">Username</label>
          <input id="cp-username" class="form-control" value="${SESSION.profile().username}" readonly />
        </div>
        <div class="col-sm-3">
          <label class="form-label">Password Lama</label>
          <input id="cp-old" type="password" class="form-control" placeholder="password lama"/>
        </div>
        <div class="col-sm-3">
          <label class="form-label">Password Baru</label>
          <input id="cp-new" type="password" class="form-control" placeholder="password baru"/>
        </div>
        <div class="col-sm-2">
          <button id="btn-change-pass" class="btn btn-warning w-100">Ubah</button>
        </div>
      </div>
    </div>`;

    U.qs('#app-root').innerHTML=''; U.qs('#app-root').appendChild(div);

    // Aksi tombol
    const btnPull = div.querySelector('#btn-home-pull');
    const btnClear = div.querySelector('#btn-home-clear');

    // --- helper localStorage list & status ---
    function listByPrefix(prefix){
      return Object.keys(localStorage).filter(k => k.startsWith(prefix));
    }
    function getMastersList(){
      return listByPrefix('kpl.master.').map(k=>k.replace('kpl.master.','')).sort();
    }
    function getActualsList(){
      return listByPrefix('kpl.actual.').map(k=>k.replace('kpl.actual.','')).sort();
    }
    function getStampText(){
      try{
        const ts = STORE.getStamp && STORE.getStamp();
        return ts ? new Date(ts).toLocaleString('id-ID') : '-';
      }catch(_){ return '-'; }
    }
    function updateHomeCacheStatus(){
      const masters = getMastersList();
      const actuals = getActualsList();
      const hasData = masters.length || actuals.length;

      const el = div.querySelector('#home-cache-status');
      if(!el) return;

      if(!hasData){
        el.innerHTML = `
          <div class="alert alert-secondary mb-2">
            <div><b>Status:</b> Belum ada master/data aktual di perangkat ini.</div>
          </div>`;
        return;
      }

      const ts = getStampText();
      el.innerHTML = `
        <div class="alert alert-success mb-2">
          <div class="mb-1"><b>Status:</b> Master & Data Aktual <u>sudah tersedia</u> di perangkat ini.</div>
          <div class="small">Master: <code>${masters.join(', ')||'-'}</code></div>
          <div class="small">Actuals: <code>${actuals.join(', ')||'-'}</code></div>
          <div class="small text-muted mt-1">Waktu cache: ${ts}</div>
        </div>
        <div class="small text-warning">
          Menarik ulang akan <b>menimpa (overwrite)</b> data lokal yang sudah ada.
        </div>`;
    }
    updateHomeCacheStatus();

    // --- Tarik Master & Data Aktual (cache all) ---
    btnPull.onclick = async ()=>{
      // konfirmasi overwrite bila data sudah ada
      const hasExisting = getMastersList().length || getActualsList().length;
      if(hasExisting){
        const ok = confirm('Master & Data Aktual sudah ada di perangkat ini.\nMenarik ulang akan MENIMPA (overwrite) cache lokal.\nLanjutkan?');
        if(!ok) return;
      }

      let openedHere = false;
      try{
        openedHere = U.safeProgressOpen('Menarik Master & Data Aktual...');
        if(openedHere) U.progress(30,'Meminta server');

        await STORE.pullAll(); // tarik & cache masters + actuals + counters

        // ringkasan
        const masters = getMastersList();
        const actuals = getActualsList();
        const ts = getStampText();

        div.querySelector('#home-pull-log').innerHTML =
          `Master diperbarui: <b>${masters.join(', ')||'-'}</b><br/>
           Actuals tersimpan: <b>${actuals.join(', ')||'-'}</b><br/>
           Waktu cache: <span class="text-muted">${ts}</span>`;

        updateHomeCacheStatus();   // refresh status panel
        updateInboxBadge();        // segarkan badge pesan
        U.toast('Cache lokal siap dipakai tanpa loading.', 'success');
      }catch(e){
        U.toast('Gagal tarik data: ' + (e.message||e), 'danger');
      }finally{
        // Selalu coba tutup dan bersih-bersih, meski bukan kita yang buka
        try{ U.progress(100,'Selesai'); }catch(_){}
        setTimeout(()=>{
          try{ U.progressClose(); }catch(_){}
          U.progressHardClose(); // hapus backdrop & body lock kalau masih tertinggal
        }, 200);
      }
    };

    // --- Hapus Data Lokal (soft / hard reset) ---
    btnClear.onclick = async ()=>{
      const mode = prompt(
        'Ketik "TOTAL" untuk reset TOTAL (hapus SEMUA data lokal & logout).\n' +
        'Atau kosongkan lalu OK untuk hanya hapus cache aplikasi (tetap login).'
      );

      if (String(mode||'').toUpperCase() === 'TOTAL'){
        const really = confirm('Yakin reset TOTAL? Ini akan menghapus SEMUA data lokal & logout.');
        if(!really) return;
        let opened=false;
        try{
          await appHardResetAll();
          buildMenu(); routeTo('#/login');
          U.toast('Reset total selesai. Silakan login kembali.','warning');
        }finally{
          setTimeout(()=>{}, 150);
        }
        return;
      }

      // Soft reset (hapus cache, tetap login)
      const ok = confirm('Hapus cache aplikasi (master, actuals, draft, counters) tetapi tetap login?');
      if(!ok) return;

      appSoftResetCache();
      // segarkan status panel & badge
      div.querySelector('#home-pull-log').textContent = 'Cache aplikasi dibersihkan.';
      (function updateHomeCacheStatusSafe(){ try{ updateHomeCacheStatus(); }catch(_){ } })();
      try{ updateInboxBadge(); }catch(_){}
      U.toast('Cache aplikasi dihapus. Sesi login tetap aktif.','warning');
    };


    // Ubah password
    div.querySelector('#btn-change-pass').onclick = async ()=>{
      const oldp = div.querySelector('#cp-old').value;
      const newp = div.querySelector('#cp-new').value;
      if(!oldp || !newp){ U.toast('Isi password lama & baru.','warning'); return; }
      try{
        U.progressOpen('Mengubah password...'); U.progress(30,'Proses server');
        const r = await API.call('changePassword', { oldPassword: oldp, newPassword: newp });
        if(!r.ok) throw new Error(r.error||'Gagal ubah password');
        U.toast('Password berhasil diubah.','success');
        div.querySelector('#cp-old').value=''; div.querySelector('#cp-new').value='';
      }catch(e){ U.toast(e.message||e,'danger'); }
      finally{ U.progressClose(); U.progressHardClose(); }
    };
  }

    btnLogout.onclick = async ()=>{
    const ok = confirm('Anda yakin ingin keluar dari aplikasi?\nSemua data lokal di perangkat ini akan dihapus agar aman.');
    if(!ok) return;

    let opened = false;
    try{
      await appHardResetAll();  // reset total + SESSION.clear()
      try{ buildMenu(); }catch(_){}
      routeTo('#/login');
      U.toast && U.toast('Anda telah logout. Data lokal dibersihkan.', 'warning');
    }catch(e){
      U.toast && U.toast('Gagal membersihkan sebagian data: ' + (e.message||e), 'danger');
      // tetap arahkan ke login agar sesi berakhir
      routeTo('#/login');
    }finally{
      setTimeout(()=>{}, 150);
    }
  };


  // Theme toggle
  btnTheme.onclick = ()=>{
    const b=document.body;
    if(b.classList.contains('dark')){ b.classList.remove('dark'); b.classList.add('light'); }
    else{ b.classList.remove('light'); b.classList.add('dark'); }
  };

  buildMenu(); router();
  window.addEventListener('hashchange', router);
});

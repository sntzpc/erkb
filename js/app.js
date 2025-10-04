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
      U.qs('#login-spin').classList.remove('d-none');
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
      finally{ U.qs('#login-spin').classList.add('d-none'); }
    };
  }

// === MENU & ROUTING BARU (group + submenu) ===
function buildMenu(){
  const m = U.qs('#main-menu'); m.innerHTML='';
  const s = SESSION.get();
  activeUser.textContent = s ? `${s.profile.username} · ${s.profile.role}` : '-';
  btnLogout.classList.toggle('d-none', !s);

  // helper buat item link biasa
  const addItem = (hash, label) => {
    const li=document.createElement('li'); li.className='nav-item';
    li.innerHTML=`<a class="nav-link" href="${hash}">${label}</a>`;
    m.appendChild(li);
    li.querySelector('a').addEventListener('click', ()=>{
      const nav = document.getElementById('navContent'); const bs=bootstrap.Collapse.getInstance(nav);
      bs && bs.hide();
    });
  };

  // helper buat dropdown
  const addDropdown = (title, itemsHtml) => {
    const li=document.createElement('li'); li.className='nav-item dropdown';
    li.innerHTML = `
      <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">${title}</a>
      <ul class="dropdown-menu">
        ${itemsHtml}
      </ul>`;
    m.appendChild(li);
    // close on click (mobile)
    li.querySelectorAll('.dropdown-menu a').forEach(a=>{
      a.addEventListener('click', ()=>{
        const nav = document.getElementById('navContent'); const bs=bootstrap.Collapse.getInstance(nav);
        bs && bs.hide();
      });
    });
  };

  if(!s){
    addItem('#/login','Login');
  }else{
    const role = s.profile.role;

    // 1) Beranda
    addItem('#/','Beranda');

    // 2) RKB: Form, Draft
    if(role==='Asisten' || role==='Admin'){
    addDropdown('RKB', `
      <li><a class="dropdown-item" href="#/rkb/form">Form</a></li>
      <li><a class="dropdown-item" href="#/rkb/draft">Draft</a></li>
    `);
    }

    // 3) PDO: Form, Draft (DUMMY)
    if(role==='Asisten' || role==='Admin'){
    addDropdown('PDO', `
      <li><a class="dropdown-item" href="#/pdo/form">Form</a></li>
      <li><a class="dropdown-item" href="#/pdo/draft">Draft</a></li>
    `);
    }

    // 4) RKH: Form, Draft (DUMMY)
    if(role==='Asisten' || role==='Admin'){
    addDropdown('RKH', `
      <li><a class="dropdown-item" href="#/rkh/form">Form</a></li>
      <li><a class="dropdown-item" href="#/rkh/draft">Draft</a></li>
    `);
    }

    // 5) Outbox (tetap top-level)
    if(role==='Asisten' || role==='Admin'){
    addItem('#/outbox','Outbox');
    }

    // 6) Pesan (badge lama dipertahankan)
    if(role==='Asisten' || role==='Admin'){
    addItem('#/inbox', `Pesan <span id="badge-inbox" class="badge rounded-pill text-bg-danger ms-1 d-none">0</span>`);
    }

    // 7) Approval: Askep, Manager (tampilkan sesuai role)
    if(role==='Askep' || role==='Admin' || role==='Manager'){
      addDropdown('Approval', `
        ${(role==='Askep'||role==='Admin') ? `<li><a class="dropdown-item" href="#/approval/askep">Askep</a></li>` : ''}
        ${(role==='Manager'||role==='Admin') ? `<li><a class="dropdown-item" href="#/approval/manager">Manager</a></li>` : ''}
      `);
    }

    // 8) KTU: Rekap RKH, Rekap PDO
    if(role==='KTU' || role==='Admin'){
      addDropdown('KTU', `
        <li><a class="dropdown-item" href="#/ktu/rekap-rkh">Rekap RKH</a></li>
        <li><a class="dropdown-item" href="#/ktu/rekap-pdo">Rekap PDO</a></li>
      `);
    }

    // 9) Settings: Master Data, Upload Data, Reset Password, Pemeliharaan Data
    if(role==='Admin'){
      addDropdown('Setting', `
        <li><a class="dropdown-item" href="#/settings/master">Master Data</a></li>
        <li><a class="dropdown-item" href="#/settings/upload">Upload Data</a></li>
        <li><a class="dropdown-item" href="#/settings/reset">Reset Password</a></li>
        <li><a class="dropdown-item" href="#/settings/maintenance">Pemeliharaan Data</a></li>
      `);
    }
  }

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
      // kalau gagal network, sudah ada tampilan dari cache (jika ada)
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
    '#/draft':             '#/rkb/draft',
    '#/approval-askep':    '#/approval/askep',
    '#/approval-manager':  '#/approval/manager',
    '#/ktu':               '#/ktu/rekap-rkh',  // default lama ke rekap RKH
    '#/settings':          '#/settings/master'
  };

  // rapikan hash (hilangkan trailing slash ganda, dsb)
  hash = hash.replace(/\/+$/, '');
  if (mapOldToNew[hash]) {
    // ganti URL tanpa menambah history
    location.replace(mapOldToNew[hash]);
    hash = mapOldToNew[hash];
  }

  // (opsional debug)
  // console.log('route ->', hash);

  switch(true){
    case hash==='#/login':            renderLogin(); break;
    case hash==='#/':                 renderHome(); break;

    // RKB
    case hash==='#/rkb/form':         Pages.rkbForm(); break;
    case hash==='#/rkb/draft':        Pages.rkbList('draft'); break;

    // PDO (dummy)
    case hash==='#/pdo/form':         Pages.pdoForm && Pages.pdoForm() || Pages._dummy('PDO Form'); break;
    case hash==='#/pdo/draft':        Pages.pdoDraft && Pages.pdoDraft() || Pages._dummy('PDO Draft'); break;

    // RKH (dummy)
    case hash==='#/rkh/form':         Pages.rkhForm && Pages.rkhForm() || Pages._dummy('RKH Form'); break;
    case hash==='#/rkh/draft':        Pages.rkhDraft && Pages.rkhDraft() || Pages._dummy('RKH Draft'); break;

    // Kotak keluar & pesan
    case hash==='#/outbox':           Pages.rkbList('outbox'); break;
    case hash==='#/inbox':            Pages.inbox(); break;

    // Approval
    case hash==='#/approval/askep':   Pages.approvalsAskep(); break;
    case hash==='#/approval/manager': Pages.approvalsManager(); break;

    // KTU
    case hash==='#/ktu/rekap-rkh':    Pages.ktu(); break;
    case hash==='#/ktu/rekap-pdo':    Pages.ktuRekapPDO ? Pages.ktuRekapPDO() : Pages._dummy('KTU · Rekap PDO'); break;

    // Settings (sub-pages baru)
    case hash==='#/settings/master':       Pages.settingsMaster(); break;
    case hash==='#/settings/upload':       Pages.settingsUpload(); break;
    case hash==='#/settings/reset':        Pages.settingsReset(); break;
    case hash==='#/settings/maintenance':  Pages.settingsMaintenance(); break;

    default:
      renderHome();
  }
}


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

  // --- Tarik Master & Data Aktual (pastikan semua ke cache) ---
btnPull.onclick = async ()=>{
  try{
    const r = await STORE.pullAll(); // simpan masters + ALL actuals + counters
    const masters = Object.keys(localStorage)
      .filter(k=>k.startsWith('kpl.master.'))
      .map(k=>k.replace('kpl.master.',''))
      .sort();
    const actuals = Object.keys(localStorage)
      .filter(k=>k.startsWith('kpl.actual.'))
      .map(k=>k.replace('kpl.actual.',''))
      .sort();

    const ts = new Date(STORE.getStamp()).toLocaleString('id-ID');
    div.querySelector('#home-pull-log').innerHTML =
      `Master diperbarui: <b>${masters.join(', ')||'-'}</b><br/>
       Actuals tersimpan: <b>${actuals.join(', ')||'-'}</b><br/>
       Waktu cache: <span class="text-muted">${ts}</span>`;

    // segarkan badge pesan dari counter yang barusan di-update
    updateInboxBadge();
    U.toast('Cache lokal siap dipakai tanpa loading.', 'success');
  }catch(e){
    U.toast('Gagal tarik data: ' + (e.message||e), 'danger');
  }
};

// --- Hapus Data Lokal (tanpa logout) ---
btnClear.onclick = ()=>{
  const pass = prompt('Masukkan password aktif untuk konfirmasi:');
  if(!pass) return;

  // JANGAN sentuh sesi login ataupun preferensi lain
  const KEEP_PREFIX = ['SESSION', 'theme']; // jika Anda menyimpan preferensi tema dsb.
  const removeIf = (k) =>
    k.startsWith('kpl.master.') ||
    k.startsWith('kpl.actual.') ||
    k.startsWith('kpl.counter.') ||
    k.startsWith('rkb.') ||
    k === 'kpl.cache.ts';

  Object.keys(localStorage).forEach(k=>{
    if (KEEP_PREFIX.some(pref=> k.startsWith(pref))) return;
    if (removeIf(k)) localStorage.removeItem(k);
  });

  // Info UI
  div.querySelector('#home-pull-log').textContent = 'Cache lokal dibersihkan. Silakan tarik ulang bila perlu.';
  updateInboxBadge(); // kemungkinan badge jadi 0
  U.toast('Data lokal dihapus. Sesi login tetap aktif.', 'warning');
};

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
    finally{ U.progressClose(); }
  };
}

  btnLogout.onclick = ()=>{
    SESSION.clear(); buildMenu(); routeTo('#/login');
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

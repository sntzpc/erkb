// js/utils.js
window.U = (function(){
  const ls = window.localStorage;

  // === LocalStorage mini wrapper ===
  const S = {
    get: (k, def=null) => { try { const v = ls.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } },
    set: (k, v) => ls.setItem(k, JSON.stringify(v)),
    del: (k) => ls.removeItem(k),
    size: () => ls.length,
    clearAll: () => ls.clear(),
  };

  // === DOM helpers ===
  const qs   = (sel, el=document)=>el.querySelector(sel);
  const qsa  = (sel, el=document)=>Array.from(el.querySelectorAll(sel));

  // === Formatters (angka & tanggal, ID) ===
  const nf0 = new Intl.NumberFormat('id-ID'); // ribuan, tanpa desimal
  const nf2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function htmlBR(s){
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/\n/g,'<br/>');
  }

  function toNum(v){
    const n = (typeof v === 'number') ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const fmt  = {
    // --- EXISTING ---
    ymd: (d=new Date()) => d.toISOString().slice(0,10),
    yymmddhhmmss: (d=new Date()) => {
      const pad = (n)=> String(n).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return yy + pad(d.getMonth()+1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    },

    // --- NEW: angka Indonesia ---
    /** "12.345" */
    id0(v, fallback='0'){
      const n = toNum(v);
      return n === null ? fallback : nf0.format(n);
    },
    /** "12.345,60" */
    id2(v, fallback='0,00'){
      const n = toNum(v);
      return n === null ? fallback : nf2.format(n);
    },
    hk(v, fallback='0,00'){ return this.id2(v, fallback); },
    /** "Rp1.500.000,00" (jika fractionDigits=2) */
    idr(v, fractionDigits=0){
      const n = toNum(v) ?? 0;
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(n);
    },
    /** "YYYY-MM" (zona Asia/Jakarta) */
    periodeYM(p){
      if(!p) return '';
      if (p instanceof Date) {
        const tz = 'Asia/Jakarta';
        const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(p);
        const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(p);
        return `${y}-${m}`;
      }
      const s = String(p).trim();
      if (/^\d{4}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d)) return s;
      const tz = 'Asia/Jakarta';
      const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(d);
      const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(d);
      return `${y}-${m}`;
    }
  };

  // ====== [GLOBAL GUARD] Pastikan master/actuals sudah tersedia ======
  function _lsHasPrefix(prefix){
    return Object.keys(localStorage).some(k => k.startsWith(prefix));
  }
  function _hasAnyMaster(){ return _lsHasPrefix('kpl.master.'); }
  function _hasAnyActual(){ return _lsHasPrefix('kpl.actual.'); }

  function _hasMaster(name){ return !!localStorage.getItem(`kpl.master.${name}`); }
  function _hasActual(name){ return !!localStorage.getItem(`kpl.actual.${name}`); }

  /**
   * Cek apakah data lokal 'hangat' (tersedia).
   * - mastersNeeded: string[] nama master yg wajib (opsional)
   * - actualsNeeded: string[] nama actuals yg wajib (opsional)
   * return: { ok:boolean, missing:{masters:string[], actuals:string[]} }
   */
  function _isWarm({ mastersNeeded=[], actualsNeeded=[] } = {}){
    const missM = [];
    const missA = [];

    if(!_hasAnyMaster()) missM.push('(semua)');
    if(!_hasAnyActual()) missA.push('(semua)');

    mastersNeeded.forEach(n => { if(!_hasMaster(n)) missM.push(n); });
    actualsNeeded.forEach(n => { if(!_hasActual(n)) missA.push(n); });

    const ok = (missM.length===0 && missA.length===0);
    return { ok, missing:{masters:missM, actuals:missA} };
  }

  /** Modal simple (Bootstrap) untuk info + tombol arahkan ke Beranda */
  function _ensureInfoModal(){
    let el = document.getElementById('pull-required-modal');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'pull-required-modal';
    el.className = 'modal fade';
    el.innerHTML = `
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Data Belum Tersedia</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div id="pull-required-body" class="small"></div>
        <div class="alert alert-warning mt-2">
          Silakan lakukan <b>Tarik Master & Data Aktual</b> di halaman <b>Beranda</b> terlebih dahulu.
        </div>
      </div>
      <div class="modal-footer">
        <button id="pull-required-go" class="btn btn-primary">Ke Beranda</button>
      </div>
    </div></div>`;
    document.body.appendChild(el);
    return el;
  }

  /**
   * Tampilkan modal “Tarik Master & Data Aktual dulu”
   * - message: string (opsional)
   * - onGo: callback ketika user klik "Ke Beranda"
   */
  function showPullRequiredModal(message='', onGo=()=>{}){
    const el = _ensureInfoModal();
    const body = el.querySelector('#pull-required-body');
    body.innerHTML = message || 'Beberapa data yang diperlukan belum tersedia di perangkat ini.';
    const modal = new bootstrap.Modal(el, { backdrop:'static', keyboard:false });
    el.querySelector('#pull-required-go').onclick = ()=>{
      modal.hide();
      onGo();
    };
    modal.show();
  }

  /**
   * Guard siap pakai:
   * Jika data belum hangat → munculkan modal & arahkan ke Beranda.
   * return Promise<boolean> → true jika OK untuk lanjut, false jika dialihkan.
   */
  async function requireWarmOrRedirect(opts = {}){
    try{
      await STORE?.ensureWarm?.(); // kalau sudah hangat, ini cepat
    }catch(_){/* abaikan */}

    const { ok, missing } = _isWarm(opts);
    if(ok) return true;

    const msg = `
      <div>Data yang belum tersedia:</div>
      ${missing.masters.length ? `<div class="mt-1">Master: <code>${missing.masters.join(', ')}</code></div>` : ''}
      ${missing.actuals.length ? `<div class="mt-1">Actuals: <code>${missing.actuals.join(', ')}</code></div>` : ''}
    `;
    showPullRequiredModal(msg, ()=>{
      // arahkan ke beranda (gunakan '#/' karena router Anda renderHome di '#/')
      location.hash = '#/';
    });
    return false;
  }

  // ====== [GLOBAL PROGRESS HELPERS] ======
  // Pastikan DOM modal progress tersedia
  function ensureProgressModalDom(){
    let modalEl = document.getElementById('progressModal');
    if(!modalEl){
      modalEl = document.createElement('div');
      modalEl.id = 'progressModal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header py-2">
              <h5 class="modal-title">Memproses...</h5>
            </div>
            <div class="modal-body">
              <div class="progress" role="progressbar" aria-label="Progress">
                <div id="progressBar" class="progress-bar" style="width:0%">0%</div>
              </div>
              <div id="progressText" class="small mt-2 text-muted">Menyiapkan...</div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
    }
    return modalEl;
  }

  let progressModalInst = null;

  function progressOpen(title='Memproses...'){
    const modalEl = ensureProgressModalDom();
    const titleEl = qs('.modal-title', modalEl);
    if(titleEl) titleEl.textContent = title;

    progressModalInst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, {backdrop:'static'});
    progressModalInst.show();
    progress(0, 'Menyiapkan...');
  }

  function progress(val, text=''){
    const bar = document.getElementById('progressBar');
    const t   = document.getElementById('progressText');
    if(bar){
      const v = Math.max(0, Math.min(100, Number(val)||0));
      bar.style.width   = `${v}%`;
      bar.textContent   = `${v}%`;
    }
    if(t && text) t.textContent = text;
  }

  function progressClose(){
    const el = document.getElementById('progressModal');
    const inst = progressModalInst || (el && bootstrap.Modal.getInstance(el));
    if(inst){ inst.hide(); }
    progressModalInst = null;
  }

  /** Cek apakah modal progress sedang "show" */
  function progressIsOpen(){
    const el = document.getElementById('progressModal');
    return !!(el && el.classList.contains('show'));
  }

  /** Safe open: hanya buka kalau belum ada yang buka */
  function safeProgressOpen(title='Memproses...'){
    if (progressIsOpen()) return false;
    progressOpen(title);
    return true;
  }

  /** Hard close: sapu bersih sisa backdrop & state body */
  function progressHardClose(){
    try{
      const el = document.getElementById('progressModal');
      if(el){
        const inst = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el, {backdrop:'static'});
        inst.hide();
      }
      // hapus backdrop tersisa
      document.querySelectorAll('.modal-backdrop.show').forEach(b=> b.remove());
      // pulihkan body
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('padding-right');
    }catch(_){ /* no-op */ }
  }

    // ====== SAFE DOM HELPERS (tahan null) ======
  const safe = {
    text(el, v){ if (el) el.textContent = v; },
    html(el, v){ if (el) el.innerHTML = v; },
    toggle(el, cls, on){ if (el && el.classList) el.classList.toggle(cls, !!on); },
    add(el, cls){ if (el && el.classList) el.classList.add(cls); },
    remove(el, cls){ if (el && el.classList) el.classList.remove(cls); },
    show(el, disp='block'){ if (el) el.style.display = disp; },
    hide(el){ if (el) el.style.display = 'none'; },
    attr(el, k, v){
      if (!el) return;
      if (v===undefined) return el.getAttribute(k);
      el.setAttribute(k, v);
    }
  };

  // ====== ALERT MODAL SEDERHANA (fallback ke window.alert) ======
  function ensureAlertModalDom(){
    let el = document.getElementById('u-alert-modal');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'u-alert-modal';
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title" id="u-alert-title">Informasi</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body" id="u-alert-body">-</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
        </div>
      </div></div>`;
    document.body.appendChild(el);
    return el;
  }

  function alert(msg, title='Informasi'){
    try{
      const el = ensureAlertModalDom();
      const t  = el.querySelector('#u-alert-title');
      const b  = el.querySelector('#u-alert-body');
      if (t) t.textContent = String(title||'Informasi');
      if (b) b.innerHTML   = htmlBR(msg||'');
      const modal = bootstrap.Modal.getOrCreateInstance(el, {backdrop:'static'});
      modal.show();
    }catch(_){
      // fallback jika Bootstrap belum ada
      window.alert(String(msg||''));
    }
  }

  // Debounce
  function debounce(fn, delay=500){
    let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
  }

  // Simple toast
  function toast(msg, type='info'){
    const div = document.createElement('div');
    div.className = `toast align-items-center text-bg-${type} border-0 show position-fixed bottom-0 end-0 m-3`;
    div.role = 'alert'; div.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 3500);
  }

  // Online status
  function updateOnlineBadge(){
    const b = document.getElementById('online-status');
    if(!b) return;
    const on = navigator.onLine;
    b.textContent = on ? 'online' : 'offline';
    b.className = `badge ${on?'text-bg-success':'text-bg-secondary'}`;
  }
  window.addEventListener('online', updateOnlineBadge);
  window.addEventListener('offline', updateOnlineBadge);

  // expose
  return {
    S, qs, qsa, fmt, htmlBR,
    debounce, toast,
    progressOpen, progressClose, progress,
    updateOnlineBadge,
    // guards & progress utils
    requireWarmOrRedirect, progressIsOpen, safeProgressOpen, progressHardClose,
    // baru
    safe, alert
  };
})();


// === KPL CCTV: tap write/read ke kpl.actual.pdo_draft + normalisasi divisi ===
(function(){
  const KEY = 'kpl.actual.pdo_draft';

  // buffer log global (bisa dibuka lewat window.__KPL_TAP)
  window.__KPL_TAP = window.__KPL_TAP || { logs: [], warn: [] };

  // util: ambil stack pendek (file:line)
  function shortStack(){
    try{
      const s = new Error().stack || '';
      // buang baris pertama ("Error")
      return s.split('\n').slice(2, 8).map(l=>l.trim()).join(' ⟂ ');
    }catch(_){ return '(no stack)'; }
  }

  // util: deep find prop name
  function hasPropDeep(obj, name){
    try{
      const seen = new WeakSet();
      const dfs = (o)=>{
        if (!o || typeof o!=='object' || seen.has(o)) return false;
        seen.add(o);
        if (Object.prototype.hasOwnProperty.call(o, name)) return true;
        return Object.values(o).some(v=> dfs(v));
      };
      return dfs(obj);
    }catch(_){ return false; }
  }

  // util: NORMALISASI divisi_xxx -> divisi_id (hanya untuk pdo_draft)
  function normalizeDivisiId(arr){
    let changed = false;
    const out = (Array.isArray(arr)? arr : []).map(row=>{
      if (!row || typeof row!=='object') return row;
      const r = {...row};
      // jika ada divisi_kode tapi tidak ada divisi_id → angkat jadi divisi_id
      if (!r.divisi_id && r.divisi_kode){
        r.divisi_id = String(r.divisi_kode).trim();
        changed = true;
      }
      // jika ada divisi (lama) dan belum ada divisi_id → pakai divisi
      if (!r.divisi_id && r.divisi){
        r.divisi_id = String(r.divisi).trim();
        changed = true;
      }
      return r;
    });
    return { out, changed };
  }

  // PATCH 1: tap U.S.set (prioritas)
  if (window.U && U.S && typeof U.S.set === 'function'){
    const _set = U.S.set.bind(U.S);
    U.S.set = function(k, v){
      if (k === KEY){
        // normalisasi sebelum simpan
        let payload = v;
        const norm = normalizeDivisiId(payload);
        if (norm.changed) payload = norm.out;

        // CCTV log
        const log = {
          when: new Date().toISOString(),
          action: 'SET',
          stack: shortStack(),
          size: Array.isArray(payload) ? payload.length : '(not array)',
          has_divisi_kode: hasPropDeep(payload, 'divisi_kode'),
          sample: Array.isArray(payload) ? payload[0] : payload
        };
        window.__KPL_TAP.logs.push(log);
        try{ console.groupCollapsed('[CCTV][SET] kpl.actual.pdo_draft'); console.log(log); console.groupEnd(); }catch(_){}

        // peringatan jika masih ada divisi_kode
        if (log.has_divisi_kode){
          const msg = `[CCTV] WARNING: payload untuk ${KEY} masih memuat "divisi_kode". Sumber stack: ${log.stack}`;
          window.__KPL_TAP.warn.push({ when: log.when, msg });
          try{ console.warn(msg); }catch(_){}
        }
        return _set(k, payload);
      }
      return _set(k, v);
    };
  }

  // PATCH 2: tap U.S.get (untuk melihat siapa pembaca pertama)
  if (window.U && U.S && typeof U.S.get === 'function'){
    const _get = U.S.get.bind(U.S);
    U.S.get = function(k, def){
      const out = _get(k, def);
      if (k === KEY){
        const log = {
          when: new Date().toISOString(),
          action: 'GET',
          stack: shortStack(),
          size: Array.isArray(out) ? out.length : '(not array)',
          has_divisi_kode: hasPropDeep(out, 'divisi_kode')
        };
        window.__KPL_TAP.logs.push(log);
        try{ console.groupCollapsed('[CCTV][GET] kpl.actual.pdo_draft'); console.log(log); console.groupEnd(); }catch(_){}
      }
      return out;
    };
  }

  // PATCH 3 (opsional): tap API.call untuk melihat apakah backend pernah mengirim divisi_kode
  if (window.API && typeof API.call === 'function'){
    const _call = API.call.bind(API);
    API.call = async function(name, payload){
      const res = await _call(name, payload);
      try{
        const has = (obj)=> hasPropDeep(obj, 'divisi_kode');
        if (has(res)){
          const log = {
            when: new Date().toISOString(),
            action: 'API',
            endpoint: name,
            stack: shortStack(),
            has_divisi_kode: true
          };
          window.__KPL_TAP.logs.push(log);
          console.warn('[CCTV][API] Response mengandung "divisi_kode"', log);
        }
      }catch(_){}
      return res;
    };
  }

  // PANEL KECIL (opsional): ketuk F9 → buka ringkasan
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'F9'){
      const d = window.__KPL_TAP;
      alert(`[CCTV] Logs: ${d.logs.length} entri\nWarnings: ${d.warn.length}\nCek console untuk detail.`);
      try{ console.table(d.logs.map(x=>({when:x.when,action:x.action, size:x.size, api:x.endpoint||'', has_divisi_kode:x.has_divisi_kode}))); }catch(_){}
    }
  });
})();

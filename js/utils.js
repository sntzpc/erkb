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
    requireWarmOrRedirect, progressIsOpen, safeProgressOpen, progressHardClose
  };
})();

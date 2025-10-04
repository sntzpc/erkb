window.U = (function(){
  const ls = window.localStorage;
  const S = {
    get: (k, def=null) => { try { const v = ls.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } },
    set: (k, v) => ls.setItem(k, JSON.stringify(v)),
    del: (k) => ls.removeItem(k),
    size: () => ls.length,
    clearAll: () => ls.clear(),
  };

  const qs   = (sel, el=document)=>el.querySelector(sel);
  const qsa  = (sel, el=document)=>Array.from(el.querySelectorAll(sel));

  // === Formatters (angka & tanggal, ID) ===
  // NOTE: menambah formatter global tanpa mengganggu util lama.
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
    /**
     * Format angka Indonesia tanpa desimal (pemisah ribuan).
     * Contoh: U.fmt.id0(12345) -> "12.345"
     */
    id0(v, fallback='0'){
      const n = toNum(v);
      return n === null ? fallback : nf0.format(n);
    },

    /**
     * Format angka Indonesia dengan 2 desimal (ribuan + 2 desimal).
     * Cocok untuk HK, volume, dll.
     * Contoh: U.fmt.id2(12345.6) -> "12.345,60"
     */
    id2(v, fallback='0,00'){
      const n = toNum(v);
      return n === null ? fallback : nf2.format(n);
    },

    /**
     * Alias semantik untuk HK.
     */
    hk(v, fallback='0,00'){
      return this.id2(v, fallback);
    },

    /**
     * Format IDR (default tanpa desimal).
     * Contoh: U.fmt.idr(1500000) -> "Rp1.500.000"
     *        U.fmt.idr(1500000, 2) -> "Rp1.500.000,00"
     */
    idr(v, fractionDigits=0){
      const n = toNum(v) ?? 0;
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(n);
    },

    /**
     * Format periode apa pun ke "YYYY-MM" zona Asia/Jakarta.
     * Terima "YYYY-MM", ISO date, atau Date object.
     * Contoh: U.fmt.periodeYM("2025-11-30T17:00:00.000Z") -> "2025-11"
     */
    periodeYM(p){
      if(!p) return '';
      if (p instanceof Date) {
        const tz = 'Asia/Jakarta';
        const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(p);
        const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(p);
        return `${y}-${m}`;
      }
      const s = String(p).trim();
      if (/^\d{4}-\d{2}$/.test(s)) return s; // sudah "YYYY-MM"
      const d = new Date(s);
      if (isNaN(d)) return s; // bukan tanggal valid -> tampilkan apa adanya
      const tz = 'Asia/Jakarta';
      const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(d);
      const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(d);
      return `${y}-${m}`;
    }
  };

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

  // Progress modal controls
  let progressModalInst = null;
  function progressOpen(title='Memproses...'){
    const modalEl = document.getElementById('progressModal');
    qs('.modal-title', modalEl).textContent = title;
    const m = new bootstrap.Modal(modalEl, {backdrop:'static'});
    progressModalInst = m;
    m.show(); progress(0, 'Menyiapkan...');
  }
  function progress(val, text=''){
    const bar = document.getElementById('progressBar');
    const t = document.getElementById('progressText');
    bar.style.width = `${val}%`; bar.textContent = `${val}%`;
    if(text) t.textContent = text;
  }
  function progressClose(){ if(progressModalInst){ progressModalInst.hide(); progressModalInst=null; } }

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
  return { S, qs, qsa, fmt, htmlBR, debounce, toast, progressOpen, progressClose, progress, updateOnlineBadge };
})();

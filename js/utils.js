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
  const fmt  = {
    ymd: (d=new Date()) => d.toISOString().slice(0,10),
    yymmddhhmmss: (d=new Date()) => {
      const pad = (n)=> String(n).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return yy + pad(d.getMonth()+1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
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

  return { S, qs, qsa, fmt, debounce, toast, progressOpen, progressClose, progress, updateOnlineBadge };
})();

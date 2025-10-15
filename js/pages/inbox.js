// js/pages/inbox.js
// ====================================================================
// INBOX GABUNGAN (RKB + PDO + Inbox Umum)
// ====================================================================

window.Pages = window.Pages || {};
Pages.inbox = function(){
  // ===== Root =====
  const root = U.qs('#app-root');

  // ===== Styles sekali saja =====
  (function ensureInboxStyles(){
    if(document.getElementById('inbox-css')) return;
    const css = `
      .dot{display:inline-block;width:10px;height:10px;border-radius:50%;}
      .dot-unread{background:#dc3545;}
      .dot-read{background:#6c757d;}
      .table-compact td, .table-compact th { white-space: nowrap; }
      .pager .page-link{cursor:pointer}
      .pager .disabled .page-link{pointer-events:none; opacity:.6}
      @media (max-width: 768px){ .hide-sm{ display:none; } }
    `;
    const s = document.createElement('style'); s.id='inbox-css'; s.textContent=css; document.head.appendChild(s);
  })();

  // ===== Kunci penyimpanan lokal & antrean aksi offline =====
  const ACT_KEY    = 'kpl.actual.inbox';   // cache gabungan yang ditampilkan
  const OUTBOX_ACT = 'kpl.outbox.actions'; // antrean aksi network (offline)

  // ====================================================================
  // UTIL & HELPERS
  // ====================================================================

  function getActualInbox(){ return U.S.get(ACT_KEY, []) || []; }
  function setActualInbox(rows){ U.S.set(ACT_KEY, rows||[]); }
  function queueAction(action, payload){
    const q = U.S.get(OUTBOX_ACT, []) || [];
    q.unshift({ action, payload, ts:new Date().toISOString() });
    U.S.set(OUTBOX_ACT, q);
  }

  // Format WIB untuk waktu & periode
  function toLocalTime(s){
    if(!s) return '-';
    try{
      const d = new Date(s);
      return new Intl.DateTimeFormat('id-ID',{ timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short' }).format(d);
    }catch(_){ return s; }
  }
  function toPeriodeWIB(p){
    if(!p) return '-';
    const s = String(p).trim();
    if(/^\d{4}-\d{2}$/.test(s)) return s;
    if(/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0,7);
    const d = new Date(s); if(isNaN(d)) return s;
    const y = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',year:'numeric'}).format(d);
    const m = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',month:'2-digit'}).format(d);
    return `${y}-${m}`;
  }
  function _pick(o, keys){
    for(const k of keys){ if(o && o[k]!=null && String(o[k]).trim()!=='') return o[k]; }
    return '';
  }
  function fmtCount(n){ return new Intl.NumberFormat('id-ID').format(n); }

  // Key unik untuk deduplikasi
  function _keyOf(r){
    return `${String(r.module||'').toUpperCase()}|${String(r.nomor||'')}|${String(r.created_at||'')}`;
  }

  // Merge unik (primary menang, extra hanya ditambah jika belum ada)
  function _mergeInboxUnique(primary, extra){
    const used = new Set((primary||[]).map(_keyOf));
    const add  = (extra||[]).filter(r => !used.has(_keyOf(r)));
    return (primary||[]).concat(add);
  }

  // ====================================================================
  // MAPPER & KOLEKTOR KOMENTAR (PDO + RKB)
  // ====================================================================

  // ---- PDO: map 1 baris komentar → unified row
  function _mapPdoCommentRow(row){
    const nomor = String(_pick(row, ['nomor','no_pdo','pdo_no','kode','no','nomor_pdo','pdo_nomor'])||'').trim();
    const periode = _pick(row, ['periode','period','bulan','month','bulan_periode']) || '';
    const divisi = _pick(row, ['divisi','divisi_id','divisi_kode','kd_divisi','kode_divisi','divisi_nama']) || '';
    const role = _pick(row, ['role','from_role','sender_role','role_from']) || 'ASKEP';
    const username = _pick(row, ['username','created_by','sender','user','by','oleh']) || '';
    const comment = _pick(row, ['comment','komentar','message','catatan','comment_text','pesan','alasan']) || '';
    const createdAt = _pick(row, ['created_at','created_ts','created','ts','tanggal','createdAt']) || new Date().toISOString();
    let readAt = _pick(row, ['read_at','read_ts','dibaca_ts']); if (String(readAt).trim()==='') readAt = null;
    const id = _pick(row, ['id','row_id','_id']) || `${nomor}|${createdAt}|PDO`;

    return { id, module:'PDO', nomor, periode, divisi, comment, role, username, created_at: createdAt, read_at: readAt };
  }

  // ---- PDO: kumpulkan dari STORE actuals (mencoba beberapa kunci)
  function _collectPdoCommentsAsInbox(){
    let src = [];
    if (typeof STORE?.getActual === 'function'){
      const cand = ['kpl.actual.pdo_comments','pdo_comments','kpl.actual.pdo_comment','pdo_comment'];
      for(const k of cand){
        const v = STORE.getActual(k);
        if (Array.isArray(v) && v.length){ src = v; break; }
      }
    }
    if(!Array.isArray(src) || !src.length) return [];
    return src.map(_mapPdoCommentRow).filter(r => r.nomor || r.comment);
  }

  // ---- RKB: map 1 baris komentar → unified row
  function _mapRkbCommentRow(row){
    const nomor = String(_pick(row, ['nomor','no_rkb','rkb_no','kode','no'])||'').trim();
    const periode = _pick(row, ['periode','period','bulan','month']) || '';
    const divisi = _pick(row, ['divisi','divisi_id','divisi_kode','kd_divisi','kode_divisi','divisi_nama']) || '';
    const role = _pick(row, ['role','from_role','sender_role','role_from']) || 'ASKEP';
    const username = _pick(row, ['username','created_by','sender','user','by','oleh']) || '';
    const comment = _pick(row, ['comment','komentar','message','catatan','comment_text','pesan','alasan']) || '';
    const createdAt = _pick(row, ['created_at','created_ts','created','ts','tanggal','createdAt']) || new Date().toISOString();
    let readAt = _pick(row, ['read_at','read_ts','dibaca_ts']); if (String(readAt).trim()==='') readAt = null;
    const id = _pick(row, ['id','row_id','_id']) || `${nomor}|${createdAt}|RKB`;

    return { id, module:'RKB', nomor, periode, divisi, comment, role, username, created_at: createdAt, read_at: readAt };
  }

  // ---- RKB: kumpulkan dari STORE actuals (mencoba beberapa kunci)
  function _collectRkbCommentsAsInbox(){
    let src = [];
    if (typeof STORE?.getActual === 'function'){
      const cand = ['kpl.actual.rkb_comments','rkb_comments','kpl.actual.rkb_comment','rkb_comment'];
      for(const k of cand){
        const v = STORE.getActual(k);
        if (Array.isArray(v) && v.length){ src = v; break; }
      }
    }
    if(!Array.isArray(src) || !src.length) return [];
    return src.map(_mapRkbCommentRow).filter(r => r.nomor || r.comment);
  }

  // ====================================================================
  // BADGE GLOBAL — menghitung unread dari cache + komentar RKB+PDO
  // ====================================================================
  (function ensureInboxBadgeUpdater(){
  if (window.updateInboxBadge) return;

  window.updateInboxBadge = function(){
    try{
      const cached = U.S.get('kpl.actual.inbox', []) || [];
      const unread = cached.reduce((n, r) => n + (r && !r.read_at ? 1 : 0), 0);

      // Cari elemen badge (beberapa kemungkinan selector)
      const selectors = ['#menu-inbox-badge','#nav-inbox .badge','[data-badge="inbox"]','.js-inbox-badge'];
      let el = null;
      for (const sel of selectors) {
        const cand = document.querySelector(sel);
        if (cand) { el = cand; break; }
      }

      if (el) {
        if (unread > 0) {
          el.textContent = String(unread);
          el.classList.remove('d-none','visually-hidden');
          el.setAttribute('aria-label', `Pesan belum dibaca: ${unread}`);
          el.title = `${unread} pesan belum dibaca`;
        } else {
          el.textContent = '';
          el.classList.add('d-none');
          el.removeAttribute('title');
          el.removeAttribute('aria-label');
        }
      }

      // Broadcast opsional ke komponen lain
      try { document.dispatchEvent(new CustomEvent('inbox:badge', { detail: { unread } })); } catch(_) {}
      return unread;
    } catch(_) {
      return 0;
    }
  };

  // Refresh ringan berkala & saat tab aktif
  try {
    setInterval(() => { try { window.updateInboxBadge(); } catch(_) {} }, 15000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { try { window.updateInboxBadge(); } catch(_) {} }
    });
  } catch(_) {}
})();

  // ====================================================================
  // STATE UI
  // ====================================================================
  let allRows = [];       // data gabungan yang dirender
  let onlyUnread = false; // filter toggle
  let q = '';             // keyword pencarian
  let page = 1;           // halaman
  let pageSize = 20;      // ukuran halaman

  // ====================================================================
  // LOADER UTAMA (cache-first → server)
  // ====================================================================
  async function load(preferLocal=true){
    try{
      // ---- 1) Cache-first (gabungkan cache + komentar RKB + PDO)
      if(preferLocal){
        const cached = getActualInbox();
        let baseRows = Array.isArray(cached) ? cached.slice() : [];

        if (typeof STORE?.ensureWarm === 'function') await STORE.ensureWarm();
        const rkbRows = _collectRkbCommentsAsInbox();
        const pdoRows = _collectPdoCommentsAsInbox();

        allRows = _mergeInboxUnique(_mergeInboxUnique(baseRows, rkbRows), pdoRows)
          .sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setActualInbox(allRows);
        updateInboxBadge && updateInboxBadge();
        if(allRows.length){ render(); return; }
        // jika cache kosong, lanjut ambil dari server
      }

      // ---- 2) Server fetch (inbox umum) + pull actuals (agar rkb/pdo comments segar)
      U.progressOpen('Memuat pesan...'); U.progress(30,'Ambil dari server');

      const r = await API.call('inboxList', { onlyUnread:false });
      const base = r.ok && Array.isArray(r.rows) ? r.rows : [];

      try{ await API.call('pullMaster', {}); }catch(_){ /* optional */ }
      if (typeof STORE?.ensureWarm === 'function') await STORE.ensureWarm();

      const rkbRows = _collectRkbCommentsAsInbox();
      const pdoRows = _collectPdoCommentsAsInbox();

      allRows = _mergeInboxUnique(_mergeInboxUnique(base, rkbRows), pdoRows)
        .sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActualInbox(allRows);
      updateInboxBadge && updateInboxBadge();
      render();
    }catch(e){
      root.innerHTML = `<div class="alert alert-danger">Gagal memuat: ${e.message||e}</div>`;
    }finally{
      U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 200);
      updateInboxBadge && updateInboxBadge();
    }
  }

  // ====================================================================
  // TANDAI PESAN SUDAH DIBACA (optimistic + kirim / antre)
  // ====================================================================
  async function markRead(row){
    // 1) Update lokal (optimistic)
    const idx = allRows.findIndex(x =>
      (x.id && row.id && x.id===row.id) ||
      (!x.id && x.module===row.module && x.nomor===row.nomor && x.created_at===row.created_at)
    );
    if(idx>=0){
      allRows[idx].read_at = new Date().toISOString();
      setActualInbox(allRows);
      renderTable(); renderPager();
      updateInboxBadge && updateInboxBadge();
    }

    // 2) Kirim ke server sesuai modul
    try{
      const mod = String(row.module||'').toUpperCase();
      if(mod==='PDO'){
        const payload = { nomor: row.nomor, created_at: row.created_at };
        const res = await API.call('pdoCommentMarkRead', payload);
        if(!res.ok) throw new Error(res.error||'Gagal update PDO comment');
      }else if(mod==='RKB'){
        // Jika ada endpoint khusus RKB:
        let res = {ok:false};
        try{ res = await API.call('rkbCommentMarkRead', { nomor: row.nomor, created_at: row.created_at }); }catch(_){}
        // Fallback ke inbox umum jika endpoint RKB belum tersedia:
        if(!res?.ok){
          const fb = await API.call('inboxMarkRead', { nomor: row.nomor, created_at: row.created_at });
          if(!fb.ok) throw new Error(fb.error||'Gagal update RKB comment');
        }
      }else{
        const payload = row.id ? {id: row.id} : {nomor: row.nomor, created_at: row.created_at};
        const res = await API.call('inboxMarkRead', payload);
        if(!res.ok) throw new Error(res.error||'Gagal update inbox');
      }
    }catch(e){
      // Offline/endpoint tidak ada → antrekan
      const mod = String(row.module||'').toUpperCase();
      const payload = row.id ? {id: row.id} : {nomor: row.nomor, created_at: row.created_at};
      const action  = (mod==='PDO') ? 'pdoCommentMarkRead' : (mod==='RKB' ? 'rkbCommentMarkRead' : 'inboxMarkRead');
      queueAction(action, payload);
      U.toast('Offline: penandaan dibaca diantrikan.','warning');
    }
  }

  // ====================================================================
  // FILTER & PAGINASI
  // ====================================================================
  function applyFilter(rows){
    let arr = onlyUnread ? rows.filter(r=> !r.read_at) : rows.slice();
    const qq = q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=>[
        r.module,
        r.nomor, r.divisi, r.periode, r.comment, r.username, r.role
      ].some(v=> String(v||'').toLowerCase().includes(qq)));
    }
    return arr;
  }
  function pageCountOf(rows){ return Math.max(1, Math.ceil(rows.length / pageSize)); }
  function getPaged(rows){
    const pc=pageCountOf(rows); if(page>pc) page=pc; const s=(page-1)*pageSize; return rows.slice(s, s+pageSize);
  }

  // ====================================================================
  // RENDER SHELL (toolbar, table, pager)
  // ====================================================================
  function render(){
    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">Pesan</h4>
          <div class="d-flex flex-wrap gap-2">
            <div class="input-group input-group-sm" style="width:260px">
              <span class="input-group-text">Cari</span>
              <input id="inbox-search" class="form-control" placeholder="nomor, divisi, periode, komentar...">
            </div>
            <select id="inbox-pagesize" class="form-select form-select-sm" style="width:auto">
              ${[20,40,80,100,500].map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('')}
            </select>
            <div class="btn-group btn-group-sm">
              <button id="btn-all" class="btn ${!onlyUnread?'btn-primary':'btn-outline-secondary'}">Semua</button>
              <button id="btn-unread" class="btn ${onlyUnread?'btn-primary':'btn-outline-secondary'}">Belum Dibaca</button>
              <button id="btn-reload" class="btn btn-outline-secondary">Muat Ulang (Server)</button>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle table-compact">
            <thead>
              <tr>
                <th style="width:28px"></th>
                <th>Waktu</th>
                <th class="hide-sm">Dari</th>
                <th>Modul</th>
                <th>Nomor</th>
                <th class="hide-sm">Divisi</th>
                <th>Periode</th>
                <th>Komentar</th>
              </tr>
            </thead>
            <tbody id="msg-rows"></tbody>
          </table>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-2">
          <div class="small text-muted" id="inbox-info"></div>
          <nav><ul class="pagination pagination-sm mb-0 pager" id="inbox-pager"></ul></nav>
        </div>
      </div></div>
    `;

    // Toolbar events
    const inp = U.qs('#inbox-search'); inp.value = q;
    inp.addEventListener('input', ()=>{ q=inp.value; page=1; renderTable(); renderPager(); });
    U.qs('#inbox-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderTable(); renderPager(); };
    U.qs('#btn-all').onclick    = ()=>{ onlyUnread=false; page=1; renderTable(); renderPager(); };
    U.qs('#btn-unread').onclick = ()=>{ onlyUnread=true;  page=1; renderTable(); renderPager(); };
    U.qs('#btn-reload').onclick = ()=> load(false);

    renderTable(); renderPager();
  }

  // ====================================================================
  // RENDER TABEL & PAGER
  // ====================================================================
  function renderTable(){
    const tb = U.qs('#msg-rows');
    const filtered = applyFilter(allRows);
    const slice = getPaged(filtered);

    if(!slice.length){
      tb.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Tidak ada pesan.</td></tr>`;
      U.qs('#inbox-info').textContent = `0 dari ${fmtCount(filtered.length)} pesan`;
      return;
    }

    tb.innerHTML = slice.map(r=>{
      const unread  = !r.read_at;
      const dotCls  = unread ? 'dot dot-unread' : 'dot dot-read';
      const trClass = unread ? ' class="table-warning"' : '';
      const module  = (r.module || 'RKB').toString().toUpperCase();
      const badgeCls =
        module==='PDO' ? 'text-bg-danger' :
        module==='RKB' ? 'text-bg-primary' : 'text-bg-secondary';

      return `
        <tr${trClass} data-id="${r.id||''}">
          <td class="text-center"><span class="${dotCls}" title="${unread?'Belum dibaca':'Sudah dibaca'}"></span></td>
          <td>${toLocalTime(r.created_at)}</td>
          <td class="hide-sm">${(r.role||'-')} (${r.username||'-'})</td>
          <td><span class="badge ${badgeCls}">${module}</span></td>
          <td><code>${r.nomor||'-'}</code></td>
          <td class="hide-sm">${r.divisi||'-'}</td>
          <td>${toPeriodeWIB(r.periode)}</td>
          <td>${(r.comment||'').replace(/\n/g,'<br/>')}</td>
        </tr>`;
    }).join('');

    // Klik baris → tandai read
    const slice2 = getPaged(filtered);
    tb.querySelectorAll('tr').forEach((tr, i)=>{
      const row = slice2[i];
      const handler = ()=> { if(!row.read_at) markRead(row); };
      tr.addEventListener('click', handler);
      tr.addEventListener('dblclick', handler);
    });

    const startIdx = (page-1)*pageSize + 1;
    const endIdx = startIdx + slice.length - 1;
    U.qs('#inbox-info').textContent = `${fmtCount(startIdx)}–${fmtCount(endIdx)} dari ${fmtCount(filtered.length)} pesan`;
  }

  function renderPager(){
    const ul = U.qs('#inbox-pager');
    const filtered = applyFilter(allRows);
    const pc = Math.max(1, Math.ceil(filtered.length / pageSize));

    function pageLi(label, p, disabled=false, active=false){
      const li = document.createElement('li');
      li.className = `page-item ${disabled?'disabled':''} ${active?'active':''}`;
      li.innerHTML = `<a class="page-link">${label}</a>`;
      if(!disabled && !active){
        li.onclick = ()=>{ page=p; renderTable(); renderPager(); window.scrollTo({top:0, behavior:'smooth'}); };
      }
      return li;
    }

    ul.innerHTML='';
    ul.appendChild(pageLi('«', Math.max(1,page-1), page<=1));
    const show = new Set([1, pc, page-1, page, page+1].filter(p=> p>=1 && p<=pc));
    const nums = [...show].sort((a,b)=>a-b);
    let last=0;
    for(const n of nums){
      if(n-last>1){
        const li=document.createElement('li'); li.className='page-item disabled';
        li.innerHTML=`<span class="page-link">…</span>`; ul.appendChild(li);
      }
      ul.appendChild(pageLi(String(n), n, false, n===page));
      last=n;
    }
    ul.appendChild(pageLi('»', Math.min(pc,page+1), page>=pc));
  }

  // ====================================================================
  // GO: initial load (cache-first)
  // ====================================================================
  load(true);
};

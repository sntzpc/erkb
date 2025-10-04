// js/pages/inbox.js
window.Pages = window.Pages || {};
Pages.inbox = function(){
  const root = U.qs('#app-root');

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

  const ACT_KEY = 'kpl.actual.inbox';
  const OUTBOX_ACT = 'kpl.outbox.actions';

  function getActualInbox(){ return U.S.get(ACT_KEY, []) || []; }
  function setActualInbox(rows){ U.S.set(ACT_KEY, rows||[]); }
  function queueAction(action, payload){
    const q = U.S.get(OUTBOX_ACT, []) || [];
    q.unshift({ action, payload, ts:new Date().toISOString() });
    U.S.set(OUTBOX_ACT, q);
  }

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
    const d = new Date(s); if(isNaN(d)) return s;
    const y = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',year:'numeric'}).format(d);
    const m = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',month:'2-digit'}).format(d);
    return `${y}-${m}`;
  }

  let allRows = [];
  let onlyUnread = false;
  let q = '';
  let page = 1;
  let pageSize = 20;

  async function load(preferLocal=true){
    try{
      if(preferLocal){
        const cached = getActualInbox();
        if(Array.isArray(cached) && cached.length){
          allRows = cached.slice().sort((a,b)=> new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
          render(); return;
        }
      }
      U.progressOpen('Memuat pesan...'); U.progress(30,'Ambil dari server');
      const r = await API.call('inboxList', { onlyUnread:false });
      if(!r.ok) throw new Error(r.error||'Gagal memuat');
      allRows = Array.isArray(r.rows)? r.rows : [];
      allRows.sort((a,b)=> new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
      setActualInbox(allRows); // cache-kan agar halaman lain cepat & offline-ready
      render();
    }catch(e){
      root.innerHTML = `<div class="alert alert-danger">Gagal memuat: ${e.message||e}</div>`;
    }finally{
      U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 200);
      updateInboxBadge && updateInboxBadge();
    }
  }

  async function markRead(row){
    // update lokal dulu (optimistic)
    const idx = allRows.findIndex(x=> (x.id && x.id===row.id) || (!x.id && x.nomor===row.nomor && x.created_at===row.created_at));
    if(idx>=0){ allRows[idx].read_at = new Date().toISOString(); setActualInbox(allRows); renderTable(); renderPager(); updateInboxBadge && updateInboxBadge(); }
    try{
      const payload = row.id ? {id: row.id} : {nomor: row.nomor, created_at: row.created_at};
      const r = await API.call('inboxMarkRead', payload);
      if(!r.ok) throw new Error(r.error||'Gagal update');
    }catch(e){
      // offline → antrekan action
      const payload = row.id ? {id: row.id} : {nomor: row.nomor, created_at: row.created_at};
      queueAction('inboxMarkRead', payload);
      U.toast('Offline: penandaan dibaca diantrikan.','warning');
    }
  }

  function applyFilter(rows){
    let arr = onlyUnread ? rows.filter(r=> !r.read_at) : rows.slice();
    const qq = q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=>[
        r.nomor, r.divisi, r.periode, r.comment, r.username, r.role
      ].some(v=> String(v||'').toLowerCase().includes(qq)));
    }
    return arr;
  }
  function pageCountOf(rows){ return Math.max(1, Math.ceil(rows.length / pageSize)); }
  function getPaged(rows){ const pc=pageCountOf(rows); if(page>pc) page=pc; const s=(page-1)*pageSize; return rows.slice(s, s+pageSize); }
  function fmtCount(n){ return new Intl.NumberFormat('id-ID').format(n); }

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
                <th>Nomor RKB</th>
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

    const inp = U.qs('#inbox-search'); inp.value = q;
    inp.addEventListener('input', ()=>{ q=inp.value; page=1; renderTable(); renderPager(); });
    U.qs('#inbox-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderTable(); renderPager(); };
    U.qs('#btn-all').onclick    = ()=>{ onlyUnread=false; page=1; renderTable(); renderPager(); };
    U.qs('#btn-unread').onclick = ()=>{ onlyUnread=true;  page=1; renderTable(); renderPager(); };
    U.qs('#btn-reload').onclick = ()=> load(false);

    renderTable(); renderPager();
  }

  function renderTable(){
    const tb = U.qs('#msg-rows');
    const filtered = applyFilter(allRows);
    const slice = getPaged(filtered);

    if(!slice.length){
      tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Tidak ada pesan.</td></tr>`;
      U.qs('#inbox-info').textContent = `0 dari ${fmtCount(filtered.length)} pesan`;
      return;
    }

    tb.innerHTML = slice.map(r=>{
      const unread = !r.read_at;
      const dotCls = unread ? 'dot dot-unread' : 'dot dot-read';
      const trClass = unread ? ' class="table-warning"' : '';
      return `
        <tr${trClass} data-id="${r.id||''}">
          <td class="text-center"><span class="${dotCls}" title="${unread?'Belum dibaca':'Sudah dibaca'}"></span></td>
          <td>${toLocalTime(r.created_at)}</td>
          <td class="hide-sm">${(r.role||'-')} (${r.username||'-'})</td>
          <td><code>${r.nomor||'-'}</code></td>
          <td class="hide-sm">${r.divisi||'-'}</td>
          <td>${toPeriodeWIB(r.periode)}</td>
          <td>${(r.comment||'').replace(/\n/g,'<br/>')}</td>
        </tr>`;
    }).join('');

    // klik → tandai read (optimistic + queue offline)
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
      if(!disabled && !active) li.onclick = ()=>{ page=p; renderTable(); renderPager(); window.scrollTo({top:0, behavior:'smooth'}); };
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

  // first load: cache-first
  load(true);
};

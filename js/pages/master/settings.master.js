// js/pages/settings.master.js (Asisten boleh lihat sheet 'yrates' read-only)
window.Pages = window.Pages || {};
Pages.settingsMaster = function(){
  const root = U.qs('#app-root');
  const s = SESSION.profile(); if(!s){ location.hash='#/login'; return; }

  const role = String(s.role||'').toLowerCase();
  const isAdmin = role === 'admin';
  const isAsisten = role === 'asisten';

  // === Guard akses: Admin full, Asisten hanya 'yrates' (read-only).
  if(!isAdmin && !isAsisten){
    root.innerHTML = `<div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Master Data</h4>
      <div class="text-muted">Akses terbatas.</div>
    </div></div>`;
    return;
  }

  ensureStyles();
  function ensureStyles(){
    if(document.getElementById('settings-autofit-css')) return;
    const css = `
      .table-nowrap th, .table-nowrap td { white-space: nowrap; }
      .table-autofit input.form-control.form-control-sm.cell { width:100%; min-width:0; }
      .table-autofit thead th { position:sticky; top:0; z-index:1; background:var(--bs-body-bg,#fff); }
    `;
    const style = document.createElement('style'); style.id='settings-autofit-css'; style.textContent = css;
    document.head.appendChild(style);
  }

  // Admin: semua; Asisten: hanya 'yrates'
  const MASTER_LIST = isAdmin
    ? ['yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ybahan','yorg_map','yrates']
    : ['yrates'];

  // kontrol read-only utk Asisten
  const READ_ONLY = !isAdmin;

  let currentSheet = MASTER_LIST[0];
  let rows = [];
  let headers = [];
  let dirty = false;

  build(); loadSheet(currentSheet, true);

  function build(){
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h4 class="mb-0">Master Data ${isAdmin ? '(Admin)' : '(Asisten · lihat saja)'}</h4>
        <span class="badge ${dirty?'text-bg-warning':'text-bg-secondary'}" id="dirty-badge">${dirty?'Belum disimpan':'Tersimpan'}</span>
      </div>
      <div class="small text-muted mb-3">Kelola/lihat data master. Data dibaca dari cache lokal bila tersedia.</div>

      <div class="row g-3 align-items-end">
        <div class="col-lg-4">
          <label class="form-label">Pilih Master</label>
          <select id="sheet-name" class="form-select" ${READ_ONLY?'disabled':''}>
            ${MASTER_LIST.map(n=>`<option value="${n}" ${n===currentSheet?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="col-lg-8 d-flex flex-wrap gap-2">
          <button id="btn-reload" class="btn btn-outline-secondary">Muat Ulang (Server)</button>
          ${READ_ONLY ? '' : `
            <button id="btn-add-row" class="btn btn-outline-primary">Tambah Baris</button>
            <button id="btn-save" class="btn btn-success">Simpan Perubahan</button>
          `}
        </div>
      </div>

      <hr/>
      <div class="table-responsive" id="grid-wrap"></div>
      <div class="mt-3 small text-muted" id="status-line"></div>
    </div></div>`;

    const sel = U.qs('#sheet-name');
    if(sel){
      sel.onchange = (e)=>{
        if(dirty && !confirm('Perubahan belum disimpan. Ganti master akan menghapus perubahan. Lanjutkan?')){
          sel.value = currentSheet; return;
        }
        currentSheet = e.target.value; rows=[]; headers=[]; setDirty(false);
        renderGrid(); loadSheet(currentSheet, true);
      };
    }
    U.qs('#btn-reload').onclick = ()=> loadSheet(currentSheet, false);
    if(!READ_ONLY){
      U.qs('#btn-add-row').onclick = addRow;
      U.qs('#btn-save').onclick = saveAll;
    }
  }

  function setDirty(v){
    dirty = !!v;
    const b = U.qs('#dirty-badge');
    if(b){
      b.textContent = dirty ? 'Belum disimpan' : 'Tersimpan';
      b.className = `badge ${dirty?'text-bg-warning':'text-bg-secondary'}`;
    }
  }
  function setStatus(msg){ const el = U.qs('#status-line'); if(el) el.textContent = msg||''; }

  // Tambahkan di atas (bareng helper lain)
function _norm(v){ return String(v ?? '').trim(); }
function _normDiv(v){ return _norm(v).toUpperCase().replace(/[^A-Z0-9]/g,''); }
function _yyyymm(s){
  const t = _norm(s);
  if(/^\d{4}[-/]\d{2}$/.test(t)) return t.replace('/','-');
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/yyyy
  return m ? `${m[3]}-${m[2]}` : '';
}
function _isYratesGlobal(row){
  return !_norm(row.plant_id) && !_norm(row.estate_id) && !_norm(row.divisi_id);
}
function _yratesDedupKey(row){
  // prioritaskan id kalau ada; kalau tidak, pakai gabungan field yang stabil
  const id = _norm(row.id);
  if(id) return `id:${id}`;
  return [
    'k',
    String(row.jenis||'').toLowerCase(),
    _norm(row.plant_id),
    _norm(row.estate_id),
    _normDiv(row.divisi_id),
    _yyyymm(row.periode)||'',
    _norm(row.effective_from)||'',
  ].join('|');
}
function _mergeYratesServerWithLocal(serverRows, localRows){
  // Pastikan semua baris global dari lokal ikut ada
  const out = Array.isArray(serverRows) ? [...serverRows] : [];
  const have = new Set(out.map(_yratesDedupKey));
  (Array.isArray(localRows) ? localRows : []).forEach(r=>{
    if(_isYratesGlobal(r)){
      const k = _yratesDedupKey(r);
      if(!have.has(k)){ have.add(k); out.push(r); }
    }
  });
  return out;
}


  async function loadSheet(name, preferLocal=true){
  try{
    await STORE.ensureWarm?.();
    setStatus('Memuat data...');

    const localKey = `kpl.master.${name}`;
    let local = U.S.get(localKey, null);

    if(preferLocal && Array.isArray(local) && local.length){
      rows = JSON.parse(JSON.stringify(local));
    }else{
      U.progressOpen('Memuat master...'); U.progress(25,'Minta server');
      // >>> penting: minta server ikutkan baris global
      const payload = { name };
      if(name === 'yrates'){ payload.includeGlobal = true; }   // <-- kunci

      const r = await API.call('listMaster', payload);
      if(!r.ok) throw new Error(r.error||'Gagal memuat');
      let fromServer = Array.isArray(r.rows)? r.rows : [];

      // >>> jaga-jaga: merge baris global dari lokal agar tidak hilang
      if(name === 'yrates'){
        fromServer = _mergeYratesServerWithLocal(fromServer, local);
      }

      rows = fromServer;
      // cache ke lokal (agar dipakai form PDO dsb.)
      U.S.set(localKey, rows);
    }

    const set = new Set(); rows.forEach(o=> Object.keys(o||{}).forEach(k=> set.add(k)));
    headers = Array.from(set);
    setDirty(false); renderGrid();
    setStatus(`Memuat ${name}: ${rows.length} baris.`);
  }catch(e){
    U.toast(e.message||e,'danger'); setStatus('Gagal memuat.');
  }finally{ U.progressClose(); }
}


  function computeColumnWidths(headers, data){
    const MIN=120, MAX=420, CHAR_PX=8, PAD=24;
    return headers.map(h=>{
      let maxLen = String(h||'').length;
      for(const r of data){
        const v = r[h]!==undefined && r[h]!==null ? String(r[h]) : '';
        if(v.length > maxLen) maxLen = v.length;
      }
      return Math.max(MIN, Math.min(Math.round(maxLen*CHAR_PX+PAD), MAX));
    });
  }

  function renderGrid(){
    const wrap = U.qs('#grid-wrap');
    if(!rows.length){ wrap.innerHTML = `<div class="text-muted">Tidak ada data.</div>`; return; }

    const widths = computeColumnWidths(headers, rows);
    const colgroup = `<colgroup>${widths.map(w=>`<col style="width:${w}px">`).join('')}<col style="width:120px"></colgroup>`;
    const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Aksi</th></tr></thead>`;
    const body = rows.map((r,i)=>{
      const inputs = headers.map(h=>{
        const v = r[h]!==undefined ? r[h] : '';
        const disabled = READ_ONLY ? 'disabled' : '';
        return `<td><input class="form-control form-control-sm cell" data-k="${h}" value="${(v??'')}" ${disabled} /></td>`;
      }).join('');
      const aksi = READ_ONLY
        ? `<td><div class="small text-muted">View</div></td>`
        : `<td><button class="btn btn-sm btn-outline-danger" data-a="del" data-i="${i}">Hapus</button></td>`;
      return `<tr data-i="${i}">${inputs}${aksi}</tr>`;
    }).join('');

    wrap.innerHTML = `<table class="table table-sm table-striped align-middle table-nowrap table-autofit">${colgroup}${thead}<tbody>${body}</tbody></table>`;

    if(!READ_ONLY){
      // edit
      wrap.querySelectorAll('.cell').forEach(inp=>{
        inp.addEventListener('input', (e)=>{
          const tr = e.target.closest('tr'); const i = +tr.dataset.i;
          const k = e.target.dataset.k; rows[i][k] = e.target.value; setDirty(true);
        });
      });
      // hapus
      wrap.querySelectorAll('button[data-a="del"]').forEach(btn=>{
        btn.onclick = ()=>{
          const i = +btn.dataset.i;
          if(confirm('Hapus baris ini?')){ rows.splice(i,1); setDirty(true); renderGrid(); }
        };
      });
    }
  }

  function addRow(){
    if(!headers.length){ headers=['nama']; }
    const obj = Object.fromEntries(headers.map(h=>[h,'']));
    rows.push(obj); setDirty(true); renderGrid();
  }

  async function saveAll(){
    if(!rows.length){ U.toast('Tidak ada data untuk disimpan.','warning'); return; }
    try{
      U.progressOpen('Menyimpan...'); U.progress(20,'Kirim ke server');
      const r = await API.call('replaceMaster', { name: currentSheet, rows });
      if(!r.ok) throw new Error(r.error||'Gagal menyimpan');
      U.S.set(`kpl.master.${currentSheet}`, rows);
      setDirty(false);
      U.toast('Tersimpan ke Google Sheets.','success');
      setStatus(`Sheet ${currentSheet} tersimpan (${rows.length} baris).`);
    }catch(e){ U.toast(e.message||e,'danger'); }
    finally{ U.progressClose(); }
  }
};

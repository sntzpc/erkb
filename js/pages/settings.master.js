// js/pages/settings.master.js
window.Pages = window.Pages || {};
Pages.settingsMaster = function(){
  const root = U.qs('#app-root');
  const s = SESSION.profile(); if(!s){ location.hash='#/login'; return; }
  if((s.role||'').toLowerCase() !== 'admin'){
    root.innerHTML = `<div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Master Data</h4><div class="text-muted">Akses terbatas. Khusus Admin.</div></div></div>`;
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

  const MASTER_LIST = ['yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ybahan','yorg_map','yrates'];

  let currentSheet = 'ybahan';
  let rows = [];
  let headers = [];
  let dirty = false;

  build(); loadSheet(currentSheet, true);

  function build(){
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h4 class="mb-0">Master Data (Admin)</h4>
        <span class="badge ${dirty?'text-bg-warning':'text-bg-secondary'}" id="dirty-badge">${dirty?'Belum disimpan':'Tersimpan'}</span>
      </div>
      <div class="small text-muted mb-3">Kelola data master. Saat masuk, data dibaca dari cache lokal bila tersedia.</div>

      <div class="row g-3 align-items-end">
        <div class="col-lg-4">
          <label class="form-label">Pilih Master</label>
          <select id="sheet-name" class="form-select">
            ${MASTER_LIST.map(n=>`<option value="${n}" ${n===currentSheet?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="col-lg-8 d-flex flex-wrap gap-2">
          <button id="btn-reload" class="btn btn-outline-secondary">Muat Ulang (Server)</button>
          <button id="btn-add-row" class="btn btn-outline-primary">Tambah Baris</button>
          <button id="btn-save" class="btn btn-success">Simpan Perubahan</button>
        </div>
      </div>

      <hr/>
      <div class="table-responsive" id="grid-wrap"></div>
      <div class="mt-3 small text-muted" id="status-line"></div>
    </div></div>`;

    U.qs('#sheet-name').onchange = (e)=>{
      if(dirty && !confirm('Perubahan belum disimpan. Ganti master akan menghapus perubahan. Lanjutkan?')){ 
        U.qs('#sheet-name').value = currentSheet; return; 
      }
      currentSheet = e.target.value; rows=[]; headers=[]; setDirty(false);
      renderGrid(); loadSheet(currentSheet, true);
    };
    U.qs('#btn-reload').onclick = ()=> loadSheet(currentSheet, false);
    U.qs('#btn-add-row').onclick = addRow;
    U.qs('#btn-save').onclick = saveAll;
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

  async function loadSheet(name, preferLocal=true){
    try{
      setStatus('Memuat data...');
      let local = U.S.get(`kpl.master.${name}`, null);
      if(preferLocal && Array.isArray(local) && local.length){
        rows = JSON.parse(JSON.stringify(local));
      }else{
        U.progressOpen('Memuat master...'); U.progress(25,'Minta server');
        const r = await API.call('listMaster', { name });
        if(!r.ok) throw new Error(r.error||'Gagal memuat');
        rows = Array.isArray(r.rows)? r.rows : [];
        U.S.set(`kpl.master.${name}`, rows);
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

    const isOrg = currentSheet === 'yorg_map';
    const widths = computeColumnWidths(headers, rows);
    const colgroup = `<colgroup>${widths.map(w=>`<col style="width:${w}px">`).join('')}<col style="width:120px"></colgroup>`;
    const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Aksi</th></tr></thead>`;
    const body = rows.map((r,i)=>{
      const isAdminRow = isOrg && String(r.role||'').toLowerCase()==='admin';
      const inputs = headers.map(h=>{
        const v = r[h]!==undefined ? r[h] : '';
        const disabled = isAdminRow ? 'disabled' : '';
        return `<td><input class="form-control form-control-sm cell" data-k="${h}" value="${(v??'')}" ${disabled} /></td>`;
      }).join('');
      const aksi = isAdminRow
        ? `<td><div class="small text-muted">Proteksi</div></td>`
        : `<td><button class="btn btn-sm btn-outline-danger" data-a="del" data-i="${i}">Hapus</button></td>`;
      return `<tr data-i="${i}">${inputs}${aksi}</tr>`;
    }).join('');

    wrap.innerHTML = `<table class="table table-sm table-striped align-middle table-nowrap table-autofit">${colgroup}${thead}<tbody>${body}</tbody></table>`;

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

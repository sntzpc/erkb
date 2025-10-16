// js/pages/settings.master.js
// (Asisten boleh lihat sheet 'yrates' read-only)
// -----------------------------------------------------------------------------

window.Pages = window.Pages || {};
Pages.settingsMaster = function(){
  // ---------------------------------------------------------------------------
  // BOOTSTRAP + GUARD LOGIN
  // ---------------------------------------------------------------------------
  const root = U.qs('#app-root');
  const s = SESSION.profile(); 
  if (!s){ location.hash = '#/login'; return; }

  const role = String(s.role || '').toLowerCase();
  const isAdmin   = role === 'admin';
  const isAsisten = role === 'asisten';   // asisten: hanya boleh lihat 'yrates'

  // ---------------------------------------------------------------------------
  // AKSES: jika bukan Admin/Asisten → tidak boleh masuk
  // ---------------------------------------------------------------------------
  if(!isAdmin && !isAsisten){
    root.innerHTML = `
      <div class="card shadow-sm">
        <div class="card-body settings-master">
          <h4 class="mb-2">Master Data</h4>
          <div class="text-muted">Akses terbatas.</div>
        </div>
      </div>`;
    return;
  }

  // ---------------------------------------------------------------------------
  // STYLES (dipasang sekali saja)
  // - Menyatukan ukuran form-control di mobile agar setara desktop
  // - Memaksa lebar kolom (override colgroup) untuk sheet tertentu di mobile
  // ---------------------------------------------------------------------------
  ensureStyles();
  function ensureStyles(){
    if (document.getElementById('settings-autofit-css')) return;

    const css = `
      /* ======= TABEL DASAR ======= */
      .table-nowrap th, .table-nowrap td { white-space: nowrap; }
      .table-autofit input.form-control.form-control-sm.cell { width: 100%; min-width: 0; }
      .table-autofit thead th { position: sticky; top: 0; z-index: 1; background: var(--bs-body-bg, #fff); }

      /* ======= MOBILE TWEAKS: samakan ukuran field dg desktop ======= */
      @media (max-width: 768px){
        /* 1) Form kecil Bootstrap disetarakan dg ukuran default desktop */
        .settings-master .form-control-sm,
        .settings-master .form-select-sm{
          padding: .375rem .75rem;
          font-size: 1rem;
          line-height: 1.5;
          border-radius: .375rem;
          height: auto;
        }

        /* 2) Tinggi minimum agar nyaman disentuh */
        .settings-master .form-control,
        .settings-master .form-select{
          min-height: 44px;
        }

        /* 3) Pastikan grid bisa di-swipe */
        .settings-master .table-responsive{
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* 4) Lebar minimum tabel default (sheet selain yang di-force) */
        .settings-master .table-autofit{
          min-width: 980px;
        }

        /* 5) Input di sel jangan terlalu pendek */
        .settings-master .table-autofit td input.form-control{
          min-width: 140px;
        }

        /* ======= OVERRIDE KHUSUS PER-SHEET (pakai data-sheet) ======= */
        /* NOTE: gunakan !important untuk mengalahkan <col style="width:..."> dari colgroup */

        /* ---- yrates: banyak kolom numerik → 180px/kolom nyaman di mobile ---- */
        .settings-master #grid-wrap[data-sheet="yrates"] .table-autofit{
          min-width: 1280px;              /* sesuaikan (1360–1600) kalau kolom makin banyak */
        }
        .settings-master #grid-wrap[data-sheet="yrates"] .table-autofit col{
          width: 180px !important;        /* override lebar kolom dari colgroup */
        }

        /* ---- yorg_map: teks lebih panjang (username/role/divisi) → 200px/kolom ---- */
        .settings-master #grid-wrap[data-sheet="yorg_map"] .table-autofit{
          min-width: 1440px;              /* bisa 1560–1680 bila masih terasa sempit */
        }
        .settings-master #grid-wrap[data-sheet="yorg_map"] .table-autofit col{
          width: 200px !important;
        }

        /* Kolom terakhir = Aksi → tetap ramping */
        .settings-master .table-autofit col:last-child{
          width: 120px !important;
        }

        /* Input minimum di dua sheet itu ikut lebar kolomnya */
        .settings-master #grid-wrap[data-sheet="yrates"]  .table-autofit td input.form-control,
        .settings-master #grid-wrap[data-sheet="yorg_map"] .table-autofit td input.form-control{
          min-width: 180px;
        }
      }
    `;

    const style = document.createElement('style');
    style.id = 'settings-autofit-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // LIST SHEET & MODE READ-ONLY
  // ---------------------------------------------------------------------------
  const MASTER_LIST = isAdmin
    ? ['yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ybahan','yorg_map','yrates']
    : ['yrates']; // Asisten: hanya yrates (view-only)

  const READ_ONLY = !isAdmin;

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  let currentSheet = MASTER_LIST[0];
  let rows    = [];
  let headers = [];
  let dirty   = false;

  // ---------------------------------------------------------------------------
  // RENDER UI UTAMA + LOAD AWAL
  // ---------------------------------------------------------------------------
  build(); 
  loadSheet(currentSheet, true);

  function build(){
    root.innerHTML = `
      <div class="card shadow-sm">
        <div class="card-body settings-master">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 class="mb-0">Master Data ${isAdmin ? '(Admin)' : '(Asisten · lihat saja)'}</h4>
            <span class="badge ${dirty ? 'text-bg-warning' : 'text-bg-secondary'}" id="dirty-badge">
              ${dirty ? 'Belum disimpan' : 'Tersimpan'}
            </span>
          </div>

          <div class="small text-muted mb-3">Kelola/lihat data master. Data dibaca dari cache lokal bila tersedia.</div>

          <div class="row g-3 align-items-end">
            <div class="col-lg-4">
              <label class="form-label">Pilih Master</label>
              <select id="sheet-name" class="form-select" ${READ_ONLY ? 'disabled' : ''}>
                ${MASTER_LIST.map(n => `<option value="${n}" ${n===currentSheet ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="col-lg-8 d-flex flex-wrap gap-2">
              <button id="btn-reload"  class="btn btn-outline-secondary">Muat Ulang (Server)</button>
              ${READ_ONLY ? '' : `
                <button id="btn-add-row" class="btn btn-outline-primary">Tambah Baris</button>
                <button id="btn-save"    class="btn btn-success">Simpan Perubahan</button>
              `}
            </div>
          </div>

          <hr/>
          <div class="table-responsive" id="grid-wrap"></div>
          <div class="mt-3 small text-muted" id="status-line"></div>
        </div>
      </div>`;

    // events
    const sel = U.qs('#sheet-name');
    if (sel){
      sel.onchange = (e) => {
        if (dirty && !confirm('Perubahan belum disimpan. Ganti master akan menghapus perubahan. Lanjutkan?')){
          sel.value = currentSheet; 
          return;
        }
        currentSheet = e.target.value;
        rows = []; headers = []; 
        setDirty(false);
        renderGrid(); 
        loadSheet(currentSheet, true);
      };
    }
    U.qs('#btn-reload').onclick = () => loadSheet(currentSheet, false);
    if (!READ_ONLY){
      U.qs('#btn-add-row').onclick = addRow;
      U.qs('#btn-save').onclick    = saveAll;
    }
  }

  // ---------------------------------------------------------------------------
  // UTIL UI
  // ---------------------------------------------------------------------------
  function setDirty(v){
    dirty = !!v;
    const b = U.qs('#dirty-badge');
    if (b){
      b.textContent = dirty ? 'Belum disimpan' : 'Tersimpan';
      b.className = `badge ${dirty ? 'text-bg-warning' : 'text-bg-secondary'}`;
    }
  }
  function setStatus(msg){
    const el = U.qs('#status-line'); 
    if (el) el.textContent = msg || '';
  }

  // ---------------------------------------------------------------------------
  // HELPER untuk 'yrates' merge global rows
  // ---------------------------------------------------------------------------
  function _norm(v){ return String(v ?? '').trim(); }
  function _normDiv(v){ return _norm(v).toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function _yyyymm(s){
    const t = _norm(s);
    if (/^\d{4}[-/]\d{2}$/.test(t)) return t.replace('/','-');
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/yyyy
    return m ? `${m[3]}-${m[2]}` : '';
  }
  function _isYratesGlobal(row){
    return !_norm(row.plant_id) && !_norm(row.estate_id) && !_norm(row.divisi_id);
  }
  function _yratesDedupKey(row){
    const id = _norm(row.id);
    if (id) return `id:${id}`;
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
    const out = Array.isArray(serverRows) ? [...serverRows] : [];
    const have = new Set(out.map(_yratesDedupKey));
    (Array.isArray(localRows) ? localRows : []).forEach(r=>{
      if (_isYratesGlobal(r)){
        const k = _yratesDedupKey(r);
        if (!have.has(k)){ have.add(k); out.push(r); }
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // LOAD SHEET (prefer local cache; kalau kosong → server)
  // ---------------------------------------------------------------------------
  async function loadSheet(name, preferLocal=true){
    try{
      await STORE.ensureWarm?.();
      setStatus('Memuat data...');

      const localKey = `kpl.master.${name}`;
      let local = U.S.get(localKey, null);

      if (preferLocal && Array.isArray(local) && local.length){
        rows = JSON.parse(JSON.stringify(local));
      }else{
        U.progressOpen('Memuat master...'); 
        U.progress(25,'Minta server');

        // minta server ikutkan baris global untuk yrates
        const payload = { name };
        if (name === 'yrates'){ payload.includeGlobal = true; }

        const r = await API.call('listMaster', payload);
        if (!r.ok) throw new Error(r.error || 'Gagal memuat');

        let fromServer = Array.isArray(r.rows) ? r.rows : [];

        // jaga-jaga: merge global dari lokal agar tidak hilang
        if (name === 'yrates'){
          fromServer = _mergeYratesServerWithLocal(fromServer, local);
        }

        rows = fromServer;
        U.S.set(localKey, rows); // cache lokal
      }

      // kumpulkan header unik (dinamis)
      const set = new Set();
      rows.forEach(o => Object.keys(o || {}).forEach(k => set.add(k)));
      headers = Array.from(set);

      setDirty(false);
      renderGrid();
      setStatus(`Memuat ${name}: ${rows.length} baris.`);
    }catch(e){
      U.toast(e.message || e, 'danger'); 
      setStatus('Gagal memuat.');
    }finally{
      U.progressClose();
    }
  }

  // ---------------------------------------------------------------------------
  // LAYOUT: lebar kolom dihitung dari panjang konten (desktop)
  // (di mobile, akan dioverride oleh CSS !important per-sheet)
  // ---------------------------------------------------------------------------
  function computeColumnWidths(headers, data){
    const MIN=120, MAX=420, CHAR_PX=8, PAD=24;
    return headers.map(h=>{
      let maxLen = String(h||'').length;
      for(const r of data){
        const v = r[h]!==undefined && r[h]!==null ? String(r[h]) : '';
        if (v.length > maxLen) maxLen = v.length;
      }
      return Math.max(MIN, Math.min(Math.round(maxLen*CHAR_PX + PAD), MAX));
    });
  }

  // ---------------------------------------------------------------------------
  // RENDER GRID TABEL
  // ---------------------------------------------------------------------------
  function renderGrid(){
    const wrap = U.qs('#grid-wrap');
    if (!rows.length){
      wrap.innerHTML = `<div class="text-muted">Tidak ada data.</div>`;
      // update data-sheet agar aturan CSS tetap akurat saat kosong
      wrap.setAttribute('data-sheet', currentSheet);
      return;
    }

    const widths   = computeColumnWidths(headers, rows);
    const colgroup = `<colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}<col style="width:120px"></colgroup>`;
    const thead    = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}<th>Aksi</th></tr></thead>`;

    const body = rows.map((r,i)=>{
      const inputs = headers.map(h=>{
        const v = r[h] !== undefined ? r[h] : '';
        const disabled = READ_ONLY ? 'disabled' : '';
        return `<td><input class="form-control form-control-sm cell" data-k="${h}" value="${(v ?? '')}" ${disabled} /></td>`;
      }).join('');

      const aksi = READ_ONLY
        ? `<td><div class="small text-muted">View</div></td>`
        : `<td><button class="btn btn-sm btn-outline-danger" data-a="del" data-i="${i}">Hapus</button></td>`;

      return `<tr data-i="${i}">${inputs}${aksi}</tr>`;
    }).join('');

    wrap.innerHTML = `<table class="table table-sm table-striped align-middle table-nowrap table-autofit">${colgroup}${thead}<tbody>${body}</tbody></table>`;

    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    // PENTING: tandai sheet aktif untuk CSS kontekstual di mobile
    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    wrap.setAttribute('data-sheet', currentSheet);

    if (!READ_ONLY){
      // edit sel → update model + set dirty
      wrap.querySelectorAll('.cell').forEach(inp=>{
        inp.addEventListener('input', (e)=>{
          const tr = e.target.closest('tr'); 
          const i  = +tr.dataset.i;
          const k  = e.target.dataset.k; 
          rows[i][k] = e.target.value; 
          setDirty(true);
        });
      });
      // hapus baris
      wrap.querySelectorAll('button[data-a="del"]').forEach(btn=>{
        btn.onclick = ()=>{
          const i = +btn.dataset.i;
          if (confirm('Hapus baris ini?')){
            rows.splice(i,1); 
            setDirty(true); 
            renderGrid();
          }
        };
      });
    }
  }

  // ---------------------------------------------------------------------------
  // AKSI TAMBAH & SIMPAN
  // ---------------------------------------------------------------------------
  function addRow(){
    if (!headers.length){ headers = ['nama']; }
    const obj = Object.fromEntries(headers.map(h => [h,'']));
    rows.push(obj); 
    setDirty(true); 
    renderGrid();
  }

  async function saveAll(){
    if (!rows.length){ U.toast('Tidak ada data untuk disimpan.', 'warning'); return; }
    try{
      U.progressOpen('Menyimpan...'); 
      U.progress(20,'Kirim ke server');
      const r = await API.call('replaceMaster', { name: currentSheet, rows });
      if (!r.ok) throw new Error(r.error || 'Gagal menyimpan');
      U.S.set(`kpl.master.${currentSheet}`, rows);
      setDirty(false);
      U.toast('Tersimpan ke Google Sheets.', 'success');
      setStatus(`Sheet ${currentSheet} tersimpan (${rows.length} baris).`);
    }catch(e){
      U.toast(e.message || e, 'danger');
    }finally{
      U.progressClose();
    }
  }
};

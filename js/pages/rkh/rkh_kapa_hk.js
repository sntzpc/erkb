// js/pages/rkh/rkh_kapa_hk.js
window.Pages = window.Pages || {};
Pages.rkhKapaHK = async function(){
  const root = U.qs('#app-root');
  const ok = await STORE.ensureActuals(['rkh','rkh_items','ydivisi','yestate','yplant']);
  if(!ok){ U.showPullRequiredModal('Data RKH belum tersedia. Silakan tarik Master & Data Aktual dulu.', ()=>location.hash='#/'); return; }

  const me   = SESSION.profile() || {};
  const role = String(me.role||'').toLowerCase();

  const rkhHdrAll   = STORE.getActual('rkh') || [];
  const rkhItemsAll = STORE.getActual('rkh_items') || [];
  const divMap      = new Map((STORE.getMaster('ydivisi')||[]).map(d=>[String(d.id), d]));

  let rkhHdr = [];
  if (role === 'admin') {
    rkhHdr = rkhHdrAll.slice();
  } else if (role === 'asisten') {
    rkhHdr = rkhHdrAll.filter(x => String(x.divisi_id||'') === String(me.divisi_id||''));
  } else {
    rkhHdr = rkhHdrAll.filter(x => String(x.estate_id||'') === String(me.estate_id||''));
  }

  const hdrByNomor   = new Map(rkhHdr.map(h=>[String(h.nomor), h]));
  const allowedNomor = new Set(rkhHdr.map(h=> String(h.nomor)));

  const agg = new Map();
  (rkhItemsAll||[]).forEach(it=>{
    const no = String(it.nomor||''); if(!allowedNomor.has(no)) return;
    const a = agg.get(no) || { hk_bhl:0, hk_sku:0, hk_total:0 };
    a.hk_bhl   += Number(it.hk_bhl  || 0);
    a.hk_sku   += Number(it.hk_sku  || 0);
    a.hk_total += Number(it.hk_total|| 0);
    agg.set(no, a);
  });

  let rows = [];
  agg.forEach((a, nomor)=>{
    const h      = hdrByNomor.get(nomor)||{};
    const hk_bhl = Math.round(a.hk_bhl||0);
    const hk_sku = Math.round(a.hk_sku||0);
    const tk_bhl = hk_bhl; // spesifikasi
    const tk_sku = hk_sku;
    rows.push({
      nomor,
      tanggal: (h.tanggal||'').slice(0,10),
      periode: U.fmt.periodeYM(h.periode||''),
      divisi : String(h.divisi||'') || (divMap.get(String(h.divisi_id||''))?.nama || ''),
      ref_rkb: String(h.ref_rkb||'')||'-',
      tk_bhl: Math.round(tk_bhl),
      tk_sku: Math.round(tk_sku),
      tk_total: Math.round(tk_bhl+tk_sku),
      status: String(h.status||'')||'-'
    });
  });

  // UI
  let page=1, pageSize=20, q='', periodeFilter='';
  const PAGE_CHOICES=[20,40,80,100];
  const periodeOptions = Array.from(new Set(rkhHdr.map(h=>U.fmt.periodeYM(h.periode||'')))).sort().reverse();

  // --- HTML escape fallback (aman bila U.escapeHtml tidak tersedia) ---
    const EH = (typeof U !== 'undefined' && U && typeof U.escapeHtml === 'function')
    ? U.escapeHtml
    : (s)=> String(s ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');

  function applyFilter(){
    let arr = rows.slice();
    if(periodeFilter) arr = arr.filter(x => String(x.periode) === String(periodeFilter));
    const qq = q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=> [r.nomor, r.periode, r.divisi, r.ref_rkb, r.status]
        .some(v=> String(v||'').toLowerCase().includes(qq)));
    }
    arr.sort((a,b)=> (a.tanggal===b.tanggal)
      ? String(b.nomor).localeCompare(String(a.nomor))
      : String(b.tanggal).localeCompare(String(a.tanggal)));
    return arr;
  }
  const pageCountOf = len => Math.max(1, Math.ceil(len/pageSize));
  function getPageSlice(arr){ const pc=pageCountOf(arr.length); if(page>pc) page=pc; const s=(page-1)*pageSize; return arr.slice(s, s+pageSize); }

  // --- API helper (sama seperti di rkb_kapa_hk.js) ---
    async function postAction(action, payload){
    if (window.API && typeof API.post === 'function') return API.post(action, payload);
    if (window.U && U.api && typeof U.api.post === 'function') return U.api.post(action, payload);

    const base =
        (window.Client && Client.get && Client.get()?.api_base) ||
        (window.CONFIG && CONFIG.API_BASE) ||
        (window.CONFIG && CONFIG.gsUrl) || '';
    if(!base) throw new Error('API base URL tidak terdeteksi. Pastikan Client/CONFIG sudah terisi.');

    const url = `${base}?action=${encodeURIComponent(action)}`;
    const token = (window.SESSION && typeof SESSION.token==='function' && SESSION.token()) ||
                    localStorage.getItem('session.token') || '';

    const res = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, token, ...payload })
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
    }


  function render(){
    const data  = applyFilter();
    const slice = getPageSlice(data);
    const optPeriode = ['<option value="">Semua Periode</option>']
      .concat(periodeOptions.map(p=>`<option value="${p}" ${p===periodeFilter?'selected':''}>${p}</option>`)).join('');
    const optPage = PAGE_CHOICES.map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('');

    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0">Kapasitas HK – RKH</h5>
        <div class="btn-group">
            <button id="btn-export" class="btn btn-sm btn-success">Export Excel</button>
            <button id="btn-rebuild" class="btn btn-sm btn-primary">Kirim ke Sheet (Rebuild)</button>
        </div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-12 col-md-3">
            <label class="form-label">Periode</label>
            <select id="f-periode" class="form-select">${optPeriode}</select>
          </div>
          <div class="col-12 col-md-5">
            <label class="form-label">Cari</label>
            <input id="f-q" class="form-control" placeholder="Cari nomor/divisi/ref RKB/status..." value="${q}">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label">Baris/Halaman</label>
            <select id="f-ps" class="form-select">${optPage}</select>
          </div>
          <div class="col-6 col-md-2 d-flex align-items-end">
            <div class="ms-auto small text-muted">${data.length} data</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle">
            <thead class="table-light">
              <tr>
                <th>No</th><th>Nomor RKH</th><th>Tanggal</th><th>Periode</th><th>Divisi</th><th>Ref. No RKB</th>
                <th class="text-end">TK BHL</th><th class="text-end">TK SKU</th><th class="text-end">TK (Total)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${ slice.map((r,i)=>`
                <tr>
                  <td>${(page-1)*pageSize + i + 1}</td>
                  <td>${EH(r.nomor)}</td>
                  <td>${EH(r.tanggal)}</td>
                  <td>${EH(r.periode)}</td>
                  <td>${EH(r.divisi)}</td>
                  <td>${EH(r.ref_rkb)}</td>
                  <td class="text-end">${U.fmt.id0(r.tk_bhl)}</td>
                  <td class="text-end">${U.fmt.id0(r.tk_sku)}</td>
                  <td class="text-end">${U.fmt.id0(r.tk_total)}</td>
                  <td><span class="badge bg-secondary">${EH(r.status)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-between align-items-center">
          <div class="btn-group" role="group">
            <button id="p-prev" class="btn btn-sm btn-outline-secondary">&laquo;</button>
            <span class="btn btn-sm btn-outline-secondary disabled">${page} / ${pageCountOf(data.length)}</span>
            <button id="p-next" class="btn btn-sm btn-outline-secondary">&raquo;</button>
          </div>
          <div class="small text-muted">Menampilkan ${(page-1)*pageSize+1}-${Math.min(page*pageSize, data.length)} dari ${data.length}</div>
        </div>
      </div></div>
    `;

    U.qs('#f-periode').onchange = e=>{ periodeFilter = e.target.value; page=1; render(); };
    U.qs('#f-q').oninput       = e=>{ q = e.target.value||''; page=1; render(); };
    U.qs('#f-ps').onchange     = e=>{ pageSize = Number(e.target.value)||20; page=1; render(); };
    U.qs('#p-prev').onclick    = ()=>{ if(page>1){ page--; render(); } };
    U.qs('#p-next').onclick    = ()=>{ if(page<pageCountOf(applyFilter().length)){ page++; render(); } };
    U.qs('#btn-export').onclick= ()=> exportExcel(applyFilter());
    
     // Rebuild ke Sheet sesuai filter periode saat ini
        const btnRebuild = U.qs('#btn-rebuild');
        btnRebuild.onclick = async ()=>{
        try{
            if(!periodeFilter){
            const okAll = confirm('Periode tidak dipilih. Rebuild untuk SEMUA periode?');
            if(!okAll) return;
            }
            const label = btnRebuild.innerHTML;
            btnRebuild.disabled = true;
            btnRebuild.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Memproses...`;

            const resp = await postAction('rebuildKapasitasHK', {
            kind: 'rkh',
            periode: periodeFilter || ''
            });
            const written = resp?.written ?? resp?.data?.length ?? 0;
            U.toast(`Berhasil rebuild Kapasitas RKH ke Sheet (${written} baris).`, 'success');
        }catch(err){
            console.error(err);
            U.toast(`Gagal rebuild: ${err.message||err}`, 'danger');
        }finally{
            btnRebuild.disabled = false;
            btnRebuild.innerHTML = 'Kirim ke Sheet (Rebuild)';
        }
        };
  }

  function exportExcel(arr){
    if(typeof XLSX==='undefined'){ alert('SheetJS belum dimuat'); return; }
    const header = ['No','Nomor RKH','Tanggal','Periode','Divisi','Ref. No RKB','TK BHL','TK SKU','TK (Total)','Status'];
    const rows   = arr.map((r,i)=>[ i+1, r.nomor, r.tanggal, r.periode, r.divisi, r.ref_rkb, r.tk_bhl, r.tk_sku, r.tk_total, r.status ]);
    const ws     = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb     = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kapasitas RKH');
    XLSX.writeFile(wb, 'kapa_hk_rkh.xlsx');
  }

  render();
};

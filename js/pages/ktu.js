// js/pages/ktu.js
window.Pages = window.Pages || {};
Pages.ktu = function(){
  const root = U.qs('#app-root');

  const ACT_KEY_KTU = 'kpl.actual.ktu_rekap';
  function getKtuCache(){ return U.S.get(ACT_KEY_KTU, []) || []; }
  function setKtuCache(rows){ U.S.set(ACT_KEY_KTU, rows||[]); }

  const fPeriode = (p)=>{
    if(!p) return '-';
    const s = String(p).trim();
    if(/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if(isNaN(d)) return s;
    const y = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',year:'numeric'}).format(d);
    const m = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',month:'2-digit'}).format(d);
    return `${y}-${m}`;
  };

  let items = [];
  let masters = { ydivisi:[], yrayon:[], yestate:[] };
  let filters = { periode:'', divisi_id:'', rayon_id:'', estate_id:'' };

  // ---- Helper cari rayon dari berbagai jalur (id/kode/nama) ----
function _lc(v){ return v==null ? '' : String(v).trim().toLowerCase(); }
function _eq(a,b){ return _lc(a) === _lc(b); }

function _findRayonByAny(val, rayons){
  if(!val) return null;
  return (rayons||[]).find(r =>
    _eq(r.id, val) || _eq(r.rayon_id, val) ||
    _eq(r.kode, val) || _eq(r.kd_rayon, val) || _eq(r.kode_rayon, val) ||
    _lc(r.nama||r.nama_rayon) === _lc(val)
  ) || null;
}

function _findDivisiByAny(val, divisis){
  if(!val) return null;
  const v = _lc(val);
  return (divisis||[]).find(d =>
    _eq(d.id, val) || _eq(d.divisi_id, val) ||
    _eq(d.kode, val) || _eq(d.kd_divisi, val) ||
    _lc(d.nama||d.nama_divisi) === v
  ) || null;
}

function _findEstateByAny(val, estates){
  if(!val) return null;
  const v = _lc(val);
  return (estates||[]).find(e =>
    _eq(e.id, val) || _eq(e.kode, val) || _eq(e.kd_estate, val) ||
    _lc(e.nama_panjang||e.nama) === v
  ) || null;
}

/**
 * Menentukan rayon dari konteks RKB + master.
 * Urutan:
 * 1) ctx.rayon_id langsung
 * 2) ydivisi (via ctx.divisi_id ATAU ctx.divisi_label)
 * 3) yestate (via ctx.estate_id ATAU ctx.estate_label)
 * 4) (opsional) jika divisi punya kolom nama rayon
 */
function resolveRayonForContext(ctx, masters){
  const { rayon_id, divisi_id, divisi_label, estate_id, estate_label } = ctx || {};
  const rayons  = masters?.yrayon  || [];
  const divisis = masters?.ydivisi || [];
  const estates = masters?.yestate || [];

  // 1) dari ctx.rayon_id
  if(rayon_id){
    const r = _findRayonByAny(rayon_id, rayons);
    if(r) return { rayon_id: r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? '', rayon_nama: r.nama ?? r.nama_rayon ?? '' };
  }

  // 2) dari ydivisi (id ataupun label/nama)
  let drow = _findDivisiByAny(divisi_id, divisis);
  if(!drow && divisi_label){ drow = _findDivisiByAny(divisi_label, divisis); }
  if(drow){
    // coba banyak kemungkinan kolom rayon di ydivisi
    const cand = [drow.rayon_id, drow.kd_rayon, drow.kode_rayon, drow.rayon].filter(Boolean);
    for(const c of cand){
      const r = _findRayonByAny(c, rayons);
      if(r) return { rayon_id: r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? '', rayon_nama: r.nama ?? r.nama_rayon ?? '' };
    }
    // kadang ada nama rayon di ydivisi
    if(drow.nama_rayon || drow.rayon_nama){
      const r = _findRayonByAny(drow.nama_rayon || drow.rayon_nama, rayons);
      if(r) return { rayon_id: r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? '', rayon_nama: r.nama ?? r.nama_rayon ?? '' };
    }
  }

  // 3) dari yestate (id ataupun label/nama)
  let erow = _findEstateByAny(estate_id, estates);
  if(!erow && estate_label){ erow = _findEstateByAny(estate_label, estates); }
  if(erow){
    const candE = [erow.rayon_id, erow.kd_rayon, erow.kode_rayon, erow.rayon].filter(Boolean);
    for(const c of candE){
      const r = _findRayonByAny(c, rayons);
      if(r) return { rayon_id: r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? '', rayon_nama: r.nama ?? r.nama_rayon ?? '' };
    }
  }

  // 4) gagal → kosong
  return { rayon_id: '', rayon_nama: '' };
}



  async function load(preferLocal=true){
  try{
    // masters
    masters.ydivisi = STORE.getMaster('ydivisi')||[];
    masters.yrayon  = STORE.getMaster('yrayon')||[];
    masters.yestate = STORE.getMaster('yestate')||[];

    const actuals = STORE.getActualsRkb();
    const rkbByNomor = Object.fromEntries((actuals||[]).map(r=>[String(r.nomor), r]));
    const estateById = Object.fromEntries((masters.yestate||[]).map(x=>[String(x.id), x]));
    const divById    = Object.fromEntries((masters.ydivisi||[]).map(x=>[String(x.id), x]));

    let raw = [];
    if(preferLocal){
      const cached = getKtuCache();
      if(Array.isArray(cached) && cached.length){
        raw = cached;
      }
    }
    if(!raw.length){
      U.progressOpen('Tarik rekap bahan...'); U.progress(30,'Ambil data (server)');
      const r = await API.call('ktuRekap', {});
      if(!r.ok) throw new Error(r.error||'Gagal tarik');
      raw = Array.isArray(r.items) ? r.items : [];
      setKtuCache(raw); // cache-kan agar offline-ready
    }

    items = raw.map(it=>{
  const rkb = rkbByNomor[String(it.nomor)] || {};
  const estateRow = estateById[String(rkb.estate_id||'')] || {};
  const divRow    = divById[String(rkb.divisi_id||'')]    || {};

  // >>> Cari rayon secara robust (pakai id & label sebagai fallback)
  const ray = resolveRayonForContext(
    {
      rayon_id:      rkb.rayon_id,
      divisi_id:     rkb.divisi_id,
      divisi_label:  it.divisi || rkb.divisi || divRow?.nama || divRow?.kode,
      estate_id:     rkb.estate_id,
      estate_label:  rkb.estate_full || estateRow?.nama_panjang || estateRow?.nama
    },
    masters
  );

  return {
    nomor: it.nomor,
    periode: fPeriode(it.periode),
    divisi: it.divisi||'',
    pekerjaan: it.pekerjaan||'',
    nama: it.nama,
    jumlah: Number(it.jumlah||0),
    satuan: it.satuan||'',
    estate_id: String(rkb.estate_id||''),
    estate_full: rkb.estate_full || estateRow.nama_panjang || estateRow.nama || '',
    rayon_id: String(ray.rayon_id||''),
    rayon_nama: ray.rayon_nama || '',
    divisi_id: String(rkb.divisi_id||''),
    divisi_nama: divRow.nama || divRow.kode || it.divisi || ''
  };
});

    render();
  }catch(e){
    root.innerHTML = `<div class="alert alert-danger">Gagal memuat: ${e.message||e}</div>`;
  }finally{
    U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 350);
  }
}


  function getFiltered(){
    return items.filter(r=>{
      if(filters.periode && fPeriode(r.periode)!==filters.periode) return false;
      if(filters.divisi_id && String(r.divisi_id)!==String(filters.divisi_id)) return false;
      if(filters.rayon_id && String(r.rayon_id)!==String(filters.rayon_id)) return false;
      if(filters.estate_id && String(r.estate_id)!==String(filters.estate_id)) return false;
      return true;
    });
  }

  function aggregate(data){
    const byDivisi = {};
    const estateTot = {};
    data.forEach(r=>{
      const keyD = `${r.divisi_id}|${r.nama}|${r.satuan}`;
      byDivisi[keyD] = (byDivisi[keyD]||0) + Number(r.jumlah||0);
      const keyE = `${r.nama}|${r.satuan}`;
      estateTot[keyE] = (estateTot[keyE]||0) + Number(r.jumlah||0);
    });
    const divName = (id)=>{
      const d = masters.ydivisi.find(x=> String(x.id)===String(id));
      return d ? (d.nama||d.kode||id) : id;
    };
    const perDivisi = Object.entries(byDivisi).map(([k,v])=>{
      const [div_id, nama, satuan] = k.split('|');
      return { divisi: divName(div_id), nama, total: v, satuan };
    }).sort((a,b)=> a.divisi.localeCompare(b.divisi) || a.nama.localeCompare(b.nama));

    const estateTotal = Object.entries(estateTot).map(([k,v])=>{
      const [nama, satuan] = k.split('|'); return { nama, total: v, satuan };
    }).sort((a,b)=> a.nama.localeCompare(b.nama));

    return { perDivisi, estateTotal };
  }

  function exportXlsx(){
    if(typeof XLSX === 'undefined'){ U.toast('XLSX belum tersedia.','danger'); return; }
    const data = getFiltered();
    if(!data.length){ U.toast('Tidak ada data untuk diexport.','warning'); return; }
    const { perDivisi, estateTotal } = aggregate(data);

    const detail = data.map(r=>({
      Nomor: r.nomor, Periode: r.periode, Estate: r.estate_full, Rayon: r.rayon_nama,
      Divisi: r.divisi_nama || r.divisi || '', Pekerjaan: r.pekerjaan, Bahan: r.nama, Jumlah: r.jumlah, Satuan: r.satuan
    }));
    const divSheet = perDivisi.map(x=>({ Divisi:x.divisi, Bahan:x.nama, Total:x.total, Satuan:x.satuan }));
    const estSheet = estateTotal.map(x=>({ Bahan:x.nama, Total:x.total, Satuan:x.satuan }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detail');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(divSheet), 'Rekap per Divisi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(estSheet), 'Total Estate');

    const labelPeriode = filters.periode || 'ALL';
    XLSX.writeFile(wb, `KTU_Rekap_${labelPeriode}.xlsx`);
  }

  function printPdf(){
    const data = getFiltered();
    if(!data.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }
    const { perDivisi, estateTotal } = aggregate(data);
    const p = (k,v)=> `<p style="margin:4px 0"><b>${k}:</b> ${v}</p>`;

    const rowsDiv = perDivisi.map(x=> `<tr><td>${x.divisi}</td><td>${x.nama}</td><td style="text-align:right">${x.total}</td><td>${x.satuan||''}</td></tr>`).join('');
    const rowsEst = estateTotal.map(x=> `<tr><td>${x.nama}</td><td style="text-align:right">${x.total}</td><td>${x.satuan||''}</td></tr>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Rekap KTU</title>
<style>
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding:16px; }
  h2,h3{ margin:6px 0; }
  table{ width:100%; border-collapse:collapse; margin-top:8px; }
  th,td{ border:1px solid #999; padding:6px 8px; font-size:12px; }
  th{ background:#f2f2f2; }
  .t-right{ text-align:right; }
  .muted{ color:#666; font-size:12px; }
  @page{ size:A4; margin:14mm; }
</style>
</head>
<body>
  <h2>REKAP KEBUTUHAN BAHAN</h2>
  <div class="muted">
    ${p('Periode', filters.periode || 'Semua')}
    ${p('Estate', (masters.yestate.find(e=> String(e.id)==filters.estate_id)?.nama_panjang||'Semua'))}
    ${p('Rayon', (masters.yrayon.find(e=> String(e.id)==filters.rayon_id)?.nama||'Semua'))}
    ${p('Divisi', (masters.ydivisi.find(e=> String(e.id)==filters.divisi_id)?.nama||'Semua'))}
    <p class="muted">Dicetak: ${new Intl.DateTimeFormat('id-ID',{dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta'}).format(new Date())}</p>
  </div>

  <h3>Ringkas: Per Divisi</h3>
  <table>
    <thead><tr><th>Divisi</th><th>Nama Bahan</th><th class="t-right">Total</th><th>Satuan</th></tr></thead>
    <tbody>${rowsDiv || `<tr><td colspan="4" class="muted">Tidak ada data.</td></tr>`}</tbody>
  </table>

  <h3>Total Estate</h3>
  <table>
    <thead><tr><th>Nama Bahan</th><th class="t-right">Total</th><th>Satuan</th></tr></thead>
    <tbody>${rowsEst || `<tr><td colspan="3" class="muted">Tidak ada data.</td></tr>`}</tbody>
  </table>
  <script>window.print();</script>
</body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  }

  function render(){
    const periodes = Array.from(new Set(items.map(r=> r.periode))).sort().reverse();
    const estates  = masters.yestate;
    const rayons   = masters.yrayon;
    const divisies = masters.ydivisi;

    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <h4 class="mb-0">Rekap Bahan (RKB Full Approve)</h4>
        <div class="d-flex flex-wrap gap-2">
          <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
          <button id="btn-xlsx" class="btn btn-sm btn-success">Export Excel</button>
          <button id="btn-pdf" class="btn btn-sm btn-dark">Cetak PDF</button>
        </div>
      </div>

      <div class="row g-2 mb-2">
        <div class="col-sm-3">
          <label class="form-label">Periode (YYYY-MM)</label>
          <select id="f-periode" class="form-select form-select-sm">
            <option value="">Semua</option>
            ${periodes.map(p=>`<option value="${p}" ${filters.periode===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="col-sm-3">
          <label class="form-label">Estate</label>
          <select id="f-estate" class="form-select form-select-sm">
            <option value="">Semua</option>
            ${estates.map(e=>`<option value="${e.id}" ${filters.estate_id==e.id?'selected':''}>${e.nama_panjang||e.nama||e.id}</option>`).join('')}
          </select>
        </div>
        <div class="col-sm-3">
          <label class="form-label">Rayon</label>
          <select id="f-rayon" class="form-select form-select-sm">
            <option value="">Semua</option>
            ${rayons.map(e=>`<option value="${e.id}" ${filters.rayon_id==e.id?'selected':''}>${e.nama||e.id}</option>`).join('')}
          </select>
        </div>
        <div class="col-sm-3">
          <label class="form-label">Divisi</label>
          <select id="f-divisi" class="form-select form-select-sm">
            <option value="">Semua</option>
            ${divisies.map(e=>`<option value="${e.id}" ${filters.divisi_id==e.id?'selected':''}>${e.nama||e.kode||e.id}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-responsive mb-3">
        <table class="table table-sm table-hover align-middle">
          <thead>
            <tr>
              <th>Nomor</th><th>Periode</th><th>Estate</th><th>Rayon</th><th>Divisi</th>
              <th>Pekerjaan</th><th>Bahan</th><th class="text-end">Jumlah</th><th>Satuan</th>
            </tr>
          </thead>
          <tbody id="ktu-rows"></tbody>
        </table>
      </div>

      <h5 class="mb-2">Ringkas: Kebutuhan per Divisi</h5>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Divisi</th><th>Nama Bahan</th><th class="text-end">Total</th><th>Satuan</th></tr></thead>
          <tbody id="ktu-sum-divisi"></tbody>
        </table>
      </div>

      <h5 class="mt-3 mb-2">Total Estate</h5>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Nama Bahan</th><th class="text-end">Total</th><th>Satuan</th></tr></thead>
          <tbody id="ktu-sum-estate"></tbody>
        </table>
      </div>
    </div></div>`;

    U.qs('#btn-reload').onclick = ()=> load(false);
    U.qs('#btn-xlsx').onclick  = exportXlsx;
    U.qs('#btn-pdf').onclick   = printPdf;

    U.qs('#f-periode').onchange = (e)=>{ filters.periode   = e.target.value; drawTables(); };
    U.qs('#f-divisi').onchange  = (e)=>{ filters.divisi_id = e.target.value; drawTables(); };
    U.qs('#f-rayon').onchange   = (e)=>{ filters.rayon_id  = e.target.value; drawTables(); };
    U.qs('#f-estate').onchange  = (e)=>{ filters.estate_id = e.target.value; drawTables(); };

    drawTables();
  }

  function drawTables(){
    const data = getFiltered();
    const tbody = U.qs('#ktu-rows');
    if(!data.length){
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Tidak ada data.</td></tr>`;
    }else{
      tbody.innerHTML = data.map(r=>`
        <tr>
          <td>${r.nomor}</td>
          <td>${r.periode}</td>
          <td>${r.estate_full||'-'}</td>
          <td>${r.rayon_nama||'-'}</td>
          <td>${r.divisi_nama||r.divisi||'-'}</td>
          <td>${r.pekerjaan||''}</td>
          <td>${r.nama}</td>
          <td class="text-end">${U.fmt.id0(r.jumlah)}</td>
          <td>${r.satuan||''}</td>
        </tr>`).join('');
    }

    const { perDivisi, estateTotal } = aggregate(data);
    U.qs('#ktu-sum-divisi').innerHTML = perDivisi.length
      ? perDivisi.map(x=>`<tr><td>${x.divisi}</td><td>${x.nama}</td><td class="text-end">${U.fmt.id0(x.total)}</td><td>${x.satuan||''}</td></tr>`).join('')
      : `<tr><td colspan="4" class="text-center text-muted">Tidak ada data.</td></tr>`;
    U.qs('#ktu-sum-estate').innerHTML = estateTotal.length
      ? estateTotal.map(x=>`<tr><td>${x.nama}</td><td class="text-end">${U.fmt.id0(x.total)}</td><td>${x.satuan||''}</td></tr>`).join('')
      : `<tr><td colspan="3" class="text-center text-muted">Tidak ada data.</td></tr>`;
  }

  load(true);
};

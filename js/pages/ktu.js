// js/pages/ktu.js
window.Pages = window.Pages || {};
Pages.ktu = async function(){
  const root = U.qs('#app-root');

  // ===== [GUARD: WAJIB DATA HANGAT] =====
  // contoh minimal: butuh master ydivisi, yrayon, yestate dan actuals rkb
  const ok = await U.requireWarmOrRedirect({
    mastersNeeded: ['ydivisi','yrayon','yestate'],
    actualsNeeded: ['rkb']   // kalau perlu yang lain, tambahkan di sini
  });
  if(!ok){
    // tampilkan placeholder tipis; return supaya halaman ini tidak lanjut render
    root.innerHTML = `<div class="alert alert-warning">Menunggu Tarik Master & Data Aktual...</div>`;
    return;
  }

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

  
  // >>> TAMBAHKAN: default periode = bulan depan (WIB)
  const nextMonthYM = ()=>{
    const tz = 'Asia/Jakarta';
    const now = new Date();
    const y  = Number(new Intl.DateTimeFormat('id-ID',{timeZone:tz,year:'numeric'}).format(now));
    const m  = Number(new Intl.DateTimeFormat('id-ID',{timeZone:tz,month:'2-digit'}).format(now));
    const ny = m===12 ? y+1 : y;
    const nm = m===12 ? 1 : (m+1);
    return `${ny}-${String(nm).padStart(2,'0')}`;
  };

  let items = [];
  let masters = { ydivisi:[], yrayon:[], yestate:[] };
    let filters = { periode: nextMonthYM(), divisi_id:'', rayon_id:'', estate_id:'' };

// ---- Index helper (cepat & tegas) ----
function _lc(v){ return v==null ? '' : String(v).trim().toLowerCase(); }

function buildDivisiIndex(list){
  const byId=new Map(), byKode=new Map(), byNama=new Map();
  (list||[]).forEach(d=>{
    const id   = d.id ?? d.divisi_id;
    const kode = d.kode ?? d.kd_divisi;
    const nama = d.nama ?? d.nama_divisi;
    if(id!=null)   byId.set(_lc(id), d);
    if(kode!=null) byKode.set(_lc(kode), d);
    if(nama!=null) byNama.set(_lc(nama), d);
  });
  return { byId, byKode, byNama };
}

function buildRayonIndex(list){
  const byId=new Map(), byKode=new Map(), byNama=new Map();
  (list||[]).forEach(r=>{
    const id   = r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? r.kode_rayon;
    const kode = r.kode ?? r.kd_rayon ?? r.kode_rayon ?? r.rayon_id;
    const nama = r.nama ?? r.nama_rayon ?? r.rayon_nama;
    if(id!=null)   byId.set(_lc(id), r);
    if(kode!=null) byKode.set(_lc(kode), r);
    if(nama!=null) byNama.set(_lc(nama), r);
  });
  return { byId, byKode, byNama };
}

function findDivRow(divisiId, divisiLabel, DX){
  if(divisiId){
    const hit = DX.byId.get(_lc(divisiId));
    if(hit) return hit;
  }
  if(divisiLabel){
    const k = _lc(divisiLabel);
    return DX.byKode.get(k) || DX.byNama.get(k) || null;
  }
  return null;
}

function findRayonRowByAny(rayonIdOrKode, RX){
  if(!rayonIdOrKode) return null;
  const k=_lc(rayonIdOrKode);
  return RX.byId.get(k) || RX.byKode.get(k) || RX.byNama.get(k) || null;
}

/**
 * Ambil rayon_id prioritas:
 * 1) dari actuals RKB (by nomor)
 * 2) fallback dari ydivisi (kolom: rayon_id | kd_rayon | kode_rayon | rayon)
 */
function resolveRayonId({ nomor, divisi_id, divisi_label }, { rkbByNomor, DX }){
  // 1) dari RKB actuals
  const ridFromRkb = rkbByNomor[String(nomor)]?.rayon_id;
  if(ridFromRkb) return String(ridFromRkb);

  // 2) dari ydivisi
  const drow = findDivRow(divisi_id, divisi_label, DX);
  if(drow){
    return String(
      drow.rayon_id ?? drow.kd_rayon ?? drow.kode_rayon ?? drow.rayon ?? ''
    );
  }
  return '';
}

/**
 * Resolve final rayon (id + nama). Jika nama tidak ditemukan di master,
 * kembalikan nama = rayon_id (agar kolom Rayon tidak kosong).
 */
function resolveRayon({ nomor, divisi_id, divisi_label }, ctx){
  const { rkbByNomor, RX } = ctx;
  const rayon_id = resolveRayonId({ nomor, divisi_id, divisi_label }, ctx);
  if(!rayon_id) return { rayon_id: '', rayon_nama: '' };

  const rrow = findRayonRowByAny(rayon_id, RX);
  const rayon_nama = rrow
    ? (rrow.nama ?? rrow.nama_rayon ?? rrow.rayon_nama ?? String(rayon_id))
    : String(rayon_id); // fallback tampilkan id-nya

  return { rayon_id: String(rayon_id), rayon_nama: String(rayon_nama) };
}

async function load(preferLocal=true){
  let openedHere = false;
  try{
    // masters
    masters.ydivisi = STORE.getMaster('ydivisi')||[];
    masters.yrayon  = STORE.getMaster('yrayon')||[];
    masters.yestate = STORE.getMaster('yestate')||[];

    // build index
    const DX = buildDivisiIndex(masters.ydivisi);
    const RX = buildRayonIndex(masters.yrayon);

    // actuals rkb
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
      // --- cegah double progress: hanya buka jika belum ada modal "show"
      const pm = document.getElementById('progressModal');
      const pmShown = pm && pm.classList.contains('show');
      if(!pmShown){ U.progressOpen('Tarik rekap bahan...'); U.progress(30,'Ambil data (server)'); openedHere = true; }

      const r = await API.call('ktuRekap', {});
      if(!r.ok) throw new Error(r.error||'Gagal tarik');
      raw = Array.isArray(r.items) ? r.items : [];
      setKtuCache(raw); // cache-kan agar offline-ready
    }

    items = raw.map(it=>{
      const rkb       = rkbByNomor[String(it.nomor)] || {};
      const estateRow = estateById[String(rkb.estate_id||'')] || {};
      const divRow    = divById[String(rkb.divisi_id||'')]    || {};

      // >>> Rayon: ambil dari RKB (jika ada), fallback ydivisi
      const ray = resolveRayon(
        {
          nomor:        it.nomor,
          divisi_id:    rkb.divisi_id,
          divisi_label: it.divisi || rkb.divisi || divRow?.nama || divRow?.kode
        },
        { rkbByNomor, DX, RX }
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
    // tutup progress hanya jika halaman ini yang membuka
    if(openedHere){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 350); }
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
    const perSet = new Set(items.map(r=> r.periode));
    if (filters.periode) perSet.add(filters.periode);
    const periodes = Array.from(perSet).filter(Boolean).sort().reverse();
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

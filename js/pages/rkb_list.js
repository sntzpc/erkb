// js/pages/rkb_list.js (ENHANCED)
window.Pages = window.Pages || {};
Pages.rkbList = function(which='draft'){
  const root = U.qs('#app-root');

// ====== COMPANY NAME (diambil dari master yplant berdasar plant_id user) ======
let COMPANY_NAME = 'PT -';
async function resolveCompanyName(){
  try{
    // pastikan master hangat
    if (typeof STORE?.ensureWarm === 'function') {
      await STORE.ensureWarm();
    }
    const getM = STORE?.getMaster?.bind(STORE);
    const plants  = getM ? (getM('yplant')  || []) : [];
    const estates = getM ? (getM('yestate') || []) : [];

    // 1) langsung dari profil
    let pid = SESSION.profile()?.plant_id;

    // 2) kalau tak ada, coba dari estate_id profil
    if(!pid){
      const eid = SESSION.profile()?.estate_id;
      if(eid){
        const est = estates.find(e => String(e.id) === String(eid));
        pid = est?.plant_id;
      }
    }

       // 3) kalau masih tak ada, coba dari data draft/outbox (estate_id atau estate_full)
    if(!pid && Array.isArray(data) && data.length){
      const sample = data.find(r => r.estate_id || r.estate_full) || {};
      if(sample.estate_id){
        const est = estates.find(e => String(e.id) === String(sample.estate_id));
        pid = est?.plant_id;
      }else if(sample.estate_full){
        const est = estates.find(e => (e.nama_panjang || e.nama) === sample.estate_full);
        pid = est?.plant_id;
      }
    }

    // 4) fallback: jika hanya ada satu plant di master, ambil itu
    let plant = plants.find(p => String(p.id) === String(pid));
    if(!plant && plants.length === 1){ plant = plants[0]; }

    if(plant){
      COMPANY_NAME = plant.nama_panjang || plant.nama || COMPANY_NAME;
    }
  }catch(_){ /* biarkan default */ }
}


  // Flatten 1 RKB → baris-baris detail (1 baris per bahan; jika tanpa bahan → 1 baris kosong bagian bahan)
function flattenRkbRows(r){
  const items = Array.isArray(r.items) ? r.items : [];
  if(!items.length){
    return [{
      'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
      'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
    }];
  }

  // Kelompokkan item berdasarkan "pekerjaan" (dan activity type)
  const groups = new Map();
  items.forEach(it=>{
    const key = [
      String(it.activity_type || it.activity || ''),
      String(it.pekerjaan || '')
      // NOTE: jika Anda ingin memisah baris ketika satuannya beda, tambahkan: , String(it.satuan||'')
    ].join('|:|');

    if(!groups.has(key)){
      groups.set(key, {
        first: it,                       // referensi item pertama
        items: [it],                     // semua item di grup
        bahanList: [],                   // semua bahan dari semua item (tanpa agregasi)
        lokasiSet: new Set(),            // set lokasi unik
        volumeList: []                   // daftar volume untuk logika agregasi
      });
    }else{
      groups.get(key).items.push(it);
    }

    const g = groups.get(key);
    // Kumpulkan lokasi
    (it.lokasi || []).forEach(l => { const nm = (l && l.name) ? l.name : String(l||''); if(nm) g.lokasiSet.add(nm); });
    // Simpan volume masing-masing item
    g.volumeList.push(Number(it.volume || 0));

    // Kumpulkan bahan
    if(Array.isArray(it.bahan) && it.bahan.length){
      it.bahan.forEach(b=>{
        g.bahanList.push({
          kode: (b && (b.kode || b.no)) ? (b.kode || b.no) : '',
          nama: b?.nama || '',
          jumlah: (b?.jumlah!==undefined && b?.jumlah!==null) ? b.jumlah : '',
          satuan: b?.satuan || ''
        });
      });
    }else{
      // jika item tidak punya bahan, tetap biarkan kosong (tidak menambah apa-apa)
    }
  });

  // Bangun 1 baris per grup pekerjaan
  const MATERIAL_SEP = '\n';       // bisa diganti dengan ' | ' jika ingin
  const rows = [];

  for(const [,g] of groups){
    const it0 = g.first;

    // Lokasi gabungan
    const lokasiArr = Array.from(g.lokasiSet);
    const lokasiStr = lokasiArr.join(', ');

    // Volume: jika lokasi unik >1 → jumlahkan; jika 1 → ambil volume item pertama
    let volumeKerja = 0;
    if(lokasiArr.length > 1){
      volumeKerja = g.volumeList.reduce((a,n)=>a + (Number(n)||0), 0);
    }else{
      volumeKerja = Number(g.volumeList[0] || 0);
    }

    // Ambil satuan & HK Unit dari item pertama
    const satuan   = it0.satuan || '';
    const hkUnit   = Number(it0.hk_unit || 0);
    const pct_bhl  = Number(it0.pct_bhl || 0);
    const pct_sku  = Number(it0.pct_sku || 0);
    const pct_bhb  = Number(it0.pct_bhb || 0);

    // Hitung HK pakai distribusi + hkUnit dari item pertama, volume sesuai aturan di atas
    const base = (Number(volumeKerja)||0) * (hkUnit||0);
    const BHL  = base * (pct_bhl/100);
    const SKU  = base * (pct_sku/100);
    const BHB  = base * (pct_bhb/100);

    // Gabungkan bahan (tanpa penjumlahan jumlah!) — setiap kolom digabung per entri
    const noMat    = g.bahanList.map(b => b.kode).filter(Boolean).join(MATERIAL_SEP);
    const namaBhn  = g.bahanList.map(b => b.nama).filter(Boolean).join(MATERIAL_SEP);
    const jumlahB  = g.bahanList.map(b => (b.jumlah!=='' && b.jumlah!==null && b.jumlah!==undefined) ? String(b.jumlah) : '').filter(s=>s!=='').join(MATERIAL_SEP);
    const satuanB  = g.bahanList.map(b => b.satuan).filter(Boolean).join(MATERIAL_SEP);

    rows.push({
      'Activity Type'  : it0.activity_type || it0.activity || '',
      'Jenis Pekerjaan': it0.pekerjaan || '',
      'Lokasi'         : lokasiStr,
      'Volume Kerja'   : volumeKerja,
      'Satuan'         : satuan,
      'HK/Unit'        : hkUnit,
      'BHL'            : Number(BHL || 0),
      'SKU'            : Number(SKU || 0),
      'BHB'            : Number(BHB || 0),
      'No. Material'   : noMat,
      'Nama Bahan'     : namaBhn,
      'Jumlah'         : jumlahB,
      'Sat. Bahan'     : satuanB,
      'Nama Pengawas'  : it0.pengawas || ''
    });
  }

  // Safeguard: jika tak ada output, tetap berikan 1 baris kosong
  if(!rows.length){
    rows.push({
      'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
      'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
    });
  }

  return rows;
}

// Buat judul kolom yang konsisten
const DETAIL_HEADERS = [
  'Activity Type','Jenis Pekerjaan','Lokasi','Volume Kerja','Satuan','HK/Unit',
  'BHL','SKU','BHB','No. Material','Nama Bahan','Jumlah','Sat. Bahan','Nama Pengawas'
];

  // ===== Helpers =====
  function computeHK(it){
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const BHL = base * ((Number(it.pct_bhl)||0)/100);
    const SKU = base * ((Number(it.pct_sku)||0)/100);
    const BHB = base * ((Number(it.pct_bhb)||0)/100);
    return {BHL, SKU, BHB, total: (BHL+SKU+BHB)};
  }
  function nomorToDate(n){
    const m = String(n||'').match(/(\d{12})$/); if(!m) return 0;
    const s = m[1];
    const yy=+s.slice(0,2), mm=+s.slice(2,4)-1, dd=+s.slice(4,6);
    const hh=+s.slice(6,8), mi=+s.slice(8,10), ss=+s.slice(10,12);
    return new Date(2000+yy, mm, dd, hh, mi, ss).getTime();
  }
  function fmtN(n){ return new Intl.NumberFormat('id-ID').format(n); }

  // ===== Styles (sekali saja) =====
  (function ensureStyles(){
    if(document.getElementById('rkb-list-css')) return;
    const css = `
      .table-compact th, .table-compact td { white-space: nowrap; }
      .pager .page-link{cursor:pointer}
      .pager .disabled .page-link{pointer-events:none; opacity:.6}
      .icon-btn{ width:34px; height:30px; display:inline-flex; align-items:center; justify-content:center; }
      .icon-btn[disabled]{ pointer-events:none; opacity:.5 }
      .i{font-size:16px; line-height:1;}
      .i-view{ } .i-edit{ } .i-del{ } .i-sync{ } .i-refresh{ }
      @media (max-width: 768px){
        .hide-sm{ display:none; }
      }
    `;
    const s = document.createElement('style');
    s.id='rkb-list-css'; s.textContent=css; document.head.appendChild(s);
  })();

  // ===== Load data lokal =====
  const draftKey  = 'rkb.drafts';
  const outboxKey = 'rkb.outbox';
  let data = which==='outbox'
    ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)   // hanya yang gagal
    : (U.S.get(draftKey, [])||[]);

  // ===== State UI =====
  let page=1, pageSize=20, q='', periodeFilter='';
  const PAGE_CHOICES=[20,40,80,100];

  // ===== Sort terbaru =====
  function sortData(arr){
    arr.sort((a,b)=>{
      const ta = new Date(a.updated_at||a.created_at||0).getTime() || nomorToDate(a.nomor);
      const tb = new Date(b.updated_at||b.created_at||0).getTime() || nomorToDate(b.nomor);
      return (tb||0)-(ta||0);
    });
    return arr;
  }
  sortData(data);

  // ===== Filtering & Paging =====
  function uniquePeriodes(arr){
    return Array.from(new Set(arr.map(x=>String(x.periode||'').trim()).filter(Boolean))).sort().reverse();
  }
  function applyFilter(){
    let arr = data.slice();
    if(periodeFilter) arr = arr.filter(x=> String(x.periode||'')===String(periodeFilter));
    const qq=q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=>{
        return [r.nomor, r.periode, r.divisi, r.estate_full, r.status]
          .some(v=> String(v||'').toLowerCase().includes(qq));
      });
    }
    return sortData(arr);
  }
  function pageCountOf(len){ return Math.max(1, Math.ceil(len/pageSize)); }
  function getPageSlice(arr){
    const pc = pageCountOf(arr.length);
    if(page>pc) page=pc;
    const s=(page-1)*pageSize;
    return arr.slice(s, s+pageSize);
  }

  // konversi index kolom (0-based) ke huruf Excel (A, B, ..., AA, AB, ...)
function colLetter(n){
  let s=''; n = n + 1;
  while(n>0){ let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
  return s;
}
  // ===== Export XLSX (per-periode) =====
  async function exportXlsx(){
  await resolveCompanyName();
  if(typeof XLSX==='undefined'){ U.toast('Library XLSX belum tersedia.','warning'); return; }
  const arr = applyFilter();
  if(!arr.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }

  const wb = XLSX.utils.book_new();

  arr.forEach((r,idx)=>{
    const rows = flattenRkbRows(r);

    // Header blok (4 baris)
    const headerBlock = [
      [COMPANY_NAME],
      [r.estate_full || ''],
      ['RENCANA KERJA BULANAN'],
      [`Periode: ${r.periode||'-'}`, `Divisi: ${r.divisi||'-'}`, `No RKB: ${r.nomor||'-'}`],
      [], // spasi
      DETAIL_HEADERS
    ];

    // Gabung header + detail
    const detailData = rows.map(obj => DETAIL_HEADERS.map(h=> obj[h]));
    const aoa = headerBlock.concat(detailData);

    // Tambahkan baris persetujuan (kosong untuk ditandatangani)
    aoa.push([]);
    aoa.push(['Asisten','','','Askep','','','Manager']);
    aoa.push(['(........................)','', '', '(........................)','', '', '(........................)']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // --- WRAP TEXT untuk kolom dengan newline ---
const WRAP_HEADERS = ['Lokasi','No. Material','Nama Bahan','Sat. Bahan']; // tambahkan jika perlu
const wrapColIdx = WRAP_HEADERS.map(h => DETAIL_HEADERS.indexOf(h)).filter(i => i >= 0);

// baris data mulai setelah headerBlock (yang memuat judul + header kolom)
const dataStartRow = headerBlock.length + 1; // 1-based row index di Excel
const dataEndRow   = dataStartRow + (detailData.length || 0) - 1;

for(const ci of wrapColIdx){
  const col = colLetter(ci);
  for(let rrow = dataStartRow; rrow <= dataEndRow; rrow++){
    const addr = `${col}${rrow}`;
    if(ws[addr]){
      ws[addr].t = 's'; // pastikan sebagai string
      ws[addr].s = Object.assign({}, ws[addr].s || {}, { alignment:{ wrapText:true, vertical:'top' } });
    }
  }
}

// (opsional) beri tinggi baris lebih besar supaya nyaman
if(!ws['!rows']) ws['!rows'] = [];
for(let rrow = dataStartRow-1; rrow <= dataEndRow-1; rrow++){
  ws['!rows'][rrow] = Object.assign({}, ws['!rows'][rrow] || {}, { hpt: 18 }); // ~18pt
}

    // Lebar kolom agar nyaman dibaca
    ws['!cols'] = [
      {wch:18},{wch:28},{wch:26},{wch:14},{wch:10},{wch:10},
      {wch:12},{wch:12},{wch:12},{wch:14},{wch:28},{wch:10},{wch:12},{wch:20}
    ];

    // Nama sheet maksimal 31 karakter → gunakan nomor atau ringkas
    let sname = (r.nomor || `RKB${idx+1}`).replace(/[\\/?*\[\]]/g,'');
    if(sname.length>31) sname = sname.slice(-31);
    XLSX.utils.book_append_sheet(wb, ws, sname||`RKB${idx+1}`);
  });

  const label = periodeFilter || 'ALL';
  XLSX.writeFile(wb, `RKB_Detail_${label}.xlsx`);
}

function htmlBR(s){
  if(s==null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/\n/g,'<br/>');
}
  // ===== Cetak PDF (per-periode) =====
  async function printPdf(){
  await resolveCompanyName();
  const arr = applyFilter();
  if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

  const sections = arr.map((r, idx)=>{
    const rows = flattenRkbRows(r).map(obj=>`
  <tr>
    <td>${obj['Activity Type']}</td>
    <td>${obj['Jenis Pekerjaan']}</td>
    <td>${htmlBR(obj['Lokasi'])}</td>
    <td class="t-right">${obj['Volume Kerja']}</td>
    <td>${obj['Satuan']}</td>
    <td class="t-right">${obj['HK/Unit']}</td>
    <td class="t-right">${obj['BHL']}</td>
    <td class="t-right">${obj['SKU']}</td>
    <td class="t-right">${obj['BHB']}</td>
    <td>${htmlBR(obj['No. Material'])}</td>
    <td>${htmlBR(obj['Nama Bahan'])}</td>
    <td class="t-right">${htmlBR(obj['Jumlah'])}</td>
    <td>${htmlBR(obj['Sat. Bahan'])}</td>
    <td>${obj['Nama Pengawas']}</td>
  </tr>
`).join('');

    return `
    <section class="page">
      <h2 class="company">${COMPANY_NAME}</h2>
      <div class="estate">${r.estate_full||''}</div>
      <h3 class="title">RENCANA KERJA BULANAN</h3>

      <div class="meta">
        <div><b>Periode</b>: ${r.periode||'-'}</div>
        <div><b>Divisi</b>: ${r.divisi||'-'}</div>
        <div><b>No RKB</b>: ${r.nomor||'-'}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Activity Type</th><th>Jenis Pekerjaan</th><th>Lokasi</th>
            <th class="t-right">Volume Kerja</th><th>Satuan</th><th class="t-right">HK/Unit</th>
            <th class="t-right">BHL</th><th class="t-right">SKU</th><th class="t-right">BHB</th>
            <th>No. Material</th><th>Nama Bahan</th><th class="t-right">Jumlah</th><th>Sat.</th>
            <th>Nama Pengawas</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="14" class="muted">Tidak ada detail.</td></tr>`}</tbody>
      </table>

      <div class="signs">
        <div>Asisten<br/><br/><br/>(........................)</div>
        <div>Askep<br/><br/><br/>(........................)</div>
        <div>Manager<br/><br/><br/>(........................)</div>
      </div>

      <div class="printed">Dicetak: ${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short'}).format(new Date())}</div>
    </section>`;
  }).join('\n');

  const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>RKB Detail ${periodeFilter||'Semua'}</title>
<style>
  @page{ size:A4; margin:12mm; }
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
  .page{ page-break-after: always; }
  .company{ margin:0; font-size:16px; text-transform:uppercase; }
  .estate{ margin:2px 0 8px 0; color:#444; }
  .title{ margin:6px 0 10px 0; }
  .meta{ display:flex; gap:18px; font-size:12px; margin-bottom:8px; }
  table{ width:100%; border-collapse:collapse; }
  th,td{ border:1px solid #888; padding:5px 6px; font-size:11px; vertical-align: top; }
  th{ background:#f2f2f2; }
  .t-right{ text-align:right; }
  .muted{ color:#666; }
  .signs{ display:flex; gap:12px; justify-content:space-between; margin-top:14px; font-size:12px; text-align:center; }
  .printed{ margin-top:8px; color:#666; font-size:10px; }
</style></head>
<body>
${sections}
<script>window.print();</script>
</body></html>`;
  const w = window.open('', '_blank'); w.document.write(html); w.document.close();
}

  // ===== Copy RKB dari periode → periode lain =====
  function copyPeriode(){
    if(!data.length){ U.toast('Belum ada draft untuk dicopy.','warning'); return; }
    const src = prompt('Copy dari periode (YYYY-MM):', periodeFilter || '');
    if(!src) return;
    const dst = prompt('Ke periode (YYYY-MM):', src);
    if(!dst) return;

    // ambil sumber di SEMUA draft (bukan outbox)
    const allDrafts = U.S.get(draftKey, []);
    const srcRows = (allDrafts||[]).filter(x=> String(x.periode||'')===String(src));
    if(!srcRows.length){ U.toast('Tidak ada RKB dengan periode sumber.','warning'); return; }

    // klon → reset nomor & status
    const now = Date.now();
    const clones = srcRows.map((r,idx)=>{
      const t = new Date(now+idx*1000);
      const yy=String(t.getFullYear()).slice(-2);
      const mm=String(t.getMonth()+1).padStart(2,'0');
      const dd=String(t.getDate()).padStart(2,'0');
      const hh=String(t.getHours()).padStart(2,'0');
      const mi=String(t.getMinutes()).padStart(2,'0');
      const ss=String(t.getSeconds()).padStart(2,'0');
      // nomor baru (unik)
      const divCode = String(r.divisi||'').replace(/\s+/g,'').toUpperCase();
      const nomorBaru = `RKB${divCode}${yy}${mm}${dd}${hh}${mi}${ss}`;
      return {
        ...JSON.parse(JSON.stringify(r)),
        nomor: nomorBaru,
        periode: dst,
        status: 'draft',
        hk_total: Number(r.hk_total||0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const merged = clones.concat(allDrafts);
    U.S.set(draftKey, merged);
    if(which==='draft'){ data = merged; sortData(data); build(); }
    U.toast(`Tersalin ${clones.length} RKB ke periode ${dst}.`,'success');
  }

  // ===== Template ikon sederhana (unicode, tak perlu lib eksternal) =====
  const ICON = {
    view:    '👁️',
    edit:    '✏️',
    del:     '🗑️',
    sync:    '✅',
    refresh: '🔁'
  };

  // ===== Build UI =====
  async function build(){
  await resolveCompanyName();
    const periodes = uniquePeriodes(data);
    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">${which==='outbox'?'Outbox':'Draft RKB'}</h4>
          <div class="d-flex flex-wrap gap-2">
            ${which==='draft' ? `
              <button id="btn-copy" class="btn btn-sm btn-outline-primary">Copy Periode</button>
            `:''}
            <button id="btn-xlsx" class="btn btn-sm btn-success">Export Excel</button>
            <button id="btn-pdf"  class="btn btn-sm btn-dark">Cetak PDF</button>
          </div>
        </div>

        <div class="row g-2 align-items-end mb-2">
          <div class="col-md-3">
            <label class="form-label">Periode</label>
            <select id="f-periode" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${periodes.map(p=>`<option value="${p}" ${p===periodeFilter?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-5">
            <label class="form-label">Cari</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">Keyword</span>
              <input id="f-search" class="form-control" placeholder="nomor, periode, divisi, estate, status..." />
            </div>
          </div>
          <div class="col-md-2">
            <label class="form-label">Baris / halaman</label>
            <select id="f-pagesize" class="form-select form-select-sm">
              ${PAGE_CHOICES.map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle table-compact">
            <thead>
              <tr>
                <th style="width:60px">No</th>
                <th>Nomor RKB</th>
                <th>Periode</th>
                <th>Divisi</th>
                <th>HK (Total)</th>
                <th>Status</th>
                ${which==='outbox' ? '<th class="hide-sm">Keterangan Error</th>' : ''}
                <th style="width:210px">Aksi</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-2">
          <div class="small text-muted" id="info"></div>
          <nav><ul id="pager" class="pagination pagination-sm mb-0 pager"></ul></nav>
        </div>
      </div></div>
    `;

    // Bind top controls
    const sInput = U.qs('#f-search'); sInput.value = q;
    sInput.addEventListener('input', ()=>{ q=sInput.value; page=1; renderRows(); renderPager(); });
    U.qs('#f-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderRows(); renderPager(); };
    U.qs('#f-periode').onchange  = (e)=>{ periodeFilter=e.target.value; page=1; renderRows(); renderPager(); };
    U.qs('#btn-xlsx').onclick = exportXlsx;
    U.qs('#btn-pdf').onclick  = printPdf;
    if(which==='draft'){ U.qs('#btn-copy').onclick = copyPeriode; }

    renderRows(); renderPager();
  }

  // ===== Render rows =====
  function renderRows(){
    const arr = applyFilter();
    const slice = getPageSlice(arr);
    const tb = U.qs('#rows');

    if(!slice.length){
      tb.innerHTML = `<tr><td colspan="${which==='outbox'?8:7}" class="text-center text-muted">Tidak ada data.</td></tr>`;
      U.qs('#info').textContent = `0 dari ${fmtN(arr.length)} RKB`;
      return;
    }

    tb.innerHTML = slice.map((r,idx)=>{
      let hk = Number(r.hk_total||0);
      if(!hk && Array.isArray(r.items)) hk = r.items.reduce((a,it)=>a+computeHK(it).total,0);
      const i = (page-1)*pageSize + idx;
      const isDraft = String(r.status||'draft')==='draft';
      const sBadge = String(r.status||'draft');
      const badgeCls =
        sBadge==='submitted' ? 'text-bg-warning' :
        sBadge==='askep_approved' ? 'text-bg-info' :
        sBadge==='full_approved' ? 'text-bg-success' :
        'text-bg-secondary';

      const btn = (name, title, action, enabled=true)=>{
        const dis = enabled ? '' : 'disabled';
        return `<button class="btn btn-outline-secondary icon-btn" title="${title}" data-a="${action}" data-i="${i}" ${dis}>
                  <span class="i i-${name}">${ICON[name]}</span>
                </button>`;
      };

      return `<tr>
        <td>${i+1}</td>
        <td>${r.nomor}</td>
        <td>${r.periode||'-'}</td>
        <td>${r.divisi||'-'}</td>
        <td>${hk.toFixed(2)}</td>
        <td><span class="badge ${badgeCls}">${sBadge}</span></td>
        ${which==='outbox' ? `<td class="hide-sm">${r.last_error||''}</td>` : ''}
        <td>
          <div class="btn-group btn-group-sm">
            ${btn('view','Lihat (detail)','view',true)}
            ${btn('edit','Edit','edit', isDraft && which==='draft')}
            ${btn('del','Hapus','del',  isDraft && which==='draft')}
            ${which==='draft'
              ? btn('sync','Kirim/Sync ke server','sync', isDraft && (r.items||[]).length>0)
              : `<button class="btn btn-outline-success icon-btn" title="Kirim Ulang" data-a="resend" data-i="${i}">
                   <span class="i">⟳</span>
                 </button>`
            }
            ${btn('refresh','Perbarui Status','refresh',true)}
          </div>
        </td>
      </tr>`;
    }).join('');

    // Bind actions
    tb.querySelectorAll('button').forEach(btn=>{
      const i = +btn.dataset.i; const a = btn.dataset.a;
      btn.onclick = ()=> handleAction(a, i);
    });

    const start=(page-1)*pageSize + 1;
    const end = start + slice.length - 1;
    U.qs('#info').textContent = `${fmtN(start)}–${fmtN(end)} dari ${fmtN(arr.length)} RKB`;
  }

  // ===== Pager (elipsis) =====
  function renderPager(){
    const ul = U.qs('#pager');
    const arr = applyFilter();
    const pc = pageCountOf(arr.length);

    function li(label, to, disabled=false, active=false){
      const el=document.createElement('li');
      el.className=`page-item ${disabled?'disabled':''} ${active?'active':''}`;
      el.innerHTML = `<a class="page-link">${label}</a>`;
      if(!disabled && !active){
        el.onclick=()=>{ page=to; renderRows(); renderPager(); window.scrollTo({top:0,behavior:'smooth'}); };
      }
      return el;
    }

    ul.innerHTML='';
    ul.appendChild(li('«', Math.max(1,page-1), page<=1));
    const show=new Set([1, pc, page-1, page, page+1].filter(p=>p>=1&&p<=pc));
    const nums=[...show].sort((a,b)=>a-b);
    let last=0;
    for(const n of nums){
      if(n-last>1){
        const d=document.createElement('li'); d.className='page-item disabled';
        d.innerHTML=`<span class="page-link">…</span>`; ul.appendChild(d);
      }
      ul.appendChild(li(String(n), n, false, n===page));
      last=n;
    }
    ul.appendChild(li('»', Math.min(pc,page+1), page>=pc));
  }

  // ===== Action handlers =====
  async function handleAction(a, i){
    const listKey = which==='outbox' ? outboxKey : draftKey;
    const arr = which==='outbox'
      ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)
      : (U.S.get(draftKey, [])||[]);
    const idx = i; // index relatif ke data (sudah dipetakan saat render)
    const row = (which==='outbox') ? data[idx] : arr[idx];

    if(a==='del'){
      if(!confirm('Hapus RKB ini dari daftar?')) return;
      arr.splice(idx,1);
      U.S.set(listKey, arr);
      data = (which==='outbox') ? arr.filter(x=>!!x.last_error) : arr;
      sortData(data); renderRows(); renderPager();
      return;
    }

    if(a==='edit'){
      U.S.set('rkb.form.buffer', row);
      location.hash = '#/rkb/form';
      return;
    }

    if(a==='view'){
      openViewModal(row);
      return;
    }

    if(a==='sync'){
      if(!(row.items && row.items.length)){ U.toast('Draft belum punya item.','warning'); return; }
      try{
        U.progressOpen('Sinkronisasi RKB...'); U.progress(30,'Kirim ke server');
        const payload = { row: { nomor:row.nomor, periode:row.periode, divisi:row.divisi, estate_full:row.estate_full }, items: row.items };
        const r = await API.call('pushRKB', payload);
        if(r.ok){
          // sukses → update status, hapus error di outbox bila ada
          arr[idx].status='submitted';
          arr[idx].updated_at=new Date().toISOString();
          U.S.set(draftKey, arr);
          // bersihkan dari outbox jika pernah gagal
          const ob = U.S.get(outboxKey, []);
          const j = ob.findIndex(x=> x.nomor===row.nomor);
          if(j>=0){ ob.splice(j,1); U.S.set(outboxKey, ob); }
          U.toast('Berhasil sync.','success');
        }else{
          // gagal server → simpan ke outbox dengan alasan
          saveToOutboxWithError(row, r.error||'Gagal sync');
          U.toast(r.error||'Gagal sync. Tersimpan di Outbox.','danger');
        }
      }catch(e){
        // gagal jaringan → outbox
        saveToOutboxWithError(row, e.message||'Jaringan gagal');
        U.toast('Jaringan gagal. Disimpan di Outbox.','danger');
      }finally{
        U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250);
        data = U.S.get(draftKey, []);
        sortData(data); renderRows(); renderPager();
      }
      return;
    }

    if(a==='resend' && which==='outbox'){
      try{
        U.progressOpen('Kirim ulang...'); U.progress(35,'Kirim');
        const payload = row.items && row.items.length
          ? { row: {nomor:row.nomor, periode:row.periode, divisi:row.divisi, estate_full:row.estate_full}, items: row.items }
          : { row };
        const r = await API.call('pushRKB', payload);
        if(r.ok){
          // sukses → hapus error & update waktu
          const all = U.S.get(outboxKey, []);
          const j = all.findIndex(x=> x.nomor===row.nomor);
          if(j>=0){ all.splice(j,1); U.S.set(outboxKey, all); }
          U.toast('Terkirim. Item dihapus dari Outbox.','success');
          data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error);
          sortData(data); renderRows(); renderPager();
        }else{
          U.toast(r.error||'Gagal kirim ulang.','danger');
        }
      }catch(e){
        U.toast(e.message||'Gagal kirim ulang.','danger');
      }finally{
        U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250);
      }
      return;
    }

    if(a==='refresh'){
      try{
        U.progressOpen('Perbarui status...'); U.progress(30,'Ambil status');
        const r = await API.call('pullMaster', {});
        if(r.ok && r.actuals?.rkb){
          const found = (r.actuals.rkb||[]).find(x=> String(x.nomor)===String(row.nomor));
          if(found){
            if(which==='outbox'){
              // kalau sudah berhasil di server, hapus dari outbox
              if(String(found.status||'').toLowerCase()!=='draft'){
                const all = U.S.get(outboxKey, []);
                const j = all.findIndex(x=> x.nomor===row.nomor);
                if(j>=0){ all.splice(j,1); U.S.set(outboxKey, all); }
                data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error);
              }
            }else{
              arr[idx].status = found.status || arr[idx].status;
              arr[idx].updated_at = new Date().toISOString();
              U.S.set(draftKey, arr);
              data = U.S.get(draftKey, []);
            }
            sortData(data); renderRows(); renderPager();
            U.toast('Status diperbarui.','info');
          }else{
            U.toast('Nomor tidak ditemukan di server untuk scope Anda.','warning');
          }
        }else{
          U.toast('Gagal ambil status.','danger');
        }
      }finally{
        U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 200);
      }
      return;
    }
  }

  function saveToOutboxWithError(item, msg){
    const ob = U.S.get(outboxKey, []);
    const idx = ob.findIndex(x=> x.nomor===item.nomor);
    const payload = {...item, last_error: msg, updated_at: new Date().toISOString()};
    if(idx>=0) ob[idx]=payload; else ob.unshift(payload);
    U.S.set(outboxKey, ob);
  }

  // ===== Modal detail =====
  function openViewModal(d){
    const div=document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
    <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Detail RKB · ${d.nomor||'-'}</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2 small text-muted">
          Periode: <b>${d.periode||'-'}</b> · Divisi: <b>${d.divisi||'-'}</b> · Estate: <b>${d.estate_full||'-'}</b>
        </div>
        <div id="detail-items"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m=new bootstrap.Modal(div); m.show();

    const wrap = div.querySelector('#detail-items');
    const items = d.items||[];
    if(!items.length){
      wrap.innerHTML = `<div class="text-muted">Tidak ada item pekerjaan.</div>`;
    }else{
      const rows = items.map((it,idx)=>{
        const hk=computeHK(it);
        const bahan=(it.bahan||[]).map(b=>`${b.nama} (${b.jumlah} ${b.satuan||''})`).join(', ')||'-';
        return `<tr>
          <td>${idx+1}</td>
          <td>${it.pekerjaan||''}</td>
          <td>${(it.lokasi||[]).map(x=>x.name).join(', ')||'-'}</td>
          <td>${it.volume||0} ${it.satuan||''}</td>
          <td>${hk.BHL.toFixed(2)}</td>
          <td>${hk.SKU.toFixed(2)}</td>
          <td>${hk.BHB.toFixed(2)}</td>
          <td>${hk.total.toFixed(2)}</td>
          <td>${bahan}</td>
          <td>${it.pengawas||''}</td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-striped">
            <thead>
              <tr>
                <th>No</th><th>Pekerjaan</th><th>Lokasi</th>
                <th>Volume</th><th>HK BHL</th><th>HK SKU</th><th>HK BHB</th><th>HK Total</th>
                <th>Bahan</th><th>Pengawas</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // go
  build();
};

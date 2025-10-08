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
  // Hitung label revisi: "draft r1/r2/..." dari komentar Askep/Manager
function computeRevisionTag(nomor){
  try{
    const comments = (window.STORE && STORE.getActual) ? (STORE.getActual('rkb_comments')||[]) : [];
    const revs = comments.filter(c =>
      String(c.nomor)===String(nomor) &&
      (String(c.role||'').toLowerCase()==='askep' || String(c.role||'').toLowerCase()==='manager')
    ).length;
    return revs>0 ? `draft r${revs}` : 'draft';
  }catch(_){ return 'draft'; }
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

// ===== Load data lokal (compat + fallback) =====
const draftKey     = 'rkb.drafts';
const draftKeyOld  = 'rkb.draft';       // kompatibel versi lama
const outboxKey    = 'rkb.outbox';

// Draft lokal (editable) + kompat versi lama
function readDraftsCompat(){
  // 1) kunci baru (utama)
  let rows = U.S.get(draftKey, []);
  if (Array.isArray(rows) && rows.length) return rows;

  // 2) kunci lama (kompat)
  const oldRows = U.S.get(draftKeyOld, []);
  if (Array.isArray(oldRows) && oldRows.length){
    U.S.set(draftKey, oldRows);
    try{ localStorage.removeItem(draftKeyOld); }catch(_){}
    return oldRows;
  }

  // 3) fallback: tidak ada draft lokal
  return [];
}

// History dari server (read-only): ambil dari kpl.actual.rkb yang ditarik saat pullAll
function readHistoryFromActuals(){
  const all = (window.STORE && STORE.getActualsRkb) ? (STORE.getActualsRkb()||[]) : [];
  const me  = (SESSION.profile()?.username || '').toLowerCase();

  // tampilkan hanya RKB yang dibuat oleh user aktif
  const mine = all.filter(x => String(x.username||'').toLowerCase() === me);

  // map ke bentuk ringkasan untuk list; diberi bendera __history agar tombol edit/hapus/sync nonaktif
  return mine.map(x => ({
    nomor:        x.nomor,
    periode:      x.periode,
    divisi:       x.divisi,
    estate_full:  x.estate_full,
    status:       x.status || 'draft',
    hk_total:     Number(x.hk_total||0),
    created_at:   x.created_at || '',
    updated_at:   x.updated_at || '',
    items:        [],                // detail tidak ditarik di sini
    __history:    true               // ← penanda item riwayat (read-only)
  }));
}

// Gabungkan unik berdasar "nomor" — utamakan draft lokal (bila bentrok, history di-skip)
function mergeUniqueByNomor(primaryArr, secondaryArr){
  const used = new Set(primaryArr.map(r => String(r.nomor)));
  const extra = (secondaryArr||[]).filter(r => !used.has(String(r.nomor)));
  return primaryArr.concat(extra);
}

let data = (which==='outbox')
  ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)   // hanya yg gagal
  : mergeUniqueByNomor(readDraftsCompat(), readHistoryFromActuals());
  data = (data||[]).map(r => ({ ...r, periode: fPeriode(r.periode) }));

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
  return Array.from(
    new Set((arr||[]).map(x => fPeriode(x.periode)).filter(Boolean))
  ).sort().reverse();
}
function applyFilter(){
  let arr = (data||[]).slice();
  if(periodeFilter) arr = arr.filter(x => fPeriode(x.periode) === String(periodeFilter));
  const qq = q.trim().toLowerCase();
  if(qq){
    arr = arr.filter(r=>{
      return [r.nomor, fPeriode(r.periode), r.divisi, r.estate_full, r.status]
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


// === Helper: cari penandatangan dari master (idaman: estate/divisi/rayon lengkap)
async function resolveSignersByContext(ctx = {}){
  // ctx: { estate_id?, rayon_id?, divisi_id?, divisi?, estate_full? }
  try{
    if (typeof STORE?.ensureWarm === 'function') {
      await STORE.ensureWarm();
    }
    const getM = STORE?.getMaster?.bind(STORE) || (()=>[]);
    const estates  = getM('yestate')  || [];   // manager: kolom nama_mgr
    const rayons   = getM('yrayon')   || [];   // askep  : kolom nama_askep
    const divisis  = getM('ydivisi')  || [];   // asisten: kolom nama_asisten
    const orgMap   = getM('yorg_map') || [];   // fallback tambahan bila perlu
    const signersT = getM('ysigners') || getM('yorg_signers') || []; // fallback tambahan

    const prof = (typeof SESSION?.profile === 'function') ? (SESSION.profile() || {}) : {};

    // --- Helpers kecil
    const LC = v => v==null ? '' : String(v).toLowerCase();
    const eqLoose = (a,b)=> LC(a) === LC(b);

    // --- 1) Temukan estateId
    let estateId =
      ctx.estate_id
      || (estates.find(e => (e.nama_panjang||e.nama) === ctx.estate_full)?.id)
      || prof.estate_id;

    const estateRow = estates.find(e =>
      eqLoose(e.id, estateId) || eqLoose(e.kode, estateId) || eqLoose(e.kd_estate, estateId)
    ) || {};

    // --- 2) Temukan divisiId (boleh berupa id/kode/nama)
    function guessDivisiId(label){
      if(!label) return null;
      const L = LC(label);
      const row = divisis.find(d =>
         eqLoose(d.id, label) || eqLoose(d.divisi_id, label)
      || eqLoose(d.kode, label) || eqLoose(d.kd_divisi, label)
      || LC(d.nama||d.nama_divisi) === L
      );
      return row?.id || row?.divisi_id || null;
    }

    let divisiId =
      ctx.divisi_id
      || guessDivisiId(ctx.divisi)
      || prof.divisi_id
      || prof.divisi;

    const divRow = divisis.find(d =>
      eqLoose(d.id, divisiId) || eqLoose(d.divisi_id, divisiId)
      || eqLoose(d.kode, divisiId) || eqLoose(d.kd_divisi, divisiId)
      || LC(d.nama||d.nama_divisi) === LC(divisiId)
    ) || {};

    // --- 3) Temukan rayonId dari beberapa jalur:
    // ctx.rayon_id → d.rayon_id → estate.rayon_id → profile.rayon_id
    let rayonId =
      ctx.rayon_id
      || divRow.rayon_id
      || estateRow.rayon_id
      || prof.rayon_id;

    // kalau masih kosong, coba tebak dari kemungkinan kolom kode di divisi/estate
    if(!rayonId){
      const candidates = [
        divRow.rayon, divRow.kd_rayon, divRow.kode_rayon,
        estateRow.kd_rayon, estateRow.kode_rayon,
      ].filter(Boolean);

      for(const c of candidates){
        const r = rayons.find(x =>
          eqLoose(x.id, c) || eqLoose(x.rayon_id, c)
          || eqLoose(x.kode, c) || eqLoose(x.kd_rayon, c)
          || LC(x.nama||x.nama_rayon) === LC(c)
        );
        if(r){ rayonId = r.id || r.rayon_id || r.kode || r.kd_rayon; break; }
      }
    }

    // --- 4) Ambil nama berdasarkan master yang Anda sebut:
    const manager = estateRow.nama_mgr || '';

    const rayonRow = rayons.find(r =>
      eqLoose(r.id, rayonId) || eqLoose(r.rayon_id, rayonId)
      || eqLoose(r.kode, rayonId) || eqLoose(r.kd_rayon, rayonId)
    ) || {};

    let askep   = rayonRow.nama_askep || '';
    let asisten = divRow.nama_asisten || '';

    // --- 5) Fallback bila masih kosong: ysigners / yorg_map
    if(!(manager && askep && asisten)){
      const pool = (signersT.length ? signersT : orgMap).filter(r=>{
        const okE = !estateId || eqLoose(r.estate_id, estateId);
        const okR = !rayonId  || eqLoose(r.rayon_id,  rayonId);
        const okD = !divisiId || LC(r.divisi_id||r.divisi) === LC(divisiId);
        return okE && okR && okD;
      });
      const pick = (role) => {
        const tgt = LC(role);
        return pool.find(x=>{
          const jr = LC(x.role||x.jabatan||'');
          const nj = LC(x.nama_jabatan||'');
          return jr.includes(tgt) || nj.includes(tgt);
        });
      };
      if(!askep){
        askep   = pick('askep')?.nama_lengkap || pick('askep')?.nama || askep;
      }
      if(!asisten){
        asisten = pick('asisten')?.nama_lengkap || pick('asisten')?.nama || asisten;
      }
    }

    return { asisten: asisten || '', askep: askep || '', manager: manager || '' };
  }catch(_){
    return { asisten:'', askep:'', manager:'' };
  }
}

function signerLine(name){
  return `(${name && String(name).trim() ? String(name).trim() : '........................'})`;
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
  if (typeof XLSX === 'undefined'){ U.toast('Library XLSX belum tersedia.','warning'); return; }

  const arr = applyFilter();
  if (!arr.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }

  const wb = XLSX.utils.book_new();

  // gunakan loop biasa agar bisa await
  for (let idx = 0; idx < arr.length; idx++) {
    const r = arr[idx];

    // ambil nama penandatangan dari master
    const sign = await resolveSignersByContext({
      estate_id:   r.estate_id,
      rayon_id  : r.rayon_id,
      divisi_id:   r.divisi_id,
      divisi:      r.divisi,
      estate_full: r.estate_full
    });

    // inflate items dari actuals jika kosong (kasus RKB server/history)
    const items = (Array.isArray(r.items) && r.items.length)
      ? r.items
      : (typeof itemsFromActuals === 'function' ? itemsFromActuals(r.nomor) : []);

    // susun rows via flattenRkbRows menggunakan items hasil inflate
    const rowsAoa = flattenRkbRows({ ...r, items });

    // Header blok (4 baris)
    const headerBlock = [
      [COMPANY_NAME],
      [r.estate_full || ''],
      ['RENCANA KERJA BULANAN'],
      [`Periode: ${fPeriode(r.periode)||'-'}`, `Divisi: ${r.divisi||'-'}`, `No RKB: ${r.nomor||'-'}`],
      [], // spasi
      DETAIL_HEADERS
    ];

    // Gabung header + detail
    const detailData = rowsAoa.map(obj => DETAIL_HEADERS.map(h => obj[h]));
    const aoa = headerBlock.concat(detailData);

    // Baris persetujuan pakai nama dari master (fallback titik-titik)
    aoa.push([]);
    aoa.push(['Asisten','','','Askep','','','Manager']);
    aoa.push([
      signerLine(sign.asisten), '', '',
      signerLine(sign.askep),   '', '',
      signerLine(sign.manager)
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // --- WRAP TEXT untuk kolom yang berisi newline ---
    const WRAP_HEADERS = ['Lokasi','No. Material','Nama Bahan','Sat. Bahan'];
    const wrapColIdx = WRAP_HEADERS.map(h => DETAIL_HEADERS.indexOf(h)).filter(i => i >= 0);

    // baris data mulai setelah headerBlock (yang memuat judul + header kolom)
    const dataStartRow = headerBlock.length + 1; // 1-based row index di Excel
    const dataEndRow   = dataStartRow + (detailData.length || 0) - 1;

    for (const ci of wrapColIdx) {
      const col = colLetter(ci);
      for (let rrow = dataStartRow; rrow <= dataEndRow; rrow++) {
        const addr = `${col}${rrow}`;
        if (ws[addr]) {
          ws[addr].t = 's';
          ws[addr].s = Object.assign({}, ws[addr].s || {}, { alignment:{ wrapText:true, vertical:'top' } });
        }
      }
    }

    // (opsional) tinggi baris nyaman
    if (!ws['!rows']) ws['!rows'] = [];
    for (let rrow = dataStartRow-1; rrow <= dataEndRow-1; rrow++) {
      ws['!rows'][rrow] = Object.assign({}, ws['!rows'][rrow] || {}, { hpt: 18 });
    }

    // Lebar kolom
    ws['!cols'] = [
      {wch:18},{wch:28},{wch:26},{wch:14},{wch:10},{wch:10},
      {wch:12},{wch:12},{wch:12},{wch:14},{wch:28},{wch:10},{wch:12},{wch:20}
    ];

    // Nama sheet
    let sname = (r.nomor || `RKB${idx+1}`).replace(/[\\/?*\[\]]/g,'');
    if (sname.length > 31) sname = sname.slice(-31);
    XLSX.utils.book_append_sheet(wb, ws, sname || `RKB${idx+1}`);
  }

  const label = periodeFilter || 'ALL';
  XLSX.writeFile(wb, `RKB_Detail_${label}.xlsx`);
}


// ===== Cetak PDF (per-periode) =====
async function printPdf(){
  await resolveCompanyName();
  const arr = applyFilter();
  if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

  const sections = await Promise.all(arr.map(async (r) => {
  // nama penandatangan
  const sign = await resolveSignersByContext({
    estate_id:   r.estate_id,
    rayon_id:    r.rayon_id,
    divisi_id:   r.divisi_id,
    divisi:      r.divisi,
    estate_full: r.estate_full
  });

  // inflate items dari actuals bila kosong
  const items = (Array.isArray(r.items) && r.items.length)
    ? r.items
    : (typeof itemsFromActuals === 'function' ? itemsFromActuals(r.nomor) : []);

  // kolom "Jumlah" multiline → format angka per baris
  const fmtJumlah = (s) => String(s ?? '')
    .split('\n')
    .map(t => t.trim() ? U.fmt.id0(t) : '')
    .join('\n');

  const rows = flattenRkbRows({ ...r, items }).map(obj => `
    <tr>
      <td>${obj['Activity Type']}</td>
      <td>${obj['Jenis Pekerjaan']}</td>
      <td>${U.htmlBR(obj['Lokasi'])}</td>
      <td class="t-right">${U.fmt.id2(obj['Volume Kerja'])}</td>
      <td>${obj['Satuan']}</td>
      <td class="t-right">${U.fmt.id2(obj['HK/Unit'])}</td>
      <td class="t-right">${U.fmt.id2(obj['BHL'])}</td>
      <td class="t-right">${U.fmt.id2(obj['SKU'])}</td>
      <td class="t-right">${U.fmt.id2(obj['BHB'])}</td>
      <td>${U.htmlBR(obj['No. Material'])}</td>
      <td>${U.htmlBR(obj['Nama Bahan'])}</td>
      <td class="t-right">${U.htmlBR(fmtJumlah(obj['Jumlah']))}</td>
      <td>${U.htmlBR(obj['Sat. Bahan'])}</td>
      <td>${obj['Nama Pengawas']}</td>
    </tr>
  `).join('');

  return `
    <section class="page">
      <h2 class="company">${COMPANY_NAME}</h2>
      <div class="estate">${r.estate_full||''}</div>
      <h3 class="title">RENCANA KERJA BULANAN</h3>

      <div class="meta">
        <div><b>Periode</b>: ${fPeriode(r.periode)||'-'}</div>
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
    <div>Asisten<br/><br/><br/>${signerLine(sign.asisten)}</div>
    <div>Askep<br/><br/><br/>${signerLine(sign.askep)}</div>
    <div>Manager<br/><br/><br/>${signerLine(sign.manager)}</div>
  </div>

      <div class="printed">Dicetak: ${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short'}).format(new Date())}</div>
    </section>`;
}));


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
${sections.join('\n')}
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
    const srcRows = (allDrafts||[]).filter(x => fPeriode(x.periode) === String(src));
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

  const isDraft   = String(r.status||'draft').toLowerCase()==='draft';
  const isHistory = !!r.__history;
  const canEdit   = which==='draft' && isDraft && !isHistory;
  const canSync   = which==='draft' && isDraft && !isHistory && (r.items||[]).length>0;
  const canDelete = which==='draft' && isDraft && !isHistory && !r.__serverLinked;

  // label draft rN
  const sBadgeRaw = String(r.status||'draft');
  const isDraftStatus = sBadgeRaw.toLowerCase()==='draft';
  const comments = (window.STORE && STORE.getActual) ? (STORE.getActual('rkb_comments')||[]) : [];
  const revCount = isDraftStatus
    ? comments.filter(c =>
        String(c.nomor)===String(r.nomor) &&
        (String(c.role||'').toLowerCase()==='askep' || String(c.role||'').toLowerCase()==='manager')
      ).length
    : 0;
  const sBadge = isDraftStatus ? (revCount>0 ? `draft r${revCount}` : 'draft') : sBadgeRaw;

  const badgeCls =
    sBadgeRaw==='submitted' ? 'text-bg-warning' :
    sBadgeRaw==='askep_approved' ? 'text-bg-info' :
    sBadgeRaw==='full_approved' ? 'text-bg-success' :
    'text-bg-secondary';

  const histBadge = r.__history
    ? '<span class="badge bg-light text-dark border ms-1" title="Riwayat dari server (read-only)">Server</span>'
    : '';

  const btn = (name, title, action, enabled=true)=>{
    const dis = enabled ? '' : 'disabled';
  return `<button class="btn btn-outline-secondary icon-btn" title="${title}" data-a="${action}" data-i="${i}" data-nomor="${r.nomor}" ${dis}>
            <span class="i i-${name}">${ICON[name]}</span>
          </button>`;
  };

  // >>> format HK: ribuan + 2 desimal
  const hkStr = U.fmt.id2(hk);

  return `<tr>
    <td>${i+1}</td>
    <td>${r.nomor}</td>
    <td>${fPeriode(r.periode) || '-'}</td>
    <td>${r.divisi||'-'}</td>
    <td>${hkStr}</td>
    <td><span class="badge ${badgeCls}">${sBadge}</span>${histBadge}</td>
    ${which==='outbox' ? `<td class="hide-sm">${r.last_error||''}</td>` : ''}
    <td>
      <div class="btn-group btn-group-sm">
        ${btn('view','Lihat (detail)','view', true)}
        ${btn('edit','Edit','edit',  canEdit)}
        ${btn('del','Hapus','del',   canDelete)}
        ${which==='draft'
          ? btn('sync','Kirim/Sync ke server','sync', canSync)
      : `<button class="btn btn-outline-success icon-btn" title="Kirim Ulang" data-a="resend" data-i="${i}" data-nomor="${r.nomor}">
     <span class="i">⟳</span>
      </button>`
        }
        ${btn('refresh','Perbarui Status','refresh', true)}
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
  // Ambil nomor dari tombol yang ditekan (dibuat di renderRows)
  const btnEl = document.querySelector(`button[data-a="${a}"][data-i="${i}"]`);
  const nomor = btnEl?.dataset?.nomor || '';

  const listKey = which==='outbox' ? outboxKey : draftKey;
  // List "mentah" sesuai tab
  const rawList = which==='outbox'
    ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)
    : (U.S.get(draftKey, [])||[]);

  // Sumber yang sedang tampil (sudah terfilter & tersortir)
  const currentList = applyFilter();

  // Cari baris berdasar nomor (prioritas: yang sedang tampil → rawList → data gabungan)
  let rowRaw = currentList.find(x => String(x.nomor)===String(nomor))
           || rawList.find(x => String(x.nomor)===String(nomor))
           || data.find(x => String(x.nomor)===String(nomor));

  if(!rowRaw){
    U.toast('RKB tidak ditemukan di memori lokal. Coba perbarui/refresh data.', 'warning');
    return;
  }

  // Index baris di list yang akan dimodifikasi (bisa -1 jika berasal dari history server)
  const idx = rawList.findIndex(x => String(x.nomor)===String(rowRaw.nomor));

  // === Aksi ===
  if(a==='del'){
    if (rowRaw.__history){
      U.toast('Ini riwayat dari server dan tidak bisa dihapus.', 'warning');
      return;
    }
    if (rowRaw.__serverLinked){
      U.toast('RKB revisi dari server tidak bisa dihapus. Silakan edit lalu Sync.', 'warning');
      return;
    }
    if(!confirm('Hapus RKB ini dari daftar?')) return;

    if(idx>=0){
      rawList.splice(idx,1);
      U.S.set(listKey, rawList);
    }
    data = (which==='outbox') ? rawList.filter(x=>!!x.last_error) : rawList;
    sortData(data); renderRows(); renderPager();
    return;
  }

  if(a==='edit'){
    // Kirim baris apapun (draft/history). UI sebelumnya sudah membatasi tombol Edit untuk case allowed.
    U.S.set('rkb.form.buffer', rowRaw);
    location.hash = '#/rkb/form';
    return;
  }

  if(a==='view'){
    openViewModal(rowRaw);
    return;
  }

  if(a==='sync'){
    if(!(rowRaw.items && rowRaw.items.length)){
      U.toast('Draft belum punya item.', 'warning');
      return;
    }
    try{
      U.progressOpen('Sinkronisasi RKB...'); U.progress(30,'Kirim ke server');
      const payload = {
        row: {
          nomor: rowRaw.nomor,
          periode: fPeriode(rowRaw.periode),
          divisi: rowRaw.divisi,
          estate_full: rowRaw.estate_full
        },
        items: rowRaw.items
      };
      const r = await API.call('pushRKB', payload);
      if(r.ok){
        if(idx>=0){
          rawList[idx].status = 'submitted';
          rawList[idx].updated_at = new Date().toISOString();
          U.S.set(draftKey, rawList);
        }
        // bersihkan dari outbox bila sebelumnya pernah gagal
        const ob = U.S.get(outboxKey, []);
        const j = ob.findIndex(x=> String(x.nomor)===String(rowRaw.nomor));
        if(j>=0){ ob.splice(j,1); U.S.set(outboxKey, ob); }
        U.toast('Berhasil sync.','success');
      }else{
        saveToOutboxWithError(rowRaw, r.error||'Gagal sync');
        U.toast(r.error||'Gagal sync. Tersimpan di Outbox.','danger');
      }
    }catch(e){
      saveToOutboxWithError(rowRaw, e.message||'Jaringan gagal');
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
      const payload = (rowRaw.items && rowRaw.items.length)
        ? { row: { nomor: rowRaw.nomor, periode: fPeriode(rowRaw.periode), divisi: rowRaw.divisi, estate_full: rowRaw.estate_full }, items: rowRaw.items }
        : { row: { ...rowRaw, periode: fPeriode(rowRaw.periode) } };
      const r = await API.call('pushRKB', payload);
      if(r.ok){
        const all = U.S.get(outboxKey, []);
        const j = all.findIndex(x=> String(x.nomor)===String(rowRaw.nomor));
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
        const found = (r.actuals.rkb||[]).find(x=> String(x.nomor)===String(rowRaw.nomor));
        if(found){
          if(which==='outbox'){
            // kalau sudah bukan draft di server → hapus dari outbox
            if(String(found.status||'').toLowerCase()!=='draft'){
              const all = U.S.get(outboxKey, []);
              const j = all.findIndex(x=> String(x.nomor)===String(rowRaw.nomor));
              if(j>=0){ all.splice(j,1); U.S.set(outboxKey, all); }
              data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error);
            }
          }else{
            if(idx>=0){
              rawList[idx].status = found.status || rawList[idx].status;
              rawList[idx].updated_at = new Date().toISOString();
              U.S.set(draftKey, rawList);
              data = U.S.get(draftKey, []);
            }
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


  // === [NEW] Resolver nama key actuals yang dipakai backend
let ACT_KEYS = { items: 'rkb_items', bahan: 'rkb_bahan' };

async function resolveActualNames(){
  try{
    if (typeof STORE?.ensureWarm === 'function') {
      await STORE.ensureWarm();
    }
    const tryKeysItems = ['rkb_items','rkb_item','rkb_detail_items','rkb_details','rkb_detail'];
    const tryKeysBahan = ['rkb_bahan','rkb_material','rkb_bhn','rkb_bahan_items'];

    for (const k of tryKeysItems){
      const v = STORE.getActual(k);
      if (Array.isArray(v) && v.length){ ACT_KEYS.items = k; break; }
    }
    for (const k of tryKeysBahan){
      const v = STORE.getActual(k);
      if (Array.isArray(v) && v.length){ ACT_KEYS.bahan = k; break; }
    }
  }catch(_){ /* biarkan default */ }
}


  // === Ambil detail item+bahan dari cache actuals untuk nomor tertentu
async function itemsFromActuals(nomor){
  try{
    await resolveActualNames();

    const itemsAll = (window.STORE && STORE.getActual) ? (STORE.getActual(ACT_KEYS.items) || []) : [];
    const bahanAll = (window.STORE && STORE.getActual) ? (STORE.getActual(ACT_KEYS.bahan) || []) : [];

    const rowsI = itemsAll.filter(i => String(i.nomor)===String(nomor));
    if(!rowsI.length) return [];

    const bahanByIdx = {};
    bahanAll.filter(b => String(b.nomor)===String(nomor)).forEach(b=>{
      const k = String(b.item_idx||'');
      (bahanByIdx[k] = bahanByIdx[k] || []).push({
        nama: b.nama || '',
        jumlah: Number(b.jumlah||0),
        satuan: b.satuan || ''
      });
    });

    return rowsI.map(r=>{
      const lokasiArr = (String(r.lokasi||'').split(',').map(s=>s.trim()).filter(Boolean) || [])
        .map(nm => ({type:'', name:nm, luas:undefined}));
      const it = {
        pekerjaan: r.pekerjaan || '',
        activity_type: r.activity_type || '',
        lokasi: lokasiArr,
        volume: Number(r.volume||0),
        satuan: r.satuan || '',
        hk_unit: Number(r.hk_unit||0),
        pct_bhl: Number(r.pct_bhl||0),
        pct_sku: Number(r.pct_sku||0),
        pct_bhb: Number(r.pct_bhb||0),
        bahan: bahanByIdx[String(r.idx||'')] || [],
        pengawas: r.pengawas || ''
      };
      it.hk = computeHK(it);
      return it;
    });
  }catch(_){ return []; }
}


  // ===== Modal detail =====
  async function openViewModal(d){
  const div=document.createElement('div');
  div.className='modal fade'; div.innerHTML=`
  <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title">Detail RKB · ${d.nomor||'-'}</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="mb-2 small text-muted">
        Periode: <b>${fPeriode(d.periode)||'-'}</b> · Divisi: <b>${d.divisi||'-'}</b> · Estate: <b>${d.estate_full||'-'}</b>
      </div>
      <div id="detail-items"><div class="text-muted">Memuat detail...</div></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
    </div>
  </div></div>`;
  document.body.appendChild(div);
  const m=new bootstrap.Modal(div); m.show();

  const wrap = div.querySelector('#detail-items');

  // === [NEW] pastikan cache hangat & key actual ter-resolve
  await resolveActualNames();

  // Jika items kosong (riwayat server), inflate dari actuals
  let items = Array.isArray(d.items) ? d.items : [];
  if(!items.length){
    items = await itemsFromActuals(d.nomor);
    if(items.length){ d.items = items; }
  }

  if(!items.length){
    // Bantuan diagnostik kecil: tunjukkan key yang dipakai
    wrap.innerHTML = `<div class="text-muted">
      Tidak ada item pekerjaan di lokal.<br/>
      Actuals digunakan: <code>${ACT_KEYS.items}</code> & <code>${ACT_KEYS.bahan}</code>.<br/>
      Coba "Muat Ulang (Server)" di halaman Home/Settings untuk menyegarkan cache.
    </div>`;
    return;
  }

  const rows = items.map((it,idx)=>{
    const hk = it.hk || computeHK(it);
    const bahan = (it.bahan||[]).map(b=>`${b.nama} (${U.fmt.id0(b.jumlah)} ${b.satuan||''})`).join(', ') || '-';
    return `<tr>
      <td>${idx+1}</td>
      <td>${it.pekerjaan||''}</td>
      <td>${(it.lokasi||[]).map(x=>x.name).join(', ')||'-'}</td>
      <td class="t-right">${it.volume||0} ${it.satuan||''}</td>
      <td class="t-right">${U.fmt.id2(hk.BHL)}</td>
      <td class="t-right">${U.fmt.id2(hk.SKU)}</td>
      <td class="t-right">${U.fmt.id2(hk.BHB)}</td>
      <td class="t-right">${U.fmt.id2(hk.total)}</td>
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
  div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
}

  // Format periode ke YYYY-MM (zona Asia/Jakarta)
function fPeriode(p){
  if(!p) return '';
  const s = String(p).trim();
  if(/^\d{4}-\d{2}$/.test(s)) return s; // sudah OK
  const d = new Date(s);
  if(isNaN(d)) return s;                // bukan tanggal valid → tampilkan apa adanya
  const tz = 'Asia/Jakarta';
  const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(d);
  const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(d);
  return `${y}-${m}`;
}

  // go
  build();
};

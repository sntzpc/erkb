// js/pages/pdo/ktu_rekap_pdo.js
// ===============================================================
// Rekap PDO untuk KTU
// - Local-first (cache header + cache detail per nomor)
// - Filter: Periode, Estate, Rayon, Divisi, Status
// - Tabel rekap menampilkan kolom Status setelah No. PDO
// - Export Excel & Cetak PDF selalu menggunakan data yang DIFILTER
// ===============================================================
window.Pages = window.Pages || {};
Pages.ktuRekapPDO = async function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if (!profile) { location.hash = '#/login'; return; }

  // -------------------------------------------------------------
  // 0) WARM DATA GUARD
  // -------------------------------------------------------------
  const ok = await U.requireWarmOrRedirect({
    mastersNeeded: ['ydivisi','yrayon','yestate'],
    actualsNeeded: [] // rekap header PDO saja
  });
  if (!ok) {
    root.innerHTML = `<div class="alert alert-warning">Menunggu Tarik Master & Data Aktual...</div>`;
    return;
  }

  // -------------------------------------------------------------
  // 1) KONST & CACHE KEYS
  // -------------------------------------------------------------
  const ACT_KEY_HEADER = 'kpl.actual.ktu_rekap_pdo';     // cache header rekap (array rows)
  const ACT_KEY_DETAIL = 'kpl.cache.pdo_detail.map';     // cache detail per nomor (map)

  // -------------------------------------------------------------
  // 2) MASTERS
  // -------------------------------------------------------------
  const M = {
    ydivisi: STORE.getMaster('ydivisi') || [],
    yrayon:  STORE.getMaster('yrayon')  || [],
    yestate: STORE.getMaster('yestate') || []
  };

  // === Ambil scope estate user dari profile ===
function getUserEstateScope(){
  const prof = SESSION.profile() || {};
  const rawRole = String(prof.role||'').trim().toLowerCase();

  // Kumpulan id estate yang diizinkan
  const allow = new Set();

  // 1) Sumber langsung yang umum dipakai backend
  //    - estate_id: string tunggal
  //    - estate_ids / estates: array id
  const directOne  = prof.estate_id || prof.estate || prof.est || '';
  const directMany = prof.estate_ids || prof.estates || [];

  if (directOne) allow.add(String(directOne));
  if (Array.isArray(directMany)) directMany.forEach(x => x && allow.add(String(x)));

  // 2) Beberapa profil menyimpan daftar DIVISI user → turunkan estate_id via master
  const divs = prof.divisi_ids || prof.divisis || prof.divisions || [];
  if (Array.isArray(divs) && divs.length){
    divs.forEach(did=>{
      const hit = (M.ydivisi||[]).find(dd => String(dd.id)===String(did));
      if (hit && hit.estate_id) allow.add(String(hit.estate_id));
    });
  }

  // 3) Ada juga yang hanya menyimpan "estate_nama" → mapping ke id
  if (prof.estate_nama){
    const hit = (M.yestate||[]).find(e=>{
      const a = String(e.nama_panjang||'').trim().toLowerCase();
      const b = String(e.nama||'').trim().toLowerCase();
      const t = String(prof.estate_nama||'').trim().toLowerCase();
      return t===a || t===b;
    });
    if (hit) allow.add(String(hit.id));
  }

  // Catatan: untuk role non-KTU biarkan kosong (artinya bebas, pakai filter UI).
  // Untuk KTU, bila kosong, kita tidak paksa (fallback ke UI).
  return { role: rawRole, estateIds: Array.from(allow) };
}

// === [BARU] Terapkan scope estate user ke headers (khusus KTU)
function applyUserEstateScope(rows){
  const { role, estateIds } = getUserEstateScope();
  if (role !== 'ktu') return rows;        // hanya KTU yang di-hard-scope
  if (!estateIds.length) return rows;     // tak ada info scope → biarkan

  const allowed = new Set(estateIds.map(String));
  return (rows||[]).filter(r=>{
    // r.estate_id sudah dinormalisasi di normalizeHeaders()
    return r.estate_id && allowed.has(String(r.estate_id));
  });
}

  // -------------------------------------------------------------
  // 3) UTIL (formatting & helpers)
  // -------------------------------------------------------------
  const lc = (v)=> (v==null ? '' : String(v).trim().toLowerCase());

  const fmt = {
    idr: (n)=> (U.fmt && typeof U.fmt.idr === 'function') ? U.fmt.idr(n) : Number(n||0).toLocaleString('id-ID'),
    id0: (n)=> (U.fmt && typeof U.fmt.id0 === 'function') ? U.fmt.id0(n) : Number(n||0).toLocaleString('id-ID'),
    periodeYM: (p)=>{
      if(!p) return '';
      const s = String(p).trim();
      if(/^\d{4}-\d{2}$/.test(s)) return s;
      const d = new Date(s); if(isNaN(d)) return s;
      const y = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', year:'numeric'}).format(d);
      const m = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', month:'2-digit'}).format(d);
      return `${y}-${m}`;
    },
    nextMonthYM: ()=>{
      const tz='Asia/Jakarta';
      const now = new Date();
      const y = Number(new Intl.DateTimeFormat('id-ID',{timeZone:tz, year:'numeric'}).format(now));
      const m = Number(new Intl.DateTimeFormat('id-ID',{timeZone:tz, month:'2-digit'}).format(now));
      const ny = m===12 ? y+1 : y;
      const nm = m===12 ? 1 : (m+1);
      return `${ny}-${String(nm).padStart(2,'0')}`;
    }
  };

  // ---- Status normalizer (sesuai permintaan)
  function normalizeStatus(raw) {
    if (!raw) return 'UNKNOWN';
    let s = String(raw).trim().toLowerCase();
    if (s.startsWith('draft ')) s = 'draft';
    switch (s) {
      case 'draft':            return 'DRAFT';
      case 'submitted':        return 'SUBMITTED';
      case 'askep_approved':   return 'ASKEP_APPROVED';
      case 'partial_approved': return 'PARTIAL_APPROVED';
      case 'full_approved':    return 'FULL_APPROVED';
      case 'rejected':         return 'REJECTED';
      default:                 return 'UNKNOWN';
    }
  }


  // === Normalisasi header divisi ===
function normalizeHeaders(arr){
  // helper: cari estate by "nama panjang"/"nama"
  const findEstateIdByName = (namaLike)=>{
    const n = String(namaLike||'').trim().toLowerCase();
    if(!n) return '';
    const hit = (M.yestate||[]).find(e=>{
      const a = String(e.nama_panjang||'').trim().toLowerCase();
      const b = String(e.nama||'').trim().toLowerCase();
      return n===a || n===b;
    });
    return hit ? String(hit.id) : '';
  };
  // helper: turunkan estate dari divisi (bila master ydivisi punya estate_id)
  const findEstateIdByDivisi = (divAny)=>{
    const v = String(divAny||'').trim().toLowerCase();
    if(!v) return '';
    const hit = (M.ydivisi||[]).find(d=>{
      const id   = String(d.id||'').trim().toLowerCase();
      const kode = String(d.kode||d.kd_divisi||'').trim().toLowerCase();
      const nama = String(d.nama||'').trim().toLowerCase();
      return v===id || v===kode || v===nama;
    });
    return hit && hit.estate_id ? String(hit.estate_id) : '';
  };

  return (arr||[]).map(r=>{
    const divKeyRaw = r.divisi_id || r.divisi || r.div || '';
    // estate_id prioritas: langsung dari server → dari divisi → dari nama estate
    const estate_id =
      (r.estate_id ? String(r.estate_id) : '') ||
      findEstateIdByDivisi(divKeyRaw) ||
      findEstateIdByName(r.estate_nama);

    return {
      nomor       : r.nomor,
      periode     : fmt.periodeYM(r.periode),
      divisi_id   : divKeyRaw,                // biarkan fleksibel (id/kode/nama)
      rayon_kode  : r.rayon_kode || '',
      estate_nama : r.estate_nama || '',
      estate_id   : estate_id || '',          // <-- kini tersedia & konsisten
      total_rp    : Number(r.total_rp||0),
      status      : normalizeStatus(r.status || r.raw_status || r.state)
    };
  });
}

// === [DROP-IN PATCH] Helper label divisi yang robust (id/kode/nama) ===
function labelDivisiFromAny(val){
  const v = String(val||'').trim();
  if(!v) return '-';
  const vLc = lc(v);
  const found = (M.ydivisi||[]).find(d=>{
    const idMatch   = String(d.id||'') === v;
    const kodeMatch = lc(d.kode ?? d.kd_divisi ?? '') === vLc;
    const namaMatch = lc(d.nama||'') === vLc;
    return idMatch || kodeMatch || namaMatch;
  });
  return found ? (found.nama || found.kode || found.id || '-') : (v || '-');
}

// Kompatibilitas: biarkan pemanggilan lama tetap jalan.
function labelDivisiFromKode(kode){ return labelDivisiFromAny(kode); }

// === [DROP-IN PATCH] Filter Divisi: cocokkan ke id/kode/nama (dua arah) ===
function passDivisi(row){
  if(!filters.divisi_id) return true;

  // Ambil baris master untuk divisi yang dipilih user (berdasarkan ID value dropdown)
  const d = (M.ydivisi||[]).find(e => String(e.id)===String(filters.divisi_id));
  if(!d) return true;

  // Kumpulan kandidat nilai dari master (yang mungkin muncul di data header)
  const cand = new Set([
    lc(d.id),
    lc(d.kode ?? d.kd_divisi ?? ''),
    lc(d.nama||'')
  ].filter(Boolean));

  // Nilai divisi yang datang dari header (bisa id/kode/nama)
  const rowVal = lc(row.divisi_id || row.divisi || row.div || '');

  // Lolos jika cocok salah satu
  return cand.has(rowVal);
}

  // ---- Master lookups
  const estateRowById = (id)=> (M.yestate||[]).find(e => String(e.id)===String(id)) || {};
  const rayonRowById  = (id)=> (M.yrayon||[]).find (e => String(e.id)===String(id)) || {};
  const divisiRowById = (id)=> (M.ydivisi||[]).find(e => String(e.id)===String(id)) || {};
  function divisiRowByKode(kode){
    const k = lc(kode);
    return (M.ydivisi||[]).find(d => lc(d.kode ?? d.kd_divisi ?? '') === k) || {};
  }
  function labelRayonFromKode(kode){
    const k = lc(kode);
    const r = (M.yrayon||[]).find(x=> lc(x.kode ?? x.kd_rayon ?? x.kode_rayon ?? '')===k);
    return r ? (r.nama || r.kode || r.kd_rayon || '-') : (kode || '-');
  }

  // ---- Signers (fallback aman)
  function signerFromMasters({ estate_id, rayon_id, divisi_id }){
    const est = estateRowById(estate_id);
    const ray = rayonRowById(rayon_id);
    const div = divisiRowById(divisi_id);
    const pick = (row, ...keys)=> {
      for(const k of keys){
        if(row && row[k]!=null && String(row[k]).trim()!=='') return String(row[k]);
      }
      return '';
    };
    return {
      company: pick(est, 'plant_nama','company_name','nama_company','plant_name','plant') || 'BUANA TUNAS SEJAHTERA',
      estateFull: pick(est, 'nama_panjang','nama','estate_nama','nama_estate'),
      manager: pick(est, 'manager','manager_nama','nama_mgr'),
      ktu:     pick(est, 'ktu','ktu_nama','nama_ktu'),
      askep:   pick(ray, 'askep','askep_nama','nama_askep'),
      asisten: pick(div, 'nama_asisten','asisten','asisten_nama','nama_ast','pic')
    };
  }
  const sigCell = (role, name='', ts='')=>{
    const t = ts ? `<div class="muted">TTD: ${ts}</div>` : `<div class="muted">&nbsp;</div>`;
    return `
      <td style="width:25%; text-align:center; vertical-align:bottom; height:90px">
        <div style="margin-bottom:48px">&nbsp;</div>
        <div style="font-weight:600; text-transform:uppercase">${role||'&nbsp;'}</div>
        <div style="border-top:1px solid #000; margin-top:36px; padding-top:6px">${name||'Nama Jelas & Ttd'}</div>
        ${t}
      </td>`;
  };
  const tableRow = (k, v)=> `<tr><th style="width:28%; text-align:left">${k}</th><td>${v||'-'}</td></tr>`;

  // -------------------------------------------------------------
  // 4) STATE
  // -------------------------------------------------------------
  let headers = [];  // data rekap (header ringkas)
  let filters = {
    periode : fmt.nextMonthYM(), // default bulan depan
    status   : '',
    estate_id: '',
    rayon_id : '',
    divisi_id: ''
  };
  const STATUS_OPTIONS = [
    'DRAFT','SUBMITTED','ASKEP_APPROVED','PARTIAL_APPROVED','FULL_APPROVED','REJECTED','UNKNOWN'
  ];

  // -------------------------------------------------------------
  // 5) CACHE GET/SET
  // -------------------------------------------------------------
  const getHeaderCache = ()=> U.S.get(ACT_KEY_HEADER, []) || [];
  const setHeaderCache = (rows)=> U.S.set(ACT_KEY_HEADER, rows||[]);

  function _getDetailMap(){ return U.S.get(ACT_KEY_DETAIL, {}) || {}; }
  function _setDetailMap(map){ try{ U.S.set(ACT_KEY_DETAIL, map||{}); }catch(e){} }
  const DETAIL_TTL = 3 * 24 * 60 * 60 * 1000; // 3 hari

  function getDetailFromCache(nomor){
    const map = _getDetailMap();
    const rec = map && map[String(nomor)];
    if(!rec) return null;
    if(DETAIL_TTL > 0 && Date.now() - Number(rec.ts||0) > DETAIL_TTL) return null;
    return rec;
  }
  function setDetailToCache(nomor, header, items){
    const map = _getDetailMap();
    map[String(nomor)] = { header: header||{}, items: items||[], ts: Date.now() };
    _setDetailMap(map);
  }
  function clearDetailCache(nomor){
    if(!nomor){ _setDetailMap({}); return; }
    const map = _getDetailMap(); delete map[String(nomor)]; _setDetailMap(map);
  }

  // -------------------------------------------------------------
  // 6) LOADERS
  // -------------------------------------------------------------
    async function loadHeaders(preferLocal=true){
      let openedHere = false;
      try{
        let data = [];
        if (preferLocal) {
          const cached = getHeaderCache();
          if (Array.isArray(cached) && cached.length) data = cached;
        }
        if (!data.length) {
          const pm = document.getElementById('progressModal');
          const pmShown = pm && pm.classList.contains('show');
          if(!pmShown){ U.progressOpen('Menyiapkan rekap PDO...'); U.progress(30,'Ambil data (server)'); openedHere = true; }
          const r = await API.call('ktuRekapPDO', {}); // server: semua estate
          if(!r.ok) throw new Error(r.error||'Gagal ambil data');
          data = r.rows || [];
          setHeaderCache(data);
        }

        // 1) Normalisasi struktur baris
        let norm = normalizeHeaders(data);

        // 2) Terapkan SCOPE estate user (khusus KTU)
        norm = applyUserEstateScope(norm);

        // 3) Set ke memori modul
        headers = norm;

        // 4) Set default filter Estate = estate user pertama (jika kosong)
        if (!filters.estate_id){
          const { role, estateIds } = getUserEstateScope();
          if (role==='ktu' && estateIds && estateIds.length){
            filters.estate_id = String(estateIds[0]);
          }
        }

        render(); // build UI + drawTable()
      }catch(e){
        root.innerHTML = `<div class="alert alert-danger">Gagal memuat rekap PDO: ${e.message||e}</div>`;
      }finally{
        if(openedHere){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 350); }
      }
    }

  // Ambil detail untuk daftar nomor (cache-first, server fallback per nomor)
  async function fetchDetailsForPrint(list){
    const out = [];
    const needFetch = [];
    const cachedPart = {};

    for(const it of (list||[])){
      const nomor = String(it.nomor);
      const rec = getDetailFromCache(nomor);
      if(rec){ cachedPart[nomor] = rec; }
      else   { needFetch.push(nomor); }
    }

    let opened = false;
    try{
      if(needFetch.length){
        const pm = document.getElementById('progressModal');
        const pmShown = pm && pm.classList.contains('show');
        if(!pmShown){ U.progressOpen('Menyiapkan detail PDO...'); opened = true; }
      }

      for(let i=0;i<needFetch.length;i++){
        const nomor = needFetch[i];
        U.progress(20 + Math.round((i/Math.max(1,needFetch.length))*70), `Ambil ${nomor} (${i+1}/${needFetch.length})`);
        const r = await API.call('getPdoDetail', { nomor });
        if(r && r.ok){
          setDetailToCache(nomor, r.header||{}, r.items||[]);
          cachedPart[nomor] = { header:r.header||{}, items:r.items||[], ts: Date.now() };
        }else{
          setDetailToCache(nomor, { nomor, error:true }, []);
          cachedPart[nomor] = { header:{ nomor, error:true }, items:[], ts: Date.now() };
        }
      }
    } finally {
      if(opened){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250); }
    }

    for(const it of (list||[])){
      const nomor = String(it.nomor);
      const rec = cachedPart[nomor];
      if(rec) out.push({ header: rec.header||{}, items: rec.items||[] });
      else    out.push({ header:{ nomor, error:true }, items:[] });
    }
    return out;
  }

  // -------------------------------------------------------------
  // 7) FILTER LOGIC
  // -------------------------------------------------------------
  function passEstate(row){
    if(!filters.estate_id) return true;

    // Prioritas pakai estate_id (hasil normalisasi header)
    if (row.estate_id) {
      return String(row.estate_id) === String(filters.estate_id);
    }

    // Fallback lama: cocokkan berdasarkan nama estate
    const est = (M.yestate||[]).find(e=> String(e.id)===String(filters.estate_id));
    if(!est) return true;
    const target = lc(est.nama_panjang || est.nama || '');
    return lc(row.estate_nama) === target;
  }

  function passRayon(row){
    if(!filters.rayon_id) return true;
    const r = (M.yrayon||[]).find(e=> String(e.id)===String(filters.rayon_id));
    if(!r) return true;
    const kode = lc(r.kode ?? r.kd_rayon ?? r.kode_rayon ?? '');
    return lc(row.rayon_kode) === kode;
  }
  function passPeriode(row){
    if(!filters.periode) return true;
    return String(row.periode) === String(filters.periode);
  }
  function passStatus(row){
    if(!filters.status) return true; // '' = semua
    return String(row.status) === String(filters.status);
  }
  function filtered(){
    // urutkan di akhir untuk tampilan rapi (opsional: by nomor asc)
    return headers
      .filter(r => passPeriode(r) && passEstate(r) && passRayon(r) && passDivisi(r) && passStatus(r))
      .sort((a,b)=> String(a.nomor).localeCompare(String(b.nomor)));
  }

  // -------------------------------------------------------------
  // 8) EXPORT & PRINT (memakai data TERFILTER)
  // -------------------------------------------------------------
  function exportXlsx(){
    const data = filtered();
    if(!data.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }
    if(typeof Exporter==='undefined' || !Exporter.exportRekapPDOXlsx){
      U.alert('Exporter.exportRekapPDOXlsx belum tersedia (muat js/pages/pdo/exporter.pdo.js).');
      return;
    }
    // Data sudah termasuk kolom status (Exporter boleh abaikan kolom tak dikenal)
    Exporter.exportRekapPDOXlsx(data);
  }

  async function printPdf(){
    const data = filtered();
    if(!data.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

    // Ambil detail untuk halaman 2++
    const details = await fetchDetailsForPrint(data);

    // REKAP (halaman-1) — kolom STATUS setelah No. PDO
    const grand = data.reduce((a,b)=> a + Number(b.total_rp||0), 0);
    const rowsRekap = data.map(r=>{
      return `<tr>
        <td style="white-space:nowrap">${r.nomor||'-'}</td>
        <td>${r.status||'-'}</td>
        <td>${r.periode||'-'}</td>
        <td>${labelDivisiFromKode(r.divisi_id)}</td>
        <td>${labelRayonFromKode(r.rayon_kode)}</td>
        <td>${r.estate_nama||'-'}</td>
        <td class="t-right">${fmt.idr(r.total_rp||0)}</td>
      </tr>`;
    }).join('');

    // Signer ambil dari detail pertama yang tampil
    let signerHead = { manager:'', ktu:'' };
    if(details[0] && details[0].header){
      const h0 = details[0].header;
      signerHead = signerFromMasters({
        estate_id: h0.estate_id, rayon_id: h0.rayon_id, divisi_id: h0.divisi_id
      });
    }

    const pageRekap = `
      <h2 style="margin:0 0 6px">REKAP PDO</h2>
      <div class="muted">
        <p style="margin:4px 0"><b>Periode:</b> ${filters.periode || 'Semua'}</p>
        <p style="margin:4px 0"><b>Estate:</b> ${(M.yestate.find(e=> String(e.id)==filters.estate_id)?.nama_panjang || 'Semua')}</p>
        <p style="margin:4px 0"><b>Rayon:</b> ${(M.yrayon.find(e=> String(e.id)==filters.rayon_id)?.nama || 'Semua')}</p>
        <p style="margin:4px 0"><b>Divisi:</b> ${(M.ydivisi.find(e=> String(e.id)==filters.divisi_id)?.nama || 'Semua')}</p>
        <p style="margin:4px 0"><b>Status:</b> ${filters.status || 'Semua'}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th>No. PDO</th><th>Status</th><th>Periode</th><th>Divisi</th><th>Rayon</th><th>Estate</th><th class="t-right">Total PDO (Rp)</th>
          </tr>
        </thead>
        <tbody>${rowsRekap || `<tr><td colspan="7" class="muted">Tidak ada data.</td></tr>`}</tbody>
        <tfoot><tr><th colspan="6" class="t-right">TOTAL</th><th class="t-right">${fmt.idr(grand)}</th></tr></tfoot>
      </table>

      <table style="margin-top:18px"><tr>
        ${sigCell('KTU', signerHead.ktu || '')}
        ${sigCell('MANAGER', signerHead.manager || '')}
        ${sigCell('', '')}
        ${sigCell('', '')}
      </tr></table>
    `;

    // DETAIL PDO (halaman-2++)
    const detailPages = details.map((dobj, idx)=>{
      const h  = dobj.header || {};
      const it = dobj.items  || [];

      const estRow = estateRowById(h.estate_id);
      const signer = signerFromMasters({
        estate_id: h.estate_id, rayon_id: h.rayon_id, divisi_id: h.divisi_id
      });

      const company   = (signer.company ? `PT. ${String(signer.company).toUpperCase()}` : 'PT. BUANA TUNAS SEJAHTERA');
      const estateFull= signer.estateFull || estRow.nama_panjang || estRow.nama || '';

      const HK  = it.filter(x=> String(x.tipe_item)==='HK');
      const BOR = it.filter(x=> String(x.tipe_item)==='BOR');

      const totalHK    = HK.reduce((a,b)=> a+Number(b.total_rp||0),0);
      const totalBor   = BOR.reduce((a,b)=> a+Number(b.total_rp||0),0);
      const totalPremi = Number(h.premi_panen||0) + Number(h.premi_non_panen||0);
      const totalPDO   = totalHK + totalBor + totalPremi;

      const rowsHK = HK.map(row=>`
        <tr>
          <td>${row.activity_type||''}</td>
          <td>${row.pekerjaan||''}</td>
          <td class="t-right">${fmt.id0(row.luas_ha||0)}</td>
          <td class="t-right">${fmt.id0(row.hk||0)}</td>
          <td class="t-right">${fmt.idr(row.total_rp||0)}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">Tidak ada pekerjaan HK.</td></tr>`;

      const rowsBOR = BOR.map(row=>`
        <tr>
          <td>${row.activity_type||''}</td>
          <td>${row.pekerjaan||''}</td>
          <td class="t-right">${fmt.id0(row.qty||0)}</td>
          <td class="t-right">${fmt.idr(row.tarif_borongan||0)}</td>
          <td class="t-right">${fmt.idr(row.total_rp||0)}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">Tidak ada pekerjaan borongan.</td></tr>`;

      const headerBox = `
        <table style="border:none; margin-top:6px"><tr>
          <td style="border:none; padding:0; width:70%">
            <div style="font-weight:800; font-size:16px">${company}</div>
            <div style="font-weight:600; font-size:14px">${estateFull||''}</div>
            <div style="height:6px"></div>
            <div style="font-size:14px; font-weight:700; text-transform:uppercase">PERMINTAAN DANA OPERASIONAL</div>
          </td>
          <td style="border:none; padding:0; width:30%; vertical-align:top">
            <table>
              <thead><tr><th>Disetujui</th><th>Diperiksa</th><th>Dibuat</th></tr></thead>
              <tbody>
                <tr>
                  <td style="text-align:center; height:70px; vertical-align:bottom">
                    <div style="font-weight:600">${signer.manager||''}</div>
                    <div class="muted">TTD: ${h.manager_ts||''}</div>
                    <div style="font-weight:700; border-top:1px solid #000; margin-top:6px">MANAGER</div>
                  </td>
                  <td style="text-align:center; vertical-align:bottom">
                    <div style="font-weight:600">${signer.askep||''}</div>
                    <div class="muted">TTD: ${h.askep_ts||''}</div>
                    <div style="font-weight:700; border-top:1px solid #000; margin-top:6px">ASKEP</div>
                  </td>
                  <td style="text-align:center; vertical-align:bottom">
                    <div style="font-weight:600">${signer.asisten||''}</div>
                    <div class="muted">TTD: ${h.asst_ts||h.created_ts||''}</div>
                    <div style="font-weight:700; border-top:1px solid #000; margin-top:6px">ASISTEN</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr></table>
      `;

      const infoTable = `
        <table>
          <tbody>
            ${tableRow('Periode', fmt.periodeYM(h.periode))}
            ${tableRow('Divisi',  labelDivisiFromKode(h.divisi_id))}
            ${tableRow('No. PDO', h.nomor)}
            ${tableRow('Status',  normalizeStatus(h.status||h.raw_status||h.state))}
            ${tableRow('Ref. RKB', h.ref_rkb||'')}
            ${tableRow('Upah HK SKU', `${fmt.idr(h.upah_hk_sku||0)}`)}
            ${tableRow('Upah HK BHL', `${fmt.idr(h.upah_hk_bhl||0)}`)}
            ${tableRow('Target Produksi', `${fmt.id0(h.target_produksi_ton||0)} Ton`)}
          </tbody>
        </table>
      `;

      const premiRow = `
        <div style="margin:8px 0">
          <span>Premi Panen : <b>Rp ${fmt.idr(h.premi_panen||0)}</b></span>
          <span style="margin-left:24px">Premi Non Panen : <b>Rp ${fmt.idr(h.premi_non_panen||0)}</b></span>
        </div>
      `;

      const tblHK = `<br/>
        <h4 style="margin:10px 0 6px">RINCIAN PEKERJAAN</h4>
        <div style="font-weight:700; margin:6px 0 4px">PEKERJAAN HK</div>
        <table>
          <thead><tr>
            <th>ACTIVITY TYPE</th><th>JENIS PEKERJAAN</th><th class="t-right">LUAS (HA)</th><th class="t-right">JLH HK</th><th class="t-right">TOTAL (RP)</th>
          </tr></thead>
          <tbody>${rowsHK}</tbody>
          <tfoot><tr><th colspan="4" class="t-right">TOTAL</th><th class="t-right">Rp ${fmt.idr(totalHK)}</th></tr></tfoot>
        </table>
      `;
      const tblBOR = `
        <div style="font-weight:700; margin:12px 0 4px">PEKERJAAN BORONGAN</div>
        <table>
          <thead><tr>
            <th>ACTIVITY TYPE</th><th>JENIS PEKERJAAN</th><th class="t-right">QTY</th><th class="t-right">HARGA (RP)</th><th class="t-right">TOTAL (RP)</th>
          </tr></thead>
          <tbody>${rowsBOR}</tbody>
          <tfoot><tr><th colspan="4" class="t-right">TOTAL</th><th class="t-right">Rp ${fmt.idr(totalBor)}</th></tr></tfoot>
        </table>
        <div style="margin:8px 0">
          <span>TOTAL PDO: <b>Rp ${fmt.idr(totalPDO)}</b></span>
        </div>
      `;

      return `
        <div class="page-break"></div>
        ${headerBox}
        ${infoTable}
        ${premiRow}
        ${tblHK}
        ${tblBOR}
      `;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Rekap & Detail PDO</title>
<style>
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding:16px; }
  h2,h3,h4{ margin:8px 0; }
  table{ width:100%; border-collapse:collapse; margin-top:8px; }
  th,td{ border:1px solid #999; padding:6px 8px; font-size:12px; vertical-align:middle; }
  th{ background:#f2f2f2; }
  .t-right{ text-align:right; }
  .muted{ color:#666; font-size:12px; }
  .page-break{ page-break-before: always; }
  @page{ size:A4; margin:12mm; }
</style>
</head><body>
  ${pageRekap}
  ${detailPages}
  <script>window.print();</script>
</body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  }

  // -------------------------------------------------------------
  // 9) UI RENDER
  // -------------------------------------------------------------
  function render(){
    // Kumpulkan daftar periode untuk dropdown
    const setPer = new Set(headers.map(r=> r.periode));
    if(filters.periode) setPer.add(filters.periode);
    const periodes = Array.from(setPer).filter(Boolean).sort().reverse();

    // CSS kecil: status pill + table vibes
    if(!document.getElementById('ktu-rekap-pdo-css')){
      const s = document.createElement('style');
      s.id = 'ktu-rekap-pdo-css';
      s.textContent = `
        .table tfoot th { background:#f8f9fa; font-weight:700; }
        .table thead th { white-space:nowrap; }
        .table-hover tbody tr:hover { background:#fafbfd; }
        .status-pill{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:.75rem; font-weight:600; }
        .st-DRAFT{            background:#fff3cd; color:#856404; }
        .st-SUBMITTED{        background:#cfe2ff; color:#084298; }
        .st-ASKEP_APPROVED{   background:#e2e3e5; color:#41464b; }
        .st-PARTIAL_APPROVED{ background:#fde2cf; color:#7a3e00; }
        .st-FULL_APPROVED{    background:#d1e7dd; color:#0f5132; }
        .st-REJECTED{         background:#f8d7da; color:#842029; }
        .st-UNKNOWN{          background:#e9ecef; color:#495057; }
      `;
      document.head.appendChild(s);
    }

    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">Rekap PDO – KTU</h4>
          <div class="d-flex flex-wrap gap-2">
            <button id="btn-reload"  class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
            <button id="btn-xlsx"    class="btn btn-sm btn-success">Export Excel</button>
            <button id="btn-pdf"     class="btn btn-sm btn-dark">Cetak PDF</button>
            <button id="btn-details" class="btn btn-sm btn-outline-primary">Tampilkan Detail di Bawah</button>
          </div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-sm-2">
            <label class="form-label">Periode (YYYY-MM)</label>
            <select id="f-periode" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${periodes.map(p=>`<option value="${p}" ${filters.periode===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-2">
            <label class="form-label">Status</label>
            <select id="f-status" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${STATUS_OPTIONS.map(s=> `<option value="${s}" ${filters.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="col-sm-2">
            <label class="form-label">Estate</label>
            <select id="f-estate" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${(M.yestate||[]).map(e=>{
                const label = e.nama_panjang || e.nama || e.id;
                return `<option value="${e.id}" ${String(filters.estate_id)===String(e.id)?'selected':''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="col-sm-2">
            <label class="form-label">Rayon</label>
            <select id="f-rayon" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${(M.yrayon||[]).map(r=>{
                const label = r.nama || r.kode || r.kd_rayon || r.id;
                return `<option value="${r.id}" ${String(filters.rayon_id)===String(r.id)?'selected':''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="col-sm-2">
            <label class="form-label">Divisi</label>
            <select id="f-divisi" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${(M.ydivisi||[]).map(d=>{
                const label = d.nama || d.kode || d.id;
                return `<option value="${d.id}" ${String(filters.divisi_id)===String(d.id)?'selected':''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-bordered table-hover align-middle">
            <thead class="table-light">
              <tr>
                <th>No. PDO</th>
                <th>Status</th>
                <th>Periode</th>
                <th>Divisi</th>
                <th>Rayon</th>
                <th>Estate</th>
                <th class="text-end">Total PDO (Rp)</th>
              </tr>
            </thead>
            <tbody id="ktu-rows"></tbody>
            <tfoot>
              <tr>
                <th colspan="6" class="text-end">TOTAL (yang ditampilkan)</th>
                <th class="text-end" id="ktu-total">0</th>
              </tr>
            </tfoot>
          </table>
        </div>

        <div id="pdo-details-holder" class="mt-3"></div>
      </div></div>
    `;

    // Bind tombol
    U.qs('#btn-reload').onclick = ()=>{
      U.S.set(ACT_KEY_HEADER, []); // bersihkan cache header
      clearDetailCache();          // bersihkan cache detail
      loadHeaders(false);          // paksa ambil server
    };
    U.qs('#btn-xlsx').onclick  = exportXlsx;
    U.qs('#btn-pdf').onclick   = printPdf;

    // Bind filter
    U.qs('#f-periode').onchange = (e)=>{ filters.periode   = e.target.value; drawTable(); };
    U.qs('#f-estate').onchange  = (e)=>{ filters.estate_id = e.target.value; drawTable(); };
    U.qs('#f-rayon').onchange   = (e)=>{ filters.rayon_id  = e.target.value; drawTable(); };
    U.qs('#f-divisi').onchange  = (e)=>{ filters.divisi_id = e.target.value; drawTable(); };
    U.qs('#f-status').onchange  = (e)=>{ filters.status    = e.target.value; drawTable(); };

    // Tampilkan detail di bawah rekap
    U.qs('#btn-details').onclick = async ()=>{
      const data = filtered();
      if(!data.length){ U.toast('Tidak ada data ditampilkan.','warning'); return; }
      const details = await fetchDetailsForPrint(data);
      const holder = U.qs('#pdo-details-holder');
      holder.innerHTML = details.map((d)=>{
        const hdr = d.header||{};
        const items = d.items||[];
        const HK  = items.filter(x=> String(x.tipe_item)==='HK');
        const BOR = items.filter(x=> String(x.tipe_item)==='BOR');

        // === Hitung total per bagian ===
        const totalHK  = HK.reduce((a,r)=> a + Number(r.total_rp||0), 0);
        const totalBOR = BOR.reduce((a,r)=> a + Number(r.total_rp||0), 0);

        // premi opsional dari header (0 jika tidak ada)
        const premiPanen = Number(hdr.premi_panen||0);
        const premiNon   = Number(hdr.premi_non_panen||0);

        // Total PDO: pakai header.total_rp jika ada, else hitung dari items + premi
        const totalPDO = (Number(hdr.total_rp||0) > 0)
          ? Number(hdr.total_rp||0)
          : (totalHK + totalBOR + premiPanen + premiNon);

        const rowsHK = HK.map((row,i)=>`
          <tr>
            <td>${i+1}</td>
            <td>${row.pekerjaan||''}</td>
            <td class="text-end">${fmt.id0(row.hk||0)}</td>
            <td class="text-end">${fmt.idr(row.total_rp||0)}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="text-center text-muted">Tidak ada pekerjaan HK.</td></tr>`;

        const rowsBOR = BOR.map((row,i)=>`
          <tr>
            <td>${i+1}</td>
            <td>${row.pekerjaan||''}</td>
            <td class="text-end">${fmt.id0(row.qty||0)}</td>
            <td class="text-end">${fmt.idr(row.total_rp||0)}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="text-center text-muted">Tidak ada pekerjaan borongan.</td></tr>`;

        const st = normalizeStatus(hdr.status||hdr.raw_status||hdr.state);
        return `
          <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
              <div>
                <b>${hdr.nomor||'-'}</b> · ${fmt.periodeYM(hdr.periode)||'-'} ·
                ${labelDivisiFromKode(hdr.divisi_id)||'-'} · ${(estateRowById(hdr.estate_id).nama_panjang||'')}
              </div>
              <div class="d-flex align-items-center gap-3">
                <div class="fw-semibold">Total PDO: ${fmt.idr(totalPDO)}</div>
                <span class="status-pill st-${st}">${st}</span>
              </div>
            </div>
            <div class="card-body p-2">
              <div class="row g-2">
                <div class="col-md-6">
                  <h6 class="mb-1">Pekerjaan HK</h6>
                  <div class="table-responsive">
                    <table class="table table-sm table-bordered align-middle">
                      <thead class="table-light">
                        <tr><th>#</th><th>Jenis</th><th class="text-end">HK</th><th class="text-end">Total (Rp)</th></tr>
                      </thead>
                      <tbody>${rowsHK}</tbody>
                      <tfoot>
                        <tr>
                          <th colspan="3" class="text-end">Total</th>
                          <th class="text-end">${fmt.idr(totalHK)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <div class="col-md-6">
                  <h6 class="mb-1">Pekerjaan Borongan</h6>
                  <div class="table-responsive">
                    <table class="table table-sm table-bordered align-middle">
                      <thead class="table-light">
                        <tr><th>#</th><th>Jenis</th><th class="text-end">Qty</th><th class="text-end">Total (Rp)</th></tr>
                      </thead>
                      <tbody>${rowsBOR}</tbody>
                      <tfoot>
                        <tr>
                          <th colspan="3" class="text-end">Total</th>
                          <th class="text-end">${fmt.idr(totalBOR)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              ${
                (premiPanen || premiNon)
                  ? `<div class="mt-2 small text-muted">
                      Premi Panen: ${fmt.idr(premiPanen)} · Premi Non-Panen: ${fmt.idr(premiNon)}
                    </div>`
                  : ''
              }
            </div>
          </div>`;
      }).join('');
      U.toast('Detail dimuat.','success');
    };


    // Gambar tabel awal
    drawTable();
  }

  // -------------------------------------------------------------
  // 10) DRAW TABLE (pakai data terfilter)
  // -------------------------------------------------------------
  function drawTable(){
    const data = filtered();
    const tb = U.qs('#ktu-rows');
    if(!data.length){
      tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Tidak ada data.</td></tr>`;
      U.qs('#ktu-total').textContent = fmt.idr(0);
      return;
    }
    tb.innerHTML = data.map(r=>{
      const st = r.status || 'UNKNOWN';
      return `
        <tr>
          <td style="white-space:nowrap">${r.nomor||'-'}</td>
          <td><span class="status-pill st-${st}">${st}</span></td>
          <td>${r.periode||'-'}</td>
          <td>${labelDivisiFromKode(r.divisi_id)}</td>
          <td>${labelRayonFromKode(r.rayon_kode)}</td>
          <td>${r.estate_nama||'-'}</td>
          <td class="text-end">${fmt.idr(r.total_rp||0)}</td>
        </tr>`;
    }).join('');

    const tot = data.reduce((a,b)=> a + Number(b.total_rp||0), 0);
    U.qs('#ktu-total').textContent = fmt.idr(tot);
  }

  // -------------------------------------------------------------
  // 11) START
  // -------------------------------------------------------------
  loadHeaders(true);
};

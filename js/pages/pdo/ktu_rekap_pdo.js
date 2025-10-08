// js/pages/pdo/ktu_rekap_pdo.js
window.Pages = window.Pages || {};
Pages.ktuRekapPDO = async function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash = '#/login'; return; }

  // ===== [GUARD: WAJIB DATA HANGAT] =====
  const ok = await U.requireWarmOrRedirect({
    mastersNeeded: ['ydivisi','yrayon','yestate'],
    actualsNeeded: [] // rekap PDO pakai header PDO + masters
  });
  if(!ok){
    root.innerHTML = `<div class="alert alert-warning">Menunggu Tarik Master & Data Aktual...</div>`;
    return;
  }

  // ===== Cache lokal =====
  const ACT_KEY = 'kpl.actual.ktu_rekap_pdo';
  const getCache = ()=> U.S.get(ACT_KEY, []) || [];
  const setCache = (rows)=> U.S.set(ACT_KEY, rows||[]);

  // ===== Masters =====
  const M = {
    ydivisi: STORE.getMaster('ydivisi') || [],
    yrayon:  STORE.getMaster('yrayon')  || [],
    yestate: STORE.getMaster('yestate') || []
  };

  // ===== Helpers =====
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

  // ==== Ambil label dari master (fleksibel ke berbagai skema kolom) ====
  function estateRowById(id){
    return (M.yestate||[]).find(e => String(e.id)===String(id)) || {};
  }
  function rayonRowById(id){
    return (M.yrayon||[]).find(e => String(e.id)===String(id)) || {};
  }
  function divisiRowById(id){
    return (M.ydivisi||[]).find(e => String(e.id)===String(id)) || {};
  }
  function divisiRowByKode(kode){
    const k = lc(kode);
    return (M.ydivisi||[]).find(d => lc(d.kode ?? d.kd_divisi ?? '') === k) || {};
  }
  function labelDivisiFromKode(kode){
    const d = divisiRowByKode(kode);
    return d ? (d.nama || d.kode || kode || '-') : (kode || '-');
  }
  function labelRayonFromKode(kode){
    const k = lc(kode);
    const r = (M.yrayon||[]).find(x=> lc(x.kode ?? x.kd_rayon ?? x.kode_rayon ?? '')===k);
    return r ? (r.nama || r.kode || r.kd_rayon || '-') : (kode || '-');
  }

  // ==== Penandatangan (ambil dari master jika ada; aman bila kosong) ====
  function signerFromMasters({ estate_id, rayon_id, divisi_id }){
    const est = estateRowById(estate_id);
    const ray = rayonRowById(rayon_id);
    const div = divisiRowById(divisi_id);

    const get = (row, ...keys)=> {
      for(const k of keys){
        if(row && row[k]!=null && String(row[k]).trim()!=='') return String(row[k]);
      }
      return '';
    };

    return {
      company: get(est, 'plant_nama','company_name','nama_company','plant_name','plant') || 'BUANA TUNAS SEJAHTERA',
      estateFull: get(est, 'nama_panjang','nama','estate_nama','nama_estate'),
      manager: get(est, 'manager','manager_nama','nama_mgr'),
      ktu:     get(est, 'ktu','ktu_nama','nama_ktu'),
      askep:   get(ray, 'askep','askep_nama','nama_askep'),
      asisten: get(div, 'nama_asisten','asisten','asisten_nama','nama_ast','pic')
    };
  }

  // ---- Helper TTD (HTML sel)
  function sigCell(role, name='', ts=''){
    const t = ts ? `<div class="muted">TTD: ${ts}</div>` : `<div class="muted">&nbsp;</div>`;
    return `
      <td style="width:25%; text-align:center; vertical-align:bottom; height:90px">
        <div style="margin-bottom:48px">&nbsp;</div>
        <div style="font-weight:600; text-transform:uppercase">${role||'&nbsp;'}</div>
        <div style="border-top:1px solid #000; margin-top:36px; padding-top:6px">${name||'Nama Jelas & Ttd'}</div>
        ${t}
      </td>`;
  }
  function tableRow(k, v){
    return `<tr><th style="width:28%; text-align:left">${k}</th><td>${v||'-'}</td></tr>`;
  }

  // ===== State =====
  let rows = []; // data dari cache/server (header PDO ringkas)
  let filters = { 
    periode: fmt.nextMonthYM(),   // default: bulan depan
    estate_id:'', 
    rayon_id:'', 
    divisi_id:''
  };

  // ===== Loader (local-first, server fallback) =====
  async function load(preferLocal=true){
    let openedHere = false;
    try{
      let data = [];
      if(preferLocal){
        const cached = getCache();
        if(Array.isArray(cached) && cached.length) data = cached;
      }
      if(!data.length){
        const pm = document.getElementById('progressModal');
        const pmShown = pm && pm.classList.contains('show');
        if(!pmShown){ U.progressOpen('Menyiapkan rekap PDO...'); U.progress(30,'Ambil data (server)'); openedHere = true; }

        const r = await API.call('ktuRekapPDO', {});
        if(!r.ok) throw new Error(r.error||'Gagal ambil data');
        data = r.rows || [];
        setCache(data);
      }
      rows = normalize(data);
      render();
    }catch(e){
      root.innerHTML = `<div class="alert alert-danger">Gagal memuat rekap PDO: ${e.message||e}</div>`;
    }finally{
      if(openedHere){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 350); }
    }
  }

  // normalisasi: periode → YYYY-MM
  function normalize(arr){
    return (arr||[]).map(r=>({
      nomor: r.nomor,
      periode: fmt.periodeYM(r.periode),
      divisi_id: r.divisi_id || '',
      rayon_kode: r.rayon_kode || '',
      estate_nama: r.estate_nama || '',
      total_rp: Number(r.total_rp||0)
    }));
  }

  // ===== Filter util =====
  function passEstate(row){
    if(!filters.estate_id) return true;
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
  function passDivisi(row){
    if(!filters.divisi_id) return true;
    const d = (M.ydivisi||[]).find(e=> String(e.id)===String(filters.divisi_id));
    if(!d) return true;
    const kode = lc(d.kode ?? d.kd_divisi ?? '');
    return lc(row.divisi_id) === kode;
  }
  function passPeriode(row){
    if(!filters.periode) return true;
    return String(row.periode) === String(filters.periode);
  }
  function filtered(){ return rows.filter(r => passPeriode(r) && passEstate(r) && passRayon(r) && passDivisi(r)); }

  // ===== Cache detail per PDO (localStorage) =====
// Struktur: { [nomorPDO]: { header:{...}, items:[...], ts: <epoch ms> } }
const ACT_KEY_PDO_DETAIL = 'kpl.cache.pdo_detail.map';

function _getDetailMap(){
  return U.S.get(ACT_KEY_PDO_DETAIL, {}) || {};
}
function _setDetailMap(map){
  try{ U.S.set(ACT_KEY_PDO_DETAIL, map||{}); }catch(e){}
}

// optional: masa berlaku cache detail (ms). Misal 3 hari
const DETAIL_TTL = 3 * 24 * 60 * 60 * 1000;

function getDetailFromCache(nomor){
  const map = _getDetailMap();
  const rec = map && map[String(nomor)];
  if(!rec) return null;
  // cek kedaluwarsa
  if(DETAIL_TTL > 0 && Date.now() - Number(rec.ts||0) > DETAIL_TTL){
    return null;
  }
  return rec;
}
function setDetailToCache(nomor, header, items){
  const map = _getDetailMap();
  map[String(nomor)] = { header: header||{}, items: items||[], ts: Date.now() };
  _setDetailMap(map);
}

// opsional: hapus 1 nomor atau semua
function clearDetailCache(nomor){
  if(!nomor){ _setDetailMap({}); return; }
  const map = _getDetailMap(); delete map[String(nomor)]; _setDetailMap(map);
}

// ===== Ambil detail PDO (local-first, server fallback per nomor) =====
async function fetchDetailsForPrint(list){
  const out = [];
  const total = list.length || 1;
  let opened = false;

  // persiapkan daftar yang sudah ada di cache dan yang belum
  const needFetch = [];
  const cachedPart = {};
  for(const it of (list||[])){
    const nomor = String(it.nomor);
    const rec = getDetailFromCache(nomor);
    if(rec){ cachedPart[nomor] = rec; }
    else   { needFetch.push(nomor); }
  }

  try{
    // tampilkan progress hanya jika memang ada yang perlu ke server
    if(needFetch.length){
      const pm = document.getElementById('progressModal');
      const pmShown = pm && pm.classList.contains('show');
      if(!pmShown){ U.progressOpen('Menyiapkan detail PDO...'); opened = true; }
    }

    // fetch yang belum ada
    for(let i=0;i<needFetch.length;i++){
      const nomor = needFetch[i];
      U.progress(20 + Math.round((i/Math.max(1,needFetch.length))*70), `Ambil ${nomor} (${i+1}/${needFetch.length})`);
      const r = await API.call('getPdoDetail', { nomor });
      if(r && r.ok){
        setDetailToCache(nomor, r.header||{}, r.items||[]);
        cachedPart[nomor] = { header:r.header||{}, items:r.items||[], ts: Date.now() };
      }else{
        // simpan negatif agar tidak fetch berulang saat gagal (opsional)
        setDetailToCache(nomor, { nomor, error:true }, []);
        cachedPart[nomor] = { header:{ nomor, error:true }, items:[], ts: Date.now() };
      }
    }
  } finally {
    if(opened){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250); }
  }

  // susun output sesuai urutan list masukan
  for(const it of (list||[])){
    const nomor = String(it.nomor);
    const rec = cachedPart[nomor];
    if(rec) out.push({ header: rec.header||{}, items: rec.items||[] });
    else    out.push({ header:{ nomor, error:true }, items:[] }); // fallback mustahil, tapi jaga-jaga
  }
  return out;
}


  // ===== Export Excel (rekap) =====
  function exportXlsx(){
    const data = filtered();
    if(!data.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }
    if(typeof Exporter==='undefined' || !Exporter.exportRekapPDOXlsx){
      U.alert('Exporter.exportRekapPDOXlsx belum tersedia (muat js/pages/pdo/exporter.pdo.js).');
      return;
    }
    Exporter.exportRekapPDOXlsx(data);
  }

  // ===== Cetak PDF: Rekap (hal-1) + Detail per PDO (hal-2 dst) =====
  async function printPdf(){
    const data = filtered();
    if(!data.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

    // Ambil header+items setiap PDO untuk halaman detail
    const details = await fetchDetailsForPrint(data);

    // ------- Halaman 1: REKAP + TTD KTU & Manager -------
    const grand = data.reduce((a,b)=> a + Number(b.total_rp||0), 0);
    const rowsRekap = data.map(r=>{
      return `<tr>
        <td style="white-space:nowrap">${r.nomor||'-'}</td>
        <td>${r.periode||'-'}</td>
        <td>${labelDivisiFromKode(r.divisi_id)}</td>
        <td>${labelRayonFromKode(r.rayon_kode)}</td>
        <td>${r.estate_nama||'-'}</td>
        <td class="t-right">${fmt.idr(r.total_rp||0)}</td>
      </tr>`;
    }).join('');

    // Ambil signer dari data pertama yang tampil (untuk rekap)
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
      </div>

      <table>
        <thead>
          <tr>
            <th>No. PDO</th><th>Periode</th><th>Divisi</th><th>Rayon</th><th>Estate</th><th class="t-right">Total PDO (Rp)</th>
          </tr>
        </thead>
        <tbody>${rowsRekap || `<tr><td colspan="6" class="muted">Tidak ada data.</td></tr>`}</tbody>
        <tfoot><tr><th colspan="5" class="t-right">TOTAL</th><th class="t-right">${fmt.idr(grand)}</th></tr></tfoot>
      </table>

      <table style="margin-top:18px"><tr>
        ${sigCell('KTU', signerHead.ktu || '')}
        ${sigCell('MANAGER', signerHead.manager || '')}
        ${sigCell('', '')}
        ${sigCell('', '')}
      </tr></table>
    `;

    // ------- Halaman 2++ : DETAIL PDO (format “PERMINTAAN DANA OPERASIONAL”) -------
    const detailPages = details.map((dobj)=>{
      const h  = dobj.header || {};
      const it = dobj.items  || [];

      const estRow = estateRowById(h.estate_id);
      const divRow = divisiRowByKode(h.divisi_id);

      const signer = signerFromMasters({
        estate_id: h.estate_id, rayon_id: h.rayon_id, divisi_id: h.divisi_id
      });

      const company = (signer.company ? `PT. ${String(signer.company).toUpperCase()}` : 'PT. BUANA TUNAS SEJAHTERA');
      const estateFull = signer.estateFull || estRow.nama_panjang || estRow.nama || '';

      // pisahkan HK & BOR
      const HK  = it.filter(x=> String(x.tipe_item)==='HK');
      const BOR = it.filter(x=> String(x.tipe_item)==='BOR');

      const totalHK   = HK.reduce((a,b)=> a+Number(b.total_rp||0),0);
      const totalBor  = BOR.reduce((a,b)=> a+Number(b.total_rp||0),0);
      const totalPremi= Number(h.premi_panen||0) + Number(h.premi_non_panen||0);
      const totalPDO  = totalHK + totalBor + totalPremi;

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

      // blok judul + kotak tanda tangan (Manager/Askep/Asisten) seperti contoh
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
              <thead>
                <tr><th>Disetujui</th><th>Diperiksa</th><th>Dibuat</th></tr>
              </thead>
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
          <br/>
          
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

  // ===== UI =====
  function render(){
    // periode options (sertakan default bulan depan)
    const setPer = new Set(rows.map(r=> r.periode));
    if(filters.periode) setPer.add(filters.periode);
    const periodes = Array.from(setPer).filter(Boolean).sort().reverse();

    // CSS kecil untuk pewarnaan total & hover
    if(!document.getElementById('ktu-rekap-pdo-css')){
      const s = document.createElement('style');
      s.id = 'ktu-rekap-pdo-css';
      s.textContent = `
        .table tfoot th { background:#f8f9fa; font-weight:700; }
        .table thead th { white-space:nowrap; }
        .table-hover tbody tr:hover { background:#fafbfd; }
      `;
      document.head.appendChild(s);
    }

    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">Rekap PDO – KTU</h4>
          <div class="d-flex flex-wrap gap-2">
            <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
            <button id="btn-xlsx"  class="btn btn-sm btn-success">Export Excel</button>
            <button id="btn-pdf"   class="btn btn-sm btn-dark">Cetak PDF</button>
            <button id="btn-details" class="btn btn-sm btn-outline-primary">Tampilkan Detail di Bawah</button>
          </div>
        </div>

        <div class="row g-2 mb-3">
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
              ${(M.yestate||[]).map(e=>{
                const label = e.nama_panjang || e.nama || e.id;
                return `<option value="${e.id}" ${String(filters.estate_id)===String(e.id)?'selected':''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="col-sm-3">
            <label class="form-label">Rayon</label>
            <select id="f-rayon" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${(M.yrayon||[]).map(r=>{
                const label = r.nama || r.kode || r.kd_rayon || r.id;
                return `<option value="${r.id}" ${String(filters.rayon_id)===String(r.id)?'selected':''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="col-sm-3">
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
                <th colspan="5" class="text-end">TOTAL (yang ditampilkan)</th>
                <th class="text-end" id="ktu-total">0</th>
              </tr>
            </tfoot>
          </table>
        </div>

        <div id="pdo-details-holder" class="mt-3"></div>
      </div></div>
    `;

    // binds
    U.qs('#btn-reload').onclick = ()=>{
  // bersihkan cache header & detail, lalu load dari server
  U.S.set(ACT_KEY, []);      // header rekap
  clearDetailCache();        // semua detail PDO
  load(false);
};
    U.qs('#btn-xlsx').onclick  = exportXlsx;
    U.qs('#btn-pdf').onclick   = printPdf;

    U.qs('#f-periode').onchange = (e)=>{ filters.periode   = e.target.value; drawTable(); };
    U.qs('#f-estate').onchange  = (e)=>{ filters.estate_id = e.target.value; drawTable(); };
    U.qs('#f-rayon').onchange   = (e)=>{ filters.rayon_id  = e.target.value; drawTable(); };
    U.qs('#f-divisi').onchange  = (e)=>{ filters.divisi_id = e.target.value; drawTable(); };

    // tombol detail (render di bawah rekap, tidak membuka jendela baru)
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

        const rowsHK = HK.map((row,i)=>`
          <tr><td>${i+1}</td><td>${row.pekerjaan||''}</td><td class="text-end">${fmt.id0(row.hk||0)}</td><td class="text-end">${fmt.idr(row.total_rp||0)}</td></tr>
        `).join('') || `<tr><td colspan="4" class="text-center text-muted">Tidak ada pekerjaan HK.</td></tr>`;

        const rowsBOR = BOR.map((row,i)=>`
          <tr><td>${i+1}</td><td>${row.pekerjaan||''}</td><td class="text-end">${fmt.id0(row.qty||0)}</td><td class="text-end">${fmt.idr(row.total_rp||0)}</td></tr>
        `).join('') || `<tr><td colspan="4" class="text-center text-muted">Tidak ada pekerjaan borongan.</td></tr>`;

        return `
          <div class="card mb-3">
            <div class="card-header"><b>${hdr.nomor||'-'}</b> · ${fmt.periodeYM(hdr.periode)||'-'} · ${labelDivisiFromKode(hdr.divisi_id)||'-'} · ${(estateRowById(hdr.estate_id).nama_panjang||'')}</div>
            <div class="card-body p-2">
              <div class="row g-2">
                <div class="col-md-6">
                  <h6 class="mb-1">Pekerjaan HK</h6>
                  <div class="table-responsive">
                    <table class="table table-sm table-bordered align-middle">
                      <thead class="table-light"><tr><th>#</th><th>Jenis</th><th class="text-end">HK</th><th class="text-end">Total (Rp)</th></tr></thead>
                      <tbody>${rowsHK}</tbody>
                    </table>
                  </div>
                </div>
                <div class="col-md-6">
                  <h6 class="mb-1">Pekerjaan Borongan</h6>
                  <div class="table-responsive">
                    <table class="table table-sm table-bordered align-middle">
                      <thead class="table-light"><tr><th>#</th><th>Jenis</th><th class="text-end">Qty</th><th class="text-end">Total (Rp)</th></tr></thead>
                      <tbody>${rowsBOR}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');
      U.toast('Detail dimuat.','success');
    };

    drawTable();
  }

  function drawTable(){
    const data = filtered();
    const tb = U.qs('#ktu-rows');
    if(!data.length){
      tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Tidak ada data.</td></tr>`;
      U.qs('#ktu-total').textContent = fmt.idr(0);
      return;
    }
    tb.innerHTML = data.map(r=>{
      return `
        <tr>
          <td style="white-space:nowrap">${r.nomor||'-'}</td>
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

  // go
  load(true);
};

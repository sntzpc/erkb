// js/pages/pdo/pdo_list.js (UI selaras RKB Draft + fix nomor & aksi)
window.Pages = window.Pages || {};
Pages.pdoList = function(which='draft'){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash='#/login'; return; }

  // ===== Masters (untuk label & penandatangan) =====
const M = {
  ydivisi: STORE.getMaster('ydivisi') || [],
  yrayon:  STORE.getMaster('yrayon')  || [],
  yestate: STORE.getMaster('yestate') || [],
  yplant:  STORE.getMaster('yplant')  || [],
};

const lc = v => (v==null ? '' : String(v).trim().toLowerCase());
function estateById(id){ return (M.yestate||[]).find(e=> String(e.id)===String(id)) || {}; }
function rayonById(id){  return (M.yrayon||[]).find(e=> String(e.id)===String(id))  || {}; }

function _plantNameByEstateIdSync(estate_id){
  try{
    const est = (M.yestate||[]).find(e => String(e.id) === String(estate_id)) || {};
    // ambil plant_id dari estate
    let pid = est.plant_id || est.id_plant || est.kd_plant || est.kode_plant;
    // jika plant_id tak ada, coba baca nama PT langsung dari estate (beberapa DB taruh di sini)
    if(!pid){
      const byName = (
        est.plant_nama || est.nama_company || est.plant_name ||
        est.company || est.perusahaan || ''
      );
      if(String(byName).trim()) return String(byName).trim();
    }
    // resolve ke master plant
    const p = (M.yplant||[]).find(x =>
      String(x.id)===String(pid) || String(x.plant_id)===String(pid) ||
      String(x.kode)===String(pid) || String(x.kd_plant)===String(pid)
    );
    if(p){
      return String(p.nama_panjang || p.nama || p.plant_nama || p.company || p.plant || '').trim();
    }
    // fallback: jika hanya ada 1 plant di master, pakai itu
    if((M.yplant||[]).length === 1){
      const only = M.yplant[0];
      return String(only.nama_panjang || only.nama || only.company || '').trim();
    }
  }catch(_){/* ignore */}
  // hard fallback terakhir (sesuai sebelumnya)
  return 'KARYAMAS PLANTATION';
}

function _formatCompanyLabel(name){
  const raw = String(name||'').trim();
  if(!raw) return 'PT. BUANA TUNAS SEJAHTERA';
  const upper = raw.toUpperCase();
  // jika sudah mulai dengan "PT" atau "P.T" atau "PT.", biarkan tanpa menambah "PT."
  if(/^P\.?T\.?\s/.test(upper)){ return upper; }
  return `PT. ${upper}`;
}

function _normLoose(s){
  // lowercase → buang non huruf/angka → hilangkan substring "div"
  return lc(s).replace(/[^a-z0-9]/g,'').replace(/div/g,'');
}

function resolveDivisi(any){
  const v = (any==null ? '' : String(any)).trim();
  if(!v) return {};
  const low = lc(v);
  const loose = _normLoose(v);
  const list = M.ydivisi || [];

  // 1) by ID (string compare ketat)
  let row = list.find(d => String(d.id).trim().toLowerCase() === low);
  if(row) return row;

  // 2) by KODE (longgar: hilangkan underscore/“DIV”)
  row = list.find(d => _normLoose(d.kode ?? d.kd_divisi ?? d.kode_divisi ?? '') === loose);
  if(row) return row;

  // 3) by NAMA (longgar)
  row = list.find(d => _normLoose(d.nama ?? '') === loose);
  if(row) return row;

  // 4) fallback: partial (awalan) di kode
  row = list.find(d => _normLoose(d.kode ?? d.kd_divisi ?? '') .startsWith(loose));
  if(row) return row;

  return {};
}
// ==== Utils umum (gunakan jika belum ada di file terkait) ====
function _lc(v){ return (v==null?'':String(v)).trim().toLowerCase(); }
function _pick(o, keys){
  for(const k of keys){ if(o && o[k]!=null && String(o[k]).trim()!=='') return o[k]; }
  return '';
}
// Normalisasi periode ke "YYYY-MM"
function _toYYYYMM(p){
  const s = String(p||'').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = new Date(s); if (isNaN(d)) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}
// Ambil koleksi RKB Header dari localStorage terlebih dahulu, fallback ke STORE.getActual(...)
function _collectRKBHeaders(){
  const viaUS = U.S.get('kpl.actual.rkb', []) || [];
  if (Array.isArray(viaUS) && viaUS.length) return viaUS;

  // fallback umum yang sering dipakai backend
  const cand = ['rkb','rkb_header','rkb_headers','rkb_list','kpl.actual.rkb'];
  for(const k of cand){
    const v = STORE?.getActual?.(k);
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}
// Ambil field nomor/identitas RKB secara toleran
function _rkbNomor(row){
  return String(_pick(row, ['nomor','no_rkb','rkb_no','kode','id','no'] )||'').trim();
}
function _rkbPeriode(row){
  return _toYYYYMM(_pick(row, ['periode','period','bulan','month']));
}
function _rkbEstate(row){ return String(_pick(row, ['estate_id','estate','id_estate'] )||'').trim(); }
function _rkbRayon(row){  return String(_pick(row, ['rayon_id','rayon','id_rayon'] )||'').trim(); }
function _rkbDivisi(row){ return String(_pick(row, ['divisi_id','divisi','divisi_kode','kd_divisi'] )||'').trim(); }

function labelDivisi(any, mode='smart'){
  const d = resolveDivisi(any);
  const fallback = (any ?? '-');
  const name = (d.nama ?? d.nama_divisi ?? '').toString().trim();
  const code = (d.kode ?? d.kd_divisi ?? d.id ?? fallback).toString().trim();

  if(mode==='code') return code || fallback;
  if(mode==='name') return name || code || fallback;

  // mode 'smart'
  const same = name && code && name.toLowerCase() === code.toLowerCase();
  if(!name) return code || fallback;
  if(!code) return name || fallback;
  return same ? code : `${name} (${code})`;
}


function labelRayonFromKode(kode){
  const k = lc(kode);
  const r = (M.yrayon||[]).find(x=> lc(x.kode ?? x.kd_rayon ?? x.kode_rayon ?? '')===k);
  return r ? (r.nama || r.kode || r.kd_rayon || '-') : (kode || '-');
}

// signer dari masters
function signerFromMasters({ estate_id, rayon_id, divisi_id }){
  const est = estateById(estate_id);
  const ray = rayonById(rayon_id);
  const div = resolveDivisi(divisi_id);
  const pick=(row,...keys)=>{ for(const k of keys){ if(row && row[k]!=null && String(row[k]).trim()!=='') return String(row[k]); } return ''; };

  // <<— [CHANGED] company dari plant master berdasarkan estate_id
  const companyName = _plantNameByEstateIdSync(estate_id);

  return {
    company:   companyName || 'KARYAMAS PLANTATION',
    estateFull:pick(est,'nama_panjang','nama','estate_nama','nama_estate'),
    manager:   pick(est,'manager','manager_nama','nama_mgr'),
    ktu:       pick(est,'ktu','ktu_nama','nama_ktu'),
    askep:     pick(ray, 'askep','askep_nama','nama_askep'),
    asisten:   pick(div, 'nama_asisten','asisten','asisten_nama','nama_ast','pic'),
  };
}

  // ===== Helpers =====
  function fmtN(n){ return new Intl.NumberFormat('id-ID').format(n); }
  function fPeriode(p){
    if(!p) return '';
    const s = String(p).trim();
    if(/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if(isNaN(d)) return s;
    const tz='Asia/Jakarta';
    const y=new Intl.DateTimeFormat('id-ID',{timeZone:tz,year:'numeric'}).format(d);
    const m=new Intl.DateTimeFormat('id-ID',{timeZone:tz,month:'2-digit'}).format(d);
    return `${y}-${m}`;
  }
  // DD/MM/YY-hh:mm:ss → epoch ms
  function parseSig(sig){
    if(!sig) return 0;
    const m = String(sig).match(/^(\d{2})\/(\d{2})\/(\d{2})-(\d{2}):(\d{2}):(\d{2})$/);
    if(!m) return 0;
    const [_,dd,MM,yy,hh,mi,ss] = m;
    return new Date(2000+Number(yy), Number(MM)-1, Number(dd), Number(hh), Number(mi), Number(ss)).getTime();
  }
  // Ambil YYMMDDhhmmss dari created_ts; fallback now
  function stampFromSig(sig){
    const t = parseSig(sig) || Date.now();
    const d = new Date(t);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    return `${yy}${mm}${dd}${hh}${mi}${ss}`;
  }
  function ensureNomor(row){
    if(row && !row.nomor){
      const div = String(row.divisi_id||'XX').replace(/\s+/g,'').toUpperCase();
      row.nomor = `PDO${div}${stampFromSig(row.created_ts)}`;
    }
    return row;
  }

  const ICON = { view:'👁️', edit:'✏️', del:'🗑️', sync:'✅', refresh:'🔁' };

  // ===== Styles (sama seperti RKB) =====
  (function ensureStyles(){
    if(document.getElementById('pdo-list-css')) return;
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
    const s=document.createElement('style');
    s.id='pdo-list-css'; s.textContent=css; document.head.appendChild(s);
  })();

  // ===== Resolver nama actuals untuk PDO (dinamis sesuai backend) =====
let PDO_ACT_KEYS = { header: 'pdo', hk: 'pdo_hk', bor: 'pdo_borongan' };

async function resolvePdoActualKeys(){
  try{
    if (typeof STORE?.ensureWarm === 'function') await STORE.ensureWarm();

    // kandidat umum (header / daftar PDO)
    const tryHeader = ['pdo','pdo_header','pdo_headers','pdo_list','pdo_headers_list'];
    for (const k of tryHeader){
      const v = STORE.getActual?.(k);
      if (Array.isArray(v) && v.length){ PDO_ACT_KEYS.header = k; break; }
    }

    // kandidat detail HK
    const tryHK = ['pdo_hk','pdo_items_hk','pdo_detail_hk','pdo_item_hk','pdo_harian'];
    for (const k of tryHK){
      const v = STORE.getActual?.(k);
      if (Array.isArray(v) && v.length){ PDO_ACT_KEYS.hk = k; break; }
    }

    // kandidat detail borongan
    const tryBor = ['pdo_borongan','pdo_items_bor','pdo_detail_borongan','pdo_item_bor'];
    for (const k of tryBor){
      const v = STORE.getActual?.(k);
      if (Array.isArray(v) && v.length){ PDO_ACT_KEYS.bor = k; break; }
    }
  }catch(_){ /* biarkan default */ }
}

// ===== Baca riwayat PDO dari actuals (server → local cache) =====
function readHistoryPdoFromActuals(){
  const list = STORE.getActual?.(PDO_ACT_KEYS.header) || [];
  const me   = (SESSION.profile()?.username || '').toLowerCase();

  // siapkan map total dari items kalau header tidak punya total_rp
  const allItems = (STORE.getActual?.('pdo_items') || STORE.getActual?.('kpl.actual.pdo_items') || []);
  const sumByNomor = {};
  for(const it of allItems){
    const no = String(it.nomor||'');
    const val = Number(it.total_rp||0);
    sumByNomor[no] = (sumByNomor[no]||0) + (isFinite(val)?val:0);
  }

  const mine = list.filter(x => String(x.username||'').toLowerCase() === me || !x.username);

  return mine.map(x => ({
    nomor:       x.nomor,
    periode:     x.periode,
    divisi_id:   x.divisi_id || x.divisi || '',
    estate_id:   x.estate_id,
    rayon_id:    x.rayon_id,
    ref_rkb:     x.ref_rkb || '',
    status:      x.status || 'draft',
    premi_panen: Number(x.premi_panen||0),
    premi_non_panen: Number(x.premi_non_panen||0),
    upah_hk_sku: Number(x.upah_hk_sku||0),
    upah_hk_bhl: Number(x.upah_hk_bhl||0),
    target_produksi_ton: Number(x.target_produksi_ton||0),
    created_ts:  x.created_ts || x.created_at || '',
    updated_at:  x.updated_at || '',
    // >>> tambahkan total_rp agar list bisa pakai totalPrimary
    total_rp:    Number(x.total_rp ?? sumByNomor[String(x.nomor)] ?? 0),
    hk: [], borongan: [],
    __history: true
  }));
}


// ===== Merge unik by nomor (utama = draft lokal) =====
function mergeUniqueByNomor(primaryArr, secondaryArr){
  const used = new Set((primaryArr||[]).map(r => String(r.nomor)));
  const extra = (secondaryArr||[]).filter(r => !used.has(String(r.nomor)));
  return (primaryArr||[]).concat(extra);
}


// ===== Data (draft lokal) =====
const draftKeyNew = 'kpl.actual.pdo_draft';
const draftKeyOld = 'pdo.draft'; // kompat lama
const outboxKey   = 'pdo.outbox'; // untuk kiriman gagal (opsional)

function getDrafts(){
  // helper: rapikan field divisi
  const sanitize = (arr) => (
    Array.isArray(arr)
      ? arr.map(r => {
          const div = String(
            (r && (r.divisi_id || r.divisi || r.divisi_kode)) || ''
          ).trim();
          const clean = { ...r, divisi_id: div };
          delete clean.divisi;        // legacy/display-only → buang
          delete clean.divisi_kode;   // sumber salah → buang
          return clean;
        })
      : []
  );

  // 1) kunci baru
  let rows = U.S.get(draftKeyNew, []);
  if (Array.isArray(rows) && rows.length) {
    return sanitize(rows);
  }

  // 2) kunci lama (kompat)
  const old = U.S.get(draftKeyOld, []);
  if (Array.isArray(old) && old.length){
    const cleaned = sanitize(old);
    U.S.set(draftKeyNew, cleaned);
    try{ localStorage.removeItem(draftKeyOld); }catch(_){}
    return cleaned;
  }

  return [];
}

function setDrafts(v){ U.S.set(draftKeyNew, v||[]); }

// normalize nomor kosong → isi & persist
(function normalizeDraftNumbers(){
  const arr = (getDrafts()||[]).map(r=> ensureNomor(r));
  setDrafts(arr);
})();


// ===== State UI =====
let data = [];                                // <— mulai kosong; diisi oleh IIFE di bawah
let page=1, pageSize=20, q='', periodeFilter='';
const PAGE_CHOICES=[20,40,80,100];

function sortData(arr){
  arr.sort((a,b)=>{
    const ta = new Date(a.updated_at||0).getTime() || parseSig(a.created_ts);
    const tb = new Date(b.updated_at||0).getTime() || parseSig(b.created_ts);
    return (tb||0)-(ta||0);
  });
  return arr;
}

// ===== Gabung data untuk List (local-first + history server dari actuals) =====
(async ()=> {
  await resolvePdoActualKeys();

  const drafts  = getDrafts() || [];
  const history = readHistoryPdoFromActuals(); // read-only dari server cache

  // Outbox tab (jika dipakai kelak), sama pola dengan RKB
  if (which === 'outbox'){
    data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error);
  }else{
    data = mergeUniqueByNomor(
      drafts.map(r => ({ ...r, periode: fPeriode(r.periode) })),
      history.map(r => ({ ...r, periode: fPeriode(r.periode) }))
    );
  }

  sortData(data);
  build(); // bangun UI setelah data siap
})();


  function uniquePeriodes(arr){
    return Array.from(new Set((arr||[]).map(x => fPeriode(x.periode)).filter(Boolean))).sort().reverse();
  }
  
  function applyFilter(){
  let arr = (data||[]).slice();
  if(periodeFilter) arr = arr.filter(x => fPeriode(x.periode) === String(periodeFilter));

  const qq = q.trim().toLowerCase();
  if(qq){
    arr = arr.filter(r=>{
      const totalPrimary = Number(r.total_rp ?? r.total ?? 0);
      const totalHK  = (r.hk||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
      const totalBor = (r.borongan||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
      const totalFallback = totalHK + totalBor + Number(r.premi_panen||0) + Number(r.premi_non_panen||0);
      const total = Number.isFinite(totalPrimary) && totalPrimary>0 ? totalPrimary : totalFallback;

      const divId   = String(r.divisi_id||'');
      const divLbl  = labelDivisi(r.divisi_id, /*withCode*/true); // "Nama (SBSE2)"
      return [
        r.nomor,
        fPeriode(r.periode), divId, divLbl, r.ref_rkb, r.status,  String(total)
      ].some(v => String(v||'').toLowerCase().includes(qq));
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

  // Bangun detail dari draft lokal (jika ada)
function buildDetailFromDraft(d){
  if(!d) return null;
  const header = {
    nomor: d.nomor,
    periode: fPeriode(d.periode),
    estate_id: d.estate_id,
    rayon_id: d.rayon_id,
    divisi_id: d.divisi_id,
    ref_rkb: d.ref_rkb || '',
    upah_hk_sku: Number(d.upah_hk_sku||0),
    upah_hk_bhl: Number(d.upah_hk_bhl||0),
    premi_panen: Number(d.premi_panen||0),
    premi_non_panen: Number(d.premi_non_panen||0),
    target_produksi_ton: Number(d.target_produksi_ton||0),
    created_ts: d.created_ts || '',
    asst_ts: d.asst_ts || '',
    askep_ts: d.askep_ts || '',
    manager_ts: d.manager_ts || '',
    status: d.status || 'draft',
  };
  const items = [
    ...(d.hk||[]).map(x=>({ ...x, tipe_item:'HK' })),
    ...(d.borongan||[]).map(x=>({ ...x, tipe_item:'BOR' })),
  ];
  return { header, items };
}

// ===== Cache detail PDO (per nomor) di localStorage =====
// simpan per-nomor agar Cetak PDF bisa local-first → cache → API
const ACT_KEY_PDO_DETAIL = 'kpl.cache.pdo_detail.map'; // { [nomor]: {header,items,ts} }
const DETAIL_TTL = 3 * 24 * 60 * 60 * 1000; // 3 hari (0=tanpa kedaluwarsa)

// map penuh dari localStorage
function _getDetailMap(){
  return U.S.get(ACT_KEY_PDO_DETAIL, {}) || {};
}
function _setDetailMap(m){
  try{ U.S.set(ACT_KEY_PDO_DETAIL, m||{}); }catch(_){}
}

// ambil cache satu nomor (validasi TTL)
function getDetailFromCache(nomor){
  const m = _getDetailMap();
  const rec = m[String(nomor)];
  if(!rec) return null;
  if(DETAIL_TTL>0 && (Date.now() - Number(rec.ts||0) > DETAIL_TTL)) return null;
  return rec;
}

// simpan/update cache satu nomor
function setDetailToCache(nomor, header, items){
  const m = _getDetailMap();
  m[String(nomor)] = { header: header||{}, items: items||[], ts: Date.now() };
  _setDetailMap(m);
}

// hapus cache (1 nomor / seluruhnya jika nomor kosong)
function clearDetailCache(nomor){
  if(!nomor){ _setDetailMap({}); return; }
  const m = _getDetailMap();
  delete m[String(nomor)];
  _setDetailMap(m);
}


// ===== Ambil detail PDO (local-first → cache → API) =====
async function fetchDetailsForPrintFromList(list){
  const out=[];

  // Susun lookup draft nomor → draft object
  const draftsByNomor = Object.fromEntries((getDrafts()||[]).map(r=>[String(r.nomor), r]));

  // nomor yang perlu fetch ke server
  const needFetch=[]; const collected={};

  for(const it of (list||[])){
    const nomor = String(it.nomor);
    // 1) dari draft lokal
    const d = draftsByNomor[nomor];
    if(d){
      const built = buildDetailFromDraft(d);
      if(built){ collected[nomor]=built; continue; }
    }
    // 2) dari cache detail
    const cache = getDetailFromCache(nomor);
    if(cache){ collected[nomor]={ header:cache.header||{}, items:cache.items||[] }; continue; }
    // 3) antrikan untuk fetch API
    needFetch.push(nomor);
  }

  // fetch API hanya jika perlu
  let opened=false;
  try{
    if(needFetch.length){
      const pm=document.getElementById('progressModal');
      const pmShown=pm && pm.classList.contains('show');
      if(!pmShown){ U.progressOpen('Mengambil detail dari server...'); opened=true; }
    }
    for(let i=0;i<needFetch.length;i++){
      const nomor=needFetch[i];
      U.progress(20 + Math.round((i/Math.max(1,needFetch.length))*70), `Ambil ${nomor} (${i+1}/${needFetch.length})`);
      try{
        const r = await API.call('getPdoDetail', { nomor });
        if(r && r.ok){
          setDetailToCache(nomor, r.header||{}, r.items||[]);
          collected[nomor] = { header: r.header||{}, items: r.items||[] };
        }else{
          collected[nomor] = { header:{ nomor, error:true }, items:[] };
        }
      }catch(e){
        collected[nomor] = { header:{ nomor, error:true }, items:[] };
      }
    }
  }finally{
    if(opened){ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(),250); }
  }

  // urut sesuai input
  for(const it of (list||[])){
    const nomor = String(it.nomor);
    out.push(collected[nomor] || { header:{ nomor, error:true }, items:[] });
  }
  return out;
}

  // ===== Toolbar actions (Export/Cetak per filter) =====
  function exportXlsx(){
    const arr = applyFilter();
    if(!arr.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }
    if(typeof Exporter!=='undefined' && typeof Exporter.toXlsxPDOBatch==='function'){
      Exporter.toXlsxPDOBatch(arr);
    }else if(typeof Exporter!=='undefined' && typeof Exporter.toXlsxPDO==='function'){
      arr.forEach(r => Exporter.toXlsxPDO(r));
    }else{
      U.toast('Fitur Export Excel PDO belum tersedia di halaman ini.', 'warning');
    }
  }

  function sigCell(role, name='', ts=''){
  const t = ts ? `<div class="muted">TTD: ${ts}</div>` : `<div class="muted">&nbsp;</div>`;
  return `
    <td style="width:33%; text-align:center; vertical-align:bottom; height:90px">
      <div style="margin-bottom:48px">&nbsp;</div>
      <div style="font-weight:700">${name||' '}</div>
      <div class="muted" style="min-height:14px">${t}</div>
      <div style="font-weight:700; border-top:1px solid #000; margin-top:6px">${role}</div>
    </td>`;
}
function tableRowLabel(k, v){
  return `<tr><th style="width:28%; text-align:left">${k}</th><td>${v||'-'}</td></tr>`;
}

// HTML detail 1 PDO
function buildDetailHtml(one){
  const h = one.header||{}; const it = one.items||[];

  const signer = signerFromMasters({
    estate_id: h.estate_id, rayon_id: h.rayon_id, divisi_id: h.divisi_id
  });
  const company = _formatCompanyLabel(signer.company);
  const estateFull = signer.estateFull || estateById(h.estate_id).nama_panjang || estateById(h.estate_id).nama || '';

  const HK  = it.filter(x=> String(x.tipe_item)==='HK');
  const BOR = it.filter(x=> String(x.tipe_item)==='BOR');

  const sumHK  = HK.reduce((a,b)=> a+Number(b.total_rp||0), 0);
  const sumBOR = BOR.reduce((a,b)=> a+Number(b.total_rp||0), 0);
  const totalPDO = sumHK + sumBOR + Number(h.premi_panen||0) + Number(h.premi_non_panen||0);

  const rowsHK = HK.map(r=>`
  <tr>
    <td>${r.activity_type||''}</td>
    <td>${r.pekerjaan||''}${r.tipe_hk ? ` <span class="muted">(${r.tipe_hk})</span>` : ''}</td>
    <td class="text-end">${(r.luas_ha||0).toLocaleString('id-ID')}</td>
    <td class="text-end">${(r.hk||0).toLocaleString('id-ID')}</td>
    <td class="text-end">${(r.total_rp||0).toLocaleString('id-ID')}</td>
  </tr>`).join('') || `<tr><td colspan="5" class="muted">Tidak ada pekerjaan HK.</td></tr>`;

  const rowsBOR = BOR.map(r=>`
    <tr>
      <td>${r.activity_type||''}</td>
      <td>${r.pekerjaan||''}</td>
      <td class="text-end">${(r.qty||0).toLocaleString('id-ID')}</td>
      <td class="text-end">${(r.tarif_borongan||0).toLocaleString('id-ID')}</td>
      <td class="text-end">${(r.total_rp||0).toLocaleString('id-ID')}</td>
    </tr>`).join('') || `<tr><td colspan="5" class="muted">Tidak ada pekerjaan borongan.</td></tr>`;

  const headerBox = `
    <table style="border:none; margin-top:6px"><tr>
      <td style="border:none; padding:0; width:65%">
        <div style="font-weight:800; font-size:16px">${company}</div>
        <div style="font-weight:600; font-size:14px">${estateFull||''}</div>
        <div style="height:6px"></div>
        <div style="font-size:14px; font-weight:700; text-transform:uppercase">PERMINTAAN DANA OPERASIONAL</div>
      </td>
      <td style="border:none; padding:0; width:35%; vertical-align:top">
        <table>
          <thead><tr><th>Disetujui</th><th>Diperiksa</th><th>Dibuat</th></tr></thead>
          <tbody><tr>
            ${sigCell('MANAGER', signer.manager||'', h.manager_ts||'')}
            ${sigCell('ASKEP',   signer.askep||'',   h.askep_ts||'')}
            ${sigCell('ASISTEN', signer.asisten||'', h.asst_ts||h.created_ts||'')}
          </tr></tbody>
        </table>
      </td>
    </tr></table>`;

  const infoTable = `
    <table>
      <tbody>
        ${tableRowLabel('Periode', fPeriode(h.periode))}
        ${tableRowLabel('Divisi',  labelDivisi(h.divisi_id, 'smart'))}
        ${tableRowLabel('No. PDO', h.nomor)}
        ${tableRowLabel('Ref. RKB', h.ref_rkb||'')}
        ${tableRowLabel('Upah HK SKU', (Number(h.upah_hk_sku||0)).toLocaleString('id-ID'))}
        ${tableRowLabel('Upah HK BHL', (Number(h.upah_hk_bhl||0)).toLocaleString('id-ID'))}
        ${tableRowLabel('Target Produksi', `${(Number(h.target_produksi_ton||0)).toLocaleString('id-ID')} Ton`)}
      </tbody>
    </table>`;

  const premiBlock = `
    <div style="margin:8px 0">
      <span>Premi Panen : <b>Rp ${(Number(h.premi_panen||0)).toLocaleString('id-ID')}</b></span>
      <span style="margin-left:24px">Premi Non Panen : <b>Rp ${(Number(h.premi_non_panen||0)).toLocaleString('id-ID')}</b></span>
    </div>`;

  const tblHK = `
    <h4 style="margin:10px 0 6px">RINCIAN PEKERJAAN</h4>
    <div style="font-weight:700; margin:6px 0 4px">PEKERJAAN HK</div>
    <table>
      <thead><tr>
        <th>ACTIVITY TYPE</th><th>JENIS PEKERJAAN</th>
        <th class="text-end">LUAS (HA)</th><th class="text-end">JLH HK</th><th class="text-end">TOTAL (RP)</th>
      </tr></thead>
      <tbody>${rowsHK}</tbody>
      <tfoot><tr><th colspan="4" class="text-end">TOTAL</th><th class="text-end">Rp ${sumHK.toLocaleString('id-ID')}</th></tr></tfoot>
    </table>`;

  const tblBOR = `
    <div style="font-weight:700; margin:12px 0 4px">PEKERJAAN BORONGAN</div>
    <table>
      <thead><tr>
        <th>ACTIVITY TYPE</th><th>JENIS PEKERJAAN</th>
        <th class="text-end">QTY</th><th class="text-end">HARGA (RP)</th><th class="text-end">TOTAL (RP)</th>
      </tr></thead>
      <tbody>${rowsBOR}</tbody>
      <tfoot><tr><th colspan="4" class="text-end">TOTAL</th><th class="text-end">Rp ${sumBOR.toLocaleString('id-ID')}</th></tr></tfoot>
    </table>
    <div style="margin:8px 0"><span>TOTAL PDO: <b>Rp ${totalPDO.toLocaleString('id-ID')}</b></span></div>`;

  return `
    ${headerBox}
    ${infoTable}
    ${premiBlock}
    ${tblHK}
    ${tblBOR}
  `;
}

  async function printPdf(){
  const arr = applyFilter();
  if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

  // Ambil header+items tiap PDO: local-first → cache → API
  const details = await fetchDetailsForPrintFromList(arr.map(x=>({ nomor: x.nomor })));

  // Susun HTML (detail per PDO; page-break sebelum halaman ke-2 dst)
  const detailPages = details.map((d, i) => (i > 0 ? '<div class="page-break"></div>' : '') + buildDetailHtml(d)).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Form PDO (Batch)</title>
<style>
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding:16px; }
  h2,h3,h4{ margin:8px 0; }
  table{ width:100%; border-collapse:collapse; margin-top:8px; }
  th,td{ border:1px solid #999; padding:6px 8px; font-size:12px; vertical-align:middle; }
  th{ background:#f2f2f2; }
  .text-end{ text-align:right; }
  .muted{ color:#666; font-size:12px; }
  .page-break{ page-break-before: always; }
  @page{ size:A4; margin:12mm; }
    /* === Print helpers agar header tabel muncul tiap halaman & baris tidak terpotong === */
  thead{ display: table-header-group; }
  tfoot{ display: table-row-group; }
  tr{ page-break-inside: avoid; }
  table, thead, tbody, tfoot, tr, td, th{ page-break-inside: auto; }
</style>
</head><body>
  ${detailPages || '<p class="muted">Tidak ada data.</p>'}
  <script>window.print();</script>
</body></html>`;

  const w = window.open('', '_blank'); w.document.write(html); w.document.close();
}

// === REPLACE: Bangun detail dari actuals STORE (server → read-only, tanpa progress) ===
async function buildDetailFromActuals(nomor){
  try{
    await resolvePdoActualKeys();

    const listHdr = STORE.getActual?.(PDO_ACT_KEYS.header) || [];
    const hdr = listHdr.find(x => String(x.nomor) === String(nomor));
    if(!hdr) return null;

    // --- helper normalisasi HK & BOR ---
    const normHK = (row)=>{
      const hkSku = Number(row.hk_sku ?? row.hkSKU ?? row.hk_s ?? 0);
      const hkBhl = Number(row.hk_bhl ?? row.hkBHL ?? row.hk_b ?? 0);

      let tipeHK = String(row.tipe_hk ?? row.jenis_tk ?? row.tipe_tk ?? '')
                    .trim().toUpperCase();
      if(!tipeHK){
        if(hkBhl>0 && hkSku===0) tipeHK = 'BHL';
        else if(hkSku>0 && hkBhl===0) tipeHK = 'SKU';
        else tipeHK = 'SKU'; // default aman bila tidak jelas
      }

      const hkUnified = (tipeHK==='BHL'
        ? (hkBhl || Number(row.jlh_hk ?? row.hk ?? 0))
        : (hkSku || Number(row.jlh_hk ?? row.hk ?? 0)));

      return {
        ...row,
        tipe_item: 'HK',
        tipe_hk: tipeHK,                       // <<— penting agar bisa ditampilkan
        hk: Number(hkUnified || 0),            // <<— dipakai di tabel
        luas_ha: Number(row.luas_ha ?? row.luas ?? 0),
        total_rp: Number(row.total_rp ?? row.total ?? 0)
      };
    };

    const normBOR = (row)=>{
      const qty   = Number(row.qty ?? row.volume ?? 0);
      const harga = Number(row.tarif_borongan ?? row.harga_borongan ?? row.harga ?? 0);
      let total = 0;
      if (row.total_rp != null)      total = Number(row.total_rp) || 0;
      else if (row.total != null)    total = Number(row.total) || 0;
      else                           total = (Number(row.qty ?? row.volume) || 0) * (Number(row.tarif_borongan ?? row.harga_borongan ?? row.harga) || 0);
      return {
        ...row,
        tipe_item: 'BOR',
        qty, tarif_borongan: harga,
        total_rp: total
      };
    };

    // 1) Koleksi items bila sudah terpisah
    let itemsHK  = STORE.getActual?.(PDO_ACT_KEYS.hk)  || [];
    let itemsBOR = STORE.getActual?.(PDO_ACT_KEYS.bor) || [];

    // 2) Fallback: satu koleksi gabungan (pdo_items / kpl.actual.pdo_items)
    if((!itemsHK.length && !itemsBOR.length) && typeof STORE?.getActual === 'function'){
      const all = STORE.getActual('pdo_items') || STORE.getActual('kpl.actual.pdo_items') || [];
      const filtered = (all||[]).filter(x => String(x.nomor)===String(nomor));

      // klasifikasi mutual-exclusive
      const classify = (row)=>{
        if(row==null) return null;
        if('tipe_item' in row){
          const t = String(row.tipe_item).toUpperCase();
          if(t==='HK')  return 'HK';
          if(t==='BOR') return 'BOR';
        }
        if(row.qty!=null || row.tarif_borongan!=null || row.harga_borongan!=null) return 'BOR';
        if(row.hk!=null || row.luas_ha!=null || row.jlh_hk!=null || row.hk_sku!=null || row.hk_bhl!=null) return 'HK';
        return null;
      };

      itemsHK  = filtered.filter(x => classify(x)==='HK').map(normHK);
      itemsBOR = filtered.filter(x => classify(x)==='BOR').map(normBOR);
    }else{
      // sudah terpisah: filter per nomor + normalisasi
      itemsHK  = (itemsHK  || []).filter(x => String(x.nomor)===String(nomor)).map(normHK);
      itemsBOR = (itemsBOR || []).filter(x => String(x.nomor)===String(nomor)).map(normBOR);
    }

    const header = {
      nomor: hdr.nomor,
      periode: fPeriode(hdr.periode),
      estate_id: hdr.estate_id,
      rayon_id:  hdr.rayon_id,
      divisi_id: hdr.divisi_id || hdr.divisi || '',
      ref_rkb:   hdr.ref_rkb || '',
      upah_hk_sku: Number(hdr.upah_hk_sku||0),
      upah_hk_bhl: Number(hdr.upah_hk_bhl||0),
      premi_panen: Number(hdr.premi_panen||0),
      premi_non_panen: Number(hdr.premi_non_panen||0),
      target_produksi_ton: Number(hdr.target_produksi_ton||0),
      created_ts: hdr.created_ts || hdr.created_at || '',
      asst_ts:    hdr.asst_ts || '',
      askep_ts:   hdr.askep_ts || '',
      manager_ts: hdr.manager_ts || '',
      status:     hdr.status || 'submitted',
    };

    const items = [...itemsHK, ...itemsBOR];
    return { header, items };
  }catch(e){
    console.warn('[PDO] buildDetailFromActuals error:', e);
    return null;
  }
}

// === [NEW] Rehydrate draft lokal dari actuals server bila status server = 'draft' ===
async function rehydrateDraftFromActuals(nomor){
  // Sudah ada draft? langsung kembalikan
  let arr = getDrafts();
  const idx = arr.findIndex(x => String(x.nomor) === String(nomor));
  if (idx > -1) return arr[idx];

  // Ambil detail dari actuals (LOCAL cache STORE) → build jadi draft lokal
  const detail = await buildDetailFromActuals(nomor);
  if (!detail || !detail.header) return null;

  const h = detail.header;
  // Paksa status 'draft' agar bisa disunting kembali (server memang sudah draft)
  const draftObj = {
    nomor: h.nomor,
    periode: h.periode,
    estate_id: h.estate_id,
    rayon_id:  h.rayon_id,
    divisi_id: h.divisi_id,
    ref_rkb:   h.ref_rkb || '',
    upah_hk_sku: Number(h.upah_hk_sku||0),
    upah_hk_bhl: Number(h.upah_hk_bhl||0),
    premi_panen: Number(h.premi_panen||0),
    premi_non_panen: Number(h.premi_non_panen||0),
    target_produksi_ton: Number(h.target_produksi_ton||0),
    created_ts: h.created_ts || '',
    asst_ts:    h.asst_ts || '',
    askep_ts:   h.askep_ts || '',
    manager_ts: h.manager_ts || '',
    status:     'draft',
    // pisahkan items:
    hk:  (detail.items||[]).filter(x=> String(x.tipe_item).toUpperCase()==='HK'),
    borongan: (detail.items||[]).filter(x=> String(x.tipe_item).toUpperCase()==='BOR'),
    __serverLinked: true // penanda: draft ini hasil rehydrate dari server
  };

  // Simpan ke draft lokal (replace kalau ada)
  arr = getDrafts();
  const idx2 = arr.findIndex(x => String(x.nomor) === String(nomor));
  if (idx2 > -1) arr[idx2] = draftObj; else arr.push(draftObj);
  setDrafts(arr);

  return draftObj;
}



// ===== Row actions – gunakan buffer agar router pasti match =====
async function viewRow(nomor){
  // 1) Coba draft lokal dulu (perilaku lama)
  const d = (getDrafts()||[]).find(x=> String(x.nomor)===String(nomor));
  if(d){
    U.S.set('pdo.form.buffer', d);
    U.S.set('pdo.form.readonly', true);
    location.hash = '#/pdo/form';
    return;
  }

  // 2) Tidak ada draft → baca dari actuals (LOCAL), tanpa progress bar
  const detail = await buildDetailFromActuals(nomor);
  if(!detail){
    U.alert('Data tidak ditemukan di draft maupun actuals lokal. Silakan Refresh Status atau sinkronisasi.');
    return;
  }

  // pisah HK & BOR untuk buffer form
  const hk  = (detail.items||[]).filter(x => String(x.tipe_item).toUpperCase()==='HK');
  const bor = (detail.items||[]).filter(x => String(x.tipe_item).toUpperCase()==='BOR');

  if(!hk.length && !bor.length){
    U.alert('Detail item tidak ditemukan untuk nomor tersebut.');
    return;
  }

  // simpan sedikit ke cache detail (opsional, bantu cetak)
  setDetailToCache(nomor, detail.header, detail.items);

  // bentuk buffer mirip draft → form tetap kompatibel
  const buf = {
    nomor: detail.header.nomor,
    periode: detail.header.periode,
    estate_id: detail.header.estate_id,
    rayon_id:  detail.header.rayon_id,
    divisi_id: detail.header.divisi_id,
    ref_rkb:   detail.header.ref_rkb || '',
    upah_hk_sku: Number(detail.header.upah_hk_sku||0),
    upah_hk_bhl: Number(detail.header.upah_hk_bhl||0),
    premi_panen: Number(detail.header.premi_panen||0),
    premi_non_panen: Number(detail.header.premi_non_panen||0),
    target_produksi_ton: Number(detail.header.target_produksi_ton||0),
    created_ts: detail.header.created_ts || '',
    asst_ts:    detail.header.asst_ts || '',
    askep_ts:   detail.header.askep_ts || '',
    manager_ts: detail.header.manager_ts || '',
    status:     detail.header.status || 'submitted',
    hk,
    borongan: bor,
    __history: true,
    __serverLinked: true
  };

  U.S.set('pdo.form.buffer', buf);
  U.S.set('pdo.form.readonly', true);
  location.hash = '#/pdo/form';
}


  async function editRow(nomor){
  // Coba draft lokal
  let d = (getDrafts()||[]).find(x=> String(x.nomor)===String(nomor));

  // Jika belum ada, tapi status server kemungkinan 'draft', rehydrate dari actuals
  if (!d) {
    // optional: cek status dari daftar gabungan 'data'
    const rec = (data||[]).find(x => String(x.nomor)===String(nomor));
    if (rec && String(rec.status||'').toLowerCase()==='draft') {
      d = await rehydrateDraftFromActuals(nomor);
    }
  }
  if(!d){ U.alert('Draft tidak ditemukan. Silakan "Perbarui Status" dulu.'); return; }

  U.S.set('pdo.form.buffer', d);
  U.S.del('pdo.form.readonly');
  location.hash = '#/pdo/form';
}

  function delRow(nomor){
    const arr = getDrafts().filter(x=> String(x.nomor)!==String(nomor));
    setDrafts(arr);
    data = arr; sortData(data);
    U.toast('Draft dihapus.'); renderRows(); renderPager(); updateInfo();
  }

  async function refreshStatus(nomor){
  const btns = [...document.querySelectorAll(`button[data-a="refresh"][data-nomor="${nomor}"]`)];
  btns.forEach(b=> b.disabled = true);

  try{
    U.progressOpen('Perbarui status...'); U.progress(30,'Ambil status dari server');
    await resolvePdoActualKeys();
    const r = await API.call('pullMaster', {}); // tarik actuals terbaru ke local

    if(r.ok){
      const list = STORE.getActual?.(PDO_ACT_KEYS.header) || [];
      const found = list.find(x => String(x.nomor)===String(nomor));
      if(found){
        const arr = getDrafts();
        const idx = arr.findIndex(x => String(x.nomor)===String(nomor));
        if(idx > -1){
          arr[idx].status     = found.status || arr[idx].status;
          arr[idx].manager_ts = found.manager_ts || arr[idx].manager_ts;
          arr[idx].askep_ts   = found.askep_ts   || arr[idx].askep_ts;
          arr[idx].asst_ts    = found.asst_ts    || arr[idx].asst_ts;
          arr[idx].updated_at = new Date().toISOString();
          setDrafts(arr);

          // perbarui sumber gabungan
          data = mergeUniqueByNomor(
            (getDrafts()||[]).map(r => ({...r, periode:fPeriode(r.periode)})),
            readHistoryPdoFromActuals().map(r => ({...r, periode:fPeriode(r.periode)}))
          );
          sortData(data);
        }
        // Jika status server sekarang 'draft' dan draft lokal belum ada → rehydrate
          if (String(found.status||'').toLowerCase() === 'draft') {
            const hasLocal = (getDrafts()||[]).some(x => String(x.nomor)===String(nomor));
            if (!hasLocal) {
              await rehydrateDraftFromActuals(nomor);
            }
          }
        U.toast('Status diperbarui.', 'success');
      }else{
        U.toast('Nomor tidak ditemukan di actuals untuk scope Anda.', 'warning');
      }
    }else{
      U.toast('Gagal ambil status.', 'danger');
    }
  }catch(e){
    U.alert(e.message || 'Gagal memperbarui status');
  }finally{
    U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(),200);
    renderRows(); renderPager(); updateInfo();
    btns.forEach(b=> b.disabled = false);
  }
}


  async function syncRow(nomor){
  // Pastikan ada draft lokal; kalau belum ada tapi server status draft → rehydrate dulu
  let arr = getDrafts();
  let obj = arr.find(x=> String(x.nomor)===String(nomor));
  if (!obj) {
    const rec = (data||[]).find(x => String(x.nomor)===String(nomor));
    if (rec && String(rec.status||'').toLowerCase()==='draft') {
      obj = await rehydrateDraftFromActuals(nomor);
      arr = getDrafts(); // refresh ref
    }
  }
  if(!obj){ U.alert('Draft tidak ditemukan. Silakan "Perbarui Status" dulu.'); return; }

  const payload = {
    row: {
      nomor: obj.nomor, ref_rkb: obj.ref_rkb, periode: obj.periode,
      estate_id: String(obj.estate_id ?? '').trim(),
      rayon_id:  String(obj.rayon_id  ?? '').trim(),
      divisi_id: obj.divisi_id,
      upah_hk_bhl: obj.upah_hk_bhl, upah_hk_sku: obj.upah_hk_sku,
      premi_panen: obj.premi_panen, premi_non_panen: obj.premi_non_panen,
      target_produksi_ton: obj.target_produksi_ton,
      created_ts: obj.created_ts, askep_ts: obj.askep_ts||'', manager_ts: obj.manager_ts||'',
    },
    items: { hk: obj.hk||[], borongan: obj.borongan||[] }
  };

  try{
    U.progressOpen('Kirim PDO...'); U.progress(40,'Kirim data');
    const res = await API.call('pushPDOv2', payload);
    if(!res.ok){ throw new Error(res.error||'Gagal sync PDO'); }
    obj.status = 'submitted';
    obj.updated_at = new Date().toISOString();
    setDrafts(arr); data = mergeUniqueByNomor(
      (getDrafts()||[]).map(r => ({...r, periode:fPeriode(r.periode)})),
      readHistoryPdoFromActuals().map(r => ({...r, periode:fPeriode(r.periode)}))
    );
    sortData(data);
    U.toast('PDO terkirim. Menunggu persetujuan.','success');
  }catch(e){
    U.alert(e.message||'Gagal sync PDO');
  }finally{
    U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(),200);
    renderRows(); renderPager(); updateInfo();
  }
}


  // ===== Build UI (selaras RKB) =====
  async function build(){
    const periodes = uniquePeriodes(data);
    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">${which==='outbox'?'Outbox':'Draft PDO'}</h4>
          <div class="d-flex flex-wrap gap-2">
            <button id="btn-new-pdo" class="btn btn-sm btn-danger">Buat PDO Baru</button>
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
              <input id="f-search" class="form-control" placeholder="nomor, periode, divisi, ref RKB, status, total..." />
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
                <th>No PDO</th>
                <th>Periode</th>
                <th>Divisi</th>
                <th>Ref. RKB</th>
                <th class="text-end">Total (Rp)</th>
                <th>Status</th>
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

    U.qs('#btn-new-pdo').onclick = openNewPdoModal;
    U.qs('#btn-xlsx').onclick = exportXlsx;
    U.qs('#btn-pdf').onclick  = printPdf;

    const sInput = U.qs('#f-search'); sInput.value = q;
    sInput.addEventListener('input', ()=>{ q=sInput.value; page=1; renderRows(); renderPager(); updateInfo(); });
    U.qs('#f-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderRows(); renderPager(); updateInfo(); };
    U.qs('#f-periode').onchange  = (e)=>{ periodeFilter=e.target.value; page=1; renderRows(); renderPager(); updateInfo(); };

    renderRows(); renderPager(); updateInfo();
  }

  // ==== Modal Buat PDO Baru (dari RKB) ====
// render modal sekali
(function ensureNewPdoModal(){
  if (document.getElementById('pdo-new-modal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
<div class="modal fade" id="pdo-new-modal" tabindex="-1">
  <div class="modal-dialog modal-lg modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Buat PDO Baru (Pilih RKB)</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="mb-2">
          <label class="form-label">Cari RKB</label>
          <input id="npdo-q" class="form-control" placeholder="ketik nomor/periode/divisi..." />
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle">
            <thead><tr>
              <th style="width:40px">#</th>
              <th>No. RKB</th>
              <th>Periode</th>
              <th>Divisi</th>
              <th>Estate</th>
              <th>Rayon</th>
              <th style="width:90px">Aksi</th>
            </tr></thead>
            <tbody id="npdo-rows"><tr><td colspan="7" class="text-muted">Memuat...</td></tr></tbody>
          </table>
        </div>
        <div class="small text-muted" id="npdo-info"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Tutup</button>
      </div>
    </div>
  </div>
</div>`;
  document.body.appendChild(wrap.firstElementChild);
})();

function _pdoHasRefRkb(ref){
  if(!ref) return false;
  // 1) Draft lokal
  const drafts = (getDrafts()||[]);
  if (drafts.some(x => _lc(x.ref_rkb) === _lc(ref))) return true;

  // 2) Actuals lokal (hasil pull server)
  const list = STORE.getActual?.(PDO_ACT_KEYS.header) || [];
  if (Array.isArray(list) && list.some(x => _lc(x.ref_rkb||'') === _lc(ref))) return true;

  return false;
}

function _pdoRefBadge(ref){
  return _pdoHasRefRkb(ref)
    ? `<span class="badge rounded-pill text-bg-warning ms-1" title="RKB ini sudah memiliki PDO">Sudah ada PDO</span>`
    : '';
}

function _newPdoSeedFromRkb(row){
  const ref = _rkbNomor(row);
  return {
    nomor: '', // akan diisi oleh pdo_form.js saat dibuka
    ref_rkb: ref,
    periode: _rkbPeriode(row),
    estate_id: _rkbEstate(row),
    rayon_id:  _rkbRayon(row),
    divisi_id: _rkbDivisi(row),
    upah_hk_bhl: 0, upah_hk_sku: 0, premi_panen: 0, premi_non_panen: 0,
    target_produksi_ton: 0,
    hk: [], borongan: [],
    created_ts: null, askep_ts: null, manager_ts: null,
    status: 'draft'
  };
}

function _renderRkbTable(rows){
  const tb = document.getElementById('npdo-rows');
  const info = document.getElementById('npdo-info');
  if(!rows.length){
    tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Tidak ada RKB.</td></tr>`;
    info.textContent = '';
    return;
  }
  tb.innerHTML = rows.map((r,i)=>{
    const no  = _rkbNomor(r);
    const per = _rkbPeriode(r);
    const div = _rkbDivisi(r);
    const est = _rkbEstate(r);
    const ray = _rkbRayon(r);
    const disabled = _pdoHasRefRkb(no) ? 'disabled' : '';
    return `<tr>
      <td>${i+1}</td>
      <td>${no} ${_pdoRefBadge(no)}</td>
      <td>${per||'-'}</td>
      <td>${div||'-'}</td>
      <td>${est||'-'}</td>
      <td>${ray||'-'}</td>
      <td><button class="btn btn-sm btn-danger" data-newpdo="${no}" ${disabled}>Pilih</button></td>
    </tr>`;
  }).join('');
  info.textContent = `Menampilkan ${rows.length} RKB.`;
  tb.querySelectorAll('button[data-newpdo]').forEach(b=>{
    b.onclick = ()=> onPickRkbForNewPdo(String(b.dataset.newpdo));
  });
}

function openNewPdoModal(){
  const all = _collectRKBHeaders();
  // urutkan terbaru di atas berdasarkan periode + nomor
  const rows = (all||[]).slice().sort((a,b)=>{
    const pa = _rkbPeriode(a), pb = _rkbPeriode(b);
    return String(pb).localeCompare(String(pa)) || _rkbNomor(b).localeCompare(_rkbNomor(a));
  });

  const modalEl = document.getElementById('pdo-new-modal');
  const m = bootstrap?.Modal ? new bootstrap.Modal(modalEl) : null;
  _renderRkbTable(rows);
  if(m) m.show();

  const q = document.getElementById('npdo-q');
  q.value = '';
  q.oninput = ()=>{
    const s = _lc(q.value);
    const filtered = rows.filter(r=>{
      return [_rkbNomor(r), _rkbPeriode(r), _rkbDivisi(r), _rkbEstate(r), _rkbRayon(r)]
        .some(v => _lc(v).includes(s));
    });
    _renderRkbTable(filtered);
  };
}

function onPickRkbForNewPdo(nomorRkb){
  // Validasi unik: kalau sudah ada PDO, blok
  if (_pdoHasRefRkb(nomorRkb)){
    U.alert('Setiap No. RKB hanya boleh memiliki 1 PDO.\nRKB terpilih sudah memiliki PDO.');
    return;
  }
  // Bangun seed dari sumber RKB
  const row = (_collectRKBHeaders()||[]).find(x => _rkbNomor(x) === nomorRkb);
  if(!row){ U.alert('RKB tidak ditemukan di lokal.'); return; }

  const seed = _newPdoSeedFromRkb(row);

  // Simpan buffer untuk form & buka form (read/write)
  U.S.set('pdo.form.buffer', seed);
  U.S.del('pdo.form.readonly');
  location.hash = '#/pdo/form';

  // tutup modal jika ada
  try{
    const modalEl = document.getElementById('pdo-new-modal');
    const inst = bootstrap.Modal.getInstance(modalEl);
    if(inst) inst.hide();
  }catch(_){}
}

  function renderRows(){
    const arr = applyFilter();
    const slice = getPageSlice(arr);
    const tb = U.qs('#rows');

    if(!slice.length){
      tb.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Tidak ada data.</td></tr>`;
      return;
    }

    tb.innerHTML = slice.map((r,idx)=>{
      const totalPrimary = Number(r.total_rp ?? r.total ?? 0);
      const totalHK   = (r.hk||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
      const totalBor  = (r.borongan||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
      const totalPremi = Number(r.premi_panen||0) + Number(r.premi_non_panen||0);
      const grand = Number.isFinite(totalPrimary) && totalPrimary>0
        ? totalPrimary
        : (totalHK + totalBor + totalPremi);

      const sRaw = String(r.status||'draft').toLowerCase();
      const badgeCls =
        sRaw==='submitted' ? 'text-bg-warning' :
        sRaw==='askep_approved'  ? 'text-bg-info' :
        sRaw==='full_approved' ? 'text-bg-success' :
        'text-bg-secondary';

      const i = (page-1)*pageSize + idx;
      const btn = (name, title, action, nomor, enabled=true)=>{
        const dis = enabled ? '' : 'disabled';
        return `<button class="btn btn-outline-secondary icon-btn" title="${title}" data-a="${action}" data-nomor="${nomor}" ${dis}>
                  <span class="i i-${name}">${ICON[name]}</span>
                </button>`;
      };

const isHistory = !!r.__history;
const isDraft   = String(r.status||'draft').toLowerCase() === 'draft';
const canEdit   = isDraft;
const canSync   = isDraft; 
const canDelete = !isHistory && canEdit && !r.__serverLinked;

const histBadge = isHistory
  ? '<span class="badge bg-light text-dark border ms-1" title="Riwayat dari server (read-only)">Server</span>'
  : '';


    return `<tr>
  <td>${i+1}</td>
  <td>${ensureNomor(r).nomor || '-'}</td>
  <td>${fPeriode(r.periode)||'-'}</td>
  <td>${labelDivisi(r.divisi_id, 'code')}</td>
  <td>${r.ref_rkb||'-'}</td>
  <td class="text-end">${U.fmt ? U.fmt.idr(grand) : (Number(grand)||0).toLocaleString('id-ID')}</td>
  <td><span class="badge ${badgeCls}">${r.status||'draft'}</span>${histBadge}</td>
  <td>
    <div class="btn-group btn-group-sm">
      ${btn('view','Lihat (detail)','view', r.nomor, true)}
      ${btn('edit','Edit','edit', r.nomor, canEdit)}
      ${btn('del','Hapus','del', r.nomor, canDelete)}
      ${btn('sync','Kirim/Sync ke server','sync', r.nomor, !!canSync)}
      ${btn('refresh','Perbarui Status','refresh', r.nomor, true)}
    </div>
  </td>
</tr>`;

    }).join('');

    tb.querySelectorAll('button[data-a]').forEach(b=>{
      const act=b.dataset.a, nomor=b.dataset.nomor;
      if(act==='view')    b.onclick = ()=> viewRow(nomor);
      if(act==='edit')    b.onclick = ()=> editRow(nomor);
      if(act==='del')     b.onclick = ()=> delRow(nomor);
      if(act==='sync')    b.onclick = ()=> syncRow(nomor);
      if(act==='refresh') b.onclick = ()=> refreshStatus(nomor);
    });
  }

  function renderPager(){
    const ul = U.qs('#pager');
    const arr = applyFilter();
    const pc = pageCountOf(arr.length);

    function li(label, to, disabled=false, active=false){
      const el=document.createElement('li');
      el.className=`page-item ${disabled?'disabled':''} ${active?'active':''}`;
      el.innerHTML = `<a class="page-link">${label}</a>`;
      if(!disabled && !active){
        el.onclick=()=>{ page=to; renderRows(); renderPager(); window.scrollTo({top:0,behavior:'smooth'}); updateInfo(); };
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

  function updateInfo(){
    const arr = applyFilter();
    const slice = getPageSlice(arr);
    const start=(page-1)*pageSize + 1;
    const end = start + slice.length - 1;
    U.qs('#info').textContent = `${slice.length?fmtN(start):0}–${slice.length?fmtN(end):0} dari ${fmtN(arr.length)} PDO`;
  }

};

// Alias kompat
Pages.pdoDraft = Pages.pdoList;

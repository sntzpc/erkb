// js/pages/rkh/rkh_form.js
// RKH Form — local-first data flow + robust RKB picker
// - Masters dari localStorage (konsisten dgn RKB)
// - RKB Picker: baca Draft + Actual (LocalStorage/STORE) + API fallback
// - Import dari RKB: detail items+bahan; skala harian (bagi 20) opsional
// - Import dari RKH tanggal lain (local-first)
// - Draft RKH tersimpan ke localStorage

window.Pages = window.Pages || {};
Pages.rkhForm = function () {
  const root = U.qs("#app-root");
  const profile = SESSION.profile();
  if (!profile) { location.hash = "#/login"; return; }

  // ====== MASTER (konsisten dengan rkb_form.js) ======
  const M = {
    activity: U.S.get("kpl.master.yactivity", []) || [],
    blok:     U.S.get("kpl.master.yblok", []) || [],
    komplek:  U.S.get("kpl.master.ykomplek", []) || [],
    bahan:    U.S.get("kpl.master.ybahan", []) || [],
    org:      U.S.get("kpl.master.yorg_map", []) || [],
    estate:   U.S.get("kpl.master.yestate", []) || [],
  };

  // ====== MAP USER -> ORG ======
  const myOrg =
    (M.org || []).find(
      (x) =>
        (x.username || "").toLowerCase() ===
        (profile.username || "").toLowerCase()
    ) || {};
  const estateObj =
    (M.estate || []).find((e) => e.id === (myOrg.estate_id || "")) || {};
  const DIVISI     = myOrg.divisi_id || profile.divisi || "UNKNOWN";
  const ESTATE     = estateObj.nama_panjang || profile.estate_full || "UNKNOWN ESTATE";
  const DIVISI_ID  = myOrg.divisi_id || profile.divisi_id || DIVISI;
  const ESTATE_ID  = myOrg.estate_id || profile.estate_id || "";
  const RAYON_ID   = myOrg.rayon_id || profile.rayon_id || "";

  // ====== KONST VERSI DATA ======
  const DAILY_SCALE       = 20; // ubah ke 1 bila tak ingin bagi 20 saat turunan harian
  const RKB_ACTUAL_HDR    = "kpl.actual.rkb";
  const RKB_ACTUAL_ITEMS  = "kpl.actual.rkb_items";
  const RKB_ACTUAL_BHN    = "kpl.actual.rkb_bahan";
  const RKH_ACTUAL_HDR    = "kpl.actual.rkh";
  const RKH_ACTUAL_ITEMS  = "kpl.actual.rkh_items";
  const RKH_ACTUAL_BHN    = "kpl.actual.rkh_bahan";
  const RKB_CACHE_KEY     = "rkb.cache.headers"; // cache header RKB (normalized)
  const RKB_DETAIL_ITEMS  = "rkb.cache.items";   // map: nomor -> items
  const RKB_DETAIL_BAHAN  = "rkb.cache.bahan";   // map: nomor -> bahan
  const RKH_CACHE_HDR_KEY = "rkh.cache.headers"; // cache header RKH (normalized)
  const BAHAN_UNIT_KEY    = "kpl.master.ybahan_unit";

  // Persist actuals dari payload pullMaster ke LocalStorage + siapkan cache header
function stashRkbActualsFromServerPayload(payload){
  // payload = response dari API.pullMaster()
  try{
    const act = (payload && payload.actuals) || {};
    const H = Array.isArray(act.rkb) ? act.rkb : [];
    const I = Array.isArray(act.rkb_items) ? act.rkb_items : [];
    const B = Array.isArray(act.rkb_bahan) ? act.rkb_bahan : [];

    U.S.set(RKB_ACTUAL_HDR,   H);
    U.S.set(RKB_ACTUAL_ITEMS, I);
    U.S.set(RKB_ACTUAL_BHN,   B);

    // Normalisasi ke bentuk yang dipakai picker
    const normalized = (H||[]).map(h => ({
  nomor:       String(h.nomor || h.no || ''),
  periode:     canonPeriode(h.periode),
  divisi:      h.divisi || h.divisi_id || '',
  estate_full: h.estate_full || '',
  status:      h.status || 'created'
})).filter(h => h.nomor);

    U.S.set(RKB_CACHE_KEY, normalized);
    return normalized;
  }catch(e){
    console.warn('[RKH] stashRkbActualsFromServerPayload error:', e);
    return [];
  }
}


  // ====== UTIL ======
  function _str(v) { return String(v ?? "").trim(); }
  function _num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function _isPos(n){ return _num(n) > 0; }
  function _required(v){ return _str(v).length > 0; }
  function uniqBy(arr, keyFn) {
    const seen = new Set(); const out = [];
    for (const x of arr || []) { const k = keyFn(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
    return out;
  }
  function fPeriode(p) {
    if (!p) return "";
    const s = String(p).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d)) return s;
    const tz = "Asia/Jakarta";
    const y = new Intl.DateTimeFormat("id-ID", { timeZone: tz, year: "numeric" }).format(d);
    const m = new Intl.DateTimeFormat("id-ID", { timeZone: tz, month: "2-digit" }).format(d);
    return `${y}-${m}`;
  }

  function canonPeriode(p){
  const s = String(p||'').trim();
  if (!s) return '';
  // Terima variasi: "YYYY-M" / "YYYY-MM" / tanggal
  if (/^\d{4}-\d{1,2}$/.test(s)){
    const [y,m] = s.split('-');
    return `${y}-${String(m).padStart(2,'0')}`;
  }
  // jika berupa tanggal, pakai fPeriode
  return fPeriode(s);
}

// === PATCH: helper lokasi seragam → array of {type,name,luas} ===
function normalizeLokasi(raw, masters={blok:M.blok, komplek:M.komplek}) {
  // Sudah array objek?
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') {
    return raw.map(l => ({ type: _str(l.type||''), name: _str(l.name||l.kode||l), luas: _num(l.luas)||undefined }));
  }
  // String "A1, A2" → pecah
  const arr = _str(raw).split(',').map(s => s.trim()).filter(Boolean);
  // coba deteksi dari master blok/komplek utk dapatkan luas
  const idxBlok   = new Map((masters.blok||[]).map(b => [String(b.kode).toLowerCase(), _num(b.luas_ha)]));
  const idxKompl  = new Map((masters.komplek||[]).map(k => [String(k.kode).toLowerCase(), _num(k.luas_ha||k.luas)]));
  return arr.map(nm => {
    const key = nm.toLowerCase();
    const luasBlok  = idxBlok.get(key);
    const luasKompl = idxKompl.get(key);
    return {
      type: (luasBlok!=null && !isNaN(luasBlok)) ? 'blok' : ((luasKompl!=null && !isNaN(luasKompl)) ? 'komplek' : ''),
      name: nm,
      luas: (luasBlok!=null && !isNaN(luasBlok)) ? luasBlok :
            (luasKompl!=null && !isNaN(luasKompl)) ? luasKompl : undefined
    };
  });
}

// ====== RKH NUMBERING (Asia/Jakarta) ======
function _tzPartsWIB(d = new Date()) {
  // ambil komponen waktu WIB secara aman
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return {
    YY: parts.year, MM: parts.month, DD: parts.day,
    hh: parts.hour,  mm: parts.minute, ss: parts.second
  };
}
function _sanDiv(v){ return String(v||'').replace(/[^A-Za-z0-9]/g,'') || 'XX'; }

// kumpulkan semua nomor RKH yang kita tahu (draft lokal + actual cache)
function _knownRkhNumbersSet(){
  const set = new Set();
  const drafts = U.S.get('rkh.drafts', []) || [];
  drafts.forEach(d => { const n = String(d?.header?.nomor||'').trim(); if(n) set.add(n); });

  const actual = U.S.get(RKH_ACTUAL_HDR, []) || [];
  (Array.isArray(actual) ? actual : []).forEach(h => { const n = String(h?.nomor||'').trim(); if(n) set.add(n); });

  // cache headers
  const cached = U.S.get(RKH_CACHE_HDR_KEY, []) || [];
  (Array.isArray(cached) ? cached : []).forEach(h => { const n = String(h?.nomor||'').trim(); if(n) set.add(n); });

  return set;
}

// bentuk nomor: RKH-{DIV}{YYMMDD}{hhmmss}
function _formatRkhNumber(divisi, dateObj){
  const d = _tzPartsWIB(dateObj);
  const DIV = _sanDiv(divisi);
  return `RKH-${DIV}${d.YY}${d.MM}${d.DD}${d.hh}${d.mm}${d.ss}`;
}

// pastikan unik: jika bentrok, geser +1 detik hingga unik
function _ensureUniqueRkhNumber(divisi){
  const seen = _knownRkhNumbersSet();
  let t = new Date();
  for (let i=0; i<20; i++){ // 20 kali cukup; secara praktis jarang sekali perlu lebih
    const cand = _formatRkhNumber(divisi, t);
    if (!seen.has(cand)) return cand;
    t = new Date(t.getTime() + 1000);
  }
  // fallback ekstrem: tambahkan milidetik kalau benar-benar perlu
  const d = _tzPartsWIB(new Date());
  const DIV = _sanDiv(divisi);
  return `RKH-${DIV}${d.YY}${d.MM}${d.DD}${d.hh}${d.mm}${d.ss}` + String(Date.now()%1000).padStart(3,'0');
}

// helper: generate & assign ke F.nomor bila kosong
function ensureNomorRkhIfEmpty(reason = ''){
  if (_str(F.nomor)) return F.nomor;
  const divForNum = F.divisi_id || DIVISI_ID || DIVISI || 'XX';
  const nomor = _ensureUniqueRkhNumber(divForNum);
  F.nomor = nomor;
  saveBufferThin();  // simpan ke buffer agar tampil di header
  console.debug('[RKH] nomor generated:', nomor, 'reason:', reason);
  return nomor;
}


  // ====== MASTER BAHAN: index cepat nama -> (no_material, satuan_default) ======
  const MASTER_BAHAN = M.bahan;
  const bahanIndexByName = {};
  (MASTER_BAHAN || []).forEach((b) => {
    const nm = _str(b.nama_bahan || b.nama).toLowerCase();
    if (!nm) return;
    bahanIndexByName[nm] = {
      no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no),
      satuan_default: _str(b.satuan_default ?? b.satuan),
    };
  });
  function getBahanMetaByName(name) {
    const key = _str(name).toLowerCase();
    return key ? bahanIndexByName[key] || null : null;
  }
  function findBahanInMaster(name) {
    const key = _str(name).toLowerCase();
    if (!key) return null;
    const meta = getBahanMetaByName(key);
    if (meta && _str(meta.no_material)) {
      return { nama: name, no_material: _str(meta.no_material), satuan_default: _str(meta.satuan_default) };
    }
    const hit = (MASTER_BAHAN || []).find(
      (b) => _str(b.nama_bahan || b.nama).toLowerCase() === key
    );
    if (hit) {
      const noMat = _str(hit.no_material ?? hit.kode ?? hit.code ?? hit.id ?? hit.no);
      if (noMat) return { nama: name, no_material: noMat, satuan_default: _str(hit.satuan_default ?? hit.satuan) };
    }
    return null;
  }

  // ====== NORMALIZER ACTUAL ======
function lsActualRkbHeaders() {
  let raw = U.S.get(RKB_ACTUAL_HDR, []) || [];

  // Bentuk lama: { rows: [...] }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.rows)) {
    raw = raw.rows;
  }
  // Bentuk map: { "RKB-...": {nomor,...}, ... }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = Object.values(raw);
  }
  if (!Array.isArray(raw)) raw = [];

  return raw
    .map(h => {
      const nomor = _str(h.nomor || h.no);
      const per   = canonPeriode(h.periode);
      return {
        nomor,
        periode: per,
        divisi: h.divisi || h.divisi_id || '',
        estate_full: h.estate_full || '',
        status: h.status || 'created',
        rayon_id: h.rayon_id || '',
        estate_id: h.estate_id || '',
        divisi_id: h.divisi_id || h.divisi || '',
      };
    })
    .filter(h => h.nomor);
}

  function lsActualRkbItemsByNomor(nomor) {
    const all = U.S.get(RKB_ACTUAL_ITEMS, []) || [];
    return all.filter((x) => _str(x.nomor) === _str(nomor));
  }
  function lsActualRkbBahanByNomor(nomor) {
    const all = U.S.get(RKB_ACTUAL_BHN, []) || [];
    return all.filter((x) => _str(x.nomor) === _str(nomor));
  }

  function lsActualRkhHeadersByDate(tglYmd) {
    const rows = U.S.get(RKH_ACTUAL_HDR, []) || [];
    return (rows || [])
      .filter((h) => _str(h.tanggal) === _str(tglYmd))
      .map((h) => ({
        nomor: _str(h.nomor),
        tanggal: _str(h.tanggal),
        periode: _str(h.periode),
        divisi: h.divisi || h.divisi_id || "",
        estate_full: h.estate_full || "",
        source: "server",
      }))
      .filter((h) => h.nomor);
  }
  function lsActualRkhItemsByNomor(nomor) {
    const all = U.S.get(RKH_ACTUAL_ITEMS, []) || [];
    return all.filter((x) => _str(x.nomor) === _str(nomor));
  }
  function lsActualRkhBahanByNomor(nomor) {
    const all = U.S.get(RKH_ACTUAL_BHN, []) || [];
    return all.filter((x) => _str(x.nomor) === _str(nomor));
  }

  // ====== WARM ACTUALS (STORE → LS) ======
async function warmRkbActualsAll(){
  // 0) kalau STORE sudah berisi, pakai dulu (paling murah)
  try{
    if (typeof STORE?.ensureWarm === 'function') await STORE.ensureWarm();
    const H = STORE.getActual?.('rkb')        || STORE.getActual?.('RKB')        || [];
    const I = STORE.getActual?.('rkb_items')  || STORE.getActual?.('RKB_ITEMS')  || [];
    const B = STORE.getActual?.('rkb_bahan')  || STORE.getActual?.('RKB_BAHAN')  || [];
    if (H.length || I.length || B.length){
      U.S.set(RKB_ACTUAL_HDR,   Array.isArray(H)?H:[]);
      U.S.set(RKB_ACTUAL_ITEMS, Array.isArray(I)?I:[]);
      U.S.set(RKB_ACTUAL_BHN,   Array.isArray(B)?B:[]);
      const normalized = (H||[]).map(h => ({
        nomor:       String(h.nomor || h.no || ''),
        periode:     String(h.periode || ''),
        divisi:      h.divisi || h.divisi_id || '',
        estate_full: h.estate_full || '',
        status:      h.status || 'created'
      })).filter(h => h.nomor);
      U.S.set(RKB_CACHE_KEY, normalized);
      return normalized;
    }
  }catch(e){
    console.warn('[RKH] warm from STORE failed, will use API:', e);
  }

  // 1) Panggil server langsung dan PAKAI payload-nya
  try{
    const r = await API.call?.('pullMaster', {});
    if (r?.ok){
      const normalized = stashRkbActualsFromServerPayload(r);
      return normalized;
    }
  }catch(e){
    console.warn('[RKH] pullMaster API error:', e);
  }

  // 2) Fallback lokal (kalau ada sisa)
  const local = lsActualRkbHeaders();
  if (local.length){
    U.S.set(RKB_CACHE_KEY, local);
    return local;
  }
  return [];
}


  // ====== RKB HEADERS (cache-first; bisa force server) ======
  function inMyScope(r) {
    // jika org punya scope, filter; jika kosong, loloskan
    if (RAYON_ID && _str(r.rayon_id) && _str(r.rayon_id) !== _str(RAYON_ID)) return false;
    if (ESTATE_ID && _str(r.estate_id) && _str(r.estate_id) !== _str(ESTATE_ID)) return false;
    if (DIVISI_ID && _str(r.divisi_id || r.divisi) && _str(r.divisi_id || r.divisi) !== _str(DIVISI_ID)) return false;
    return true;
  }

  async function getRkbHeadersCached(periodeWanted, opts = {}) {
  const { forceServer = false } = opts;

  // drafts lokal
  const drafts = (U.S.get('rkb.drafts',[])||[]).map(x=>({
    nomor: x.nomor, periode: String(x.periode||''), divisi: x.divisi||x.divisi_id||'',
    estate_full: x.estate_full||'', status: 'draft'
  }));

  // kalau refresh dipaksa → kosongkan cache lalu ambil dari server
  if (forceServer){
    U.S.set(RKB_CACHE_KEY, []);
    await warmRkbActualsAll(); // ⟵ ini sekarang benar2 ambil dari server
  }else{
    // coba sync ringan dari actual lokal dulu; jika kosong, warm sekali
    const actual = lsActualRkbHeaders();
    if (actual.length){
      U.S.set(RKB_CACHE_KEY, uniqBy(actual, r=>String(r.nomor||'')));
    }else{
      const warmed = await warmRkbActualsAll();
      if (warmed.length) U.S.set(RKB_CACHE_KEY, warmed);
    }
  }

  // gabungkan
  const actualNow = lsActualRkbHeaders();
  const cached    = U.S.get(RKB_CACHE_KEY, []) || [];
  const merged = uniqBy([ ...actualNow, ...cached, ...drafts ], r => String(r.nomor||''));

  // filter periode
  const per = String(periodeWanted||F.periode||'').trim();
  const filtered = per ? merged.filter(r => String(r.periode||'').startsWith(per)) : merged;

  // urut terbaru
  filtered.sort((a,b)=> String(b.nomor||'').localeCompare(String(a.nomor||'')));
  return filtered;
}


  // ====== DETAIL RKB (prefer local/cache; API fallback) ======
  async function getRkbDetailPreferLocal(nomor) {
    if (!nomor) return { items: [], bahan: [] };

    const CI = U.S.get(RKB_DETAIL_ITEMS, {}) || {};
    const CB = U.S.get(RKB_DETAIL_BAHAN, {}) || {};
    if (Array.isArray(CI[nomor]) || Array.isArray(CB[nomor])) {
      return { items: CI[nomor] || [], bahan: CB[nomor] || [] };
    }

    const its = lsActualRkbItemsByNomor(nomor);
    const bhn = lsActualRkbBahanByNomor(nomor);
    if (its.length || bhn.length) {
      CI[nomor] = its; CB[nomor] = bhn;
      U.S.set(RKB_DETAIL_ITEMS, CI);
      U.S.set(RKB_DETAIL_BAHAN, CB);
      return { items: its, bahan: bhn };
    }

    try {
      const r = await API.call?.("getRkbDetail", { nomor });
      if (r?.ok) {
        const items2 = Array.isArray(r.items) ? r.items : [];
        const bahan2 = Array.isArray(r.bahan) ? r.bahan : [];
        CI[nomor] = items2; CB[nomor] = bahan2;
        U.S.set(RKB_DETAIL_ITEMS, CI);
        U.S.set(RKB_DETAIL_BAHAN, CB);
        return { items: items2, bahan: bahan2 };
      }
    } catch (e) {
      console.warn("[RKH] getRkbDetailPreferLocal API error:", e);
    }
    return { items: [], bahan: [] };
  }

  // ====== MAP RKB → RKH items (skala harian & bahan per item_idx) ======
  function mapRkbToRkhItems(rkbItems, rkbBahan) {
    const bahanByIdx = {};
    (rkbBahan || []).forEach((b) => {
      const k = _str(b.item_idx || b.idx);
      (bahanByIdx[k] = bahanByIdx[k] || []).push({
        nama: _str(b.nama),
        no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no),
        jumlah: _num(b.jumlah) / DAILY_SCALE,
        satuan: _str(b.satuan),
      });
    });

    return (rkbItems || []).map((x, i) => {
      let lokasiArr = [];
      if (Array.isArray(x.lokasi)) {
        lokasiArr = x.lokasi.map((l) => ({
          type: _str(l.type || ""),
          name: _str(l.name || l),
          luas: _num(l.luas) || undefined,
        }));
      } else {
        lokasiArr = _str(x.lokasi)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((nm) => ({ type: "", name: nm, luas: undefined }));
      }
      const it = {
        pekerjaan: x.pekerjaan || "",
        activity_type: x.activity_type || "",
        lokasi: lokasiArr,
        volume: _num(x.volume) / DAILY_SCALE,
        satuan: _str(x.satuan || ""),
        hk_unit: _num(x.hk_unit),
        pct_bhl: _num(x.pct_bhl),
        pct_sku: _num(x.pct_sku),
        pct_bhb: _num(x.pct_bhb),
        pengawas: _str(x.pengawas || ""),
        bahan: bahanByIdx[_str(x.idx || i + 1)] || [],
      };
      it.hk = computeHK(it);
      return it;
    });
  }

  // ====== RKH headers/detail (local-first) ======
  async function getRkhHeadersCachedByDate(tglYmd) {
    const drafts = (U.S.get("rkh.drafts", []) || [])
      .map((d) => ({
        nomor: d?.header?.nomor || "",
        tanggal: d?.header?.tanggal || "",
        periode: d?.header?.periode || "",
        divisi: d?.header?.divisi || d?.header?.divisi_id || "",
        estate_full: d?.header?.estate_full || "",
        source: "draft",
      }))
      .filter((x) => _str(x.tanggal) === _str(tglYmd));

    const actual = lsActualRkhHeadersByDate(tglYmd);
    let cached = U.S.get(RKH_CACHE_HDR_KEY, []) || [];
    if (actual.length) {
      const uniq = {};
      [...cached, ...actual].forEach((r) => { uniq[`${r.source || "server"}:${r.nomor}`] = r; });
      cached = Object.values(uniq);
      U.S.set(RKH_CACHE_HDR_KEY, cached);
    }
    const merged = {};
    [...drafts, ...actual, ...cached.filter((x) => _str(x.tanggal) === _str(tglYmd))].forEach((r) => {
      merged[`${r.source || "server"}:${r.nomor}`] = r;
    });
    return Object.values(merged).sort((a, b) => _str(a.nomor).localeCompare(_str(b.nomor)));
  }

  async function getRkhDetailPreferLocal(nomor) {
    const drafts = U.S.get("rkh.drafts", []) || [];
    const hit = drafts.find((d) => _str(d?.header?.nomor) === _str(nomor));
    if (hit) return { header: hit.header, items: hit.items, bahan: hit.bahan || [] };

    const itsLS = lsActualRkhItemsByNomor(nomor);
    const bhnLS = lsActualRkhBahanByNomor(nomor);
    if (itsLS.length || bhnLS.length) {
      const hdrArr = (U.S.get(RKH_ACTUAL_HDR, []) || []).filter((h) => _str(h.nomor) === _str(nomor));
      const hdr = hdrArr[0] || { nomor };
      return { header: hdr, items: itsLS, bahan: bhnLS };
    }

    try {
      if (typeof STORE?.ensureWarm === "function") await STORE.ensureWarm();
      const itemsAll = STORE.getActual?.("rkh_items") || STORE.getActual?.("rkh_detail_items") || [];
      const bahanAll = STORE.getActual?.("rkh_bahan") || STORE.getActual?.("rkh_material") || [];
      const its = itemsAll.filter((i) => _str(i.nomor) === _str(nomor));
      const bhn = bahanAll.filter((b) => _str(b.nomor) === _str(nomor));
      if (its.length || bhn.length) return { header: { nomor }, items: its, bahan: bhn };
    } catch (_) {}

    try {
      const r = await API.call?.("getRkhDetail", { nomor });
      if (r?.ok) return { header: r.header, items: r.items || [], bahan: r.bahan || [] };
    } catch (_) {}

    return { header: { nomor }, items: [], bahan: [] };
  }

  // ====== HK ======
  function computeHK(item) {
    const base = (_num(item.volume) || 0) * (_num(item.hk_unit) || 0);
    const BHL = base * ((_num(item.pct_bhl) || 0) / 100);
    const SKU = base * ((_num(item.pct_sku) || 0) / 100);
    const BHB = base * ((_num(item.pct_bhb) || 0) / 100);
    return { BHL, SKU, BHB, total: BHL + SKU + BHB };
  }
  function hkBadge(hk) {
    return `
      <div class="d-flex flex-wrap gap-2">
        <span class="badge text-bg-secondary">BHL: <strong>${(hk.BHL || 0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">SKU: <strong>${(hk.SKU || 0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">BHB: <strong>${(hk.BHB || 0).toFixed(2)}</strong></span>
        <span class="badge text-bg-dark">TOTAL HK: <strong>${(hk.total || 0).toFixed(2)}</strong></span>
      </div>`;
  }

  // ====== VALIDATION ======
  function validateHeaderStrict() {
    if (!_required(F.tanggal)) return "Tanggal RKH wajib diisi.";
    if (!_required(F.ref_rkb)) return "Ref. No RKB wajib diisi.";
    return "";
  }
  function validateItemStrict(it) {
    if (!_required(it.pekerjaan)) return "Jenis Pekerjaan wajib diisi.";
    if (!Array.isArray(it.lokasi) || it.lokasi.length === 0) return "Lokasi minimal 1 baris.";
    if (!_isPos(it.volume)) return "Volume harus > 0.";
    if (!_required(it.satuan)) return "Satuan volume wajib diisi.";
    if (!_isPos(it.hk_unit)) return "HK/Unit harus > 0.";
    if (!_required(it.pengawas)) return "Nama Pengawas wajib diisi.";
    const pBHL = _num(it.pct_bhl), pSKU = _num(it.pct_sku), pBHB = _num(it.pct_bhb);
    if (pBHL + pSKU + pBHB !== 100) return "Persentase HK harus tepat 100% (BHL+SKU+BHB).";
    return "";
  }
  function validateBahanList(list) {
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const nm = _str(b.nama);
      const jm = _num(b.jumlah);
      const st = _str(b.satuan);
      const meta = findBahanInMaster(nm);
      if (!meta) return `Bahan #${i + 1} ("${nm}") tidak valid atau tidak ada di master.`;
      if (!_str(meta.no_material)) return `Bahan #${i + 1} ("${nm}") tidak memiliki No Material.`;
      if (jm <= 0) return `Bahan #${i + 1} ("${nm}") jumlah harus > 0.`;
      if (!st) return `Bahan #${i + 1} ("${nm}") satuan wajib diisi.`;
    }
    return "";
  }

  // ====== BUFFER ======
  const DKEY = "rkh.form.buffer";
  let F = U.S.get(DKEY, {
    nomor: "",
    tanggal: U.fmt.ymd(new Date(), "Asia/Jakarta"),
    periode: "",
    ref_rkb: "",
    divisi: DIVISI,
    estate_full: ESTATE,
    divisi_id: DIVISI_ID,
    estate_id: ESTATE_ID,
    rayon_id: RAYON_ID,
    items: [],
  });
  function setPeriodeFromTanggal() {
    const d = new Date(F.tanggal);
    if (!isNaN(d)) F.periode = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (!F.periode) setPeriodeFromTanggal();

  const saveBuffer = U.debounce(() => U.S.set(DKEY, F), 250);
  function saveBufferThin() { U.S.set(DKEY, F); }

  // ====== ITEM MODEL ======
  function defaultItem() {
    return {
      pekerjaan: "",
      activity_type: "",
      lokasi: [],
      volume: 0,
      satuan: "Ha",
      hk_unit: 0,
      pct_bhl: 0,
      pct_sku: 100,
      pct_bhb: 0,
      bahan: [],
      pengawas: "",
    };
  }
  let CUR = defaultItem();

  function newBlankRkh(confirmIfDirty = true){
  const hasData = (F.items && F.items.length) || F.ref_rkb || F.nomor;
  if (confirmIfDirty && hasData){
    const ok = confirm('Kosongkan form untuk membuat RKH baru? Perubahan yang belum disimpan akan hilang.');
    if(!ok) return;
  }
  const today = U.fmt.ymd(new Date(), 'Asia/Jakarta');
  F = {
    nomor: "",
    tanggal: today,
    periode: fPeriode(today),
    ref_rkb: "",
    divisi: DIVISI,
    estate_full: ESTATE,
    divisi_id: DIVISI_ID,
    estate_id: ESTATE_ID,
    rayon_id: RAYON_ID,
    items: []
  };
  U.S.set(DKEY, F);
  build();
}

  // ====== UI ======
  function build() {
    const totalItems = F.items?.length || 0;
    const hkNow = computeHK(CUR);
    const ringkasanHK = (F.items || []).reduce((a, it) => a + (computeHK(it).total || 0), 0);

    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0">Form RKH</h4>
            <button id="btn-new-rkh" class="btn btn-sm btn-danger">Buat RKH Baru</button>
        </div>
        <div class="small text-muted">${ESTATE} · ${DIVISI}</div>
        </div>

        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label">Tanggal RKH</label>
            <input id="tgl" type="date" class="form-control" value="${F.tanggal}" />
            <div class="form-text">Periode mengikuti tanggal.</div>
          </div>
          <div class="col-sm-4">
            <label class="form-label">Periode (otomatis)</label>
            <input id="periode" class="form-control" value="${fPeriode(F.periode)}" readonly />
          </div>
          <div class="col-sm-4">
            <label class="form-label">No. RKH</label>
            <div class="input-group">
              <input id="nomor" class="form-control" value="${F.nomor || ""}" readonly />
              <button id="btn-load" class="btn btn-outline-secondary">Muat Detail</button>
            </div>
          </div>
        </div>

        <div class="row g-3 mt-1">
          <div class="col-sm-8">
            <label class="form-label">Ref. No RKB</label>
            <div class="input-group">
              <input id="ref-rkb" class="form-control" value="${F.ref_rkb || ""}" readonly />
              <button id="btn-pilih-rkb" class="btn btn-outline-primary">Pilih No RKB</button>
              <button id="btn-gen" class="btn btn-success">Create dari RKB</button>
              <button id="btn-from-date" class="btn btn-outline-secondary">Buat dari Tanggal...</button>
            </div>
            <div class="form-text">Pilih RKB lalu “Create dari RKB”. Item & bahan akan diambil (dibagi 20 jika aturan berlaku).</div>
          </div>
          <div class="col-sm-4">
            <label class="form-label">Ringkasan HK</label>
            <div class="form-control" style="background:#f8f9fa">${U.fmt.id2(ringkasanHK)}</div>
            <div class="form-text">Total HK = Σ (volume × hk/unit × %).</div>
          </div>
        </div>

        <hr/>
        <h5 class="mb-2">Pekerjaan (Item) — <span class="text-muted">sedang diisi</span></h5>

        <div class="row g-3">
          <div class="col-12">
            <label class="form-label">Jenis Pekerjaan</label>
            <input id="pekerjaan" class="form-control" list="dl-activity" placeholder="Ketik untuk cari..." value="${CUR.pekerjaan}"/>
            <datalist id="dl-activity">
              ${M.activity.map(a => `<option value="${a.nama_pekerjaan || a.nama || ""}">`).join("")}
            </datalist>
            <div class="form-text">Activity Type otomatis terisi.</div>
          </div>

          <div class="col-12">
            <label class="form-label">Lokasi</label>
            <div class="input-group">
              <input id="lokasi" class="form-control" value="${(CUR.lokasi || []).map(l => l.name).join(", ")}" readonly />
              <button class="btn btn-outline-secondary" id="btn-lokasi">Tambah Lokasi</button>
            </div>
          </div>

          <div class="col-sm-3">
            <label class="form-label">Volume</label>
            <input id="volume" type="number" step="0.01" class="form-control" value="${CUR.volume}" />
          </div>
          <div class="col-sm-3">
            <label class="form-label">Satuan</label>
            <input id="satuan" class="form-control" value="${CUR.satuan}" />
          </div>
          <div class="col-sm-3">
            <label class="form-label">HK/Unit</label>
            <div class="input-group">
              <input id="hkunit" type="number" step="0.01" class="form-control" value="${CUR.hk_unit}" />
              <button class="btn btn-outline-secondary" id="btn-hk">Atur %</button>
            </div>
            <div class="form-text">%BHL ${CUR.pct_bhl}% · %SKU ${CUR.pct_sku}% · %BHB ${CUR.pct_bhb}%</div>
          </div>

          <div class="col-sm-12">
            <label class="form-label">HK (otomatis)</label>
            <div id="hk-live">${hkBadge(hkNow)}</div>
          </div>

          <div class="col-12">
            <label class="form-label">Bahan</label>
            <div class="d-flex gap-2 mb-2">
              <input id="bahan-nama" class="form-control" list="dl-bahan" placeholder="Nama bahan..." />
              <datalist id="dl-bahan">
                ${M.bahan.map(b => `<option value="${b.nama_bahan || b.nama || ""}">`).join("")}
              </datalist>
              <input id="bahan-jml" type="number" step="0.01" class="form-control" placeholder="Jumlah" style="max-width:160px"/>
              <input id="bahan-sat" class="form-control" placeholder="Satuan" style="max-width:120px"/>
              <button id="btn-bahan-add" class="btn btn-outline-primary">Tambah</button>
            </div>
            <div id="bahan-list" class="table-responsive"></div>
          </div>

          <div class="col-sm-4">
            <label class="form-label">Pengawas</label>
            <input id="pengawas" class="form-control" value="${CUR.pengawas}" />
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <button id="btn-add-item" class="btn btn-outline-success">Tambahkan ke Daftar Pekerjaan</button>
          <button id="btn-clear-item" class="btn btn-outline-secondary">Reset Item</button>
        </div>

        <hr/>
        <h5 class="mb-2">Daftar Pekerjaan (${totalItems} item)</h5>
        <div id="items-table" class="table-responsive mb-3"></div>

        <div class="d-flex gap-2">
          <button id="btn-save-draft" class="btn btn-success">Simpan Draft</button>
        </div>
      </div></div>
    `;

    bind();
    renderBahan();
    renderItems();
    initAutoBahan();
  }

  function bind() {
    U.qs("#tgl").onchange = (e) => { F.tanggal = e.target.value; setPeriodeFromTanggal(); saveBuffer(); build(); };
    U.qs("#btn-pilih-rkb").onclick = openRkbPicker;
    U.qs("#btn-gen").onclick = createFromRkb;
    U.qs("#btn-from-date").onclick = openImportRkhByDate;
    U.qs("#btn-load").onclick = openLoadByNomor;
    U.qs("#btn-new-rkh").onclick = () => newBlankRkh(true);

    U.qs("#pekerjaan").oninput = (e) => {
      CUR.pekerjaan = e.target.value;
      const found = (M.activity || []).find(
        (a) => _str(a.nama_pekerjaan || a.nama).toLowerCase() === CUR.pekerjaan.toLowerCase()
      );
      CUR.activity_type = found?.activity_type || "";
      saveBufferThin(); updateHKLive();
    };

    U.qs("#btn-lokasi").onclick = openLokasiModal;

    U.qs("#volume").oninput = (e) => { CUR.volume = parseFloat(e.target.value || 0); saveBufferThin(); updateHKLive(); };
    U.qs("#satuan").oninput = (e) => { CUR.satuan = e.target.value; saveBufferThin(); };
    U.qs("#hkunit").oninput = (e) => { CUR.hk_unit = parseFloat(e.target.value || 0); saveBufferThin(); updateHKLive(); };
    U.qs("#btn-hk").onclick = openHKModal;

    U.qs("#pengawas").oninput = (e) => { CUR.pengawas = e.target.value; saveBufferThin(); };

    U.qs("#btn-bahan-add").onclick = addBahan;
    U.qs("#btn-add-item").onclick = addItemFromForm;
    U.qs("#btn-clear-item").onclick = () => { CUR = defaultItem(); build(); };

    U.qs("#btn-save-draft").onclick = saveDraft;
  }
  function updateHKLive() {
    const hkNow = computeHK(CUR);
    const el = U.qs("#hk-live");
    if (el) el.innerHTML = hkBadge(hkNow);
  }

  // ====== Lokasi Modal ======
  function openLokasiModal() {
    const div = document.createElement("div");
    div.className = "modal fade";
    div.innerHTML = `
    <div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Tambah Lokasi</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="d-flex gap-2 mb-2">
          <select id="lok-type" class="form-select" style="max-width:140px">
            <option value="blok">Blok</option>
            <option value="komplek">Komplek</option>
          </select>
          <input id="lok-input" class="form-control" placeholder="Ketik kode blok/komplek..."/>
          <button id="lok-add" class="btn btn-outline-primary">Tambah</button>
        </div>
        <div class="small text-muted mb-2">Auto-suggest berdasarkan master data lokal.</div>
        <div id="lok-list" class="table-responsive"></div>
        <div class="mt-3"><strong>Total Luas:</strong> <span id="lok-total">0</span> Ha</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
        <button id="ok" class="btn btn-primary">OK</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();

    const state = { rows: [...(CUR.lokasi || [])] };
    const input = div.querySelector("#lok-input");
    const listEl = div.querySelector("#lok-list");
    const totalEl = div.querySelector("#lok-total");

    function suggest(q, type) {
      const src = type === "blok" ? M.blok : M.komplek;
      const ql = q.toLowerCase();
      return src.filter((x) => _str(x.kode).toLowerCase().includes(ql)).slice(0, 20);
    }
    function addRow(r) { state.rows.push(r); renderRows(); }
    function renderRows() {
      const rows = state.rows
        .map(
          (r, i) => `
        <tr>
          <td>${i + 1}</td><td>${r.type}</td><td>${r.name}</td><td>${r.luas || 0}</td>
          <td><button data-i="${i}" class="btn btn-sm btn-outline-danger lok-del">Hapus</button></td>
        </tr>`
        )
        .join("");
      listEl.innerHTML = `<table class="table table-sm"><thead>
        <tr><th>#</th><th>Type</th><th>Nama</th><th>Luas</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
      listEl.querySelectorAll(".lok-del").forEach((btn) => {
        btn.onclick = (e) => { const i = +e.currentTarget.dataset.i; state.rows.splice(i, 1); renderRows(); };
      });
      const sum = state.rows.reduce((a, b) => a + (parseFloat(b.luas) || 0), 0);
      totalEl.textContent = sum.toFixed(2);
    }
    input.addEventListener("input", () => {
      const type = div.querySelector("#lok-type").value;
      const s = suggest(input.value, type);
      input.setAttribute("list", "dl-lok");
      let dl = div.querySelector("#dl-lok");
      if (!dl) { dl = document.createElement("datalist"); dl.id = "dl-lok"; div.appendChild(dl); }
      dl.innerHTML = s.map((x) => `<option value="${x.kode}">`).join("");
    });
    div.querySelector("#lok-add").onclick = () => {
      const type = div.querySelector("#lok-type").value;
      const name = input.value.trim(); if (!name) return;
      const src = type === "blok" ? M.blok : M.komplek;
      const found = src.find((x) => _str(x.kode).toLowerCase() === name.toLowerCase());
      addRow({ type, name, luas: parseFloat(found?.luas_ha || 0) });
      input.value = "";
    };
    div.querySelector("#ok").onclick = () => {
      CUR.lokasi = state.rows;
      const vol = state.rows.reduce((a, b) => a + (parseFloat(b.luas) || 0), 0);
      CUR.volume = parseFloat(vol.toFixed(2));
      saveBufferThin(); build(); m.hide(); setTimeout(() => div.remove(), 300);
    };
    renderRows();
    div.addEventListener("hidden.bs.modal", () => div.remove(), { once: true });
  }

  // ====== HK Modal ======
  function openHKModal() {
    const div = document.createElement("div");
    div.className = "modal fade";
    div.innerHTML = `
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Atur % HK</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="row g-2">
          <div class="col"><label class="form-label">%BHL</label>
            <input id="p-bhl" type="number" class="form-control" value="${CUR.pct_bhl}"/></div>
          <div class="col"><label class="form-label">%SKU</label>
            <input id="p-sku" type="number" class="form-control" value="${CUR.pct_sku}"/></div>
          <div class="col"><label class="form-label">%BHB</label>
            <input id="p-bhb" type="number" class="form-control" value="${CUR.pct_bhb}"/></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
        <button id="ok" class="btn btn-primary">OK</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();
    div.querySelector("#ok").onclick = () => {
      CUR.pct_bhl = parseFloat(div.querySelector("#p-bhl").value || 0);
      CUR.pct_sku = parseFloat(div.querySelector("#p-sku").value || 0);
      CUR.pct_bhb = parseFloat(div.querySelector("#p-bhb").value || 0);
      saveBufferThin(); build(); setTimeout(() => m.hide(), 10); setTimeout(() => div.remove(), 300);
    };
    div.addEventListener("hidden.bs.modal", () => div.remove(), { once: true });
  }

  // ====== BAHAN ======
  const bahanUnitCache = U.S.get(BAHAN_UNIT_KEY, {}) || {};
  function initAutoBahan() {
    const namaEl = U.qs("#bahan-nama");
    const satEl = U.qs("#bahan-sat");
    if (!namaEl || !satEl) return;
    namaEl.addEventListener("input", () => {
      const key = _str(namaEl.value).toLowerCase();
      if (!key) return;
      const meta = getBahanMetaByName(key);
      if (meta) {
        if (meta.satuan_default && !satEl.value) satEl.value = meta.satuan_default;
        namaEl.dataset.noMaterial = _str(meta.no_material);
        return;
      }
      if (bahanUnitCache[key] && !satEl.value) satEl.value = bahanUnitCache[key];
      namaEl.dataset.noMaterial = "";
    });
  }
  function addBahan() {
    const namaEl = U.qs("#bahan-nama");
    const jmlEl = U.qs("#bahan-jml");
    const satEl = U.qs("#bahan-sat");
    const nama = _str(namaEl.value);
    const jumlah = _num(jmlEl.value);
    let satuan = _str(satEl.value);
    if (!nama) { U.toast("Nama bahan wajib.", "warning"); return; }
    const meta = findBahanInMaster(nama);
    if (!meta) { U.toast(`Bahan "${nama}" tidak ditemukan di master / tanpa No Material.`, "warning"); return; }
    if (!(jumlah > 0)) { U.toast("Jumlah bahan harus > 0.", "warning"); return; }
    if (!satuan && meta.satuan_default) satuan = meta.satuan_default;
    if (!satuan) { U.toast("Satuan bahan wajib diisi.", "warning"); return; }
    CUR.bahan.push({ nama, jumlah, satuan, no_material: _str(meta.no_material) });
    const key = nama.toLowerCase();
    if (satuan && !bahanUnitCache[key]) {
      bahanUnitCache[key] = satuan; U.S.set(BAHAN_UNIT_KEY, bahanUnitCache);
    }
    saveBufferThin(); renderBahan();
    namaEl.value = ""; jmlEl.value = ""; satEl.value = ""; delete namaEl.dataset.noMaterial;
  }
  function renderBahan() {
    const list = U.qs("#bahan-list");
    const rows = (CUR.bahan || [])
      .map((b, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${_str(b.nama)}</td>
          <td>${_str(b.no_material) || "-"}</td>
          <td>${_num(b.jumlah)}</td>
          <td>${_str(b.satuan)}</td>
          <td><button class="btn btn-sm btn-outline-danger" data-i="${i}">Hapus</button></td>
        </tr>`)
      .join("");
    list.innerHTML = `<table class="table table-sm">
      <thead><tr><th>#</th><th>Nama</th><th>No. Material</th><th>Jumlah</th><th>Satuan</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    list.querySelectorAll("button[data-i]").forEach((btn) => {
      btn.onclick = (e) => { const i = +e.currentTarget.dataset.i; CUR.bahan.splice(i, 1); saveBufferThin(); renderBahan(); };
    });
  }

  // ====== ITEMS TABEL ======
  function addItemFromForm() {
    const errH = validateHeaderStrict(); if (errH) { U.toast(errH, "warning"); return; }
    const errI = validateItemStrict(CUR); if (errI) { U.toast(errI, "warning"); return; }
    const errB = validateBahanList(CUR.bahan || []); if (errB) { U.toast(errB, "warning"); return; }
    const item = JSON.parse(JSON.stringify(CUR));
    item.hk = computeHK(item);
    F.items.unshift(item);
    CUR = defaultItem(); saveBuffer(); build();
  }
  function renderItems() {
    const el = U.qs("#items-table");
    const items = F.items || [];
    if (!items.length) {
      el.innerHTML = `<div class="text-muted">Belum ada item. Tambahkan pekerjaan lalu klik "<em>Tambahkan ke Daftar Pekerjaan</em>".</div>`;
      return;
    }
    const sumBahan = (list) =>
      (list || []).map((b) => `${_str(b.nama)} (${U.fmt.id0(_num(b.jumlah))} ${_str(b.satuan)})`).join(" | ") || "-";
    const rows = items
      .map(
        (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.pekerjaan}</td>
      <td>${(r.lokasi || []).map((x) => x.name).join(", ")}</td>
      <td>${r.volume} ${r.satuan}</td>
      <td>${r.hk?.total?.toFixed(2) || "-"}</td>
      <td class="text-truncate" style="max-width:320px">${sumBahan(r.bahan)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-a="edit" data-i="${i}">Edit</button>
          <button class="btn btn-outline-danger" data-a="del" data-i="${i}">Hapus</button>
        </div>
      </td>
    </tr>`
      )
      .join("");
    el.innerHTML = `<table class="table table-sm table-hover">
      <thead>
        <tr>
          <th>No</th><th>Pekerjaan</th><th>Lokasi</th><th>Volume</th><th>HK</th><th>Bahan (ringkas)</th><th>Aksi</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
    el.querySelectorAll("button").forEach((btn) => {
      const i = +btn.dataset.i, a = btn.dataset.a;
      btn.onclick = () => {
        if (a === "del") { F.items.splice(i, 1); saveBuffer(); renderItems(); }
        if (a === "edit") { CUR = JSON.parse(JSON.stringify(F.items[i])); F.items.splice(i, 1); saveBuffer(); build(); }
      };
    });
  }

  // ====== RKB PICKER (local → STORE → API), scope-aware ======
  function openRkbPicker() {
    const div = document.createElement("div");
    div.className = "modal fade";
    div.innerHTML = `
    <div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Pilih No RKB</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="row g-2 mb-2">
          <div class="col-sm-4">
            <input id="f-per" class="form-control" placeholder="Filter periode YYYY-MM" value="${fPeriode(F.periode) || ""}"/>
          </div>
          <div class="col-sm-8">
            <input id="f-q" class="form-control" placeholder="Cari nomor / divisi / estate"/>
          </div>
        </div>
        <div class="d-flex gap-2 mb-2">
          <button id="btn-refresh" class="btn btn-outline-secondary btn-sm">Refresh dari Server</button>
          <span class="small text-muted">Default memuat dari penyimpanan lokal & STORE.</span>
        </div>
        <div id="list" class="table-responsive"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();

    const hardClose = () => { try { U.progressClose(); U.progressHardClose(); } catch (_) {} };
    div.addEventListener("hidden.bs.modal", () => { hardClose(); div.remove(); }, { once: true });

    let DATA = [];

    async function loadInitial({ forceServer = false } = {}) {
      const per = _str(U.qs("#f-per", div).value);
      if (forceServer) { U.progressOpen("Refresh dari Server..."); U.progress(30, "Menyiapkan ulang"); }
      try {
        const rows = await getRkbHeadersCached(per, { forceServer });
        DATA = Array.isArray(rows) ? rows : [];
        render();
      } catch (e) {
        U.toast(e.message || e, "danger");
      } finally {
        if (forceServer) hardClose();
      }
    }

    function render() {
  // helper kecil di dalam render agar mandiri
  function _canonPer(p) {
    const s = String(p || '').trim();
    if (!s) return '';
    // "YYYY-M" atau "YYYY-MM" → paksa jadi "YYYY-MM"
    if (/^\d{4}-\d{1,2}$/.test(s)) {
      const [y, m] = s.split('-');
      return `${y}-${String(m).padStart(2, '0')}`;
    }
    // kalau berupa tanggal → jadikan periode via fPeriode (YYYY-MM)
    return fPeriode(s);
  }

  const perInput = _canonPer(U.qs("#f-per", div).value);
  const q = _str(U.qs("#f-q", div).value).toLowerCase();

  // ambil data, batasi ke scope user
  let arr = DATA.slice().filter(inMyScope);

  // filter periode dengan perbandingan canonical (ketat)
  if (perInput) {
    arr = arr.filter(r => _canonPer(r.periode) === perInput);
  }

  // filter query bebas
  if (q) {
    arr = arr.filter(r =>
      [r.nomor, _canonPer(r.periode), r.divisi, r.estate_full, r.status]
        .some(v => _str(v).toLowerCase().includes(q))
    );
  }

  // dedupe per nomor
  arr = uniqBy(arr, r => _str(r.nomor));

  // render tabel
  U.qs("#list", div).innerHTML = arr.length
    ? `<table class="table table-sm table-hover">
         <thead>
           <tr><th>Nomor</th><th>Periode</th><th>Divisi</th><th>Estate</th><th>Status</th><th></th></tr>
         </thead>
         <tbody>
           ${arr.map(r => `
             <tr>
               <td>${r.nomor}</td>
               <td>${_canonPer(r.periode)}</td>
               <td>${r.divisi}</td>
               <td>${r.estate_full}</td>
               <td>${r.status}</td>
               <td><button class="btn btn-sm btn-primary" data-n="${r.nomor}">Pilih</button></td>
             </tr>
           `).join("")}
         </tbody>
       </table>`
    : `<div class="text-muted">Tidak ada RKB untuk filter saat ini.</div>`;

  // bind tombol "Pilih"
  U.qs("#list", div)
    .querySelectorAll("button[data-n]")
    .forEach((b) => {
      b.onclick = () => {
        F.ref_rkb = b.dataset.n;
        saveBufferThin();
        build();
        m.hide();
      };
    });
}

    U.qs('#btn-refresh', div).onclick = async ()=>{
  U.progressOpen('Refresh dari Server...');
  try{
    await loadInitial({ forceServer:true });
    U.toast('Daftar RKB diperbarui dari server.', 'info');
  }catch(e){
    U.toast(e.message||e,'danger');
  }finally{
    try{ U.progressClose(); U.progressHardClose(); }catch(_){}
  }
};
    U.qs("#f-per", div).oninput = render;
    U.qs("#f-q", div).oninput = render;

    // Load awal (silent, local-first)
    loadInitial();
  }

  // ====== CREATE dari RKB ======
  async function createFromRkb() {
  if (!F.tanggal) { U.toast("Tanggal RKH wajib diisi.", "warning"); return; }
  if (!F.ref_rkb) { U.toast("Pilih Ref. No RKB dulu.", "warning"); return; }

  try {
    const det = await getRkbDetailPreferLocal(F.ref_rkb);
    const its = Array.isArray(det.items) ? det.items : [];
    const bhn = Array.isArray(det.bahan) ? det.bahan : [];

    if (!its.length) throw new Error("Detail RKB kosong / tidak ditemukan.");

    const itemsRkh = mapRkbToRkhItems(its, bhn);

    // JANGAN kosongkan nomor; generate kalau masih kosong
    if (!_str(F.nomor)) {
    ensureNomorRkhIfEmpty('createFromRkb');
    }

    F.items = itemsRkh;
    setPeriodeFromTanggal();
    saveBufferThin();
    build();

    const totalItem = F.items.length;
    const totalBahan = F.items.reduce((a, it) => a + (it.bahan || []).length, 0);
    U.toast(
      `Item dari RKB dimuat ke Form: ${totalItem} item & ${totalBahan} bahan. Review, lalu "Simpan Draft".`,
      "success"
    );
  } catch (e) {
    U.toast(e.message || e, "danger");
  }
}

  // ====== IMPORT RKH by DATE (local-first) ======
  function openImportRkhByDate() {
    const div = document.createElement("div");
    div.className = "modal fade";
    div.innerHTML = `
    <div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Buat dari Tanggal...</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="row g-2 mb-2">
          <div class="col-sm-4">
            <label class="form-label">Tanggal</label>
            <input id="pick-date" type="date" class="form-control" value="${F.tanggal}"/>
          </div>
          <div class="col-sm-8 d-flex align-items-end">
            <button id="btn-load" class="btn btn-primary">Muat RKH</button>
          </div>
        </div>
        <div id="list" class="table-responsive"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();

    async function loadList() {
      const ymd = U.qs("#pick-date", div).value;
      if (!ymd) { U.toast("Pilih tanggal dahulu.", "warning"); return; }
      const rows = await getRkhHeadersCachedByDate(ymd);
      if (!rows.length) {
        U.qs("#list", div).innerHTML = `<div class="text-muted">Tidak ada RKH pada tanggal tersebut.</div>`;
        return;
      }
      U.qs("#list", div).innerHTML = `
        <table class="table table-sm table-hover">
          <thead><tr><th>Nomor</th><th>Tanggal</th><th>Periode</th><th>Divisi</th><th>Estate</th><th>Sumber</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${r.nomor || "-"}</td><td>${r.tanggal || "-"}</td><td>${fPeriode(r.periode || "")}</td>
                <td>${r.divisi || ""}</td><td>${r.estate_full || ""}</td><td>${r.source || ""}</td>
                <td><button class="btn btn-sm btn-outline-primary" data-n="${r.nomor}">Pilih</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`;
      U.qs("#list", div).querySelectorAll("button[data-n]").forEach((b) => {
        b.onclick = async () => {
            try {
            const nomor = b.dataset.n;
            // Ambil detail RKH SUMBER (tanggal di modal hanya untuk memilih sumber)
            const det = await getRkhDetailPreferLocal(nomor);
            const hdr = det?.header || {};
            const its = Array.isArray(det?.items) ? det.items : [];
            const bhn = Array.isArray(det?.bahan) ? det.bahan : [];

            // Index bahan per item_idx
            const bahanByIdx = {};
            (bhn || []).forEach((x) => {
                const k = _str(x.item_idx || x.idx);
                (bahanByIdx[k] = bahanByIdx[k] || []).push({
                nama: _str(x.nama),
                no_material: _str(x.no_material ?? x.kode ?? x.code ?? x.id ?? x.no),
                jumlah: _num(x.jumlah),
                satuan: _str(x.satuan),
                });
            });

            // === Draft BARU ===
            F.nomor   = "";                // auto generate
            // AMBIL Ref. No RKB dari header sumber jika ada
            const refFromSrc = _str(hdr.ref_rkb || hdr.rkb_nomor || hdr.no_rkb || "");
            if (refFromSrc) {
                F.ref_rkb = refFromSrc;
            } else {
                // tidak ada di sumber → biarkan apa adanya (tidak dihapus)
                // F.ref_rkb = F.ref_rkb;
            }

            // Tanggal RKH mengikuti tanggal yang ada di FORM (jangan diubah di sini)
            setPeriodeFromTanggal();       // sinkronkan periode dari F.tanggal form

            // Scope user aktif
            F.divisi_id   = DIVISI_ID;
            F.estate_id   = ESTATE_ID;
            F.rayon_id    = RAYON_ID;
            F.divisi      = DIVISI;
            F.estate_full = ESTATE;

            // Map items → format form
            F.items = (its || []).map((x, i) => {
                const lokasiArr = normalizeLokasi(x.lokasi);
                const it = {
                pekerjaan: _str(x.pekerjaan||""),
                activity_type: _str(x.activity_type||""),
                lokasi: lokasiArr,
                volume: (_num(x.volume) > 0) ? _num(x.volume)
                        : lokasiArr.reduce((a,b)=> a + (_num(b.luas)||0), 0),
                satuan: _str(x.satuan||"Ha"),
                hk_unit: _num(x.hk_unit),
                pct_bhl: _num(x.pct_bhl),
                pct_sku: _num(x.pct_sku),
                pct_bhb: _num(x.pct_bhb),
                pengawas: _str(x.pengawas||""),
                bahan: bahanByIdx[_str(x.idx || i + 1)] || [],
                };
                it.hk = computeHK(it);
                return it;
            });

            // Generate nomor RKH baru agar langsung tampil
            ensureNomorRkhIfEmpty('clone-from-date');

            saveBufferThin();
            build();
            U.toast("Draft RKH baru dibuat dari RKH sumber. Tanggal mengikuti form, Ref. No RKB ikut sumber.", "success");
            m.hide(); setTimeout(() => div.remove(), 150);
            } catch (e) {
            U.toast(e.message || e, "danger");
            }
        };
        });

    }

    U.qs("#btn-load", div).onclick = loadList;
    div.addEventListener("hidden.bs.modal", () => div.remove(), { once: true });
  }

  // ====== MUAT DETAIL RKH BY NOMOR ======
  function openLoadByNomor() {
    const nomor = prompt("Masukkan No RKH:", F.nomor || "");
    if (!nomor) return;
    loadDetailByNomor(nomor, false);
  }
  async function loadDetailByNomor(nomor, keepRef) {
    try {
      const local = await getRkhDetailPreferLocal(nomor);
      const hasLocal = (local.items && local.items.length) || (local.bahan && local.bahan.length);
      let h, its, bhn;
      if (hasLocal) {
        ({ header: h, items: its, bahan: bhn } = local);
      } else {
        U.progressOpen("Memuat detail RKH..."); U.progress(30, "Ambil server");
        const r = await API.call("getRkhDetail", { nomor });
        if (!r.ok) throw new Error(r.error || "RKH tidak ditemukan / tidak berwenang.");
        h = r.header || {}; its = Array.isArray(r.items) ? r.items : []; bhn = Array.isArray(r.bahan) ? r.bahan : [];
      }

      const bahanByIdx = {};
      (bhn || []).forEach((b) => {
        const k = _str(b.item_idx);
        (bahanByIdx[k] = bahanByIdx[k] || []).push({
          nama: _str(b.nama),
          no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no),
          jumlah: _num(b.jumlah),
          satuan: _str(b.satuan),
        });
      });

      F.nomor = h.nomor || nomor;
      F.tanggal = h.tanggal || F.tanggal;
      setPeriodeFromTanggal();
      F.periode = h.periode || fPeriode(F.periode);
      if (!keepRef) F.ref_rkb = h.ref_rkb || F.ref_rkb;

      F.divisi_id = h.divisi_id || F.divisi_id;
      F.estate_id = h.estate_id || F.estate_id;
      F.rayon_id = h.rayon_id || F.rayon_id;
      F.divisi = h.divisi || F.divisi;
      F.estate_full = h.estate_full || F.estate_full;

      F.items = (its || []).map((x, idx) => {
        const lokasiArr = _str(x.lokasi)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((nm) => ({ type: "", name: nm, luas: undefined }));
        const it = {
          pekerjaan: x.pekerjaan || "",
          activity_type: x.activity_type || "",
          lokasi: lokasiArr,
          volume: _num(x.volume),
          satuan: _str(x.satuan || ""),
          hk_unit: _num(x.hk_unit),
          pct_bhl: _num(x.pct_bhl),
          pct_sku: _num(x.pct_sku),
          pct_bhb: _num(x.pct_bhb),
          pengawas: _str(x.pengawas || ""),
          bahan: bahanByIdx[_str(x.idx || idx + 1)] || [],
        };
        it.hk = computeHK(it);
        return it;
      });

      saveBufferThin();
      build();
    } catch (e) {
      U.toast(e.message || e, "danger");
    } finally {
      try { U.progressClose(); U.progressHardClose(); } catch (_) {}
    }
  }

  // ====== SAVE DRAFT RKH ======
  function saveDraft() {
    const errH = validateHeaderStrict(); if (errH) { U.toast(errH, "warning"); return; }
    if (!(F.items?.length)) { U.toast("Minimal 1 item pekerjaan.", "warning"); return; }
    ensureNomorRkhIfEmpty('saveDraft');

    const flattenedBahan = [];
    (F.items || []).forEach((it, idx) => {
      (it.bahan || []).forEach((b) => {
        flattenedBahan.push({
          item_idx: idx + 1,
          no_material: _str(b.no_material || b.kode || b.code || b.id || b.no || ""),
          nama: _str(b.nama),
          jumlah: _num(b.jumlah),
          satuan: _str(b.satuan),
        });
      });
    });

    const nowIso = new Date().toISOString();
    const totalHK = (F.items || []).reduce((a, it) => a + (computeHK(it).total || 0), 0);
    const drafts = U.S.get("rkh.drafts", []) || [];
    const draftRow = {
      header: {
        nomor: F.nomor || "",
        tanggal: F.tanggal,
        periode: fPeriode(F.periode),
        ref_rkb: F.ref_rkb,
        divisi_id: F.divisi_id || DIVISI_ID,
        estate_id: F.estate_id || ESTATE_ID,
        rayon_id: F.rayon_id || RAYON_ID,
        divisi: DIVISI,
        estate_full: ESTATE,
        hk_total: Number(totalHK.toFixed(2)),
        status: "draft",
        __serverLinked: false,
        updated_at: nowIso,
      },
      items: JSON.parse(JSON.stringify(F.items)),
      bahan: flattenedBahan,
    };
    const exIdx = drafts.findIndex((d) => _str(d?.header?.nomor) === _str(draftRow.header.nomor));
    if (exIdx >= 0) drafts[exIdx] = draftRow; else drafts.unshift(draftRow);
    U.S.set("rkh.drafts", drafts);
    saveBufferThin();
    U.toast("Draft RKH disimpan.", "success");
  }

  // ====== GO ======
    if (Array.isArray(F.items)) {
    F.items = F.items.map(it => {
        return Object.assign({}, it, { hk: it.hk || computeHK(it) });
    });
    U.S.set(DKEY, F);
    }
  build();
};

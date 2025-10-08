// js/pages/pdo/pdo_form.js (local-only yrates + redirect to Home if missing)
window.Pages = window.Pages || {};
Pages.pdoForm = function () {
  const root = U.qs("#app-root");
  const profile = SESSION.profile();
  if (!profile) {
    location.hash = "#/login";
    return;
  }

  const qsParam = (k) =>
    new URLSearchParams(location.hash.split("?")[1] || "").get(k);
  const READONLY =
    qsParam("readonly") === "1" || !!U.S.get("pdo.form.readonly", false);
  const nomorQS = qsParam("nomor");

  const DEBUG = qsParam("debug") === "1";
  // CCTV buffer (global untuk inspeksi manual dari console)
  window.__PDO_CCTV = window.__PDO_CCTV || {
    pulls: [],
    yrates_len: 0,
    profile: null,
    periode: "",
    warn: [],
  };

  function cctvLog(label, data) {
    try {
      if (DEBUG) {
        console.groupCollapsed(`[PDO CCTV] ${label}`);
        console.log(data);
        console.groupEnd();
      }
    } catch (_) {}
  }

  // === Formatter yang mengikuti U.fmt bila ada ===
  const fmtIDR = (n) =>
    (U?.fmt?.idr ? U.fmt.idr : (x) => Number(x || 0).toLocaleString("id-ID"))(
      Number(n || 0)
    );

  const fmtID2 = (n) =>
    (U?.fmt?.id2
      ? U.fmt.id2
      : (x) =>
          Number(x || 0).toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }))(Number(n || 0));

  // === Parser angka lokal: "1.234,56" -> 1234.56
  function parseLocal(x) {
    if (typeof x === "number") return x;
    if (!x) return 0;
    const s = String(x)
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // Masker input sederhana: tampil rapi saat blur, bebas saat ketik
  function attachMaskText(id, kind, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    // pastikan text + keyboard angka di mobile
    try {
      el.type = "text";
    } catch (_) {}
    el.setAttribute("inputmode", "decimal");

    // render awal terformat
    const seed = parseLocal(el.value);
    el.value = kind === "idr" ? fmtIDR(seed) : fmtID2(seed);

    // saat fokus → tampilkan mentah agar mudah edit
    el.addEventListener("focus", () => {
      const raw = parseLocal(el.value);
      el.value = String(raw).replace(".", ","); // nyaman utk ID
      setTimeout(() => {
        try {
          el.select();
        } catch (_) {}
      }, 0);
    });

    // saat input → kirim nilai mentah ke model (tanpa memformat ulang)
    el.addEventListener(
      "input",
      U.debounce(() => {
        onChange(parseLocal(el.value));
      }, 30)
    );

    // saat blur → format tampilan + update model sekali lagi
    el.addEventListener("blur", () => {
      const raw = parseLocal(el.value);
      onChange(raw);
      el.value = kind === "idr" ? fmtIDR(raw) : fmtID2(raw);
    });
  }

  const saveDebounced = U.debounce(() => U.S.set(DKEY, F), 150);

  (function ensurePdoFormStyles() {
    if (document.getElementById("pdo-form-tweaks")) return;
    const css = `
  /* kolom pekerjaan lebih lebar */
  .pdo-pekerjaan-input { min-width: 320px; }
  /* biar sel total bisa wrap */
  .pdo-total-cell { white-space: nowrap; }
  .is-invalid { outline: 2px solid #dc3545 !important; }

  @media (max-width: 768px){
    /* di mobile: pekerjaan full-width, sel jangan sempit */
    .pdo-pekerjaan-input { min-width: 0; width: 100%; }
    .table-responsive table { table-layout: auto; }
    .table-responsive td, .table-responsive th { white-space: nowrap; }
    /* header inputs biar nggak dempet */
    .pdo-header .form-control, .pdo-header .form-select { min-height: 42px; }
  }
  `;
    const s = document.createElement("style");
    s.id = "pdo-form-tweaks";
    s.textContent = css;
    document.head.appendChild(s);
  })();

  function ensureDebugPanel() {
    if (!DEBUG) return;
    if (document.getElementById("pdo-cctv-panel")) return;
    const el = document.createElement("div");
    el.id = "pdo-cctv-panel";
    el.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:9999;max-width:40vw;background:#0b1020;color:#d6e0ff;border-radius:12px;padding:10px 12px;font:12px/1.35 system-ui,Segoe UI,Roboto,Arial;box-shadow:0 6px 24px rgba(0,0,0,.35);";
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <strong style="font-size:12px;">PDO CCTV</strong>
        <button id="pdo-cctv-refresh" style="margin-left:auto;border:1px solid #445; background:#19203a;color:#d6e0ff;border-radius:6px;padding:4px 8px;cursor:pointer;">Scan</button>
        <button id="pdo-cctv-copy" style="border:1px solid #445; background:#19203a;color:#d6e0ff;border-radius:6px;padding:4px 8px;cursor:pointer;">Copy</button>
      </div>
      <pre id="pdo-cctv-pre" style="margin:0;max-height:40vh;overflow:auto;white-space:pre-wrap;"></pre>
    `;
    document.body.appendChild(el);
    document.getElementById("pdo-cctv-refresh").onclick = renderCctvDump;
    document.getElementById("pdo-cctv-copy").onclick = () => {
      navigator.clipboard.writeText(JSON.stringify(window.__PDO_CCTV, null, 2));
    };
  }
  function renderCctvDump() {
    if (!DEBUG) return;
    const pre = document.getElementById("pdo-cctv-pre");
    if (pre) pre.textContent = JSON.stringify(window.__PDO_CCTV, null, 2);
  }

  function fmtStampWIB(d = new Date()) {
    const tz = "Asia/Jakarta";
    const dd = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      day: "2-digit",
    }).format(d);
    const mm = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      month: "2-digit",
    }).format(d);
    const yy = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      year: "2-digit",
    }).format(d);
    const yyyy = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      year: "numeric",
    }).format(d);
    const hh = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(d);
    const mi = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      minute: "2-digit",
    }).format(d);
    const ss = new Intl.DateTimeFormat("id-ID", {
      timeZone: tz,
      second: "2-digit",
    }).format(d);
    return {
      yy,
      yyyy,
      stamp: `${dd}${mm}${yyyy}.${hh}${mi}${ss}`,
      sig: `${dd}/${mm}/${yy}-${hh}:${mi}:${ss}`,
    };
  }

  function genNoPDO(divisi) {
    const t = fmtStampWIB();
    return `PDO${(divisi || "XX").toUpperCase()}${t.yy}${t.stamp.slice(
      2,
      8
    )}${t.stamp.slice(9)}`;
  }

  // ======== Master helpers (LOCAL ONLY) ========
  async function ensureWarm() {
    try {
      if (typeof STORE?.ensureWarm === "function") await STORE.ensureWarm();
    } catch (_) {}
  }

  function getMasterMulti(...keys) {
    for (const k of keys) {
      const byStore =
        typeof STORE?.getMaster === "function" ? STORE.getMaster(k) : null;
      if (Array.isArray(byStore) && byStore.length) {
        if (k === "yrates" || k === "yrate" || k === "yreate") {
          window.__PDO_CCTV.yrates_len = byStore.length;
          cctvLog("yrates via STORE.getMaster", {
            key: k,
            length: byStore.length,
          });
        }
        return byStore;
      }
      const byUS = U.S.get(`kpl.master.${k}`, []);
      if (Array.isArray(byUS) && byUS.length) {
        if (k === "yrates" || k === "yrate" || k === "yreate") {
          window.__PDO_CCTV.yrates_len = byUS.length;
          cctvLog("yrates via local U.S", { key: k, length: byUS.length });
        }
        return byUS;
      }
    }
    return [];
  }

  // ==== Helpers khusus yrates (skema: jenis, plant_id, estate_id, divisi_id, periode, effective_from, nilai, status, ...) ====
  function norm(s) {
    return String(s ?? "").trim();
  }
  function normDiv(s) {
    return norm(s)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  } // 'SBSE 4' => 'SBSE4'
  function yyyymm(s) {
    const t = String(s ?? "").trim();
    // Case 1: sudah "YYYY-MM"
    if (/^\d{4}-\d{2}$/.test(t)) return t;

    // Case 2: "dd/mm/yyyy" → "YYYY-MM"
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}`;

    // Case 3: ISO / tanggal umum → ambil year-month di zona WIB
    if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(t)) {
      const d = new Date(t);
      if (!isNaN(d)) {
        const tz = "Asia/Jakarta";
        const y = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
        }).format(d);
        const mo = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          month: "2-digit",
        }).format(d);
        return `${y}-${mo}`;
      }
    }

    return "";
  }

  function toDate(s) {
    const t = norm(s);
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    }
    const d = new Date(t).getTime();
    return isNaN(d) ? 0 : d;
  }
  function isActive(row) {
    return String(row.status || "").toLowerCase() === "active";
  }

  // Normalisasi untuk membandingkan kode aktivitas: "TM PM-01" => "tmpm01"
function normCode(s){
  return String(s||"").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Ambil nilai pertama yang ada dari daftar kandidat nama kolom
function pickField(obj, keys){
  for (const k of keys){
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return "";
}


  // skor spesifisitas: lebih besar = lebih spesifik
  function specificityScore(row, want) {
    const hasP = !!norm(row.plant_id);
    const hasE = !!norm(row.estate_id);
    const hasD = !!norm(row.divisi_id);

    const wantP = norm(want.plant_id);
    const wantE = norm(want.estate_id);
    const wantD = normDiv(want.divisi_id);

    // RULE: kalau sisi "yang dicari" kosong → anggap cocok (jangan gugur)
    const okP = hasP ? (wantP ? norm(row.plant_id) === wantP : true) : true;
    const okE = hasE ? (wantE ? norm(row.estate_id) === wantE : true) : true;
    const okD = hasD ? (wantD ? normDiv(row.divisi_id) === wantD : true) : true;

    if ((hasP && !okP) || (hasE && !okE) || (hasD && !okD)) return -1;

    // Skor spesifisitas: semakin lengkap semakin tinggi
    return (
      (hasP && okP ? 4 : 0) + (hasE && okE ? 2 : 0) + (hasD && okD ? 1 : 0)
    );
  }

  // pilih periode terbaik: ≤ target (kalau ada). Jika target kosong, abaikan filter
  function periodeRank(rowPeriode, targetPeriode) {
    const r = yyyymm(rowPeriode);
    if (!targetPeriode) return r ? 1 : 0; // punya periode > tidak punya
    const t = yyyymm(targetPeriode);
    if (!r) return -1;
    // lebih besar dari target → jelek
    if (r > t) return -1;
    // makin dekat ke target makin bagus → ranking pakai r secara langsung
    // kita kembalikan r agar bisa dibanding lexicographically (YYYY-MM)
    return r;
  }

  // Ambil rate dari local cache saja (yrate/yrates/yreate)
  function resolveRateValue(keyName, divPref) {
    const list = getMasterMulti("yrates", "yrate", "yreate");
    const trace = {
      key: keyName,
      list_len: Array.isArray(list) ? list.length : 0,
      want: {},
      targetPeriode: "",
      steps: [],
      picked: null,
    };

    if (!Array.isArray(list) || list.length === 0) {
      window.__PDO_CCTV.pulls.push(
        Object.assign(trace, { note: "yrates kosong" })
      );
      cctvLog(`resolveRateValue(${keyName})`, trace);
      return 0;
    }

    const want = {
      jenis: String(keyName || "").toLowerCase(),
      plant_id: F.plant_id || profile.plant_id || "",
      estate_id: F.estate_id || profile.estate_id || "",
      divisi_id: divPref || F.divisi_id || profile.divisi || "",
    };
    const targetPeriode = F.periode || "";
    trace.want = want;
    trace.targetPeriode = targetPeriode;

    const cand = list.filter(
      (r) => String(r.jenis || "").toLowerCase() === want.jenis && isActive(r)
    );
    trace.steps.push({ stage: "filter jenis+active", cand_len: cand.length });

    let best = null;
    for (const r of cand) {
      const spec = specificityScore(r, want); // -1 = gugur
      const pr = periodeRank(r.periode, targetPeriode);
      const eff = toDate(r.effective_from);
      const upd = toDate(r.updated_at);
      const rowInfo = { r, spec, pr, eff, upd };

      if (spec < 0) {
        trace.steps.push({ skip: "spec<0", ...rowInfo });
        continue;
      }
      if (pr === -1) {
        trace.steps.push({ skip: "periode>target", ...rowInfo });
        continue;
      }

      const pick = { row: r, spec, periode: yyyymm(r.periode) || "", eff, upd };
      if (!best) {
        best = pick;
        trace.steps.push({ take: "first", ...rowInfo });
      } else {
        const better =
          pick.spec > best.spec ||
          (pick.spec === best.spec && pick.periode > best.periode) ||
          (pick.spec === best.spec &&
            pick.periode === best.periode &&
            pick.eff > best.eff) ||
          (pick.spec === best.spec &&
            pick.periode === best.periode &&
            pick.eff === best.eff &&
            pick.upd > best.upd);

        trace.steps.push({
          compare: {
            candidate: rowInfo,
            against: {
              spec: best.spec,
              periode: best.periode,
              eff: best.eff,
              upd: best.upd,
            },
            better,
          },
        });
        if (better) best = pick;
      }
    }

    if (!best) {
      trace.picked = null;
      window.__PDO_CCTV.pulls.push(trace);
      cctvLog(`resolveRateValue(${keyName}) → NOT FOUND`, trace);
      return 0;
    }

    const raw = best.row.nilai;
    const num = Number(String(raw ?? "").replace(/[^0-9.-]/g, "")) || 0;
    trace.picked = { row: best.row, parsed: num };
    window.__PDO_CCTV.pulls.push(trace);
    cctvLog(`resolveRateValue(${keyName}) → ${num}`, trace);
    return num;
  }

// --- Konsolidasi key agar konsisten di semua tempat ---
const CODE_KEYS   = ["activity_type","kode","kd","type","kode_aktivitas","activity","activity_code","no_aktivitas","kodeKegiatan"];
const NAMA_KEYS   = ["nama_pekerjaan","nama","pekerjaan","jenis","deskripsi","uraian","kegiatan"];
const SATUAN_KEYS = ["satuan_borongan","satuan_default","satuan","uom","unit","satuan_output"];
const TARIF_KEYS  = ["tarif_borongan","tarif","rate_borongan","harga","nilai"];

// Ambil nilai pertama yang ada dari daftar kandidat nama kolom
function pickField(obj, keys){
  for (const k of keys){
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return "";
}

// Normalisasi kode aktivitas, mis. "TM PM-01" => "tmpm01"
function normCode(s){
  return String(s||"").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ========== Perbaikan utama: resolve by NAME robust ==========
function resolveActivityByName(nm){
  const acts = getMasterMulti("yactivity","activity","activities");
  const want = String(nm||"").trim().toLowerCase();
  if(!want || !Array.isArray(acts) || !acts.length) return null;

  // 1) exact match pada salah satu NAMA_KEYS
  let hit = acts.find(a => {
    const nama = String(pickField(a, NAMA_KEYS) || "").trim().toLowerCase();
    return nama === want;
  });

  // 2) fallback: mengandung unik (kalau exact tidak ketemu)
  if(!hit){
    const cand = acts.filter(a => {
      const nama = String(pickField(a, NAMA_KEYS) || "").trim().toLowerCase();
      return nama.includes(want);
    });
    if(cand.length === 1) hit = cand[0];
  }
  if(!hit) return null;

  // Siapkan payload standar yang dipakai di tempat lain
  const tipe   = String(pickField(hit, CODE_KEYS)   || "").trim();
  const nama   = String(pickField(hit, NAMA_KEYS)   || "").trim();
  const satuan = String(pickField(hit, SATUAN_KEYS) || "").trim();
  const tarif  = Number(String(pickField(hit, TARIF_KEYS) || "").replace(/[^0-9.-]/g,"")) || 0;

  return { activity_type: tipe, nama, satuan, tarif_borongan: tarif };
}


  // ======== Model ========
  const DKEY = "pdo.form.buffer";
  let F = U.S.get(DKEY, null);

  // preload dari draft jika query ?nomor=
  if (nomorQS) {
    const drafts = U.S.get("kpl.actual.pdo_draft", []);
    const found = drafts.find((x) => String(x.nomor) === String(nomorQS));
    if (found) {
      F = JSON.parse(JSON.stringify(found));
    }
  }

  if (!F) {
    F = {
      nomor: "",
      ref_rkb: "",
      periode: "",
      estate_id: profile.estate_id || "",
      rayon_id: profile.rayon_id || "",
      divisi_id: profile.divisi || "",
      upah_hk_bhl: 0,
      upah_hk_sku: 0,
      premi_panen: 0,
      premi_non_panen: 0,
      target_produksi_ton: 0,
      hk: [],
      borongan: [],
      created_ts: null,
      askep_ts: null,
      manager_ts: null,
    };
  }
  if (!F.nomor) {
    F.nomor = genNoPDO(F.divisi_id || profile.divisi || "XX");
  }
  if (!F.created_ts) {
    F.created_ts = fmtStampWIB().sig;
  }

  // Setelah F dibentuk (baik dari QS nomor atau dari buffer/baru):
  F.divisi_id = String(
    F.divisi_id || F.divisi || F.divisi_kode || profile.divisi || ""
  ).trim();
  delete F.divisi;
  delete F.divisi_kode;

  // Isi rate dari local bila kosong
  function bindRatesIfEmpty() {
    if (!(Number(F.upah_hk_bhl) || 0))
      F.upah_hk_bhl = resolveRateValue("upah_hk_bhl", F.divisi_id);
    if (!(Number(F.upah_hk_sku) || 0))
      F.upah_hk_sku = resolveRateValue("upah_hk_sku", F.divisi_id);
    if (!(Number(F.premi_panen) || 0))
      F.premi_panen = resolveRateValue("premi_panen", F.divisi_id);
    if (!(Number(F.premi_non_panen) || 0))
      F.premi_non_panen = resolveRateValue("premi_non_panen", F.divisi_id);
  }

  function requireLocalActivitiesOrWarn() {
    const acts = getMasterMulti("yactivity", "activity", "activities");
    const ok = Array.isArray(acts) && acts.length > 0;
    if (!ok) {
      window.__PDO_CCTV.warn.push("yactivity tidak ditemukan di localstorage");
      U.alert(
        "Daftar kegiatan (yactivity) belum tersedia di perangkat.\n" +
          'Buka Beranda lalu klik "Tarik Master & Data Aktual", kemudian kembali ke PDO.'
      );
    }
    return ok;
  }

  // Guard: wajib ada sheet yrates di lokal; kalau tidak → arahkan user ke Beranda
  function requireLocalYratesOrRedirect() {
    const hasYr = getMasterMulti("yrate", "yrates", "yreate");
    const ok = Array.isArray(hasYr) && hasYr.length > 0;
    if (!ok) {
      window.__PDO_CCTV.warn.push("yrates tidak ditemukan di localstorage");
      U.alert(
        "Data tarif (yrates) belum tersedia di perangkat.\n" +
          'Silakan buka Beranda lalu klik "Tarik Master & Data Aktual".'
      );
      location.hash = "#/"; // arahkan ke Beranda
      return false;
    }
    return true;
  }

  // ======== Perhitungan ========
  function recomputeTotals() {
    (F.hk || []).forEach((it, i) => {
      const rate =
        String(it.tipe || "").toUpperCase() === "SKU"
          ? Number(F.upah_hk_sku || 0)
          : Number(F.upah_hk_bhl || 0);
      it.total_rp = Math.round(Number(it.hk || 0) * rate);
      updateRowTotalCell("hk", i);
    });
    (F.borongan || []).forEach((it, i) => {
      it.total_rp = Math.round(
        Number(it.qty || 0) * Number(it.tarif_borongan || 0)
      );
      updateRowTotalCell("bor", i);
    });
    updateHeaderTotalsUI();
    saveDebounced();
  }

function addHK() {
  (F.hk = F.hk || []).push({
    activity_type: "",   // << wajib diisi user
    pekerjaan: "",       // akan terisi otomatis
    satuan: "",
    luas_ha: 0,
    hk: 0,
    tipe: "SKU",
    total_rp: 0,
  });
  render();
}

  function delHK(i) {
    F.hk.splice(i, 1);
    recomputeTotals();
    render();
  }

function addBorongan() {
  (F.borongan = F.borongan || []).push({
    activity_type: "",   // << wajib diisi user
    pekerjaan: "",       // auto dari master
    satuan: "",
    qty: 0,
    tarif_borongan: 0,
    total_rp: 0,
  });
  render();
}

  function delBorongan(i) {
    F.borongan.splice(i, 1);
    recomputeTotals();
    render();
  }

  function periodeOptions() {
    const p = F.periode || "";
    return `<option value="${p}">${p || "-"}</option>`;
  }

  // ======== Prefill dari RKB ke PDO ========
  let ACT_KEYS = { items: "rkb_items", bahan: "rkb_bahan" };
  async function resolveActualNames() {
    try {
      const tryItems = [
        "rkb_items",
        "rkb_item",
        "rkb_detail_items",
        "rkb_details",
        "rkb_detail",
      ];
      const tryBhn = [
        "rkb_bahan",
        "rkb_material",
        "rkb_bhn",
        "rkb_bahan_items",
      ];
      for (const k of tryItems) {
        const v = STORE?.getActual?.(k);
        if (Array.isArray(v) && v.length) {
          ACT_KEYS.items = k;
          break;
        }
      }
      for (const k of tryBhn) {
        const v = STORE?.getActual?.(k);
        if (Array.isArray(v) && v.length) {
          ACT_KEYS.bahan = k;
          break;
        }
      }
    } catch (_) {}
  }

  function readRkbDraft(nomor) {
    const drafts = U.S.get("rkb.drafts", []) || [];
    return drafts.find((x) => String(x.nomor) === String(nomor));
  }

  function itemsFromActuals(nomor) {
    const itemsAll = STORE?.getActual?.(ACT_KEYS.items) || [];
    const bahanAll = STORE?.getActual?.(ACT_KEYS.bahan) || [];
    const rowsI = itemsAll.filter((i) => String(i.nomor) === String(nomor));
    const bahanByIdx = {};
    bahanAll
      .filter((b) => String(b.nomor) === String(nomor))
      .forEach((b) => {
        const k = String(b.item_idx || "");
        (bahanByIdx[k] = bahanByIdx[k] || []).push(b);
      });
    return rowsI.map((r) => {
      const lokasiArr = String(r.lokasi || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        pekerjaan: r.pekerjaan || "",
        activity_type: r.activity_type || "",
        lokasi: lokasiArr,
        volume: Number(r.volume || 0),
        satuan: r.satuan || "",
        hk_unit: Number(r.hk_unit || 0),
        pct_bhl: Number(r.pct_bhl || 0),
        pct_sku: Number(r.pct_sku || 0),
        pct_bhb: Number(r.pct_bhb || 0),
        bahan: bahanByIdx[String(r.idx || "")] || [],
        pengawas: r.pengawas || "",
      };
    });
  }
  async function preloadFromRKB() {
    if ((F.hk && F.hk.length) || (F.borongan && F.borongan.length)) return;
    if (!F.ref_rkb) return;

    await ensureWarm();
    await resolveActualNames();

    let rkb = readRkbDraft(F.ref_rkb);
    let items = [];
    if (rkb && Array.isArray(rkb.items) && rkb.items.length) {
      items = rkb.items;
    } else {
      items = itemsFromActuals(F.ref_rkb);
    }
    if (!items.length) return;

    const HK = [];
    const BOR = [];
    items.forEach((it) => {
      const V = Number(it.volume || 0);
      const hkUnit = Number(it.hk_unit || 0);
      const baseHK = V * hkUnit;

      const hkSKU = baseHK * (Number(it.pct_sku || 0) / 100);
      const hkBHL = baseHK * (Number(it.pct_bhl || 0) / 100);
      const hkBHB = baseHK * (Number(it.pct_bhb || 0) / 100);

      // helper proporsi aman
      const prop = (hkPart, total) => (total > 0 ? hkPart / total : 0);
      const r2 = (n) => Math.round(n * 100) / 100; // 2 desimal
      const r3 = (n) => Math.round(n * 1000) / 1000; // 3 desimal

      // === HK SKU ===
      if (hkSKU > 0) {
        const luasSKU = r3(V * prop(hkSKU, baseHK)); // Luas (Ha) proporsi volume
        HK.push({
          pekerjaan: it.pekerjaan || "",
          activity_type: it.activity_type || "",
          satuan: it.satuan || "",
          luas_ha: luasSKU,
          hk: r2(hkSKU),
          tipe: "SKU",
          total_rp: 0,
        });
      }

      // === HK BHL ===
      if (hkBHL > 0) {
        const luasBHL = r3(V * prop(hkBHL, baseHK)); // Luas (Ha) proporsi volume
        HK.push({
          pekerjaan: it.pekerjaan || "",
          activity_type: it.activity_type || "",
          satuan: it.satuan || "",
          luas_ha: luasBHL,
          hk: r2(hkBHL),
          tipe: "BHL",
          total_rp: 0,
        });
      }

      // === BORONGAN (dari BHB) ===
      if (hkBHB > 0) {
  const act = resolveActivityByName(it.pekerjaan || "");
  const tipeAct = act?.activity_type || act?.kode || act?.kd || act?.type || "";
  const satuanBor =
    act?.satuan_borongan || act?.satuan_default || act?.satuan || it.satuan || "";
  const tarifBor = Number(String(act?.tarif_borongan ?? '').replace(/[^0-9.-]/g,'')) || 0;

  const qtyBor = r2(V * prop(hkBHB, baseHK)); // Qty = volume proporsional
  BOR.push({
    activity_type: tipeAct,          // ← penting (fix issue #2)
    pekerjaan: it.pekerjaan || "",
    satuan: satuanBor,
    qty: qtyBor,
    tarif_borongan: tarifBor,
    total_rp: 0,
  });
}
    });

    F.hk = HK;
    F.borongan = BOR;
    bindRatesIfEmpty();
    recomputeTotals();
    saveDebounced();
  }

  // ======== VIEW ========
  function headerView() {
    const totalHK = (F.hk || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalBor = (F.borongan || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalPremi =
      Number(F.premi_panen || 0) + Number(F.premi_non_panen || 0);
    const grand = totalHK + totalBor + totalPremi;

    return `
      <div class="card mb-3">
        <div class="card-body">
          ${
            READONLY
              ? `<div class="alert alert-warning py-1 mb-3"><strong>READ ONLY</strong> — Anda membuka tampilan PDO tanpa bisa mengubah data.</div>`
              : ""
          }
          <div class="row g-2">
            <div class="col-12 col-md-4">
              <label class="form-label">Periode</label>
              <select class="form-select" id="inp-periode" disabled>
                ${periodeOptions()}
              </select>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">No. PDO</label>
              <input class="form-control" id="inp-nomor" value="${
                F.nomor || ""
              }" disabled />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Ref. RKB</label>
              <input class="form-control" id="inp-ref-rkb" value="${
                F.ref_rkb || ""
              }" disabled />
            </div>

            <div class="col-12 col-md-4">
              <label class="form-label">Target Produksi (Ton)</label>
              <input type="number" class="form-control" id="inp-target" value="${
                F.target_produksi_ton || 0
              }" ${READONLY ? "disabled" : ""}/>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Upah HK SKU</label>
              <input type="text" class="form-control" id="inp-sku"  value="${fmtIDR(
                F.upah_hk_sku || 0
              )}" disabled />
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Upah HK BHL</label>
              <input type="text" class="form-control" id="inp-bhl" value="${fmtIDR(
                F.upah_hk_bhl || 0
              )}" disabled />
            </div>

            <div class="col-12 col-md-4">
              <label class="form-label">Premi Panen</label>
              <input type="text" inputmode="decimal" class="form-control" id="inp-premi-panen"  value="${fmtIDR(
                F.premi_panen || 0
              )}" ${READONLY ? "disabled" : ""}/>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Premi Non Panen</label>
              <input type="text" inputmode="decimal" class="form-control" id="inp-premi-non"  value="${fmtIDR(
                F.premi_non_panen || 0
              )}" ${READONLY ? "disabled" : ""}/>
            </div>
            <div class="col-12 col-md-4">
              <label class="form-label">Total PDO</label>
              <input class="form-control" value="${fmtIDR(grand)}" disabled />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function hkBlock() {
  return `
  <div class="card mb-3">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>Pekerjaan HK</strong>
        ${READONLY ? "" : `<button class="btn btn-sm btn-outline-primary" id="btn-add-hk">Tambah Baris</button>`}
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped align-middle">
          <thead class="table-light">
            <tr>
              <th style="width:38px">#</th>
              <th>Activity Type</th>
              <th>Jenis Pekerjaan</th>
              <th>Satuan</th>
              <th>Luas</th>
              <th>HK</th>
              <th>Tipe HK</th>
              <th class="text-end">Total (Rp)</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${(F.hk || []).map((it, i) => `
              <tr data-row-type="hk" data-idx="${i}">
                <td>${i + 1}</td>
                <td>
                  <input type="text" class="form-control form-control-sm"
                    list="list-activity-type" data-sec="hk" data-k="activity_type" data-i="${i}"
                    placeholder="ketik kode/tipe..." value="${it.activity_type||''}" ${READONLY?'disabled':''}/>
                </td>
                <td>
                  <input type="text" class="form-control form-control-sm pdo-pekerjaan-input"
                    data-sec="hk" data-k="pekerjaan" data-i="${i}"
                    value="${it.pekerjaan||''}" disabled />
                </td>
                <td><input class="form-control form-control-sm" data-sec="hk" data-k="satuan" data-i="${i}" value="${it.satuan||''}" ${READONLY?'disabled':''}/></td>
                <td><input type="number" class="form-control form-control-sm" data-sec="hk" data-k="luas_ha" data-i="${i}" value="${it.luas_ha||0}" ${READONLY?'disabled':''}/></td>
                <td><input type="number" class="form-control form-control-sm" data-sec="hk" data-k="hk" data-i="${i}" value="${it.hk||0}" ${READONLY?'disabled':''}/></td>
                <td>
                  <select class="form-select form-select-sm" data-sec="hk" data-k="tipe" data-i="${i}" ${READONLY?'disabled':''}>
                    <option value="SKU" ${String(it.tipe||"") === "SKU" ? "selected":""}>SKU</option>
                    <option value="BHL" ${String(it.tipe||"") === "BHL" ? "selected":""}>BHL</option>
                  </select>
                </td>
                <td class="text-end pdo-total-cell" data-total-cell="hk-${i}">${fmtIDR(it.total_rp||0)}</td>
                <td>${READONLY? "" : `<button class="btn btn-sm btn-danger" data-del-hk="${i}">Hapus</button>`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

  function boronganBlock() {
  return `
  <div class="card mb-3">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>Pekerjaan Borongan</strong>
        ${READONLY ? "" : `<button class="btn btn-sm btn-outline-primary" id="btn-add-bor">Tambah Baris</button>`}
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped align-middle">
          <thead class="table-light">
            <tr>
              <th style="width:38px">#</th>
              <th>Activity Type</th>
              <th>Jenis Pekerjaan</th>
              <th>Satuan</th>
              <th>Qty</th>
              <th>Tarif Borongan</th>
              <th class="text-end">Total (Rp)</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            ${(F.borongan || []).map((it, i) => `
              <tr data-row-type="bor" data-idx="${i}">
                <td>${i + 1}</td>
                <td>
                  <input type="text" class="form-control form-control-sm"
                    list="list-activity-type" data-sec="bor" data-k="activity_type" data-i="${i}"
                    placeholder="ketik kode/tipe..." value="${it.activity_type||''}" ${READONLY?'disabled':''}/>
                </td>
                <td>
                  <input type="text" class="form-control form-control-sm pdo-pekerjaan-input"
                    data-sec="bor" data-k="pekerjaan" data-i="${i}"
                    value="${it.pekerjaan||''}" disabled />
                </td>
                <td><input class="form-control form-control-sm" data-sec="bor" data-k="satuan" data-i="${i}" value="${it.satuan||''}" ${READONLY?'disabled':''}/></td>
                <td><input type="number" class="form-control form-control-sm" data-sec="bor" data-k="qty" data-i="${i}" value="${it.qty||0}" ${READONLY?'disabled':''}/></td>
                <td><input type="text" class="form-control form-control-sm" data-sec="bor" data-k="tarif_borongan" data-i="${i}" value="${fmtIDR(it.tarif_borongan||0)}" ${READONLY?'disabled':''}/></td>
                <td class="text-end pdo-total-cell" data-total-cell="bor-${i}">${fmtIDR(it.total_rp||0)}</td>
                <td>${READONLY? "" : `<button class="btn btn-sm btn-danger" data-del-bor="${i}">Hapus</button>`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

  function updateHeaderTotalsUI() {
    // Update kolom total di header saja (tanpa render penuh)
    const totalHK = (F.hk || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalBor = (F.borongan || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalPremi =
      Number(F.premi_panen || 0) + Number(F.premi_non_panen || 0);
    const grand = totalHK + totalBor + totalPremi;

    const inputTotal = root.querySelector(".card input[disabled][value]");
    // lebih aman: cari input "Total PDO" berdasarkan label
    const totalInput = Array.from(
      root.querySelectorAll(".card .form-control[disabled]")
    ).find(
      (el) =>
        el.previousElementSibling &&
        /Total PDO/i.test(el.previousElementSibling.textContent || "")
    );
    if (totalInput) totalInput.value = fmtIDR(grand);
  }

  function updateRowTotalCell(sec, i) {
    const sel = `[data-total-cell="${sec}-${i}"]`;
    const td = root.querySelector(sel);
    if (!td) return;
    const arr = sec === "hk" ? F.hk || [] : F.borongan || [];
    const it = arr[i] || {};
    td.textContent = fmtIDR(Number(it.total_rp || 0));
  }

  function footerActions() {
    return READONLY
      ? ""
      : `
      <div class="d-grid gap-2 my-3">
        <button class="btn btn-primary btn-lg" id="btn-save-draft">Simpan Draft</button>
      </div>
    `;
  }

  function backfillActivityFromName(row, isBor){
  if (row.activity_type) return;
  if (!row.pekerjaan) return;
  const a = resolveActivityByName(row.pekerjaan);
  if (!a) return;
  row.activity_type = a.activity_type || a.kode || a.kd || a.type || '';
  row.satuan = row.satuan || a.satuan_borongan || a.satuan_default || a.satuan || '';
  if (isBor && !Number(row.tarif_borongan||0)) {
    row.tarif_borongan = Number(String(a.tarif_borongan??'').replace(/[^0-9.-]/g,''))||0;
  }
}


  function getActivities() {
    return getMasterMulti("yactivity", "activity", "activities") || [];
  }

// Lookup by activity_type (kode) – tolerant
function pickActivityByType(code){
  const raw = String(code||"").trim();
  if (!raw) return null;

  const want = normCode(raw);
  const acts = getActivities();

  // cari kandidat: cocokkan berdasarkan berbagai kemungkinan nama kolom "kode"
  const CODE_KEYS = [
    "activity_type", "kode", "kd", "type", "kode_aktivitas",
    "activity", "activity_code", "no_aktivitas", "kodeKegiatan"
  ];

  // 1) exact match (setelah norm) pada salah satu kolom kode
  let hit = acts.find(a => {
    const kode = pickField(a, CODE_KEYS);
    return normCode(kode) === want;
  });

  // 2) fallback: contains yg unik
  if (!hit) {
    const cand = acts.filter(a => {
      const kode = pickField(a, CODE_KEYS);
      return normCode(kode).includes(want);
    });
    if (cand.length === 1) hit = cand[0];
  }
  if (!hit) return null;

  // mapping fleksibel untuk nama/pekerjaan/satuan/tarif
  const NAMA_KEYS   = ["nama_pekerjaan","nama","pekerjaan","jenis","deskripsi","uraian","kegiatan"];
  const SATUAN_KEYS = ["satuan_borongan","satuan_default","satuan","uom","unit","satuan_output"];
  const TARIF_KEYS  = ["tarif_borongan","tarif","rate_borongan","harga","nilai"];

  const nama   = String(pickField(hit, NAMA_KEYS)   || "").trim();
  const tipe   = String(pickField(hit, CODE_KEYS)   || "").trim();
  const satuan = String(pickField(hit, SATUAN_KEYS) || "").trim();
  const tarif  = Number(String(pickField(hit, TARIF_KEYS) || "")
                  .replace(/[^0-9.-]/g,"")) || 0;

  return { nama, activity_type: tipe, satuan, tarif_borongan: tarif };
}


  function render() {
    const totalHK = (F.hk || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalBor = (F.borongan || []).reduce(
      (a, b) => a + Number(b.total_rp || 0),
      0
    );
    const totalPremi =
      Number(F.premi_panen || 0) + Number(F.premi_non_panen || 0);
    const grand = totalHK + totalBor + totalPremi;

    root.innerHTML = `
      ${headerView()}
      ${hkBlock()}
      ${boronganBlock()}
      <datalist id="list-activity-type">
  ${getActivities().map(a=>{
    const type  = String(pickField(a, [
      "activity_type","kode","kd","type","kode_aktivitas","activity","activity_code","no_aktivitas","kodeKegiatan"
    ]) || "").trim();
    const nama  = String(pickField(a, ["nama_pekerjaan","nama","pekerjaan","jenis","deskripsi","uraian","kegiatan"]) || "").trim();
    const satuan= String(pickField(a, ["satuan_borongan","satuan_default","satuan","uom","unit","satuan_output"]) || "").trim();
    const tarif = Number(String(pickField(a, ["tarif_borongan","tarif","rate_borongan","harga","nilai"]) || "")
                    .replace(/[^0-9.-]/g,"")) || 0;

    const label = [type, nama?`– ${nama}`:"", satuan?`(${satuan})`:""].filter(Boolean).join(" ");
    return `<option value="${type}" data-nama="${nama}" data-satuan="${satuan}" data-tarif="${tarif}">${label}</option>`;
  }).join("")}
</datalist>

${footerActions()}
    `;

    if (!READONLY) {
      const elTarget = U.qs("#inp-target");
      if (elTarget) {
        elTarget.oninput = () => {
          F.target_produksi_ton = Number(elTarget.value || 0);
          saveDebounced();
        };
      }
      const elPremiP = U.qs("#inp-premi-panen");
      if (elPremiP) {
        elPremiP.oninput = U.debounce(() => {
          F.premi_panen = Number(elPremiP.value || 0);
          updateHeaderTotalsUI();
          saveDebounced();
        }, 30);
      }
      const elPremiN = U.qs("#inp-premi-non");
      if (elPremiN) {
        elPremiN.oninput = U.debounce(() => {
          F.premi_non_panen = Number(elPremiN.value || 0);
          updateHeaderTotalsUI();
          saveDebounced();
        }, 30);
      }

      const btnAddHK = U.qs("#btn-add-hk");
      if (btnAddHK) btnAddHK.onclick = addHK;
      const btnAddBor = U.qs("#btn-add-bor");
      if (btnAddBor) btnAddBor.onclick = addBorongan;

      U.qsa("input[data-sec], select[data-sec]").forEach((inp) => {
        // pakai event 'input' tetap, tapi tanpa render ulang
        const onChange = () => {
  const sec = inp.dataset.sec;
  const k   = inp.dataset.k;
  const i   = Number(inp.dataset.i);
  const arr = sec === "hk" ? F.hk : F.borongan;

  // simpan nilai (pastikan numerik utk tarif)
  if (k === "tarif_borongan") {
    arr[i][k] = parseLocal(inp.value);
  } else if (inp.type === "number") {
    arr[i][k] = Number(inp.value || 0);
  } else {
    arr[i][k] = inp.value;
  }

  // ketika activity_type diubah → isi turunan
  if (k === 'activity_type') {
    const meta = pickActivityByType(inp.value || '');
    const tr   = inp.closest('tr');
    const elJob= tr && tr.querySelector('input[data-k="pekerjaan"]');
    const elSat= tr && tr.querySelector('input[data-k="satuan"]');
    const elTar= tr && tr.querySelector('input[data-k="tarif_borongan"]');

    if (meta) {
      arr[i].activity_type   = meta.activity_type;
      arr[i].pekerjaan       = meta.nama;
      arr[i].satuan          = meta.satuan || arr[i].satuan || '';
      if (sec === 'bor') {
        arr[i].tarif_borongan = Number(meta.tarif_borongan||0);
      }
      if (elJob) elJob.value = arr[i].pekerjaan || '';
      if (elSat) elSat.value = arr[i].satuan || '';
      if (elTar) {
        elTar.value = fmtIDR(arr[i].tarif_borongan || 0);
        if (!elTar.id) elTar.id = `tarif-bor-${i}`;
        attachMaskText(elTar.id, 'idr', (v)=>{
          arr[i].tarif_borongan = v;
          recomputeTotals();
          saveDebounced();
        });
      }
    } else {
      // kode tak dikenali → kosongkan nama pekerjaan saja
      arr[i].pekerjaan = '';
      if (elJob) elJob.value = '';
      // satuan/tarif biarkan (jangan ditimpa) jika user sudah isi manual
    }
  }

  // dukungan lama bila kolom pekerjaan (yang sudah disabled) kebetulan aktif di draft lama:
  if (k === 'pekerjaan' && !inp.disabled) {
    // tidak perlu apa-apa, atau bisa resolve nama → kode jika Anda mau.
  }

  recomputeTotals();
};
        // untuk mengurangi “spam” event di perangkat tertentu, debounce dikit
        inp.addEventListener("input", U.debounce(onChange, 30));
        inp.addEventListener("change", onChange);
      });

      U.qsa("button[data-del-hk]").forEach(
        (b) => (b.onclick = () => delHK(Number(b.dataset.delHk)))
      );
      U.qsa("button[data-del-bor]").forEach(
        (b) => (b.onclick = () => delBorongan(Number(b.dataset.delBor)))
      );

      const btnSave = U.qs("#btn-save-draft");
if (btnSave) {
  btnSave.addEventListener('click', (e)=>{
    e.preventDefault(); // jaga-jaga kalau nanti dibungkus <form>
    onSaveDraft();
  });
}
    }
    if (!READONLY) {
      attachMaskText("inp-target", "id2", (v) => {
        F.target_produksi_ton = v;
        saveDebounced();
      });

      attachMaskText("inp-premi-panen", "idr", (v) => {
        F.premi_panen = v;
        updateHeaderTotalsUI();
        saveDebounced();
      });

      attachMaskText("inp-premi-non", "idr", (v) => {
        F.premi_non_panen = v;
        updateHeaderTotalsUI();
        saveDebounced();
      });

      // Masker untuk semua input tarif borongan di tabel (tiap baris borongan)
      U.qsa('tr[data-row-type="bor"] input[data-k="tarif_borongan"]').forEach((el, i)=>{
  if (!el.id) el.id = `tarif-bor-${i}`;
  attachMaskText(el.id, 'idr', (v)=>{
    if (Array.isArray(F.borongan) && F.borongan[i]) {
      F.borongan[i].tarif_borongan = v;
      recomputeTotals();
      saveDebounced();
    }
  });
});

    }
    updateHeaderTotalsUI();
  }

  // ======== VALIDATION ========
function clearValidationMarks(){
  root.querySelectorAll('.is-invalid').forEach(el=>{
    el.classList.remove('is-invalid');
    el.removeAttribute('title');
  });
}

function markInvalid(el, msg){
  if(!el) return;
  el.classList.add('is-invalid');
  if(msg) el.setAttribute('title', msg);
}

function findCellInput(sec, k, i){
  return root.querySelector(`tr[data-row-type="${sec}"] [data-sec="${sec}"][data-k="${k}"][data-i="${i}"]`);
}

// Wajib terisi (string non-kosong)
function reqStr(val){ return String(val ?? '').trim() !== ''; }
// Wajib > 0 (angka)
function reqPos(val){ return Number(val || 0) > 0; }

function validateBeforeSave(){
  // Sinkronkan nilai dari UI (kalau user baru mengetik lalu langsung klik)
const elTargetNow = root.querySelector('#inp-target');
if (elTargetNow) F.target_produksi_ton = parseLocal(elTargetNow.value);

  clearValidationMarks();
  const errors = [];
  let firstEl = null;

  // ===== Header checks =====
  // NB: periode & nomor disabled namun kita tetap pastikan nilainya ada
  if(!reqStr(F.periode)){ errors.push('Periode wajib diisi.'); }
  if(!reqStr(F.nomor)){ errors.push('Nomor PDO wajib ada.'); }
  if(!reqStr(F.ref_rkb)){ errors.push('Ref. RKB wajib diisi.'); }

  if(!reqStr(F.divisi_id)){ errors.push('Divisi wajib diisi.'); }
  if(!reqStr(F.estate_id)){ errors.push('Estate wajib diisi.'); }
  if(!reqStr(F.rayon_id)){ errors.push('Rayon wajib diisi.'); }

  // Angka header: semua wajib > 0 sesuai permintaan
// Angka header: semua wajib > 0 sesuai permintaan
const elTarget = root.querySelector('#inp-target');

// KOERSI: pastikan model numeric dulu (atasi kasus "0,00" dsb.)
F.target_produksi_ton = parseLocal(F.target_produksi_ton);

if (!reqPos(F.target_produksi_ton)) {
  errors.push('Target Produksi (Ton) harus > 0.');
  if (!firstEl) firstEl = elTarget;
  markInvalid(elTarget, 'Wajib lebih dari nol');
}
  const elPremiP = root.querySelector('#inp-premi-panen');
  if(!reqPos(F.premi_panen)){
    errors.push('Premi Panen harus > 0.');
    if(!firstEl) firstEl = elPremiP;
    markInvalid(elPremiP, 'Wajib lebih dari nol');
  }
  const elPremiN = root.querySelector('#inp-premi-non');
  if(!reqPos(F.premi_non_panen)){
    errors.push('Premi Non Panen harus > 0.');
    if(!firstEl) firstEl = elPremiN;
    markInvalid(elPremiN, 'Wajib lebih dari nol');
  }

  // Upah HK (disabled tapi tetap wajib ada dan >0)
  if(!reqPos(F.upah_hk_sku)){
    errors.push('Upah HK SKU belum tersedia (> 0) — tarik master yrates.');
  }
  if(!reqPos(F.upah_hk_bhl)){
    errors.push('Upah HK BHL belum tersedia (> 0) — tarik master yrates.');
  }

  // Minimal harus ada isi baris HK atau Borongan
  const hasAnyRow = Array.isArray(F.hk) && F.hk.length || Array.isArray(F.borongan) && F.borongan.length;
  if(!hasAnyRow){
    errors.push('Tambahkan minimal satu baris HK atau Borongan.');
  }

  // ===== Detail HK =====
  (F.hk || []).forEach((it, i)=>{
    const elType = findCellInput('hk','activity_type',i);
    const elJob  = findCellInput('hk','pekerjaan',i); // disabled; hanya penanda error
    const elSat  = findCellInput('hk','satuan',i);
    const elLuas = findCellInput('hk','luas_ha',i);
    const elHK   = findCellInput('hk','hk',i);
    const elTipe = root.querySelector(`tr[data-row-type="hk"] select[data-sec="hk"][data-k="tipe"][data-i="${i}"]`);

    if(!reqStr(it.activity_type)){
      errors.push(`HK baris ${i+1}: Activity Type wajib diisi.`);
      if(!firstEl) firstEl = elType;
      markInvalid(elType, 'Wajib diisi');
    }
    if(!reqStr(it.pekerjaan)){
      errors.push(`HK baris ${i+1}: Jenis Pekerjaan tidak terbaca dari master.`);
      if(!firstEl) firstEl = elType || elJob;
      markInvalid(elJob || elType, 'Isi/benarkan Activity Type (nama otomatis)');
    }
    if(!reqStr(it.satuan)){
      errors.push(`HK baris ${i+1}: Satuan wajib diisi.`);
      if(!firstEl) firstEl = elSat;
      markInvalid(elSat, 'Wajib diisi');
    }
    if(!reqPos(it.luas_ha)){
      errors.push(`HK baris ${i+1}: Luas harus > 0.`);
      if(!firstEl) firstEl = elLuas;
      markInvalid(elLuas, 'Wajib > 0');
    }
    if(!reqPos(it.hk)){
      errors.push(`HK baris ${i+1}: HK harus > 0.`);
      if(!firstEl) firstEl = elHK;
      markInvalid(elHK, 'Wajib > 0');
    }
    if(!reqStr(it.tipe)){
      errors.push(`HK baris ${i+1}: Tipe HK wajib (SKU/BHL).`);
      if(!firstEl) firstEl = elTipe;
      markInvalid(elTipe, 'Pilih tipe');
    }
    if(!reqPos(it.total_rp)){
      // total dihitung otomatis; kalau 0 kemungkinan upah 0 atau hk 0
      errors.push(`HK baris ${i+1}: Total (Rp) masih 0 — cek Upah/HK.`);
      // tak perlu mark: sudah ditandai di komponen penyebab
    }
  });

  // ===== Detail BORONGAN =====
  (F.borongan || []).forEach((it, i)=>{
    const elType = findCellInput('bor','activity_type',i);
    const elJob  = findCellInput('bor','pekerjaan',i); // disabled; hanya penanda error
    const elSat  = findCellInput('bor','satuan',i);
    const elQty  = findCellInput('bor','qty',i);
    const elTar  = findCellInput('bor','tarif_borongan',i);

    if(!reqStr(it.activity_type)){
      errors.push(`Borongan baris ${i+1}: Activity Type wajib diisi.`);
      if(!firstEl) firstEl = elType;
      markInvalid(elType, 'Wajib diisi');
    }
    if(!reqStr(it.pekerjaan)){
      errors.push(`Borongan baris ${i+1}: Jenis Pekerjaan tidak terbaca dari master.`);
      if(!firstEl) firstEl = elType || elJob;
      markInvalid(elJob || elType, 'Isi/benarkan Activity Type (nama otomatis)');
    }
    if(!reqStr(it.satuan)){
      errors.push(`Borongan baris ${i+1}: Satuan wajib diisi.`);
      if(!firstEl) firstEl = elSat;
      markInvalid(elSat, 'Wajib diisi');
    }
    if(!reqPos(it.qty)){
      errors.push(`Borongan baris ${i+1}: Qty harus > 0.`);
      if(!firstEl) firstEl = elQty;
      markInvalid(elQty, 'Wajib > 0');
    }
    if(!reqPos(it.tarif_borongan)){
      errors.push(`Borongan baris ${i+1}: Tarif Borongan harus > 0.`);
      if(!firstEl) firstEl = elTar;
      markInvalid(elTar, 'Wajib > 0');
    }
    if(!reqPos(it.total_rp)){
      errors.push(`Borongan baris ${i+1}: Total (Rp) masih 0 — cek Qty/Tarif.`);
    }
  });

  if (errors.length){
  U.alert(`Periksa kembali isian Anda:\n\n• ${errors.join('\n• ')}`);
  U.toast('Validasi gagal. Periksa bidang yang ditandai.', 'danger');
  if (firstEl){
    try{ firstEl.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){}
    try{ firstEl.focus(); }catch(_){}
  }
  return false;
}
  return true;
}


  async function onSaveDraft() {
    if (!validateBeforeSave()) return;

    const arr = U.S.get("kpl.actual.pdo_draft", []);
    const idx = arr.findIndex((x) => String(x.nomor) === String(F.nomor));
    if (idx >= 0) arr[idx] = F;
    else arr.push(F);
    U.S.set("kpl.actual.pdo_draft", arr);
    U.toast("Draft PDO tersimpan.");
    location.hash = "#/pdo/draft";
  }

  // ======== Bootstrap init ========
  (async function init() {
    await ensureWarm();
    if (!requireLocalYratesOrRedirect()) return;
    requireLocalActivitiesOrWarn();

    // snapshot profil/param untuk CCTV
    window.__PDO_CCTV.profile = profile;
    F.divisi_id = F.divisi_id || profile.divisi || "";
    if (!F.periode) {
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      F.periode = `${d.getFullYear()}-${mm}`;
    }
    window.__PDO_CCTV.periode = F.periode;
    ensureDebugPanel(); // ← pasang panel bila debug=1

    bindRatesIfEmpty();
    await preloadFromRKB();
    (F.hk||[]).forEach(r => backfillActivityFromName(r, false));
(F.borongan||[]).forEach(r => backfillActivityFromName(r, true));
    recomputeTotals();
    render();

    renderCctvDump(); // refresh isi panel
  })();
};
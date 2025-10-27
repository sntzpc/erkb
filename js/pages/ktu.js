// js/pages/ktu.js (CLEAN — No CCTV, No-Material strictly from master.ybahan)
window.Pages = window.Pages || {};
Pages.ktu = async function () {
  const root = U.qs('#app-root');

  // ====== 0) GUARANTEE MASTERS & ACTUALS ARE WARM ======
  const ok = await U.requireWarmOrRedirect({
    mastersNeeded: ['ydivisi', 'yrayon', 'yestate', 'ybahan'], // pastikan ybahan ada
    actualsNeeded: ['rkb']
  });
  if (!ok) {
    root.innerHTML = `<div class="alert alert-warning">Menunggu Tarik Master & Data Aktual...</div>`;
    return;
  }

  // ====== 1) UTILITIES ======
  const WIB = { timeZone: 'Asia/Jakarta' };
  const tzNow = () => new Date();
  function _lc(v) { return v == null ? '' : String(v).trim().toLowerCase(); }
  const isNonEmpty = (v) => v != null && String(v).trim() !== '';

  // === [PATCH] Key cache per-user supaya tidak ketukar antar user ===
  const __profile = SESSION.profile?.() || {};
  const ACT_KEY_KTU = `kpl.actual.ktu_rekap.${__profile.username || __profile.user_id || 'anon'}`;

  function getKtuCache() { return U.S.get(ACT_KEY_KTU, []) || []; }
  function setKtuCache(rows) { U.S.set(ACT_KEY_KTU, rows || []); }

  // Normalisasi YYYY-MM
  const fPeriode = (p) => {
    if (!p) return '-';
    const s = String(p).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if (isNaN(d)) return s;
    const y = new Intl.DateTimeFormat('id-ID', { ...WIB, year: 'numeric' }).format(d);
    const m = new Intl.DateTimeFormat('id-ID', { ...WIB, month: '2-digit' }).format(d);
    return `${y}-${m}`;
  };

  // Default periode = bulan depan (WIB)
  const nextMonthYM = () => {
    const now = tzNow();
    const y = Number(new Intl.DateTimeFormat('id-ID', { ...WIB, year: 'numeric' }).format(now));
    const m = Number(new Intl.DateTimeFormat('id-ID', { ...WIB, month: '2-digit' }).format(now));
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : (m + 1);
    return `${ny}-${String(nm).padStart(2, '0')}`;
  };

  // ====== 2) STATE ======
  let items = [];
  let masters = { ydivisi: [], yrayon: [], yestate: [], ybahan: [] };
  let filters = {
    periode: nextMonthYM(),
    estate_id: '',
    rayon_id: '',
    divisi_id: '',
    status: 'ALL'
  };

  // ====== 3) INDEX HELPERS ======
  function buildDivisiIndex(list) {
    const byId = new Map(), byKode = new Map(), byNama = new Map();
    (list || []).forEach(d => {
      const id = d.id ?? d.divisi_id;
      const kode = d.kode ?? d.kd_divisi;
      const nama = d.nama ?? d.nama_divisi;
      if (id != null) byId.set(_lc(id), d);
      if (kode != null) byKode.set(_lc(kode), d);
      if (nama != null) byNama.set(_lc(nama), d);
    });
    return { byId, byKode, byNama };
  }
  function buildRayonIndex(list) {
    const byId = new Map(), byKode = new Map(), byNama = new Map();
    (list || []).forEach(r => {
      const id = r.id ?? r.rayon_id ?? r.kode ?? r.kd_rayon ?? r.kode_rayon;
      const kode = r.kode ?? r.kd_rayon ?? r.kode_rayon ?? r.rayon_id;
      const nama = r.nama ?? r.nama_rayon ?? r.rayon_nama;
      if (id != null) byId.set(_lc(id), r);
      if (kode != null) byKode.set(_lc(kode), r);
      if (nama != null) byNama.set(_lc(nama), r);
    });
    return { byId, byKode, byNama };
  }
  function findDivRow(divisiId, divisiLabel, DX) {
    if (divisiId) {
      const hit = DX.byId.get(_lc(divisiId));
      if (hit) return hit;
    }
    if (divisiLabel) {
      const k = _lc(divisiLabel);
      return DX.byKode.get(k) || DX.byNama.get(k) || null;
    }
    return null;
  }
  function findRayonRowByAny(rayonIdOrKode, RX) {
    if (!rayonIdOrKode) return null;
    const k = _lc(rayonIdOrKode);
    return RX.byId.get(k) || RX.byKode.get(k) || RX.byNama.get(k) || null;
  }
  function resolveRayonId({ nomor, divisi_id, divisi_label }, { rkbByNomor, DX }) {
    const ridFromRkb = rkbByNomor[String(nomor)]?.rayon_id;
    if (ridFromRkb) return String(ridFromRkb);
    const drow = findDivRow(divisi_id, divisi_label, DX);
    if (drow) return String(drow.rayon_id ?? drow.kd_rayon ?? drow.kode_rayon ?? drow.rayon ?? '');
    return '';
  }
  function resolveRayon({ nomor, divisi_id, divisi_label }, ctx) {
    const { rkbByNomor, RX } = ctx;
    const rayon_id = resolveRayonId({ nomor, divisi_id, divisi_label }, ctx);
    if (!rayon_id) return { rayon_id: '', rayon_nama: '' };
    const rrow = findRayonRowByAny(rayon_id, RX);
    const rayon_nama = rrow ? (rrow.nama ?? rrow.nama_rayon ?? rrow.rayon_nama ?? String(rayon_id)) : String(rayon_id);
    return { rayon_id: String(rayon_id), rayon_nama: String(rayon_nama) };
  }

  // ====== 4) STATUS ======
  function normalizeStatus(raw) {
    if (!raw) return 'UNKNOWN';
    let s = String(raw).trim().toLowerCase();
    if (s.startsWith('draft ')) s = 'draft';
    switch (s) {
      case 'draft':              return 'DRAFT';
      case 'submitted':          return 'SUBMITTED';
      case 'askep_approved':     return 'ASKEP_APPROVED';
      case 'partial_approved':   return 'PARTIAL_APPROVED';
      case 'full_approved':      return 'FULL_APPROVED';
      case 'rejected':           return 'REJECTED';
      default:                   return 'UNKNOWN';
    }
  }
  function truthy(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE' || v === 'Y' || v === 'y'; }
  function deriveStatus(rkbRow = {}) {
    const raw = (rkbRow.status || rkbRow.approval_status || rkbRow.state || '').toString().trim();
    if (raw) return raw;
    const sAs = truthy(rkbRow.approve_asisten ?? rkbRow.approve_asst ?? rkbRow.sign_asisten);
    const sAk = truthy(rkbRow.approve_askep ?? rkbRow.sign_askep);
    const sEm = truthy(rkbRow.approve_em ?? rkbRow.sign_em);
    const rej = truthy(rkbRow.rejected ?? rkbRow.is_rejected) || String(rkbRow.status).toLowerCase() === 'rejected';
    if (rej) return 'rejected';
    if (sAs && sAk && sEm) return 'full_approved';
    if (sAs || sAk || sEm) return 'partial_approved';
    const submitted = truthy(rkbRow.submitted ?? rkbRow.is_submitted) || (String(rkbRow.status).toLowerCase() === 'submitted');
    if (submitted) return 'submitted';
    const draft = truthy(rkbRow.is_draft) || String(rkbRow.status).toLowerCase() === 'draft';
    if (draft) return 'draft';
    return 'unknown';
  }

  // ====== 5) INDEX ybahan & resolver No Material (STRICT dari master.ybahan) ======
  function buildBahanIndex(yb = []) {
    const byKode = new Map();
    const byNama = new Map();
    (yb || []).forEach(b => {
      const keys = [
        b.no_material, b.noMaterial,
        b.material_no, b.materialNo,
        b.material_code, b.materialCode,
        b.kode, b.code, b.kode_bahan, b.kd_bahan,
        b.kode_barang, b.kd_barang, b.item_code, b.itemCode,
        b.sap_code, b.sapCode, b.sku, b.part_no, b.partNo,
        b.nomor_material, b.nomorMaterial,
        b.materialid, b.material_id, b.id_material
      ].map(x => String(x||'').trim()).filter(Boolean);

      const nama = String(b.nama || b.bahan || b.material || '').trim();
      if (nama) byNama.set(_lc(nama), b);
      keys.forEach(k => byKode.set(_lc(k), b));
    });
    return { byKode, byNama };
  }

  // Ambil no_material HANYA dari master ybahan berdasar nama bahan (case-insensitive)
  function resolveNoMaterialFromMaster(namaBahan, BX) {
    if (!isNonEmpty(namaBahan) || !BX) return '';

    const name = String(namaBahan).trim();

    // 0) Normalizer nama
    const normName = name.replace(/\s+/g,' ').trim();

    // 1) Exact by NAMA (case-insensitive)
    const hitNama = BX.byNama.get(_lc(normName));
    if (hitNama) {
      const code = findAnyCode(hitNama);
      if (code) return code;
    }

    // 2) Tangkap KODE DI DEPAN atau DALAM KURUNG atau DI AKHIR
    //    - depan: "12345 - HOSE ..."
    //    - dalam kurung: "HOSE (MAT-12345)" / "(1234567)"
    //    - akhir: "HOSE ... - 12345"
    const tokenRegexes = [
      /^([A-Z0-9._-]{5,})\b/i,                 // depan
      /\(([A-Z0-9._-]{5,})\)/i,                // dalam kurung
      /[-–—]\s*([A-Z0-9._-]{5,})\s*$/i         // akhir setelah dash
    ];
    for (const rgx of tokenRegexes){
      const m = normName.match(rgx);
      const tok = m && m[1] ? m[1] : '';
      if (tok) {
        const hitKode = BX.byKode.get(_lc(tok));
        if (hitKode) { const code = findAnyCode(hitKode); if (code) return code; }
      }
    }

    // 3) Cari master.nama yang merupakan substring signifikan dari nama input (≥ 6 chars)
    //    contoh: master: "HOSE RUBBER 3/4" — input: "HOSE RUBBER 3/4 2M"
    for (const [kNama, row] of BX.byNama.entries()){
      if (kNama.length >= 6) {
        if (_lc(normName).includes(kNama) || kNama.includes(_lc(normName))) {
          const code = findAnyCode(row);
          if (code) return code;
        }
      }
    }

    // 4) (LAST RESORT) pecah nama menjadi token alfanumerik panjang (≥5) dan cek ke byKode
    const candTokens = normName.split(/[^A-Z0-9._-]+/i).filter(t => t && t.length >= 5);
    for (const t of candTokens){
      const hit = BX.byKode.get(_lc(t));
      if (hit) { const code = findAnyCode(hit); if (code) return code; }
    }

    return '';
  }

  function findAnyCode(b) {
    const keys = [
      'no_material','noMaterial','material_no','materialNo','material_code','materialCode',
      'kode','code','kode_bahan','kd_bahan','kode_barang','kd_barang','item_code','itemCode',
      'sap_code','sapCode','sku','part_no','partNo','nomor_material','nomorMaterial',
      'materialid','material_id','id_material'
    ];
    for (const k of keys) { if (isNonEmpty(b?.[k])) return String(b[k]).trim(); }
    for (const k of Object.keys(b||{})) {
      if (/^(no_?material|material_?(no|code|id)|kode(_(barang|bahan))?|kd_?(barang|bahan)|item_?(code|kode)|sap_?code|sku|part_?no|nomor_?material)$/i.test(k)) {
        const v = b[k]; if (isNonEmpty(v)) return String(v).trim();
      }
    }
    return '';
  }

  // === Ambil scope estate user dari SESSION.profile() ===
  function getUserEstateScope(){
    const prof = SESSION.profile() || {};
    const role = String(prof.role||'').trim().toLowerCase();

    const allow = new Set();

    // estate_id tunggal atau array
    const one  = prof.estate_id || prof.estate || '';
    const many = prof.estate_ids || prof.estates || [];
    if (one) allow.add(String(one));
    if (Array.isArray(many)) many.forEach(x => x && allow.add(String(x)));

    // turunkan dari divisi bila profil hanya punya daftar divisi
    const divs = prof.divisi_ids || prof.divisis || [];
    if (Array.isArray(divs) && divs.length){
      divs.forEach(did=>{
        const d = (masters.ydivisi||[]).find(x => String(x.id)===String(did));
        if (d && d.estate_id) allow.add(String(d.estate_id));
      });
    }

    // mapping dari estate_nama → id
    if (prof.estate_nama){
      const hit = (masters.yestate||[]).find(e=>{
        const t = String(prof.estate_nama).trim().toLowerCase();
        return t === String(e.nama_panjang||'').trim().toLowerCase() ||
              t === String(e.nama||'').trim().toLowerCase();
      });
      if (hit) allow.add(String(hit.id));
    }

    return { role, estateIds: Array.from(allow) };
  }

  // === Terapkan scope estate (hanya role KTU) ===
  function applyUserEstateScope(list){
    const { role, estateIds } = getUserEstateScope();
    if (role !== 'ktu') return list;
    if (!estateIds.length) return list;
    const allow = new Set(estateIds.map(String));
    return (list||[]).filter(r => r.estate_id && allow.has(String(r.estate_id)));
  }

  // ====== 6) LOAD + NORMALIZE ======
  async function load(preferLocal = true) {
    let openedHere = false;
    try {
      masters.ydivisi = STORE.getMaster('ydivisi') || [];
      masters.yrayon  = STORE.getMaster('yrayon')  || [];
      masters.yestate = STORE.getMaster('yestate') || [];
      masters.ybahan  = STORE.getMaster('ybahan')  || [];

      const DX = buildDivisiIndex(masters.ydivisi);
      const RX = buildRayonIndex(masters.yrayon);
      const BX = buildBahanIndex(masters.ybahan);

      const actualsRkb = STORE.getActualsRkb() || [];
      const rkbByNomor = Object.fromEntries((actualsRkb).map(r => [String(r.nomor), r]));
      const estateById = Object.fromEntries((masters.yestate || []).map(x => [String(x.id), x]));
      const divById    = Object.fromEntries((masters.ydivisi || []).map(x => [String(x.id), x]));

      let raw = [];
      if (preferLocal) {
        const cached = getKtuCache();
        if (Array.isArray(cached) && cached.length) raw = cached;
      }
      if (!raw.length) {
        const pm = document.getElementById('progressModal');
        const pmShown = pm && pm.classList.contains('show');
        if (!pmShown) { U.progressOpen('Tarik rekap bahan...'); U.progress(30, 'Ambil data (server)'); openedHere = true; }

        // === [PATCH] Sertakan scope estate user ke request server ===
        const { role, estateIds } = getUserEstateScope();
        const params = {};
        if (role === 'ktu' && Array.isArray(estateIds) && estateIds.length) {
          params.estate_ids = estateIds.map(String); // server bisa abaikan kalau tidak dipakai
        }

        const r = await API.call('ktuRekap', params);
        if (!r.ok) throw new Error(r.error || 'Gagal tarik rekap');
        raw = Array.isArray(r.items) ? r.items : [];
        setKtuCache(raw);
      }

      // NORMALISASI → no_material strictly dari master.ybahan
      items = (Array.isArray(raw) ? raw : []).map(it => {
        const nomor = String(it.nomor);
        const rkb = rkbByNomor[nomor] || {};

        const estate_id  = String(rkb.estate_id || it.estate_id || '');
        const divisi_id  = String(rkb.divisi_id || it.divisi_id || '');
        const pekerjaan  = it.pekerjaan || rkb.pekerjaan || '';
        const bahanNama  = it.nama || it.bahan || it.material || '';
        const jumlah     = Number(it.jumlah || it.qty || 0);
        const satuan     = it.satuan || it.uom || '';

        function firstNonEmpty(...vals) {
          for (const v of vals) {
            if (v != null && String(v).trim() !== '') return String(v).trim();
          }
          return '';
        }

        const no_material = firstNonEmpty( it.no_material, it.noMaterial ) || resolveNoMaterialFromMaster(bahanNama, BX);  // fallback terakhir

        const estateRow = estateById[estate_id] || {};
        const divRow    = divById[divisi_id] || {};
        const ray       = resolveRayon(
          {
            nomor,
            divisi_id,
            divisi_label: it.divisi || rkb.divisi || divRow?.nama || divRow?.kode
          },
          { rkbByNomor, DX, RX }
        );

        const rawStatus = (rkb && (rkb.status || rkb.approval_status || rkb.state)) ? rkb.status : deriveStatus(rkb);
        const status    = normalizeStatus(rawStatus);

        return {
          nomor,
          periode: fPeriode(it.periode || rkb.periode),
          estate_id,
          estate_full: rkb.estate_full || estateRow.nama_panjang || estateRow.nama || '',
          rayon_id: String(ray.rayon_id || ''),
          rayon_nama: ray.rayon_nama || '',
          divisi_id,
          divisi_nama: divRow.nama || divRow.kode || it.divisi || '',
          pekerjaan,
          nama: bahanNama,
          jumlah,
          satuan,
          no_material,
          status
        };
      });

      // [SCOPE] Potong ke estate user (hanya KTU)
      items = applyUserEstateScope(items);

      render();
    } catch (e) {
      root.innerHTML = `<div class="alert alert-danger">Gagal memuat: ${e.message || e}</div>`;
    } finally {
      try {
        if (openedHere) { U.progress(100, 'Selesai'); setTimeout(() => U.progressClose(), 350); }
      } catch (_) { /* noop */ }
    }
  }


  // ====== 7) FILTERING & AGGREGATION ======
  function getFiltered() {
    return items.filter(r => {
      if (filters.periode && fPeriode(r.periode) !== filters.periode) return false;
      if (filters.divisi_id && String(r.divisi_id) !== String(filters.divisi_id)) return false;
      if (filters.rayon_id && String(r.rayon_id) !== String(filters.rayon_id)) return false;
      if (filters.estate_id && String(r.estate_id) !== String(filters.estate_id)) return false;
      if (filters.status && filters.status !== 'ALL' && (String(r.status || '').toUpperCase() !== filters.status)) return false;
      return true;
    });
  }

  function aggregateFlat(data) {
    const estateTot = {};
    data.forEach(r => {
      const keyE = `${r.nama}|${r.satuan}`;
      estateTot[keyE] = (estateTot[keyE] || 0) + Number(r.jumlah || 0);
    });
    const estateTotal = Object.entries(estateTot).map(([k, v]) => {
      const [nama, satuan] = k.split('|'); return { nama, total: v, satuan };
    }).sort((a, b) => a.nama.localeCompare(b.nama));
    return { estateTotal };
  }

  function aggregateGroupedByDivisi(data) {
    const map = new Map();
    const nameOf = (id) => {
      const d = masters.ydivisi.find(x => String(x.id) === String(id));
      return d ? (d.nama || d.kode || id) : id;
    };
    data.forEach(r => {
      const kDiv = String(r.divisi_id || '');
      if (!map.has(kDiv)) map.set(kDiv, { divisi: nameOf(kDiv), rows: new Map(), subtotal: 0 });
      // sertakan no_material di key agar terbawa ke output
      const keyBhn = `${r.no_material||''}|${r.nama||''}|${r.satuan||''}`;
      const cur = map.get(kDiv).rows.get(keyBhn) || 0;
      const add = Number(r.jumlah || 0);
      map.get(kDiv).rows.set(keyBhn, cur + add);
      map.get(kDiv).subtotal += add;
    });
    const out = Array.from(map.values())
      .map(g => ({
        divisi: g.divisi,
        subtotal: g.subtotal,
        rows: Array.from(g.rows.entries()).map(([k, v]) => {
          const [no_material, nama, satuan] = k.split('|');
          return { no_material, nama, satuan, total: v };
        }).sort((a, b) =>
          (a.no_material||'').localeCompare(b.no_material||'') ||
          (a.nama||'').localeCompare(b.nama||'')
        )
      }))
      .sort((a, b) => a.divisi.localeCompare(b.divisi));
    return out;
  }


  // ====== 8) EXPORT & PRINT ======
  function exportXlsx() {
    if (typeof XLSX === 'undefined') { U.toast('XLSX belum tersedia.', 'danger'); return; }
    const data = getFiltered();
    if (!data.length) { U.toast('Tidak ada data untuk diexport.', 'warning'); return; }

    const grouped = aggregateGroupedByDivisi(data);

    // === Detail (tetap) ===
    const detail = data.map(r => ({
      Nomor: r.nomor, Periode: r.periode, Status: r.status,
      Estate: r.estate_full, Rayon: r.rayon_nama,
      Divisi: r.divisi_nama || '', Pekerjaan: r.pekerjaan,
      'No Material': r.no_material || '',
      Bahan: r.nama, Jumlah: r.jumlah, Satuan: r.satuan
    }));

    // === Ringkas per Divisi (sudah ada No Material) ===
    const divAOA = [];
    divAOA.push(['Divisi', 'No Material', 'Nama Bahan', 'Total', 'Satuan']);
    grouped.forEach(g => {
      divAOA.push([`=== ${g.divisi} ===`, '', '', '', '']);
      g.rows.forEach(r => {
        divAOA.push(['', r.no_material || '', r.nama, r.total, r.satuan || '']);
      });
      divAOA.push(['Subtotal', '', '', g.subtotal, '']);
      divAOA.push(['', '', '', '', '']);
    });

    // === Total Estate (tambahkan No Material) ===
    // Agregasi dengan key: no_material|nama|satuan
    const estAgg = new Map();
    data.forEach(r => {
      const key = `${r.no_material || ''}|${r.nama || ''}|${r.satuan || ''}`;
      estAgg.set(key, (estAgg.get(key) || 0) + Number(r.jumlah || 0));
    });

    const estRows = Array.from(estAgg.entries())
      .map(([k, total]) => {
        const [no_material, nama, satuan] = k.split('|');
        return { no_material, nama, satuan, total };
      })
      .sort((a, b) =>
        (a.no_material || '').localeCompare(b.no_material || '') ||
        (a.nama || '').localeCompare(b.nama || '')
      );

    const estAOA = [['No Material', 'Nama Bahan', 'Total', 'Satuan']];
    estRows.forEach(r => {
      estAOA.push([r.no_material || '', r.nama || '', r.total, r.satuan || '']);
    });

    // === Build workbook ===
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detail');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(divAOA), 'Ringkas per Divisi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(estAOA), 'Total Estate');

    const labelPeriode = filters.periode || 'ALL';
    XLSX.writeFile(wb, `KTU_Rekap_${labelPeriode}.xlsx`);
  }


  function printPdfEstateThenDivisi() {
    const data = getFiltered();
    if (!data.length) { U.toast('Tidak ada data untuk dicetak.', 'warning'); return; }

    const fmtPrinted = (d = new Date()) => {
      const tz = 'Asia/Jakarta';
      const dd = new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: '2-digit' }).format(d);
      const mmm = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: 'short' }).format(d);
      const yyyy = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(d);
      const hh = new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', hour12: false }).format(d);
      const mi = new Intl.DateTimeFormat('id-ID', { timeZone: tz, minute: '2-digit' }).format(d);
      return `${dd} ${mmm} ${yyyy}, ${hh}.${mi}`;
    };

    // Halaman 1: Rekap Estate
    const estateNames = Array.from(new Set(data.map(r => r.estate_full || '').filter(Boolean)));
    let estateLabel = 'SEMUA ESTATE';
    if (filters.estate_id) {
      const estRow = masters.yestate.find(e => String(e.id) === String(filters.estate_id));
      estateLabel = (estRow?.nama_panjang || estRow?.nama || estateNames[0] || 'ESTATE');
    } else if (estateNames.length === 1) {
      estateLabel = estateNames[0];
    }

    const estAggMap = new Map();
    data.forEach(r => {
      const key = `${r.no_material||''}|${r.nama||''}|${r.satuan||''}`;
      estAggMap.set(key, (estAggMap.get(key) || 0) + Number(r.jumlah || 0));
    });
    const estateRows = Array.from(estAggMap.entries())
      .map(([k, total]) => {
        const [no_material, nama, satuan] = k.split('|');
        return { no_material, nama, satuan, total };
      })
      .sort((a,b)=>
        (a.no_material||'').localeCompare(b.no_material||'') ||
        (a.nama||'').localeCompare(b.nama||'')
      );

    const estateTbody = estateRows.length
      ? estateRows.map((r,i)=>`
        <tr>
          <td class="num">${i+1}</td>
          <td>${r.no_material || '-'}</td>
          <td>${r.nama || '-'}</td>
          <td class="num">${U.fmt.id0(r.total)}</td>
          <td>${r.satuan || ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="muted">Tidak ada data.</td></tr>`;

    const sectionEstate = `
      <section class="page">
        <div class="hdr">
          <div class="ttl">REKAP KEBUTUHAN BAHAN ${estateLabel}</div>
          <div class="sub">Periode : ${filters.periode || '-'}</div>
          <div class="printed">Dicetak ${fmtPrinted(new Date())}</div>
        </div>
        <table class="grid">
          <colgroup>
            <col style="width:6%;"><col style="width:18%;"><col style="width:50%;"><col style="width:14%;"><col style="width:12%;">
          </colgroup>
          <thead><tr><th>No</th><th>No Material</th><th>Nama Bahan</th><th>Jumlah</th><th>Satuan</th></tr></thead>
          <tbody>${estateTbody}</tbody>
        </table>
      </section>`;

    // Halaman 2+: per Divisi
    const byDivisi = new Map();
    data.forEach(r => {
      const dname = r.divisi_nama || r.divisi || '-';
      if (!byDivisi.has(dname)) byDivisi.set(dname, new Map());
      const m = byDivisi.get(dname);
      const key = `${r.no_material||''}|${r.nama||''}|${r.satuan||''}`;
      m.set(key, (m.get(key) || 0) + Number(r.jumlah || 0));
    });

    const divSections = Array.from(byDivisi.entries())
      .sort((a,b)=> String(a[0]||'').localeCompare(String(b[0]||'')))
      .map(([divLabel, m]) => {
        const rows = Array.from(m.entries())
          .map(([k,total])=>{
            const [no_material, nama, satuan] = k.split('|');
            return { no_material, nama, satuan, total };
          })
          .sort((a,b)=>
            (a.no_material||'').localeCompare(b.no_material||'') ||
            (a.nama||'').localeCompare(b.nama||'')
          );

        const tbody = rows.length
          ? rows.map((r,i)=>`
            <tr>
              <td class="num">${i+1}</td>
              <td>${r.no_material || '-'}</td>
              <td>${r.nama || '-'}</td>
              <td class="num">${U.fmt.id0(r.total)}</td>
              <td>${r.satuan || ''}</td>
            </tr>`).join('')
          : `<tr><td colspan="5" class="muted">Tidak ada data.</td></tr>`;

        return `
          <section class="page">
            <div class="hdr">
              <div class="ttl">REKAP KEBUTUHAN BAHAN ${divLabel}</div>
              <div class="sub">Periode : ${filters.periode || '-'}</div>
              <div class="printed">Dicetak ${fmtPrinted(new Date())}</div>
            </div>
            <table class="grid">
              <colgroup>
                <col style="width:6%;"><col style="width:18%;"><col style="width:50%;"><col style="width:14%;"><col style="width:12%;">
              </colgroup>
              <thead><tr><th>No</th><th>No Material</th><th>Nama Bahan</th><th>Jumlah</th><th>Satuan</th></tr></thead>
              <tbody>${tbody}</tbody>
            </table>
          </section>`;
      }).join('\n');

    const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Rekap Kebutuhan Bahan (Estate & Divisi)</title>
<style>
  @page{ size:A4; margin:12mm; }
  *{ box-sizing:border-box; }
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#000; }
  .page{ page-break-after: always; }
  .hdr{ margin-bottom: 10px; }
  .ttl{ font-size:16px; font-weight:700; letter-spacing:.2px; }
  .sub{ font-size:12px; margin-top:2px; }
  .printed{ font-size:12px; color:#444; margin-top:2px; }
  .grid{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .grid th, .grid td{ border:1px solid #000; padding:6px 6px; font-size:11px; vertical-align:top; }
  .grid thead th{ background:#f2f2f2; text-align:center; }
  .grid td.num{ text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .muted{ color:#666; }
</style>
</head><body>
${sectionEstate}
${divSections}
<script>window.print();</script>
</body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  }

  // ====== 9) RENDER (UI) ======
  function ensureStyles() {
    if (document.getElementById('ktu-css')) return;
    const css = `
      .group-nomor{ background:#f6f8fa; font-weight:600; }
      .group-sub{ background:#fafafa; color:#333; }
      .cell-muted{ color:#6c757d; }
      .table-compact td, .table-compact th { white-space: nowrap; }
      .badge-status{ font-size:.75rem; }
      .sumgrp-head{ background:#eef6ff; font-weight:700; }
      .sumgrp-subtotal{ background:#fcfcfc; font-weight:700; }
    `;
    const s = document.createElement('style'); s.id = 'ktu-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  function render() {
    ensureStyles();

    // opsi filter
    const perSet = new Set(items.map(r => r.periode));
    if (filters.periode) perSet.add(filters.periode);
    const periodes = Array.from(perSet).filter(Boolean).sort().reverse();

    const estates  = masters.yestate;
    const rayons   = masters.yrayon;
    const divisies = masters.ydivisi;

    const statusSet = new Set(items.map(r => String(r.status || '').toUpperCase()).filter(Boolean));
    ['FULL_APPROVED','PARTIAL_APPROVED','ASKEP_APPROVED','SUBMITTED','DRAFT','REJECTED','UNKNOWN'].forEach(s => statusSet.add(s));
    const statuses = ['ALL', ...Array.from(statusSet).sort()];

    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">Rekap Bahan (Semua Status)</h4>
          <div class="d-flex flex-wrap gap-2">
            <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
            <button id="btn-xlsx"  class="btn btn-sm btn-success">Export Excel</button>
            <button id="btn-pdf"   class="btn btn-sm btn-dark" title="Cetak per Divisi/Estate">Cetak PDF</button>
          </div>
        </div>

        <div class="row g-2 mb-2">
          <div class="col-md-2 col-sm-6">
            <label class="form-label">Periode (YYYY-MM)</label>
            <select id="f-periode" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${periodes.map(p => `<option value="${p}" ${filters.periode === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2 col-sm-6">
            <label class="form-label">Status</label>
            <select id="f-status" class="form-select form-select-sm">
              ${statuses.map(s => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s === 'ALL' ? 'Semua Status' : s}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-2 col-sm-6">
            <label class="form-label">Estate</label>
            <select id="f-estate" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${estates.map(e => `<option value="${e.id}" ${filters.estate_id == e.id ? 'selected' : ''}>${e.nama_panjang || e.nama || e.id}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3 col-sm-6">
            <label class="form-label">Rayon</label>
            <select id="f-rayon" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${rayons.map(e => `<option value="${e.id}" ${filters.rayon_id == e.id ? 'selected' : ''}>${e.nama || e.id}</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3 col-sm-6">
            <label class="form-label">Divisi</label>
            <select id="f-divisi" class="form-select form-select-sm">
              <option value="">Semua</option>
              ${divisies.map(e => `<option value="${e.id}" ${filters.divisi_id == e.id ? 'selected' : ''}>${e.nama || e.kode || e.id}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- DETAIL -->
        <div class="table-responsive mb-3">
          <table class="table table-sm table-hover align-middle table-compact">
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Periode</th>
                <th>Status</th>
                <th>Estate</th>
                <th>Rayon</th>
                <th>Divisi</th>
                <th>Pekerjaan</th>
                <th>No Material</th>
                <th>Bahan</th>
                <th class="text-end">Jumlah</th>
                <th>Satuan</th>
              </tr>
            </thead>
            <tbody id="ktu-rows"></tbody>
          </table>
        </div>

        <h5 class="mb-2">Ringkas: Kebutuhan per Divisi</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-compact">
            <thead><tr><th>Nama Bahan</th><th class="text-end">Total</th><th>Satuan</th></tr></thead>
            <tbody id="ktu-sum-divisi"></tbody>
          </table>
        </div>

        <h5 class="mt-3 mb-2">Total Estate</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle table-compact">
            <thead><tr><th>Nama Bahan</th><th class="text-end">Total</th><th>Satuan</th></tr></thead>
            <tbody id="ktu-sum-estate"></tbody>
          </table>
        </div>
      </div></div>`;

    // events
    U.qs('#btn-reload').onclick = () => { 
        U.S.set(ACT_KEY_KTU, []);   // [PATCH] kosongkan cache per-user
        load(false);                // paksa ambil dari server
      };
    U.qs('#btn-xlsx').onclick  = exportXlsx;
    U.qs('#btn-pdf').onclick   = () => printPdfEstateThenDivisi();

    U.qs('#f-periode').onchange = (e) => { filters.periode   = e.target.value; drawTables(); };
    U.qs('#f-status').onchange  = (e) => { filters.status    = e.target.value; drawTables(); };
    U.qs('#f-divisi').onchange  = (e) => { filters.divisi_id = e.target.value; drawTables(); };
    U.qs('#f-rayon').onchange   = (e) => { filters.rayon_id  = e.target.value; drawTables(); };
    U.qs('#f-estate').onchange  = (e) => { filters.estate_id = e.target.value; drawTables(); };

    drawTables();
  }

  // ====== 10) DRAW TABLES ======
  function drawTables() {
    const data = getFiltered();

    // Grouping: Nomor → Estate → Divisi
    const byNomor = new Map();
    data.sort((a, b) =>
      a.nomor.localeCompare(b.nomor) ||
      (a.estate_full || '').localeCompare(b.estate_full || '') ||
      (a.divisi_nama || '').localeCompare(b.divisi_nama || '') ||
      (a.nama || '').localeCompare(b.nama || '')
    ).forEach(r => {
      if (!byNomor.has(r.nomor)) byNomor.set(r.nomor, []);
      byNomor.get(r.nomor).push(r);
    });

    const tbody = U.qs('#ktu-rows');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted">Tidak ada data.</td></tr>`;
    } else {
      let html = '';
      for (const [nomor, rowsNomor] of byNomor.entries()) {
        const first = rowsNomor[0] || {};
        const badge = (st) => {
          const S = String(st||'UNKNOWN').toUpperCase();
          const cls =
            S==='FULL_APPROVED'   ? 'success' :
            S==='ASKEP_APPROVED'  ? 'info'    :
            S==='PARTIAL_APPROVED'? 'warning' :
            S==='REJECTED'        ? 'danger'  :
            S==='SUBMITTED'       ? 'warning' :
            'secondary';
          return `<span class="badge rounded-pill text-bg-${cls} badge-status">${S}</span>`;
        };
        html += `
          <tr class="group-nomor">
            <td>${nomor}</td>
            <td>${first.periode || '-'}</td>
            <td>${badge(first.status)}</td>
            <td colspan="8" class="cell-muted">Kelompok Nomor RKB</td>
          </tr>
        `;

        const byEstate = new Map();
        rowsNomor.forEach(r => {
          const kE = r.estate_full || '-';
          if (!byEstate.has(kE)) byEstate.set(kE, []);
          byEstate.get(kE).push(r);
        });

        for (const [estateName, rowsEstate] of byEstate.entries()) {
          html += `
            <tr class="group-sub">
              <td colspan="3"></td>
              <td>${estateName}</td>
              <td>${rowsEstate[0]?.rayon_nama || '-'}</td>
              <td colspan="6" class="cell-muted">Kelompok Estate</td>
            </tr>
          `;

          const byDiv = new Map();
          rowsEstate.forEach(r => {
            const kD = r.divisi_nama || '-';
            if (!byDiv.has(kD)) byDiv.set(kD, []);
            byDiv.get(kD).push(r);
          });

          for (const [divName, rowsDiv] of byDiv.entries()) {
            html += `
              <tr class="group-sub">
                <td colspan="5"></td>
                <td>${divName}</td>
                <td colspan="5" class="cell-muted">Kelompok Divisi</td>
              </tr>
            `;
            rowsDiv.forEach(r => {
              html += `
                <tr>
                  <td>${r.nomor}</td>
                  <td>${r.periode}</td>
                  <td>${r.status || ''}</td>
                  <td>${r.estate_full || '-'}</td>
                  <td>${r.rayon_nama || '-'}</td>
                  <td>${r.divisi_nama || r.divisi || '-'}</td>
                  <td>${r.pekerjaan || ''}</td>
                  <td>${r.no_material ? `<code>${r.no_material}</code>` : '<span class="text-danger">-</span>'}</td>
                  <td>${r.nama}</td>
                  <td class="text-end">${U.fmt.id0(r.jumlah)}</td>
                  <td>${r.satuan || ''}</td>
                </tr>
              `;
            });
          }
        }
      }
      tbody.innerHTML = html;
    }

    // Ringkasan Per Divisi
    const grouped = aggregateGroupedByDivisi(data);
    const sumDivTbody = U.qs('#ktu-sum-divisi');
    if (!grouped.length) {
      sumDivTbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Tidak ada data.</td></tr>`;
    } else {
      let ghtml = '';
      grouped.forEach(g => {
        ghtml += `<tr class="sumgrp-head"><td colspan="3">DIVISI: ${g.divisi}</td></tr>`;
        g.rows.forEach(r => {
          ghtml += `<tr><td>${r.nama}</td><td class="text-end">${U.fmt.id0(r.total)}</td><td>${r.satuan || ''}</td></tr>`;
        });
        ghtml += `<tr class="sumgrp-subtotal"><td>Subtotal</td><td class="text-end">${U.fmt.id0(g.subtotal)}</td><td></td></tr>`;
        ghtml += `<tr><td colspan="3"></td></tr>`;
      });
      sumDivTbody.innerHTML = ghtml;
    }

    // Total Estate
    const { estateTotal } = aggregateFlat(data);
    U.qs('#ktu-sum-estate').innerHTML = estateTotal.length
      ? estateTotal.map(x => `<tr><td>${x.nama}</td><td class="text-end">${x.total.toLocaleString('id-ID')}</td><td>${x.satuan || ''}</td></tr>`).join('')
      : `<tr><td colspan="3" class="text-center text-muted">Tidak ada data.</td></tr>`;
  }

  // ====== 11) KICKOFF ======
  await load(true);
};

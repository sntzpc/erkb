// js/pages/rkb_form.js
window.Pages = window.Pages || {};
Pages.rkbForm = function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash='#/login'; return; }

  // ========== Helpers umum (aman tipe) ==========
  function _str(v){ try { return String(v == null ? '' : v).trim(); } catch(_) { return ''; } }
  function _num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function _isPos(n){ return _num(n) > 0; }
  function _required(v){ return _str(v).length > 0; }

  // Periode ke YYYY-MM (Asia/Jakarta)
  function fPeriode(p){
    if(!p) return '';
    const s = String(p).trim();
    if(/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if(isNaN(d)) return s;
    const tz='Asia/Jakarta';
    const y = new Intl.DateTimeFormat('id-ID',{timeZone:tz, year:'numeric'}).format(d);
    const m = new Intl.DateTimeFormat('id-ID',{timeZone:tz, month:'2-digit'}).format(d);
    return `${y}-${m}`;
  }

  // ========== Masters dari localStorage ==========
  const M = {
    activity: U.S.get('kpl.master.yactivity', []) || [],
    blok:     U.S.get('kpl.master.yblok', [])     || [],
    komplek:  U.S.get('kpl.master.ykomplek', [])  || [],
    bahan:    U.S.get('kpl.master.ybahan', [])    || [],
    org:      U.S.get('kpl.master.yorg_map', [])  || [],
    estate:   U.S.get('kpl.master.yestate', [])   || []
  };

  // ========== Indeks master bahan (1x saja) ==========
  const bahanIndex = Object.create(null); // key: nama_bahan lowercase -> { no_material, satuan_default }
  (M.bahan).forEach(b=>{
    const key = _str(b.nama_bahan ?? b.nama).toLowerCase();
    if(!key) return;
    if(!bahanIndex[key]){
      bahanIndex[key] = {
        no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no),
        satuan_default: _str(b.satuan_default ?? b.satuan)
      };
    }
  });
  function getBahanMetaByName(name){
    const key = _str(name).toLowerCase();
    return key ? (bahanIndex[key] || null) : null;
  }

  // Cache satuan lokal utk bahan
  const BAHAN_UNIT_KEY = 'kpl.master.ybahan_unit';
  const bahanUnitCache = U.S.get(BAHAN_UNIT_KEY, {}) || {}; // { 'gramoxone':'L', ... }

  // ========== Scope organisasi dari user ==========
  const myOrg = (M.org||[]).find(x=> _str(x.username).toLowerCase() === _str(profile.username).toLowerCase()) || {};
  const DIVISI_ID = myOrg.divisi_id || profile.divisi_id || myOrg.divisi || profile.divisi || 'UNKNOWN';
  const ESTATE_ID = myOrg.estate_id || profile.estate_id || '';
  const RAYON_ID  = myOrg.rayon_id  || profile.rayon_id  || '';
  const estateObj = (M.estate||[]).find(e=> _str(e.id) === _str(myOrg.estate_id)) || {};
  const ESTATE_LABEL = estateObj.nama_panjang || profile.estate_full || 'UNKNOWN ESTATE';
  const DIVISI_LABEL = myOrg.divisi_id || profile.divisi || 'UNKNOWN';

  // ========== Draft buffer ==========
  const DKEY = 'rkb.form.buffer';
  let F = U.S.get(DKEY, {
    divisi: DIVISI_LABEL,              // label tampilan (legacy)
    divisi_id: DIVISI_ID,
    estate_id: ESTATE_ID,
    rayon_id:  RAYON_ID,
    estate_full: ESTATE_LABEL,
    periode: '',    // yyyy-mm
    nomor: '',
    items: [],
  });
  F.periode = fPeriode(F.periode);
  if (F.nomor) F.status_label = computeRevisionTag(F.nomor);

  const saveBuffer   = U.debounce(()=> U.S.set(DKEY, F), 300);
  const saveBufferThin = ()=> U.S.set(DKEY, F);

  // ========== HK & Validasi ==========
  function computeHK(item){
    const base = (_num(item.volume)) * (_num(item.hk_unit));
    const BHL = base * (_num(item.pct_bhl)/100);
    const SKU = base * (_num(item.pct_sku)/100);
    const BHB = base * (_num(item.pct_bhb)/100);
    return {BHL, SKU, BHB, total:(BHL+SKU+BHB)};
  }

  // pastikan bahan ada di master & punya no_material
  function findBahanInMaster(name){
    const meta = getBahanMetaByName(name);
    if(meta && _str(meta.no_material)) return { nama: _str(name), no_material: meta.no_material, satuan_default: meta.satuan_default };
    return null;
  }

  function validateHeaderStrict(){
    if(!_required(F.periode)) return 'Periode wajib diisi.';
    if(!_required(F.nomor))   return 'No RKB belum dibuat.';
    return '';
  }
  function validateItemStrict(it){
    if(!_required(it.pekerjaan)) return 'Jenis Pekerjaan wajib diisi.';
    if(!Array.isArray(it.lokasi) || it.lokasi.length===0) return 'Lokasi minimal 1 baris.';
    if(!_isPos(it.volume))  return 'Volume harus > 0.';
    if(!_required(it.satuan)) return 'Satuan volume wajib diisi.';
    if(!_isPos(it.hk_unit)) return 'HK/Unit harus > 0.';
    if(!_required(it.pengawas)) return 'Nama Pengawas wajib diisi.';
    const pBHL=_num(it.pct_bhl), pSKU=_num(it.pct_sku), pBHB=_num(it.pct_bhb);
    if((pBHL+pSKU+pBHB)!==100) return 'Persentase HK harus berjumlah tepat 100% (BHL+SKU+BHB).';
    return '';
  }
  function validateBahanList(list){
    const arr = Array.isArray(list)?list:[];
    for(let i=0;i<arr.length;i++){
      const b=arr[i];
      const nm=_str(b.nama), jm=_num(b.jumlah), st=_str(b.satuan);
      const meta = findBahanInMaster(nm);
      if(!meta) return `Bahan #${i+1} ("${nm}") tidak valid atau tidak ada di master.`;
      if(!_str(meta.no_material)) return `Bahan #${i+1} ("${nm}") tidak memiliki No Material di master.`;
      if(!(jm>0)) return `Bahan #${i+1} ("${nm}") jumlah harus > 0.`;
      if(!st) return `Bahan #${i+1} ("${nm}") satuan wajib diisi.`;
    }
    return '';
  }


  // === API adapter (pakai yang ada di project Anda, fallback ke fetch) ===
  function resolveBackendUrl(){
  return (window.GAS_URL || window.BACKEND_URL || window.API_URL || (window.U?.S?.get?.('backend.url')) || '').toString().trim();
}

// === POST helper ke GAS (format sama seperti PDO: text/plain + JSON body) ===
async function postRkbReplace(payload){
  const url = resolveBackendUrl();
  if(!url) throw new Error('BACKEND_URL/GAS_URL belum diset.');

  // body mengikuti pola backend GAS Anda (aksi + token + payload)
  const body = {
    action: 'pushRKB',
    token : (SESSION.token?.() || payload.token || ''),
    ...payload
  };

  const res  = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch(_) {}
  if(!json.ok) throw new Error(json.error || `Gagal kirim (HTTP ${res.status})`);
  return json;
}


// === Helpers sinkron ke backend ===
// Lokasi → string "A,B,C" (backend menyimpan di kolom 'lokasi' sebagai gabungan)
function lokasiToString(list){
  const arr = Array.isArray(list) ? list : [];
  return arr.map(x => (x?.name || x)?.toString().trim()).filter(Boolean).join(',');
}

// Ambil no_material & satuan default bahan dari master (sudah ada: getBahanMetaByName), ini guard ekstra:
function ensureBahanHasNoMaterial(b){
  const meta = getBahanMetaByName(b?.nama);
  return {
    nama   : _str(b?.nama),
    jumlah : _num(b?.jumlah),
    satuan : _str(b?.satuan) || _str(meta?.satuan_default),
    no_material: _str(b?.no_material || meta?.no_material)
  };
}

// Cek apakah nomor RKB sudah ada di actuals (server) → untuk konfirmasi Replace
function existsOnServerByNomor(nomor){
  try{
    const rows = (window.STORE && STORE.getActual) ? (STORE.getActual('rkb')||[]) : [];
    return rows.some(r => _str(r.nomor) === _str(nomor));
  }catch(_){ return false; }
}


  // ========== Draft dari server → isi items dari actuals jika kosong ==========
  hydrateFromActualsIfNeeded();
  function hydrateFromActualsIfNeeded(){
    if(!F || !F.__serverLinked) return;
    if(Array.isArray(F.items) && F.items.length) return;

    const getA = (k)=> (window.STORE && STORE.getActual) ? (STORE.getActual(k)||[]) : [];
    const itemsAll = getA('rkb_items');
    const bahanAll = getA('rkb_bahan');

    const rowsI = itemsAll.filter(i => _str(i.nomor)===_str(F.nomor));
    if(!rowsI.length) return;

    const bahanByIdx = {};
    bahanAll.filter(b => _str(b.nomor)===_str(F.nomor)).forEach(b=>{
      const k = _str(b.item_idx);
      (bahanByIdx[k] = bahanByIdx[k] || []).push({
        nama: _str(b.nama),
        jumlah: _num(b.jumlah),
        satuan: _str(b.satuan),
        no_material: _str(b.no_material) // ← ambil dari actuals
      });
    });


    F.items = rowsI.map(r=>{
      const lokasiArr = _str(r.lokasi).split(',').map(s=>s.trim()).filter(Boolean)
        .map(nm=>({type:'', name:nm, luas:undefined}));
      const it = {
        pekerjaan: _str(r.pekerjaan),
        activity_type: _str(r.activity_type),
        lokasi: lokasiArr,
        volume: _num(r.volume),
        satuan: _str(r.satuan),
        hk_unit: _num(r.hk_unit),
        pct_bhl: _num(r.pct_bhl),
        pct_sku: _num(r.pct_sku),
        pct_bhb: _num(r.pct_bhb),
        bahan: bahanByIdx[_str(r.idx)] || [],
        pengawas: _str(r.pengawas)
      };
      it.hk = computeHK(it);
      return it;
    });

    F.periode = fPeriode(F.periode);
    F.status  = 'draft';
    F.status_label = computeRevisionTag(F.nomor);

    if(!F.divisi_id) F.divisi_id = DIVISI_ID;
    if(!F.estate_id) F.estate_id = ESTATE_ID;
    if(!F.rayon_id)  F.rayon_id  = RAYON_ID;
    if(!F.estate_full) F.estate_full = ESTATE_LABEL;

    saveBufferThin();
  }

  // Revisi tag berdasar komentar Askep/Manager
  function computeRevisionTag(nomor){
    try{
      const comments = (window.STORE && STORE.getActual) ? (STORE.getActual('rkb_comments')||[]) : [];
      const revs = comments.filter(c =>
        _str(c.nomor)===_str(nomor) &&
        (['askep','manager'].includes(_str(c.role).toLowerCase()))
      ).length;
      return revs>0 ? `draft r${revs}` : 'draft';
    }catch(_){ return 'draft'; }
  }

  // ========== Model item aktif ==========
  function defaultItem(){
    return {
      pekerjaan:'', activity_type:'',
      lokasi:[], volume:0, satuan:'Ha',
      hk_unit:0, pct_bhl:0, pct_sku:100, pct_bhb:0,
      bahan:[], pengawas:''
    };
  }
  let CUR = defaultItem();

  // ========== UI ==========
  function hkBadge(hk){
    return `
      <div class="d-flex flex-wrap gap-2">
        <span class="badge text-bg-secondary">BHL: <strong>${(hk.BHL||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">SKU: <strong>${(hk.SKU||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">BHB: <strong>${(hk.BHB||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-dark">TOTAL HK: <strong>${(hk.total||0).toFixed(2)}</strong></span>
      </div>`;
  }

  function build(){
    const totalItems = F.items?.length || 0;
    const hkNow = computeHK(CUR);
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="mb-0">Form RKB
          ${F.__serverLinked ? '<span class="badge text-bg-light border ms-2" title="Data berasal dari server">server</span>' : ''}
          ${String(F.status||'draft').toLowerCase()==='draft'
            ? `<span class="badge text-bg-secondary ms-1">${F.status_label || computeRevisionTag(F.nomor||'')}</span>`
            : ''}
        </h4>
        <div class="small text-muted">${ESTATE_LABEL} · ${DIVISI_LABEL}</div>
      </div>

      <div class="row g-3">
        <div class="col-sm-4">
          <label class="form-label">Periode</label>
          <div class="input-group">
            <input id="periode" class="form-control" placeholder="Pilih periode..." value="${fPeriode(F.periode)}" readonly />
            <button class="btn btn-outline-secondary" id="btn-periode">Pilih</button>
          </div>
          <div class="form-text">Gunakan pemilih bulan agar tidak salah ketik.</div>
        </div>

        <div class="col-sm-4">
          <label class="form-label">No RKB</label>
          <div class="input-group">
            <input id="nomor" class="form-control" value="${F.nomor}" readonly />
            <button class="btn btn-outline-secondary" id="btn-nomor">Buat</button>
          </div>
          <div class="form-text">Format: RKB{DIVISI}{yymmddhhmmss}</div>
        </div>

        <div class="col-sm-4">
          <label class="form-label">New Form</label>
          <div class="input-group">
            <button id="btn-new" class="btn btn-danger">Buat RKB Baru</button>
          </div>
          <div class="form-text">Klik untuk membuat From RKB yang baru</div>
        </div>
      </div>

      <hr/>
      <h5 class="mb-2">Pekerjaan (Item) — <span class="text-muted">sedang diisi</span></h5>

      <div class="row g-3">
        <div class="col-12">
          <label class="form-label">Jenis Pekerjaan</label>
          <input id="pekerjaan" class="form-control" list="dl-activity" placeholder="Ketik untuk cari..." value="${CUR.pekerjaan}"/>
          <datalist id="dl-activity">
            ${(M.activity||[]).map(a=>`<option value="${a.nama_pekerjaan||a.nama||''}">`).join('')}
          </datalist>
          <div class="form-text">Activity Type otomatis terisi.</div>
        </div>

        <div class="col-12">
          <label class="form-label">Lokasi</label>
          <div class="input-group">
            <input id="lokasi" class="form-control" value="${(CUR.lokasi||[]).map(l=>l.name).join(', ')}" readonly />
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
              ${(M.bahan||[]).map(b=>`<option value="${b.nama_bahan||b.nama||''}">`).join('')}
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

      <div class="d-flex flex-wrap gap-2">
        ${(()=>{
          const isServerDraft = !!F.__serverLinked && /^draft/i.test(String(F.status_label||F.status||'draft'));
          const saveTitle = isServerDraft
            ? 'Nonaktif saat revisi dari server (hindari duplikasi & nomor baru)'
            : 'Simpan sebagai draft lokal';
          // tombol Simpan Draft → disabled saat server draft
          return `
            <button id="btn-save-draft" class="btn btn-success" ${isServerDraft?'disabled':''} title="${saveTitle}">
              Simpan Draft
            </button>`;
        })()}
        <button id="btn-submit" class="btn btn-danger" title="Kirim Full Replace ke server">
          ${ existsOnServerByNomor(F.nomor) || F.__serverLinked ? 'Replace ke Server' : 'Submit ke Server' }
        </button>
      </div>
      <div class="form-text mt-1">
        Replace akan <strong>mengganti seluruh detail</strong> pada nomor tersebut (Full Replace). 
        Gunakan ini saat perbaikan dari Askep/Manager.
      </div>
    </div></div>`;

    bind();
    renderBahan();
    renderItems();
    initAutoBahan();
  }

  function bind(){
    U.qs('#btn-periode').onclick = openPeriodeModal;
    U.qs('#btn-nomor').onclick = ()=>{
      F.nomor = `RKB${DIVISI_ID}${U.fmt.yymmddhhmmss(new Date())}`;
      saveBuffer(); build();
    };

    U.qs('#btn-new').onclick = ()=>{
      if(confirm('Bersihkan form dan mulai RKB baru? Seluruh isian saat ini akan direset.')){
        resetFormToNew();
      }
    };

    U.qs('#pekerjaan').oninput = (e)=>{
      CUR.pekerjaan = e.target.value;
      const found = (M.activity||[]).find(a=> _str(a.nama_pekerjaan||a.nama).toLowerCase() === _str(CUR.pekerjaan).toLowerCase());
      CUR.activity_type = found?.activity_type || '';
      saveBufferThin(); updateHKLive();
    };

    U.qs('#btn-lokasi').onclick = openLokasiModal;
    U.qs('#volume').oninput = (e)=>{ CUR.volume = _num(e.target.value); saveBufferThin(); updateHKLive(); };
    U.qs('#satuan').oninput = (e)=>{ CUR.satuan = _str(e.target.value); saveBufferThin(); };
    U.qs('#hkunit').oninput = (e)=>{ CUR.hk_unit = _num(e.target.value); saveBufferThin(); updateHKLive(); };
    U.qs('#btn-hk').onclick = openHKModal;

    U.qs('#pengawas').oninput = (e)=>{ CUR.pengawas = _str(e.target.value); saveBufferThin(); };
    U.qs('#btn-bahan-add').onclick = addBahan;

    U.qs('#btn-add-item').onclick = addItemFromForm;
    U.qs('#btn-clear-item').onclick = ()=>{ CUR = defaultItem(); build(); };

    U.qs('#btn-save-draft').onclick = saveDraft;

    const btnSubmit = U.qs('#btn-submit');
  if (btnSubmit){
    btnSubmit.onclick = async ()=>{
      // jaga nomor & periode valid
      const errH = validateHeaderStrict(); if(errH){ U.toast(errH,'warning'); return; }
      await submitRKB();
    };
  }

  }

  function updateHKLive(){
    const hkNow = computeHK(CUR);
    const el = U.qs('#hk-live');
    if(el) el.innerHTML = hkBadge(hkNow);
  }

  // ====== Periode Modal ======
  function openPeriodeModal(){
    const now = new Date();
    const cur = F.periode ? new Date(F.periode+'-01T00:00:00') : now;
    const ym = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

    const div = document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
    <div class="modal-dialog"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Pilih Periode</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="input-group">
          <button class="btn btn-outline-secondary" id="prev">◀</button>
          <input id="periode-input" type="month" class="form-control" value="${ym(cur)}"/>
          <button class="btn btn-outline-secondary" id="next">▶</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
        <button id="ok" class="btn btn-primary">OK</button>
      </div>
    </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();

    const inp = div.querySelector('#periode-input');
    div.querySelector('#prev').onclick = ()=>{
      const d = new Date(inp.value+'-01T00:00:00');
      d.setMonth(d.getMonth()-1); inp.value = ym(d);
    };
    div.querySelector('#next').onclick = ()=>{
      const d = new Date(inp.value+'-01T00:00:00');
      d.setMonth(d.getMonth()+1); inp.value = ym(d);
    };

    div.querySelector('#ok').onclick = ()=>{
      F.periode = fPeriode(inp.value || ym(now));
      saveBuffer(); build(); m.hide(); setTimeout(()=>div.remove(), 300);
    };
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ====== Lokasi modal ======
  function openLokasiModal(){
    const div = document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
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

    const state = { rows: [...(CUR.lokasi||[])] };
    const input = div.querySelector('#lok-input');
    const listEl = div.querySelector('#lok-list');
    const totalEl = div.querySelector('#lok-total');

    function suggest(q, type){
      const src = type==='blok'? (M.blok||[]) : (M.komplek||[]);
      const ql = _str(q).toLowerCase();
      return src.filter(x=> _str(x.kode).toLowerCase().includes(ql)).slice(0,10);
    }

    function addRow(r){ state.rows.push(r); renderRows(); }
    function renderRows(){
      const rows = state.rows.map((r,i)=>`
        <tr>
          <td>${i+1}</td><td>${r.type}</td><td>${r.name}</td><td>${r.luas||0}</td>
          <td><button data-i="${i}" class="btn btn-sm btn-outline-danger lok-del">Hapus</button></td>
        </tr>`).join('');
      listEl.innerHTML = `<table class="table table-sm"><thead>
        <tr><th>#</th><th>Type</th><th>Nama</th><th>Luas</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
      listEl.querySelectorAll('.lok-del').forEach(btn=> btn.onclick = (e)=>{
        const i = +e.currentTarget.dataset.i; state.rows.splice(i,1); renderRows();
      });
      const sum = state.rows.reduce((a,b)=> a + (parseFloat(b.luas)||0), 0);
      totalEl.textContent = sum.toFixed(2);
    }

    input.addEventListener('input', ()=>{
      const type = div.querySelector('#lok-type').value;
      const s = suggest(input.value, type);
      input.setAttribute('list','dl-lok');
      let dl = div.querySelector('#dl-lok');
      if(!dl){ dl = document.createElement('datalist'); dl.id = 'dl-lok'; div.appendChild(dl); }
      dl.innerHTML = s.map(x=> `<option value="${x.kode}">`).join('');
    });

    div.querySelector('#lok-add').onclick = ()=>{
      const type = div.querySelector('#lok-type').value;
      const name = _str(input.value); if(!name) return;
      const src = type==='blok'? (M.blok||[]) : (M.komplek||[]);
      const found = src.find(x=> _str(x.kode).toLowerCase() === name.toLowerCase());
      addRow({type, name, luas: parseFloat(found?.luas_ha||0)});
      input.value='';
    };

    div.querySelector('#ok').onclick = ()=>{
      CUR.lokasi = state.rows;
      const vol = state.rows.reduce((a,b)=> a + (parseFloat(b.luas)||0), 0);
      CUR.volume = parseFloat(vol.toFixed(2));
      saveBufferThin(); build(); m.hide(); setTimeout(()=>div.remove(), 300);
    };

    renderRows();
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ====== HK Modal ======
  function openHKModal(){
    const div = document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
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
    div.querySelector('#ok').onclick = ()=>{
      CUR.pct_bhl = _num(div.querySelector('#p-bhl').value);
      CUR.pct_sku = _num(div.querySelector('#p-sku').value);
      CUR.pct_bhb = _num(div.querySelector('#p-bhb').value);
      saveBufferThin(); build(); m.hide(); setTimeout(()=>div.remove(), 300);
    };
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ====== Bahan: autosuggest + auto-satuan dengan cache lokal ======
  function initAutoBahan(){
    const namaEl = U.qs('#bahan-nama');
    const satEl  = U.qs('#bahan-sat');
    if(!namaEl || !satEl) return;

    namaEl.addEventListener('input', ()=>{
      const key = _str(namaEl.value).toLowerCase();
      if(!key){ namaEl.dataset.noMaterial=''; return; }

      const meta = getBahanMetaByName(key);
      if(meta){
        if(meta.satuan_default && !_str(satEl.value)){ satEl.value = meta.satuan_default; }
        namaEl.dataset.noMaterial = meta.no_material || '';
        return;
      }
      if(bahanUnitCache[key] && !_str(satEl.value)){
        satEl.value = bahanUnitCache[key];
      }
      namaEl.dataset.noMaterial = '';
    });
  }

  function addBahan(){
    const namaEl = U.qs('#bahan-nama');
    const jmlEl  = U.qs('#bahan-jml');
    const satEl  = U.qs('#bahan-sat');

    const nama   = _str(namaEl.value);
    const jumlah = _num(jmlEl.value);
    let   satuan = _str(satEl.value);

    if(!nama){ U.toast('Nama bahan wajib.','warning'); return; }

    const meta = findBahanInMaster(nama);
    if(!meta){ U.toast(`Bahan "${nama}" tidak ditemukan di master atau tanpa No Material.`, 'warning'); return; }
    if(!(jumlah>0)){ U.toast('Jumlah bahan harus > 0.', 'warning'); return; }
    if(!satuan && meta.satuan_default){ satuan = meta.satuan_default; }
    if(!satuan){ U.toast('Satuan bahan wajib diisi.', 'warning'); return; }

    (CUR.bahan = Array.isArray(CUR.bahan)?CUR.bahan:[]).push({
      nama, jumlah, satuan, no_material: meta.no_material
    });

    const key = nama.toLowerCase();
    if(satuan && !bahanUnitCache[key]){ bahanUnitCache[key]=satuan; U.S.set(BAHAN_UNIT_KEY, bahanUnitCache); }

    saveBufferThin(); renderBahan();
    namaEl.value=''; jmlEl.value=''; satEl.value='';
    delete namaEl.dataset.noMaterial;
  }

  function renderBahan(){
    const list = U.qs('#bahan-list');
    const rows = (CUR.bahan||[]).map((b,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${_str(b.nama)}</td>
        <td>${_str(b.no_material) || '-'}</td>
        <td>${_num(b.jumlah)}</td>
        <td>${_str(b.satuan)}</td>
        <td><button class="btn btn-sm btn-outline-danger" data-i="${i}">Hapus</button></td>
      </tr>
    `).join('');
    list.innerHTML = `<table class="table table-sm">
      <thead><tr><th>#</th><th>Nama</th><th>No. Material</th><th>Jumlah</th><th>Satuan</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    list.querySelectorAll('button[data-i]').forEach(btn=>{
      btn.onclick = (e)=>{ const i=+e.currentTarget.dataset.i; CUR.bahan.splice(i,1); saveBufferThin(); renderBahan(); };
    });
  }

  // ====== Items ======
  function addItemFromForm(){
    const errH = validateHeaderStrict(); if(errH){ U.toast(errH,'warning'); return; }
    const errI = validateItemStrict(CUR); if(errI){ U.toast(errI,'warning'); return; }
    const errB = validateBahanList(CUR.bahan||[]); if(errB){ U.toast(errB,'warning'); return; }

    const item = JSON.parse(JSON.stringify(CUR));
    item.hk = computeHK(item);
    F.items.unshift(item);

    CUR = defaultItem();
    saveBuffer();
    build();
  }

  function renderItems(){
    const el = U.qs('#items-table');
    const items = F.items||[];
    if(!items.length){
      el.innerHTML = `<div class="text-muted">Belum ada item. Tambahkan pekerjaan lalu klik "<em>Tambahkan ke Daftar Pekerjaan</em>".</div>`;
      return;
    }
    const rows = items.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${_str(r.pekerjaan)}</td>
        <td>${(r.lokasi||[]).map(x=>x.name).join(', ')}</td>
        <td>${_num(r.volume)} ${_str(r.satuan)}</td>
        <td>${(r.hk?.total ?? 0).toFixed(2)}</td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-a="edit" data-i="${i}">Edit</button>
            <button class="btn btn-outline-danger" data-a="del" data-i="${i}">Hapus</button>
          </div>
        </td>
      </tr>
    `).join('');
    el.innerHTML = `<table class="table table-sm table-hover">
      <thead><tr><th>No</th><th>Pekerjaan</th><th>Lokasi</th><th>Volume</th><th>HK</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody></table>`;

    el.querySelectorAll('button').forEach(btn=>{
      const i = +btn.dataset.i, a = btn.dataset.a;
      btn.onclick = ()=>{
        if(a==='del'){ F.items.splice(i,1); saveBuffer(); renderItems(); }
        if(a==='edit'){
          CUR = JSON.parse(JSON.stringify(F.items[i]));
          F.items.splice(i,1);
          saveBuffer(); build();
        }
      };
    });
  }

  // ====== Reset form baru ======
  function resetFormToNew(){
    CUR = defaultItem();
    F = {
      divisi: DIVISI_LABEL,
      divisi_id: DIVISI_ID,
      estate_id: ESTATE_ID,
      rayon_id:  RAYON_ID,
      estate_full: ESTATE_LABEL,
      periode: '',
      nomor: '',
      items: [],
      status: 'draft',
      status_label: 'draft',
      __serverLinked: false,
      created_at: undefined,
      updated_at: undefined
    };
    saveBufferThin(); build();
  }

  // ====== Simpan Draft ======
  function saveDraft(){
    const errH = validateHeaderStrict(); if(errH){ U.toast(errH,'warning'); return; }
    if(!(F.items?.length)) { U.toast('Minimal 1 item pekerjaan.','warning'); return; }

    const nowIso = new Date().toISOString();
    const drafts = U.S.get('rkb.drafts', []) || [];
    const totalHK = (F.items||[]).reduce((a,it)=> a + (computeHK(it).total||0), 0);

    const item = {
      ...F,
      // label display
      divisi: DIVISI_LABEL,
      estate_full: ESTATE_LABEL,
      // scope id dijamin
      divisi_id: F.divisi_id || DIVISI_ID,
      estate_id: F.estate_id || ESTATE_ID,
      rayon_id:  F.rayon_id  || RAYON_ID,
      periode: fPeriode(F.periode),
      status: 'draft',
      status_label: computeRevisionTag(F.nomor),
      hk_total: Number(totalHK.toFixed(2)),
      created_at: F.created_at || nowIso,
      updated_at: nowIso,
      __serverLinked: !!F.__serverLinked
    };

    const idx = drafts.findIndex(d=> _str(d.nomor)===_str(F.nomor));
    if(idx>=0) drafts[idx]=item; else drafts.unshift(item);
    U.S.set('rkb.drafts', drafts);

    F = {...item};
    saveBufferThin();

    // (opsional) buat draft PDO dari RKB untuk downstream
    try{ createPdoDraftFromRkb(F); }catch(_){}

    U.toast('Draft RKB disimpan.','success');
  }


  // === Bangun payload sesuai backend pushRKB (Full Replace: header + items lengkap) ===
function buildPushPayload(){
  // Validasi header + setiap item (pakai validator yang sudah ada)
  const errH = validateHeaderStrict(); if(errH) throw new Error(errH);
  if(!(F.items?.length)) throw new Error('Minimal 1 item pekerjaan.');

  const row = {
    nomor: _str(F.nomor),
    periode: fPeriode(F.periode),
    // scope id harus ada (backend juga akan backfill, tapi kita lengkapi di FE)
    plant_id: '',                         // opsional (akan diisi server bila ada)
    estate_id: _str(F.estate_id || ESTATE_ID),
    rayon_id:  _str(F.rayon_id  || RAYON_ID),
    divisi_id: _str(F.divisi_id || DIVISI_ID),
    estate_full: _str(F.estate_full || ESTATE_LABEL),
    // digital signature Asisten saat submit (backend pakai row.created_ts || sigWIB())
    created_ts: (function sigWIB(d=new Date()){
      const tz="Asia/Jakarta";
      const dd=new Intl.DateTimeFormat("id-ID",{timeZone:tz,day:"2-digit"}).format(d);
      const mm=new Intl.DateTimeFormat("id-ID",{timeZone:tz,month:"2-digit"}).format(d);
      const yy=new Intl.DateTimeFormat("id-ID",{timeZone:tz,year:"2-digit"}).format(d).slice(-2);
      const hh=new Intl.DateTimeFormat("id-ID",{timeZone:tz,hour:"2-digit",hour12:false}).format(d);
      const mi=new Intl.DateTimeFormat("id-ID",{timeZone:tz,minute:"2-digit"}).format(d);
      const ss=new Intl.DateTimeFormat("id-ID",{timeZone:tz,second:"2-digit"}).format(d);
      return `${dd}/${mm}/${yy}-${hh}:${mi}:${ss}`;
    })()
  };

  // Map item → struktur backend:
  const items = (F.items||[]).map((it, idx) => {
    const errI = validateItemStrict(it); if(errI) throw new Error(`Item #${idx+1}: ${errI}`);

    // pastikan bahan valid + punya no_material
    const listBhn = (it.bahan||[]).map(ensureBahanHasNoMaterial);
    const eB = validateBahanList(listBhn); if(eB) throw new Error(`Item #${idx+1}: ${eB}`);

    return {
      pekerjaan    : _str(it.pekerjaan),
      activity_type: _str(it.activity_type),
      lokasi       : lokasiToString(it.lokasi),
      volume       : _num(it.volume),
      satuan       : _str(it.satuan),
      hk_unit      : _num(it.hk_unit),
      pct_bhl      : _num(it.pct_bhl),
      pct_sku      : _num(it.pct_sku),
      pct_bhb      : _num(it.pct_bhb),
      pengawas     : _str(it.pengawas),
      bahan        : listBhn
    };
  });

  return { row, items };
}

// === Submit/Replace ke server ===
async function submitRKB(){
  let nomorNow = '';
  try{
    const payload = buildPushPayload();
    nomorNow = payload?.row?.nomor || F.nomor;

    // Konfirmasi jika nomor sudah ada di server
    if (existsOnServerByNomor(nomorNow) || F.__serverLinked){
      const ok = confirm(
        `No RKB ${nomorNow} sudah ada di server.\n`+
        `Aksi ini akan MENGGANTI SELURUH detail (Full Replace).\n\n`+
        `Lanjutkan?`
      );
      if(!ok) return;
    }

    // paksa status 'submitted' di FE → server boleh mengabaikan/override
    payload.row.status = 'submitted';

    // === PROGRESS ===
    U.progressOpen?.('Menyiapkan data…');
    U.progress?.(12, 'Validasi & kemas payload');
    
    U.progress?.(35, 'Mengirim ke server…');
    const res = await postRkbReplace(payload);  // ← pakai helper baru

    U.progress?.(60, 'Memproses respon…');
    // sukses server
    const statusNow = (res.status || 'submitted');

    // === UPDATE BUFFER LOKAL ===
    U.progress?.(75, 'Memperbarui cache lokal…');

    // 1) rkb.form.buffer
    F.__serverLinked = true;
    F.status = statusNow;
    F.status_label = statusNow;
    F.updated_at = new Date().toISOString();
    U.S.set('rkb.form.buffer', F);

    // 2) rkb.drafts → hapus nomor yang sama (supaya tidak terlihat “draft” lagi)
    const drafts = U.S.get('rkb.drafts', []) || [];
    U.S.set('rkb.drafts', drafts.filter(d => _str(d.nomor)!==_str(nomorNow)));

    // 3) Patch actuals ringkas (header) supaya halaman Rekap langsung baca 'submitted'
    // kunci umum yang sering dipakai: 'kpl.actual.rkb' dan/atau 'rkb'
    const patchActualsKey = (key)=>{
      let arr = U.S.get(key, []);
      if(!Array.isArray(arr)) arr = [];
      let found = false;
      for (let i=0;i<arr.length;i++){
        if (_str(arr[i].nomor) === _str(nomorNow)){
          arr[i].status     = statusNow;
          arr[i].periode    = fPeriode(F.periode);
          arr[i].divisi_id  = _str(F.divisi_id || arr[i].divisi_id);
          arr[i].estate_id  = _str(F.estate_id || arr[i].estate_id);
          arr[i].rayon_id   = _str(F.rayon_id  || arr[i].rayon_id);
          arr[i].updated_at = new Date().toISOString();
          found = true; break;
        }
      }
      if(!found){
        arr.push({
          nomor: nomorNow,
          periode: fPeriode(F.periode),
          divisi_id: _str(F.divisi_id),
          estate_id: _str(F.estate_id),
          rayon_id:  _str(F.rayon_id),
          status: statusNow,
          username: SESSION.profile()?.username || '',
          updated_at: new Date().toISOString()
        });
      }
      U.S.set(key, arr);
    };
    patchActualsKey('kpl.actual.rkb');
    patchActualsKey('rkb');

    // 4) (opsional) refresh actuals dari server agar konsisten
    U.progress?.(88, 'Menyegarkan data…');
    try{ await API.call?.('pullMaster', {}); }catch(_){}

    U.progress?.(100, 'Selesai');
    U.toast?.('RKB berhasil dikirim (Submitted).', 'success');

    // arahkan ke list rekap (jika ada)
    location.hash = '#/rkb/list';
  }catch(err){
    console.error(err);
    U.progress?.(100, 'Gagal');
    U.toast?.(String(err.message || err), 'danger');
  }finally{
    setTimeout(()=> U.progressClose?.(), 250);
  }
}



  // ====== Create PDO Draft dari RKB (tetap disertakan seperti versi Anda) ======
  function createPdoDraftFromRkb(rkb){
    const yrate = U.S.get('kpl.master.yrate', []);
    const yact  = U.S.get('kpl.master.yactivity', []);
    function getRate(name){
      const nm = _str(name).toLowerCase();
      const rows = (yrate||[]).filter(r => _str(r.nama||r.key).toLowerCase()===nm);
      const hit = rows.find(r=> _str(r.divisi||r.divisi_id).toUpperCase() === _str(rkb.divisi_id||rkb.divisi||profile.divisi).toUpperCase()) || rows[0];
      return _num(hit && (hit.nilai||hit.value||hit.rate));
    }
    function findActMeta(pekerjaan, activity_type){
      const byName = (yact||[]).find(a=> _str(a.nama||a.pekerjaan).toLowerCase() === _str(pekerjaan).toLowerCase());
      if(byName) return byName;
      const byType = (yact||[]).find(a=> _str(a.activity_type).toLowerCase() === _str(activity_type).toLowerCase());
      return byType || {};
    }
    function sigWIB(d=new Date()){
      const tz="Asia/Jakarta";
      const dd=new Intl.DateTimeFormat("id-ID",{timeZone:tz,day:"2-digit"}).format(d);
      const mm=new Intl.DateTimeFormat("id-ID",{timeZone:tz,month:"2-digit"}).format(d);
      const yy=new Intl.DateTimeFormat("id-ID",{timeZone:tz,year:"2-digit"}).format(d).slice(-2);
      const hh=new Intl.DateTimeFormat("id-ID",{timeZone:tz,hour:"2-digit",hour12:false}).format(d);
      const mi=new Intl.DateTimeFormat("id-ID",{timeZone:tz,minute:"2-digit"}).format(d);
      const ss=new Intl.DateTimeFormat("id-ID",{timeZone:tz,second:"2-digit"}).format(d);
      return `${dd}/${mm}/${yy}-${hh}:${mi}:${ss}`;
    }
    const upah_bhl = getRate('upah_hk_bhl');
    const upah_sku = getRate('upah_hk_sku');
    const premi_panen = getRate('premi_panen');
    const premi_non   = getRate('premi_non_panen');

    const hk=[]; const borongan=[];
    (rkb.items||[]).forEach(it=>{
      const pekerjaan = it.pekerjaan || it.nama || '';
      const actMeta = findActMeta(pekerjaan, it.activity_type);
      const satuanDefault = it.satuan_borongan || it.satuan || actMeta.satuan_borongan || actMeta.satuan_default || actMeta.satuan || '';
      const hkSKU=_num(it.hk_sku), hkBHL=_num(it.hk_bhl), hkTotal=_num(it.hk_total);
      const luas=_num(it.luas_ha || it.luas || it.volume);
      if(hkSKU>0){ hk.push({ pekerjaan, satuan: satuanDefault, luas_ha: luas, hk: hkSKU, tipe:'SKU', total_rp: Math.round(hkSKU*upah_sku) }); }
      if(hkBHL>0){ hk.push({ pekerjaan, satuan: satuanDefault, luas_ha: luas, hk: hkBHL, tipe:'BHL', total_rp: Math.round(hkBHL*upah_bhl) }); }
      if(hkSKU===0 && hkBHL===0 && hkTotal>0){ hk.push({ pekerjaan, satuan: satuanDefault, luas_ha: luas, hk: hkTotal, tipe:'SKU', total_rp: Math.round(hkTotal*upah_sku) }); }

      const rateBor=_num(it.tarif_borongan || actMeta.tarif_borongan);
      const bhbPct=_num(it.bhb_percent || it.persen_bhb);
      const vol=_num(it.volume || luas);
      const qtyBor=_num(it.qty_borongan || ((bhbPct>0)?(vol*bhbPct/100):0));
      if(rateBor>0 && qtyBor>0){
        borongan.push({ pekerjaan, satuan: satuanDefault, qty: qtyBor, tarif_borongan: rateBor, total_rp: Math.round(qtyBor*rateBor) });
      }
    });

    const pd = {
      nomor:'', ref_rkb: rkb.nomor || '', periode: rkb.periode || '',
      estate_id: rkb.estate_id || '', rayon_id: rkb.rayon_id || '', divisi_id: rkb.divisi_id || rkb.divisi || '',
      upah_hk_bhl: upah_bhl, upah_hk_sku: upah_sku, premi_panen, premi_non_panen: premi_non,
      target_produksi_ton:0, hk, borongan,
      created_ts: sigWIB(), askep_ts: null, manager_ts: null, status:'draft'
    };
    // normalisasi divisi_id
    pd.divisi_id = _str(rkb.divisi_id || rkb.divisi || SESSION.profile()?.divisi);
    delete pd.divisi; delete pd.divisi_kode;

    const arr = U.S.get('kpl.actual.pdo_draft', []) || [];
    const idx = arr.findIndex(x => _str(x.ref_rkb) === _str(pd.ref_rkb));
    if(idx>=0) arr[idx] = pd; else arr.push(pd);
    U.S.set('kpl.actual.pdo_draft', arr);
    U.toast('Draft PDO otomatis terbentuk dari Draft RKB.');
  }

  // ====== GO ======
  if(!F.periode){
    const d=new Date();
    F.periode = fPeriode(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  build();
};

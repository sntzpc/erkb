// js/pages/rkh/rkh_form.js
window.Pages = window.Pages || {};
Pages.rkhForm = function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash='#/login'; return; }

  // ===== Masters (konsisten dengan rkb_form.js) =====
  const M = {
    activity: U.S.get('kpl.master.yactivity', []),
    blok:     U.S.get('kpl.master.yblok', []),
    komplek:  U.S.get('kpl.master.ykomplek', []),
    bahan:    U.S.get('kpl.master.ybahan', []),
    org:      U.S.get('kpl.master.yorg_map', []),
    estate:   U.S.get('kpl.master.yestate', [])
  };

  // Map user → org
  const myOrg = (M.org||[]).find(x=> (x.username||'').toLowerCase() === (profile.username||'').toLowerCase()) || {};
  const DIVISI = myOrg.divisi_id || profile.divisi || 'UNKNOWN';
  const estateObj = (M.estate||[]).find(e=> e.id === (myOrg.estate_id||'')) || {};
  const ESTATE = estateObj.nama_panjang || profile.estate_full || 'UNKNOWN ESTATE';

  // Scope ID
  const DIVISI_ID = myOrg.divisi_id || profile.divisi_id || DIVISI;
  const ESTATE_ID = myOrg.estate_id || profile.estate_id || '';
  const RAYON_ID  = myOrg.rayon_id  || profile.rayon_id  || '';

// === Master bahan untuk autosuggest no_material + satuan (AMANKAN TIPE) ===
const MASTER_BAHAN = U.S.get('kpl.master.ybahan', []) || [];
const bahanByName = {};
(MASTER_BAHAN || []).forEach(b => {
  const nm = _str(b.nama_bahan || b.nama).toLowerCase();
  if (!nm) return;
  bahanByName[nm] = {
    no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no),
    satuan_default: _str(b.satuan_default ?? b.satuan)
  };
});
function getBahanMetaByName(name){
  const key = _str(name).toLowerCase();
  return key ? (bahanByName[key] || null) : null;
}


  // Cache satuan lokal utk bahan
  const BAHAN_UNIT_KEY = 'kpl.master.ybahan_unit';
  const bahanUnitCache = U.S.get(BAHAN_UNIT_KEY, {}); // { 'gramoxone': 'L', ... }

  // ===== Helpers umum (konsisten) =====
  function _str(v){ return String(v ?? '').trim(); }
  function _num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
  function _isPos(n){ return _num(n) > 0; }
  function _required(v){ return _str(v).length > 0; }

function findBahanInMaster(name){
  const key = _str(name).toLowerCase();
  if(!key) return null;

  // 1) via index cepat
  const meta = getBahanMetaByName(key);
  if(meta){
    const noMat = _str(meta.no_material);
    if(noMat) return { nama: name, no_material: noMat, satuan_default: _str(meta.satuan_default) };
  }

  // 2) fallback scan MASTER_BAHAN bila index tak cover
  const hit = (MASTER_BAHAN||[]).find(b => _str(b.nama_bahan || b.nama).toLowerCase() === key);
  if(hit){
    const noMat = _str(hit.no_material ?? hit.kode ?? hit.code ?? hit.id ?? hit.no);
    if(noMat) return { nama: name, no_material: noMat, satuan_default: _str(hit.satuan_default ?? hit.satuan) };
  }
  return null;
}


  // Format periode ke YYYY-MM
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

  // ===== Buffer (header + items) =====
  const DKEY = 'rkh.form.buffer';
  let F = U.S.get(DKEY, {
    // header
    nomor: '',
    tanggal: U.fmt.ymd(new Date(), 'Asia/Jakarta'),
    periode: '',       // auto dari tanggal
    ref_rkb: '',
    // scope + label display
    divisi: DIVISI,
    estate_full: ESTATE,
    divisi_id: DIVISI_ID,
    estate_id: ESTATE_ID,
    rayon_id:  RAYON_ID,

    items: []          // [{ ...item, hk:{BHL,SKU,BHB,total}, bahan:[{nama,no_material,jumlah,satuan}] }]
  });
  function setPeriodeFromTanggal(){
    const d = new Date(F.tanggal);
    if(!isNaN(d)){ F.periode = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  }
  setPeriodeFromTanggal();

  const saveBuffer = U.debounce(()=> U.S.set(DKEY, F), 250);
  function saveBufferThin(){ U.S.set(DKEY, F); }

  // ===== Item model & HK =====
  function defaultItem(){
    return {
      pekerjaan: '',
      activity_type: '',
      lokasi: [], // {type:'blok'|'komplek', name:'KODE', luas:Number}
      volume: 0,
      satuan: 'Ha',
      hk_unit: 0,
      pct_bhl: 0,
      pct_sku: 100,
      pct_bhb: 0,
      bahan: [],  // {nama, no_material, jumlah, satuan}
      pengawas: ''
    };
  }
  let CUR = defaultItem();

  function computeHK(item){
    const base = (Number(item.volume)||0) * (Number(item.hk_unit)||0);
    const BHL = base * ((Number(item.pct_bhl)||0)/100);
    const SKU = base * ((Number(item.pct_sku)||0)/100);
    const BHB = base * ((Number(item.pct_bhb)||0)/100);
    return {BHL, SKU, BHB, total: (BHL+SKU+BHB)};
  }
  function hkBadge(hk){
    return `
      <div class="d-flex flex-wrap gap-2">
        <span class="badge text-bg-secondary">BHL: <strong>${(hk.BHL||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">SKU: <strong>${(hk.SKU||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-secondary">BHB: <strong>${(hk.BHB||0).toFixed(2)}</strong></span>
        <span class="badge text-bg-dark">TOTAL HK: <strong>${(hk.total||0).toFixed(2)}</strong></span>
      </div>`;
  }

  // ===== VALIDATION (konsisten & ketat) =====
  function validateHeaderStrict(){
    if(!_required(F.tanggal)) return 'Tanggal RKH wajib diisi.';
    if(!_required(F.ref_rkb)) return 'Ref. No RKB wajib diisi.';
    return '';
  }
  function validateItemStrict(it){
    if(!_required(it.pekerjaan)) return 'Jenis Pekerjaan wajib diisi.';
    if(!Array.isArray(it.lokasi) || it.lokasi.length===0) return 'Lokasi minimal 1 baris.';
    if(!_isPos(it.volume))  return 'Volume harus > 0.';
    if(!_required(it.satuan)) return 'Satuan volume wajib diisi.';
    if(!_isPos(it.hk_unit)) return 'HK/Unit harus > 0.';
    if(!_required(it.pengawas)) return 'Nama Pengawas wajib diisi.';
    const pBHL = _num(it.pct_bhl), pSKU = _num(it.pct_sku), pBHB = _num(it.pct_bhb);
    if((pBHL+pSKU+pBHB) !== 100) return 'Persentase HK harus tepat 100% (BHL+SKU+BHB).';
    return '';
  }
function validateBahanList(list){
  const arr = Array.isArray(list) ? list : [];
  for(let i=0; i<arr.length; i++){
    const b = arr[i];
    const nm = _str(b.nama);
    const jm = _num(b.jumlah);
    const st = _str(b.satuan);
    const meta = findBahanInMaster(nm);
    if(!meta) return `Bahan #${i+1} ("${nm}") tidak valid atau tidak ada di master.`;
    if(!_str(meta.no_material)) return `Bahan #${i+1} ("${nm}") tidak memiliki No Material.`;
    if(jm<=0) return `Bahan #${i+1} ("${nm}") jumlah harus > 0.`;
    if(!st) return `Bahan #${i+1} ("${nm}") satuan wajib diisi.`;
  }
  return '';
}


  // ===== UI BUILD =====
  function build(){
    const totalItems = F.items?.length || 0;
    const hkNow = computeHK(CUR);
    const ringkasanHK = (F.items||[]).reduce((a,it)=> a + (computeHK(it).total||0), 0);

    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mb-0">Form RKH</h4>
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
              <input id="nomor" class="form-control" value="${F.nomor||''}" readonly />
              <button id="btn-load" class="btn btn-outline-secondary">Muat Detail</button>
            </div>
          </div>
        </div>

        <div class="row g-3 mt-1">
          <div class="col-sm-8">
            <label class="form-label">Ref. No RKB</label>
            <div class="input-group">
              <input id="ref-rkb" class="form-control" value="${F.ref_rkb||''}" readonly />
              <button id="btn-pilih-rkb" class="btn btn-outline-primary">Pilih No RKB</button>
              <button id="btn-gen" class="btn btn-success">Create dari RKB</button>
            </div>
            <div class="form-text">Pilih RKB lalu “Create dari RKB”. Item & bahan akan diambil dari server (dibagi 20 di server jika aturan itu berlaku).</div>
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

  // ===== Bind header & form controls =====
  function bind(){
    U.qs('#tgl').onchange = (e)=>{ F.tanggal = e.target.value; setPeriodeFromTanggal(); saveBuffer(); build(); };

    U.qs('#btn-pilih-rkb').onclick = openRkbPicker;
    U.qs('#btn-gen').onclick = createFromRkb;
    U.qs('#btn-load').onclick = openLoadByNomor;

    U.qs('#pekerjaan').oninput = (e)=>{
      CUR.pekerjaan = e.target.value;
      const found = (M.activity||[]).find(a=> ((a.nama_pekerjaan||a.nama||'').toLowerCase() === CUR.pekerjaan.toLowerCase()));
      CUR.activity_type = found?.activity_type || '';
      saveBufferThin(); updateHKLive();
    };

    U.qs('#btn-lokasi').onclick = openLokasiModal;

    U.qs('#volume').oninput = (e)=>{ CUR.volume = parseFloat(e.target.value||0); saveBufferThin(); updateHKLive(); };
    U.qs('#satuan').oninput = (e)=>{ CUR.satuan = e.target.value; saveBufferThin(); };
    U.qs('#hkunit').oninput = (e)=>{ CUR.hk_unit = parseFloat(e.target.value||0); saveBufferThin(); updateHKLive(); };
    U.qs('#btn-hk').onclick = openHKModal;

    U.qs('#pengawas').oninput = (e)=>{ CUR.pengawas = e.target.value; saveBufferThin(); };

    U.qs('#btn-bahan-add').onclick = addBahan;

    U.qs('#btn-add-item').onclick = addItemFromForm;
    U.qs('#btn-clear-item').onclick = ()=>{ CUR = defaultItem(); build(); };

    U.qs('#btn-save-draft').onclick = saveDraft;
  }

  function updateHKLive(){
    const hkNow = computeHK(CUR);
    const el = U.qs('#hk-live');
    if(el) el.innerHTML = hkBadge(hkNow);
  }

  // ====== Lokasi modal (copy dari rkb, minor adaptasi) ======
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
      const ql = q.toLowerCase();
      return src.filter(x=> (x.kode||'').toLowerCase().includes(ql)).slice(0,10);
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
      const name = input.value.trim(); if(!name) return;
      const src = type==='blok'? (M.blok||[]) : (M.komplek||[]);
      const found = src.find(x=> (x.kode||'').toLowerCase() === name.toLowerCase());
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

  // ====== HK Modal (copy dari rkb) ======
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
      CUR.pct_bhl = parseFloat(div.querySelector('#p-bhl').value||0);
      CUR.pct_sku = parseFloat(div.querySelector('#p-sku').value||0);
      CUR.pct_bhb = parseFloat(div.querySelector('#p-bhb').value||0);
      saveBufferThin(); build(); setTimeout(()=>m.hide(), 10); setTimeout(()=>div.remove(), 300);
    };
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ====== Bahan: autosuggest + validasi ketat ======
  function initAutoBahan(){
    const namaEl = U.qs('#bahan-nama');
    const satEl  = U.qs('#bahan-sat');
    if(!namaEl || !satEl) return;

    namaEl.addEventListener('input', ()=>{
      const key = (namaEl.value||'').toLowerCase().trim();
      if(!key) return;

      const meta = getBahanMetaByName(key);
if(meta){
  if(meta.satuan_default && !satEl.value){
    satEl.value = meta.satuan_default;
  }
  namaEl.dataset.noMaterial = _str(meta.no_material); // <— aman
  return;
}
      if(bahanUnitCache[key] && !satEl.value){
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
  if(!meta){ U.toast(`Bahan "${nama}" tidak ditemukan di master / tanpa No Material.`, 'warning'); return; }
  if(!(jumlah>0)){ U.toast('Jumlah bahan harus > 0.', 'warning'); return; }

  if(!satuan && meta.satuan_default){ satuan = meta.satuan_default; }
  if(!satuan){ U.toast('Satuan bahan wajib diisi.', 'warning'); return; }

  CUR.bahan.push({
    nama,
    jumlah,
    satuan,
    no_material: _str(meta.no_material)
  });

  const key = nama.toLowerCase();
  if(satuan && !bahanUnitCache[key]){
    bahanUnitCache[key] = satuan;
    U.S.set(BAHAN_UNIT_KEY, bahanUnitCache);
  }

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


  // ===== Add Item / Render Items =====
  function addItemFromForm(){
    const errH = validateHeaderStrict(); if(errH){ U.toast(errH,'warning'); return; }
    const errI = validateItemStrict(CUR); if(errI){ U.toast(errI,'warning'); return; }
    const errB = validateBahanList(CUR.bahan||[]); if(errB){ U.toast(errB,'warning'); return; }

    const item = JSON.parse(JSON.stringify(CUR));
    item.hk = computeHK(item);

    F.items.unshift(item);
    CUR = defaultItem(); saveBuffer(); build();
  }

  function renderItems(){
  const el = U.qs('#items-table');
  const items = F.items||[];
  if(!items.length){
    el.innerHTML = `<div class="text-muted">Belum ada item. Tambahkan pekerjaan lalu klik "<em>Tambahkan ke Daftar Pekerjaan</em>".</div>`;
    return;
  }

  // Ringkas bahan: "Nama (jml sat) | Nama2 (jml sat)"
  const sumBahan = (list)=> (list||[])
    .map(b=>`${_str(b.nama)} (${U.fmt.id0(_num(b.jumlah))} ${_str(b.satuan)})`)
    .join(' | ') || '-';

  const rows = items.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${r.pekerjaan}</td>
      <td>${(r.lokasi||[]).map(x=>x.name).join(', ')}</td>
      <td>${r.volume} ${r.satuan}</td>
      <td>${r.hk?.total?.toFixed(2) || '-'}</td>
      <td class="text-truncate" style="max-width:320px">${sumBahan(r.bahan)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-a="edit" data-i="${i}">Edit</button>
          <button class="btn btn-outline-danger" data-a="del" data-i="${i}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  el.innerHTML = `<table class="table table-sm table-hover">
    <thead>
      <tr>
        <th>No</th><th>Pekerjaan</th><th>Lokasi</th><th>Volume</th><th>HK</th><th>Bahan (ringkas)</th><th>Aksi</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

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

  // ===== RKB Picker (untuk Ref. No RKB) =====
  function openRkbPicker(){
    const div = document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Pilih No RKB</h5>
          <button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="row g-2 mb-2">
            <div class="col-sm-4"><input id="f-per" class="form-control" placeholder="Filter periode YYYY-MM"/></div>
            <div class="col-sm-8"><input id="f-q" class="form-control" placeholder="Cari nomor / divisi / estate"/></div>
          </div>
          <div id="list" class="table-responsive"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
        </div>
      </div></div>`;
    document.body.appendChild(div);
    const m = new bootstrap.Modal(div); m.show();

    const drafts = U.S.get('rkb.drafts', []);
    const hist = (window.STORE && STORE.getActualsRkb) ? (STORE.getActualsRkb()||[]) : [];
    const me = (profile.username||'').toLowerCase();
    const historyMine = hist.filter(x => String(x.username||'').toLowerCase()===me);
    const data = drafts.concat(historyMine).map(x=>({
      nomor: x.nomor,
      periode: (x.periode || '').toString(),
      divisi: x.divisi || x.divisi_id || '',
      estate_full: x.estate_full || '',
      status: x.status || 'draft'
    }));

    function apply(){
      const per = (U.qs('#f-per', div).value||'').trim();
      const q = (U.qs('#f-q', div).value||'').trim().toLowerCase();
      let arr = data.slice();
      if(per) arr = arr.filter(r => String(r.periode).startsWith(per));
      if(q) arr = arr.filter(r =>
        [r.nomor, r.periode, r.divisi, r.estate_full, r.status].some(v=> String(v||'').toLowerCase().includes(q))
      );
      arr.sort((a,b)=> String(b.nomor).localeCompare(String(a.nomor)));
      U.qs('#list', div).innerHTML = `
        <table class="table table-sm table-hover">
          <thead><tr><th>Nomor</th><th>Periode</th><th>Divisi</th><th>Estate</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${arr.map(r=>`
              <tr>
                <td>${r.nomor}</td><td>${fPeriode(r.periode)}</td><td>${r.divisi}</td><td>${r.estate_full}</td><td>${r.status}</td>
                <td><button class="btn btn-sm btn-primary" data-n="${r.nomor}">Pilih</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      U.qs('#list', div).querySelectorAll('button[data-n]').forEach(b=>{
        b.onclick = ()=>{ F.ref_rkb = b.dataset.n; saveBuffer(); build(); m.hide(); setTimeout(()=>div.remove(), 150); };
      });
    }
    U.qs('#f-per', div).oninput = apply;
    U.qs('#f-q', div).oninput = apply;
    apply();
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ===== CREATE dari RKB (server) =====
  async function createFromRkb(){
    if(!F.tanggal){ U.toast('Tanggal RKH wajib diisi.','warning'); return; }
    if(!F.ref_rkb){ U.toast('Pilih Ref. No RKB dulu.','warning'); return; }
    try{
      U.progressOpen('Membuat RKH dari RKB...'); U.progress(35,'Proses server');

      // 1) perintah create server → server mengembalikan nomor RKH
      const r = await API.call('createRKHFromRKB', {
        ref_rkb: F.ref_rkb,
        tanggal: F.tanggal
      });
      if(!r.ok){ throw new Error(r.error||'Gagal create RKH'); }
      if(r.nomor) F.nomor = r.nomor;

      // 2) ambil detail RKH lalu petakan ke buffer F.items
      await loadDetailByNomor(F.nomor, true);

      U.toast('RKH dibuat dari RKB. Item tampil di Daftar Pekerjaan.', 'success');
    }catch(e){
      U.toast(e.message||e, 'danger');
    }finally{
      U.progressClose(); U.progressHardClose();
    }
  }

  // ===== MUAT DETAIL RKH (pakai nomor) =====
  function openLoadByNomor(){
    const nomor = prompt('Masukkan No RKH:', F.nomor||'');
    if(!nomor) return;
    loadDetailByNomor(nomor, false);
  }

  async function loadDetailByNomor(nomor, keepRef){
    try{
      U.progressOpen('Memuat detail RKH...'); U.progress(30,'Ambil server');
      const r = await API.call('getRkhDetail', { nomor });
      if(!r.ok) throw new Error(r.error||'RKH tidak ditemukan / tidak berwenang.');

      const h = r.header || {};
      const its = Array.isArray(r.items) ? r.items : [];
      const bhn = Array.isArray(r.bahan) ? r.bahan : [];

      // Kelompokkan bahan per item_idx
const bahanByIdx = {};
(bhn || []).forEach(b=>{
  const k = String(b.item_idx||'');
  (bahanByIdx[k] = bahanByIdx[k] || []).push({
    nama: _str(b.nama),
    no_material: _str(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no), // ⟵ fallback aman
    jumlah: _num(b.jumlah),
    satuan: _str(b.satuan)
  });
});

      // Map item server → struktur F.items
      F.nomor   = h.nomor || nomor;
      F.tanggal = h.tanggal || F.tanggal;
      setPeriodeFromTanggal();
      F.periode = h.periode || fPeriode(F.periode);
      if(!keepRef) F.ref_rkb = h.ref_rkb || F.ref_rkb;

      F.divisi_id = h.divisi_id || F.divisi_id;
      F.estate_id = h.estate_id || F.estate_id;
      F.rayon_id  = h.rayon_id  || F.rayon_id;
      F.divisi    = h.divisi    || F.divisi;
      F.estate_full = h.estate_full || F.estate_full;

      F.items = its.map((x,idx)=>{
        // lokasi server biasanya string: "BLK01, BLK02"
        const lokasiArr = String(x.lokasi||'').split(',').map(s=>s.trim()).filter(Boolean)
          .map(nm => ({ type:'', name:nm, luas:undefined }));
        const it = {
          pekerjaan: x.pekerjaan||'',
          activity_type: x.activity_type||'',
          lokasi: lokasiArr,
          volume: Number(x.volume||0),
          satuan: x.satuan||'',
          hk_unit: Number(x.hk_unit||0),
          pct_bhl: Number(x.pct_bhl||0),
          pct_sku: Number(x.pct_sku||0),
          pct_bhb: Number(x.pct_bhb||0),
          pengawas: x.pengawas||'',
          bahan: bahanByIdx[String(x.idx || (idx+1))] || []
        };
        it.hk = computeHK(it);
        return it;
      });

      saveBufferThin();
      build();
    }catch(e){
      U.toast(e.message||e, 'danger');
    }finally{
      U.progressClose(); U.progressHardClose();
    }
  }

  // ===== Save Draft RKH =====
  function saveDraft(){
    const errH = validateHeaderStrict(); if(errH){ U.toast(errH,'warning'); return; }
    if(!(F.items?.length)) { U.toast('Minimal 1 item pekerjaan.','warning'); return; }

    const nowIso = new Date().toISOString();
    const drafts = U.S.get('rkh.drafts', []);
    const totalHK = (F.items||[]).reduce((a,it)=> a + (computeHK(it).total||0), 0);

    const item = {
      header: {
        nomor: F.nomor || '',            // nomor boleh kosong (server-side create)
        tanggal: F.tanggal,
        periode: fPeriode(F.periode),
        ref_rkb: F.ref_rkb,
        divisi_id: F.divisi_id || DIVISI_ID,
        estate_id: F.estate_id || ESTATE_ID,
        rayon_id:  F.rayon_id  || RAYON_ID,
        divisi: DIVISI,
        estate_full: ESTATE,
        hk_total: Number(totalHK.toFixed(2)),
        updated_at: nowIso
      },
      items: JSON.parse(JSON.stringify(F.items))
    };

    drafts.unshift(item);
    U.S.set('rkh.drafts', drafts);

    saveBufferThin();
    U.toast('Draft RKH disimpan.','success');
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

  // ===== go =====
  if(!F.periode) setPeriodeFromTanggal();
  build();
};

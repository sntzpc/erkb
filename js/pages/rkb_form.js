// js/pages/rkb_form.js
window.Pages = window.Pages || {};
Pages.rkbForm = function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash='#/login'; return; }

  // Masters from localStorage (pulled dari Home/Settings)
  const M = {
    activity: U.S.get('kpl.master.yactivity', []),
    blok:     U.S.get('kpl.master.yblok', []),
    komplek:  U.S.get('kpl.master.ykomplek', []),
    // prefer ybahan (punya satuan_default), fallback ke ybahan
    bahan:    U.S.get('kpl.master.ybahan', []),
    org:      U.S.get('kpl.master.yorg_map', []),
    estate:   U.S.get('kpl.master.yestate', [])
  };

  // Cache satuan lokal utk bahan (nama_bahan -> satuan_default)
  const BAHAN_UNIT_KEY = 'kpl.master.ybahan_unit';
  const bahanUnitCache = U.S.get(BAHAN_UNIT_KEY, {}); // { 'gramoxone': 'L', ... }

  // Index bahan by nama (lowercase)
  const bahanIdx = {};
  (M.bahan||[]).forEach(b=>{
    const nama = (b.nama_bahan || b.nama || '').toString().trim();
    if(nama) bahanIdx[nama.toLowerCase()] = b;
  });

  // Map user to org (PT, Estate, Divisi, Telegram)
  const myOrg = (M.org||[]).find(x=> (x.username||'').toLowerCase() === (profile.username||'').toLowerCase()) || {};
  const DIVISI = myOrg.divisi_id || profile.divisi || 'UNKNOWN';
  const estateObj = (M.estate||[]).find(e=> e.id === (myOrg.estate_id||'')) || {};
  const ESTATE = estateObj.nama_panjang || profile.estate_full || 'UNKNOWN ESTATE';

  // Draft buffer (auto save) — header RKB + daftar pekerjaan (items)
  const DKEY = 'rkb.form.buffer';
  let F = U.S.get(DKEY, {
    divisi: DIVISI,
    periode: '', // yyyy-mm
    nomor: '',
    items: [],   // daftar pekerjaan [{...itemPekerjaan}]
  });

  // Satu "item pekerjaan" (yang sedang diisi di form atas)
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
      bahan: [], // {nama, jumlah, satuan}
      pengawas: ''
    };
  }
  let CUR = defaultItem();

  const saveBuffer = U.debounce(()=> U.S.set(DKEY, F), 300);
  function saveBufferThin(){ U.S.set(DKEY, F); }

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

  function build(){
    const totalItems = F.items?.length || 0;
    const hkNow = computeHK(CUR);
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4>Form RKB</h4>
        <div class="small text-muted">${ESTATE} · ${DIVISI}</div>
      </div>

      <div class="row g-3">
        <div class="col-sm-4">
          <label class="form-label">Periode</label>
          <div class="input-group">
            <input id="periode" class="form-control" placeholder="Pilih periode..." value="${F.periode}" readonly />
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
        <!-- Tombol Sync dipindahkan ke halaman Draft per nomor -->
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
      F.nomor = `RKB${DIVISI}${U.fmt.yymmddhhmmss(new Date())}`; saveBuffer(); build();
    };

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
      F.periode = inp.value || ym(now);
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
      CUR.pct_bhl = parseFloat(div.querySelector('#p-bhl').value||0);
      CUR.pct_sku = parseFloat(div.querySelector('#p-sku').value||0);
      CUR.pct_bhb = parseFloat(div.querySelector('#p-bhb').value||0);
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
      const key = (namaEl.value||'').toLowerCase().trim();
      if(!key) return;
      // 1) dari master jika punya satuan_default
      const src = bahanIdx[key];
      if(src && src.satuan_default && !satEl.value){
        satEl.value = src.satuan_default;
        return;
      }
      // 2) dari cache lokal
      if(bahanUnitCache[key] && !satEl.value){
        satEl.value = bahanUnitCache[key];
      }
    });
  }

  function addBahan(){
    const nama = U.qs('#bahan-nama').value.trim();
    const jumlah = parseFloat(U.qs('#bahan-jml').value||0);
    let satuan = U.qs('#bahan-sat').value.trim();

    if(!nama || !jumlah){ U.toast('Nama & jumlah bahan wajib.','warning'); return; }

    // Jika kosong, coba isi dari master/cache lokal
    if(!satuan){
      const key = nama.toLowerCase();
      const src = bahanIdx[key];
      if(src && src.satuan_default) satuan = src.satuan_default;
      else if(bahanUnitCache[key])  satuan = bahanUnitCache[key];
    }

    CUR.bahan.push({nama, jumlah, satuan});
    // Simpan ke cache lokal satuan jika belum ada
    const key = nama.toLowerCase();
    if(satuan && !bahanUnitCache[key]){
      bahanUnitCache[key] = satuan;
      U.S.set(BAHAN_UNIT_KEY, bahanUnitCache);
    }

    saveBufferThin(); renderBahan();
    U.qs('#bahan-nama').value=''; U.qs('#bahan-jml').value=''; U.qs('#bahan-sat').value='';
  }

  function renderBahan(){
    const list = U.qs('#bahan-list');
    const rows = (CUR.bahan||[]).map((b,i)=>`
      <tr>
        <td>${i+1}</td><td>${b.nama}</td><td>${b.jumlah}</td><td>${b.satuan||''}</td>
        <td><button class="btn btn-sm btn-outline-danger" data-i="${i}">Hapus</button></td>
      </tr>
    `).join('');
    list.innerHTML = `<table class="table table-sm">
      <thead><tr><th>#</th><th>Nama</th><th>Jumlah</th><th>Satuan</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    list.querySelectorAll('button[data-i]').forEach(btn=> btn.onclick = (e)=>{
      const i = +e.currentTarget.dataset.i; CUR.bahan.splice(i,1); saveBufferThin(); renderBahan();
    });
  }

  // ====== Items (daftar pekerjaan di RKB) ======
  function validateHeader(){
    if(!F.periode) return 'Periode wajib diisi.';
    if(!F.nomor) return 'No RKB belum dibuat.';
    return '';
  }
  function validateItem(it){
    if(!it.pekerjaan) return 'Jenis Pekerjaan wajib diisi.';
    if(!(it.lokasi?.length)) return 'Lokasi belum diisi.';
    if(!(it.volume>0)) return 'Volume harus > 0.';
    if(!(it.hk_unit>0)) return 'HK/Unit harus > 0.';
    return '';
  }

  function addItemFromForm(){
    const errH = validateHeader(); if(errH){ U.toast(errH,'warning'); return; }
    const err = validateItem(CUR); if(err){ U.toast(err,'warning'); return; }
    const item = JSON.parse(JSON.stringify(CUR));
    item.hk = computeHK(item);
    F.items.unshift(item);
    CUR = defaultItem(); // reset item form
    saveBuffer();
    build();
  }

  function renderItems(){
    const el = U.qs('#items-table');
    const items = F.items||[];
    if(!items.length){ el.innerHTML = `<div class="text-muted">Belum ada item. Tambahkan pekerjaan lalu klik "<em>Tambahkan ke Daftar Pekerjaan</em>".</div>`; return; }
    const rows = items.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.pekerjaan}</td>
        <td>${(r.lokasi||[]).map(x=>x.name).join(', ')}</td>
        <td>${r.volume} ${r.satuan}</td>
        <td>${r.hk?.total?.toFixed(2) || '-'}</td>
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
          // Load item ke form atas
          CUR = JSON.parse(JSON.stringify(F.items[i]));
          F.items.splice(i,1);
          saveBuffer(); build();
        }
      };
    });
  }

  function saveDraft(){
    const errH = validateHeader(); if(errH){ U.toast(errH,'warning'); return; }
    if(!(F.items?.length)) { U.toast('Minimal 1 item pekerjaan.','warning'); return; }
    const nowIso = new Date().toISOString();
    // Simpan semua RKB ini ke local draft
    const drafts = U.S.get('rkb.drafts', []);
    const totalHK = (F.items||[]).reduce((a,it)=> a + (computeHK(it).total||0), 0);
    const item = {
      ...F,
      divisi:DIVISI, estate_full:ESTATE, status:'draft',
      hk_total: Number(totalHK.toFixed(2)),
      created_at: F.created_at || nowIso,
      updated_at: nowIso
    };
    const idx = drafts.findIndex(d=> d.nomor===F.nomor);
    if(idx>=0) drafts[idx]=item; else drafts.unshift(item);
    U.S.set('rkb.drafts', drafts);
    U.toast('Draft RKB disimpan.','success');
  }

  // default periode ke bulan ini jika kosong
  if(!F.periode){
    const d=new Date();
    F.periode = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  build();
};

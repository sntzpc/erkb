// js/pages/rkh/rkh_form.js
window.Pages = window.Pages || {};
Pages.rkhForm = function(){
  const root = U.qs('#app-root');
  const profile = SESSION.profile();
  if(!profile){ location.hash='#/login'; return; }

  // ======= STATE =======
  // Header RKH yang aktif di form
  // Catatan: _data server_ akan ditandai __serverLinked=true agar tombol/hint konsisten
  let HDR = {
    nomor: '',
    tanggal: U.fmt.ymd(new Date(), 'Asia/Jakarta'),
    periode: '',            // yyyy-mm (auto dari tanggal)
    ref_rkb: '',
    divisi_id: profile.divisi_id || profile.divisi || '',
    estate_id: profile.estate_id || '',
    rayon_id:  profile.rayon_id  || '',
    divisi:    profile.divisi || '',
    estate_full: profile.estate_full || '',
    status: 'created',
    __serverLinked: false,
    created_at: '',
    updated_at: ''
  };

  // Detail items & bahan (editing di frontend)
  // items: [{idx, pekerjaan, activity_type, lokasi (string gabungan), volume, satuan, hk_unit, pct_bhl, pct_sku, pct_bhb, hk_bhl, hk_sku, hk_bhb, hk_total, pengawas}]
  // bahan: [{item_idx, no_material, nama, jumlah, satuan}]
  let ITEMS = [];
  let BAHAN = [];

  // === Master bahan untuk autosuggest no_material + satuan ===
const MASTER_BAHAN = U.S.get('kpl.master.ybahan', []) || [];
const bahanByName = {};
(MASTER_BAHAN || []).forEach(b => {
  const nm = (b.nama_bahan || b.nama || '').toString().trim().toLowerCase();
  if (!nm) return;
  bahanByName[nm] = {
    no_material: b.no_material || b.kode || b.code || b.id || b.no || '',
    satuan_default: b.satuan_default || b.satuan || ''
  };
});
function getBahanMetaByName(name){
  const key = (name||'').toString().trim().toLowerCase();
  return key ? (bahanByName[key] || null) : null;
}

  // ======= HELPERS =======
  function setPeriodeFromTanggal(){
    const d = new Date(HDR.tanggal);
    if(!isNaN(d)) HDR.periode = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  setPeriodeFromTanggal();

  function hkOf(row){
    const vol = Number(row.volume||0);
    const hk_unit = Number(row.hk_unit||0);
    const base = vol * hk_unit;
    const bhl = base * (Number(row.pct_bhl||0)/100);
    const sku = base * (Number(row.pct_sku||0)/100);
    const bhb = base * (Number(row.pct_bhb||0)/100);
    return { hk_bhl:bhl, hk_sku:sku, hk_bhb:bhb, hk_total:(bhl+sku+bhb) };
  }

  function sumHK(){
    return ITEMS.reduce((a,it)=> a + Number(it.hk_total||0), 0);
  }

  function fmtId2(n){ return U.fmt.id2(n||0); }
  

  // ======= UI BUILD =======
  function build(){
    const badgeServer = HDR.__serverLinked
      ? '<span class="badge text-bg-light border ms-2" title="Data berasal dari server">server</span>'
      : '';
    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h4 class="mb-0">Form RKH ${badgeServer}</h4>
          <div class="small text-muted">${HDR.estate_full || '-'} · ${HDR.divisi || HDR.divisi_id || '-'}</div>
        </div>

        <div class="row g-3">
          <div class="col-sm-4">
            <label class="form-label">Tanggal RKH</label>
            <input id="tgl" type="date" class="form-control" value="${HDR.tanggal}" />
            <div class="form-text">Periode akan otomatis mengikuti tanggal.</div>
          </div>

          <div class="col-sm-4">
            <label class="form-label">Periode (otomatis)</label>
            <input id="periode" class="form-control" value="${HDR.periode}" readonly />
          </div>

          <div class="col-sm-4">
            <label class="form-label">No. RKH</label>
            <div class="input-group">
              <input id="nomor" class="form-control" value="${HDR.nomor||''}" readonly />
              <button id="btn-load" class="btn btn-outline-secondary">Muat Detail</button>
            </div>
            <div class="form-text">Nomor otomatis terisi ketika Create dari RKB atau setelah simpan.</div>
          </div>
        </div>

        <div class="row g-3 mt-1">
          <div class="col-sm-8">
            <label class="form-label">Ref. No RKB</label>
            <div class="input-group">
              <input id="ref" class="form-control" value="${HDR.ref_rkb||''}" readonly />
              <button id="btn-pilih-rkb" class="btn btn-outline-primary">Pilih No RKB</button>
              <button id="btn-gen" class="btn btn-success">Create dari RKB</button>
            </div>
            <div class="form-text">Pilih tanggal & No RKB, lalu klik “Create dari RKB”. Item & bahan akan ter-generate (volume & jumlah dibagi 20).</div>
          </div>

          <div class="col-sm-4">
            <label class="form-label">Ringkasan HK</label>
            <div class="form-control" style="background:#f8f9fa">${fmtId2(sumHK())}</div>
            <div class="form-text">Total HK = Σ (volume × hk_unit × %)</div>
          </div>
        </div>

        <hr/>
        <div class="d-flex flex-wrap gap-2 mb-2">
          <button id="btn-sync" class="btn btn-primary">Kirim/Sync ke Server</button>
          <button id="btn-save" class="btn btn-outline-success">Simpan ke Draft Lokal</button>
          <button id="btn-new"  class="btn btn-outline-danger">Form Baru</button>
        </div>

        <h5 class="mb-2">Daftar Item</h5>
        <div id="items" class="table-responsive"></div>

        <h5 class="mt-3">Daftar Bahan</h5>
        <div class="small text-muted mb-2">Anda bisa mengubah <b>no_material</b>, <b>nama</b>, <b>jumlah</b>, <b>satuan</b>. Pastikan kolom <em>item_idx</em> sesuai dengan index item terkait.</div>
        <div id="bahan" class="table-responsive"></div>

      </div></div>
    `;

    // bind header
    U.qs('#tgl').onchange = (e)=>{ HDR.tanggal = e.target.value; setPeriodeFromTanggal(); build(); };
    U.qs('#btn-pilih-rkb').onclick = openRkbPicker;
    U.qs('#btn-gen').onclick = createFromRkb;
    U.qs('#btn-load').onclick = openLoadByNomor;

    U.qs('#btn-save').onclick = saveDraftLocal;
    U.qs('#btn-new').onclick  = resetForm;
    U.qs('#btn-sync').onclick = doSync;

    renderItems();
    renderBahan();
  }

  // ======= RENDER TABELS =======
  function renderItems(){
    const wrap = U.qs('#items');
    if(!ITEMS.length){
      wrap.innerHTML = `<div class="text-muted">Belum ada item.</div>`;
      return;
    }
    const rows = ITEMS.map((r,i)=>{
      return `<tr>
        <td>${i+1}</td>
        <td><input class="form-control form-control-sm" data-k="pekerjaan" data-i="${i}" value="${r.pekerjaan||''}"/></td>
        <td><input class="form-control form-control-sm" data-k="activity_type" data-i="${i}" value="${r.activity_type||''}"/></td>
        <td><textarea class="form-control form-control-sm" data-k="lokasi" data-i="${i}" rows="1">${r.lokasi||''}</textarea></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="volume" data-i="${i}" value="${r.volume||0}"/></td>
        <td><input class="form-control form-control-sm" data-k="satuan" data-i="${i}" value="${r.satuan||''}"/></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="hk_unit" data-i="${i}" value="${r.hk_unit||0}"/></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="pct_bhl" data-i="${i}" value="${r.pct_bhl||0}"/></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="pct_sku" data-i="${i}" value="${r.pct_sku||0}"/></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="pct_bhb" data-i="${i}" value="${r.pct_bhb||0}"/></td>
        <td class="t-right">${fmtId2(r.hk_bhl||0)}</td>
        <td class="t-right">${fmtId2(r.hk_sku||0)}</td>
        <td class="t-right">${fmtId2(r.hk_bhb||0)}</td>
        <td class="t-right"><b>${fmtId2(r.hk_total||0)}</b></td>
        <td><input class="form-control form-control-sm" data-k="pengawas" data-i="${i}" value="${r.pengawas||''}"/></td>
        <td><button class="btn btn-sm btn-outline-danger" data-a="del" data-i="${i}">Hapus</button></td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `
      <table class="table table-sm table-hover align-middle">
        <thead>
          <tr>
            <th>#</th><th>Jenis Pekerjaan</th><th>Activity</th><th>Lokasi</th>
            <th class="t-right">Volume</th><th>Satuan</th>
            <th class="t-right">HK/Unit</th>
            <th class="t-right">%BHL</th><th class="t-right">%SKU</th><th class="t-right">%BHB</th>
            <th class="t-right">HK BHL</th><th class="t-right">HK SKU</th><th class="t-right">HK BHB</th>
            <th class="t-right">HK Total</th><th>Pengawas</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    // bind edits & delete
    wrap.querySelectorAll('input,textarea').forEach(inp=>{
      inp.oninput = (e)=>{
        const i = +e.target.dataset.i;
        const k = e.target.dataset.k;
        ITEMS[i][k] = (inp.type==='number') ? parseFloat(e.target.value||0) : e.target.value;
        // hitung ulang hk
        const hk = hkOf(ITEMS[i]);
        Object.assign(ITEMS[i], hk);
        build(); // render ulang agar ringkasan & kolom hk terbarui
      };
    });
    wrap.querySelectorAll('button[data-a="del"]').forEach(btn=>{
      btn.onclick = (e)=>{
        const i = +e.currentTarget.dataset.i;
        ITEMS.splice(i,1);
        build();
      };
    });
  }

  function renderBahan(){
    const wrap = U.qs('#bahan');
    const rows = (BAHAN||[]).map((b,i)=>`
      <tr>
        <td>${i+1}</td>
        <td><input class="form-control form-control-sm" data-k="item_idx" data-i="${i}" value="${b.item_idx||''}"/></td>
        <td><input class="form-control form-control-sm" data-k="no_material" data-i="${i}" value="${b.no_material||''}"/></td>
        <td><input class="form-control form-control-sm" data-k="nama" data-i="${i}" value="${b.nama||''}"/></td>
        <td><input type="number" step="0.01" class="form-control form-control-sm t-right" data-k="jumlah" data-i="${i}" value="${b.jumlah||0}"/></td>
        <td><input class="form-control form-control-sm" data-k="satuan" data-i="${i}" value="${b.satuan||''}"/></td>
        <td><button class="btn btn-sm btn-outline-danger" data-a="del" data-i="${i}">Hapus</button></td>
      </tr>
    `).join('');
    wrap.innerHTML = `
      <div class="d-flex flex-wrap gap-2 mb-2">
        <input id="bh-i" class="form-control form-control-sm" placeholder="item_idx" style="max-width:100px"/>
        <input id="bh-no" class="form-control form-control-sm" placeholder="no_material" style="max-width:180px"/>
        <input id="bh-nm" class="form-control form-control-sm" placeholder="nama bahan" style="min-width:220px"/>
        <input id="bh-jm" type="number" step="0.01" class="form-control form-control-sm" placeholder="jumlah" style="max-width:140px"/>
        <input id="bh-st" class="form-control form-control-sm" placeholder="satuan" style="max-width:120px"/>
        <button id="bh-add" class="btn btn-sm btn-outline-primary">Tambah</button>
      </div>

      <table class="table table-sm table-hover align-middle">
        <thead>
          <tr><th>#</th><th>item_idx</th><th>No. Material</th><th>Nama</th><th class="t-right">Jumlah</th><th>Sat.</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // add
    U.qs('#bh-add').onclick = ()=>{
  const obj = {
    item_idx: U.qs('#bh-i').value.trim(),
    no_material: U.qs('#bh-no').value.trim(),
    nama: U.qs('#bh-nm').value.trim(),
    jumlah: parseFloat(U.qs('#bh-jm').value||0),
    satuan: U.qs('#bh-st').value.trim()
  };
  if(!obj.nama){ U.toast('Nama bahan wajib.','warning'); return; }

  // Auto-isi dari master bila belum diisi manual
  const meta = getBahanMetaByName(obj.nama);
  if(meta){
    if(!obj.no_material){ obj.no_material = meta.no_material || ''; }
    if(!obj.satuan && meta.satuan_default){ obj.satuan = meta.satuan_default; }
  }

  BAHAN.push(obj);
  build();
};

    // edit/delete row
    wrap.querySelectorAll('input').forEach(inp=>{
  inp.oninput = ()=>{
    const i = +inp.dataset.i, k = inp.dataset.k;
    if(k==='jumlah'){ BAHAN[i][k] = parseFloat(inp.value||0); }
    else { BAHAN[i][k] = inp.value; }

    // Jika user mengubah NAMA → auto isi no_material jika kosong
    if(k==='nama'){
      const meta = getBahanMetaByName(BAHAN[i].nama);
      if(meta && !String(BAHAN[i].no_material||'').trim()){
        BAHAN[i].no_material = meta.no_material || '';
        // sekalian isi satuan jika kosong
        if(!String(BAHAN[i].satuan||'').trim() && meta.satuan_default){
          BAHAN[i].satuan = meta.satuan_default;
        }
        // re-render agar kolom no_material terlihat ter-update
        build();
      }
    }
  };
});
    wrap.querySelectorAll('button[data-a="del"]').forEach(btn=>{
      btn.onclick = ()=>{ const i=+btn.dataset.i; BAHAN.splice(i,1); build(); };
    });
  }

  // ======= PICKER RKB (Ref) =======
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

    // Sumber: gabungan draft lokal + history server milik user
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
                <td>${r.nomor}</td><td>${r.periode}</td><td>${r.divisi}</td><td>${r.estate_full}</td><td>${r.status}</td>
                <td><button class="btn btn-sm btn-primary" data-n="${r.nomor}">Pilih</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      U.qs('#list', div).querySelectorAll('button[data-n]').forEach(b=>{
        b.onclick = ()=>{ HDR.ref_rkb = b.dataset.n; build(); m.hide(); setTimeout(()=>div.remove(), 200); };
      });
    }
    U.qs('#f-per', div).oninput = apply;
    U.qs('#f-q', div).oninput = apply;
    apply();
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // ======= CREATE RKH dari RKB (server, auto /20) =======
  async function createFromRkb(){
    if(!HDR.tanggal){ U.toast('Tanggal wajib diisi.','warning'); return; }
    if(!HDR.ref_rkb){ U.toast('Pilih No RKB terlebih dahulu.','warning'); return; }
    try{
      U.progressOpen('Membuat RKH dari RKB...'); U.progress(35,'Proses server');
      const r = await API.call('createRKHFromRKB', {
        ref_rkb: HDR.ref_rkb,
        tanggal: HDR.tanggal
      });
      if(!r.ok){ throw new Error(r.error||'Gagal create RKH'); }
      HDR.nomor = r.nomor;
      HDR.__serverLinked = true;
      // Ambil detail
      await loadDetailByNomor(HDR.nomor, true);
      U.toast('RKH dibuat dari RKB. Volume & bahan dibagi 20.','success');
    }catch(e){
      U.toast(e.message||e,'danger');
    }finally{
      U.progressClose(); U.progressHardClose();
    }
  }

  // ======= LOAD DETAIL RKH (nomor) =======
  function openLoadByNomor(){
    const nomor = prompt('Masukkan No RKH (mis. RKH-DIVISI-yyyymmddhhmmss):', HDR.nomor||'');
    if(!nomor) return;
    loadDetailByNomor(nomor, false);
  }

  async function loadDetailByNomor(nomor, keepHeader){
    try{
      U.progressOpen('Memuat detail RKH...'); U.progress(30,'Ambil server');
      const r = await API.call('getRkhDetail', { nomor });
      if(!r.ok) throw new Error(r.error||'RKH tidak ditemukan / tidak berwenang.');
      const h = r.header || {};
      const its = r.items || [];
      const bhn = r.bahan || [];

      // map ke struktur frontend
      HDR.nomor   = h.nomor || nomor;
      HDR.tanggal = h.tanggal || HDR.tanggal;
      setPeriodeFromTanggal();
      HDR.periode = h.periode || HDR.periode;
      HDR.ref_rkb = h.ref_rkb || HDR.ref_rkb;
      HDR.divisi_id = h.divisi_id || HDR.divisi_id;
      HDR.estate_id = h.estate_id || HDR.estate_id;
      HDR.rayon_id  = h.rayon_id  || HDR.rayon_id;
      HDR.divisi    = h.divisi    || HDR.divisi;
      HDR.estate_full = h.estate_full || HDR.estate_full;
      HDR.status = h.status || 'created';
      HDR.__serverLinked = true;
      HDR.created_at = h.created_at || '';
      HDR.updated_at = h.updated_at || '';

      ITEMS = its.map(x=>{
        const row = {
          idx: Number(x.idx||0),
          pekerjaan: x.pekerjaan||'',
          activity_type: x.activity_type||'',
          lokasi: x.lokasi||'',
          volume: Number(x.volume||0),
          satuan: x.satuan||'',
          hk_unit: Number(x.hk_unit||0),
          pct_bhl: Number(x.pct_bhl||0),
          pct_sku: Number(x.pct_sku||0),
          pct_bhb: Number(x.pct_bhb||0),
          pengawas: x.pengawas||''
        };
        return Object.assign(row, hkOf(row));
      });

      BAHAN = bhn.map(b=>({
        item_idx: Number(b.item_idx||0),
        no_material: b.no_material || '',
        nama: b.nama || '',
        jumlah: Number(b.jumlah||0),
        satuan: b.satuan || ''
      }));

      build();
    }catch(e){
      U.toast(e.message||e, 'danger');
      if(!keepHeader){ resetForm(); }
    }finally{
      U.progressClose(); U.progressHardClose();
    }
  }

  // ======= SAVE DRAFT LOKAL =======
  function saveDraftLocal(){
    if(!HDR.tanggal){ U.toast('Tanggal wajib diisi.','warning'); return; }
    if(!HDR.ref_rkb){ U.toast('Ref. No RKB wajib.','warning'); return; }
    const key = 'rkh.drafts';
    const arr = U.S.get(key, []);
    const item = {
      header: {...HDR},
      items: JSON.parse(JSON.stringify(ITEMS)),
      bahan: JSON.parse(JSON.stringify(BAHAN))
    };
    const i = arr.findIndex(x => x?.header?.nomor === HDR.nomor && HDR.nomor);
    if(i>=0) arr[i] = item; else arr.unshift(item);
    U.S.set(key, arr);
    U.toast('Draft RKH disimpan di perangkat.','success');
  }

  // ======= SYNC KE SERVER =======
  async function doSync(){
    if(!HDR.tanggal){ U.toast('Tanggal wajib diisi.','warning'); return; }
    if(!HDR.ref_rkb){ U.toast('Ref. No RKB wajib.','warning'); return; }
    try{
      U.progressOpen('Mengirim RKH ke server...'); U.progress(35,'Push data');
      // body sesuai backend pushRKH()
      const payload = {
        row: {
          nomor: HDR.nomor,
          tanggal: HDR.tanggal,
          periode: HDR.periode,
          ref_rkb: HDR.ref_rkb,
          divisi_id: HDR.divisi_id,
          rayon_id:  HDR.rayon_id,
          estate_id: HDR.estate_id,
          divisi: HDR.divisi,
          estate_full: HDR.estate_full
        },
        items: ITEMS.map((it,idx)=>({
          idx: it.idx || (idx+1),
          pekerjaan: it.pekerjaan, activity_type: it.activity_type,
          lokasi: (it.lokasi||''),
          volume: Number(it.volume||0), satuan: it.satuan||'',
          hk_unit: Number(it.hk_unit||0),
          pct_bhl: Number(it.pct_bhl||0),
          pct_sku: Number(it.pct_sku||0),
          pct_bhb: Number(it.pct_bhb||0),
          pengawas: it.pengawas||''
        })),
        bahan: BAHAN.map(b=>({
          item_idx: Number(b.item_idx||0),
          no_material: b.no_material || '',
          nama: b.nama || '',
          jumlah: Number(b.jumlah||0),
          satuan: b.satuan || ''
        }))
      };

      // Validasi bahan harus punya no_material
const kosong = (BAHAN||[]).filter(b => !String(b.no_material||'').trim());
if (kosong.length) {
  U.toast('Ada bahan tanpa "No. Material". Mohon lengkapi / pilih dari master.', 'warning');
  return;
}

      const r = await API.call('pushRKH', payload);
      if(!r.ok) throw new Error(r.error||'Gagal push RKH');

      if(r.nomor){ HDR.nomor = r.nomor; }
      HDR.__serverLinked = true;
      HDR.status = 'created';
      HDR.updated_at = new Date().toISOString();

      // perbarui draft lokal juga (agar nomor & flag terbaru ikut)
      saveDraftLocal();

      U.toast('RKH tersimpan di server (status: created).','success');
    }catch(e){
      // simpan outbox
      const obk = 'rkh.outbox';
      const ob = U.S.get(obk, []);
      ob.unshift({
        header: {...HDR},
        items: JSON.parse(JSON.stringify(ITEMS)),
        bahan: JSON.parse(JSON.stringify(BAHAN)),
        last_error: e.message||'Gagal kirim',
        updated_at: new Date().toISOString()
      });
      U.S.set(obk, ob);
      U.toast('Gagal kirim. Disimpan ke Outbox RKH.','danger');
    }finally{
      U.progressClose(); U.progressHardClose();
    }
  }

  // ======= RESET FORM =======
  function resetForm(){
    HDR = {
      nomor: '',
      tanggal: U.fmt.ymd(new Date(), 'Asia/Jakarta'),
      periode: '',
      ref_rkb: '',
      divisi_id: profile.divisi_id || profile.divisi || '',
      estate_id: profile.estate_id || '',
      rayon_id:  profile.rayon_id  || '',
      divisi:    profile.divisi || '',
      estate_full: profile.estate_full || '',
      status: 'created',
      __serverLinked: false,
      created_at: '',
      updated_at: ''
    };
    setPeriodeFromTanggal();
    ITEMS = [];
    BAHAN = [];
    build();
  }

  // go
  build();
};

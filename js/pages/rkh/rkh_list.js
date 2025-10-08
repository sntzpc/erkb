// js/pages/rkh/rkh_list.js (ENHANCED, parity with rkb_list.js)
window.Pages = window.Pages || {};
Pages.rkhList = function(which='draft'){
  const root = U.qs('#app-root');

  // ====== COMPANY NAME (ambil dari yplant berdasar plant_id/estate) ======
  let COMPANY_NAME = 'PT -';
  async function resolveCompanyName(){
    try{
      if (typeof STORE?.ensureWarm === 'function') {
        await STORE.ensureWarm();
      }
      const getM = STORE?.getMaster?.bind(STORE);
      const plants  = getM ? (getM('yplant')  || []) : [];
      const estates = getM ? (getM('yestate') || []) : [];

      // 1) dari profil
      let pid = SESSION.profile()?.plant_id;

      // 2) kalau tak ada, coba dari estate_id profil
      if(!pid){
        const eid = SESSION.profile()?.estate_id;
        if(eid){
          const est = estates.find(e => String(e.id) === String(eid));
          pid = est?.plant_id;
        }
      }

      // 3) kalau belum dapat, coba dari data yang sedang dimuat (estate_id / estate_full)
      if(!pid && Array.isArray(data) && data.length){
        const sample = data.find(r => r.estate_id || r.estate_full) || {};
        if(sample.estate_id){
          const est = estates.find(e => String(e.id) === String(sample.estate_id));
          pid = est?.plant_id;
        }else if(sample.estate_full){
          const est = estates.find(e => (e.nama_panjang || e.nama) === sample.estate_full);
          pid = est?.plant_id;
        }
      }

      // 4) fallback: jika cuma ada satu plant di master
      let plant = plants.find(p => String(p.id) === String(pid));
      if(!plant && plants.length === 1){ plant = plants[0]; }

      if(plant){
        COMPANY_NAME = plant.nama_panjang || plant.nama || COMPANY_NAME;
      }
    }catch(_){ /* biarkan default */ }
  }

  // ===== Helpers umum =====
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
  function computeHK(it){
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const BHL = base * ((Number(it.pct_bhl)||0)/100);
    const SKU = base * ((Number(it.pct_sku)||0)/100);
    const BHB = base * ((Number(it.pct_bhb)||0)/100);
    return {BHL, SKU, BHB, total: (BHL+SKU+BHB)};
  }
  function fmtN(n){ return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(n||0)); }

  // === [PATCH A1] Tambah helper format tanggal WIB dd-MM-yyyy
function fmtDateWIB_ddMMyyyy(s){
  if(!s) return '';
  const d = new Date(s);
  if(isNaN(d)) return String(s);
  const tz = 'Asia/Jakarta';
  const dd = new Intl.DateTimeFormat('id-ID',{timeZone:tz,day:'2-digit'}).format(d);
  const mm = new Intl.DateTimeFormat('id-ID',{timeZone:tz,month:'2-digit'}).format(d);
  const yy = new Intl.DateTimeFormat('id-ID',{timeZone:tz,year:'numeric'}).format(d);
  return `${dd}-${mm}-${yy}`;
}

// === [PATCH B1] Tambah ikon sederhana (samakan dengan rkb_list.js)
const ICON = {
  view:    '👁️',
  edit:    '✏️',
  del:     '🗑️',
  sync:    '✅',
  refresh: '🔁',
  resend:  '⟳',
  open:    '📄'
};


  // ====== Resolver penandatangan (parity rkb_list.js) ======
  async function resolveSignersByContext(ctx = {}){
    try{
      if (typeof STORE?.ensureWarm === 'function') {
        await STORE.ensureWarm();
      }
      const getM = STORE?.getMaster?.bind(STORE) || (()=>[]);
      const estates  = getM('yestate')  || [];   // manager: nama_mgr
      const rayons   = getM('yrayon')   || [];   // askep  : nama_askep
      const divisis  = getM('ydivisi')  || [];   // asisten: nama_asisten
      const orgMap   = getM('yorg_map') || [];
      const signersT = getM('ysigners') || getM('yorg_signers') || [];
      const prof = (typeof SESSION?.profile === 'function') ? (SESSION.profile() || {}) : {};

      const LC = v => v==null ? '' : String(v).toLowerCase();
      const eqLoose = (a,b)=> LC(a) === LC(b);

      // estateId
      let estateId =
        ctx.estate_id
        || (estates.find(e => (e.nama_panjang||e.nama) === ctx.estate_full)?.id)
        || prof.estate_id;

      const estateRow = estates.find(e =>
        eqLoose(e.id, estateId) || eqLoose(e.kode, estateId) || eqLoose(e.kd_estate, estateId)
      ) || {};

      // divisiId
      function guessDivisiId(label){
        if(!label) return null;
        const L = LC(label);
        const row = divisis.find(d =>
           eqLoose(d.id, label) || eqLoose(d.divisi_id, label)
        || eqLoose(d.kode, label) || eqLoose(d.kd_divisi, label)
        || LC(d.nama||d.nama_divisi) === L
        );
        return row?.id || row?.divisi_id || null;
      }
      let divisiId =
        ctx.divisi_id
        || guessDivisiId(ctx.divisi)
        || prof.divisi_id
        || prof.divisi;

      const divRow = divisis.find(d =>
        eqLoose(d.id, divisiId) || eqLoose(d.divisi_id, divisiId)
        || eqLoose(d.kode, divisiId) || eqLoose(d.kd_divisi, divisiId)
        || LC(d.nama||d.nama_divisi) === LC(divisiId)
      ) || {};

      // rayonId
      let rayonId =
        ctx.rayon_id
        || divRow.rayon_id
        || estateRow.rayon_id
        || prof.rayon_id;

      if(!rayonId){
        const candidates = [
          divRow.rayon, divRow.kd_rayon, divRow.kode_rayon,
          estateRow.kd_rayon, estateRow.kode_rayon,
        ].filter(Boolean);
        for(const c of candidates){
          const r = (rayons||[]).find(x =>
            eqLoose(x.id, c) || eqLoose(x.rayon_id, c)
            || eqLoose(x.kode, c) || eqLoose(x.kd_rayon, c)
            || LC(x.nama||x.nama_rayon) === LC(c)
          );
          if(r){ rayonId = r.id || r.rayon_id || r.kode || r.kd_rayon; break; }
        }
      }

      const manager = estateRow.nama_mgr || '';
      const rayonRow = rayons.find(r =>
        eqLoose(r.id, rayonId) || eqLoose(r.rayon_id, rayonId)
        || eqLoose(r.kode, rayonId) || eqLoose(r.kd_rayon, rayonId)
      ) || {};
      let askep   = rayonRow.nama_askep || '';
      let asisten = divRow.nama_asisten || '';

      if(!(manager && askep && asisten)){
        const pool = (signersT.length ? signersT : orgMap).filter(r=>{
          const okE = !estateId || eqLoose(r.estate_id, estateId);
          const okR = !rayonId  || eqLoose(r.rayon_id,  rayonId);
          const okD = !divisiId || LC(r.divisi_id||r.divisi) === LC(divisiId);
          return okE && okR && okD;
        });
        const pick = (role) => {
          const tgt = LC(role);
          return pool.find(x=>{
            const jr = LC(x.role||x.jabatan||'');
            const nj = LC(x.nama_jabatan||'');
            return jr.includes(tgt) || nj.includes(tgt);
          });
        };
        if(!askep){
          askep   = pick('askep')?.nama_lengkap || pick('askep')?.nama || askep;
        }
        if(!asisten){
          asisten = pick('asisten')?.nama_lengkap || pick('asisten')?.nama || asisten;
        }
      }
      return { asisten: asisten || '', askep: askep || '', manager: manager || '' };
    }catch(_){
      return { asisten:'', askep:'', manager:'' };
    }
  }
  function signerLine(name){
    return `(${name && String(name).trim() ? String(name).trim() : '........................'})`;
  }

  // ====== DATA SOURCE ======
  const draftKey  = 'rkh.drafts';
  const outboxKey = 'rkh.outbox';

  // Draft / Outbox → ringkasan list
  function sumHK(items){
    return (items||[]).reduce((a,it)=>{
      const base = Number(it.volume||0)*Number(it.hk_unit||0);
      return a
        + base*(Number(it.pct_bhl||0)/100)
        + base*(Number(it.pct_sku||0)/100)
        + base*(Number(it.pct_bhb||0)/100);
    }, 0);
  }

  let data = (which==='outbox')
    ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)
    : (U.S.get(draftKey,  [])||[]);

  data = (data||[]).map(r=>{
    const h = r.header || {};
    return {
      nomor: h.nomor || '',
      ref_rkb: h.ref_rkb || '',
      tanggal: h.tanggal || '',
      periode: fPeriode(h.periode || ''),
      divisi: h.divisi || h.divisi_id || '',
      divisi_id: h.divisi_id || '',
      estate_full: h.estate_full || '',
      estate_id: h.estate_id || '',
      rayon_id: h.rayon_id || '',
      status: h.status || 'created',
      hk_total: sumHK(r.items||[]),
      created_at: h.created_at || r.created_at || '',
      updated_at: h.updated_at || r.updated_at || '',
      last_error: r.last_error || '',
      items: r.items || [],
      bahan: r.bahan || [],
      __serverLinked: !!h.__serverLinked,
      _raw: r
    };
  });

  // ===== Filtering / paging =====
  function sortData(arr){
    arr.sort((a,b)=>{
      const ta = new Date(a.updated_at||a.created_at||0).getTime();
      const tb = new Date(b.updated_at||b.created_at||0).getTime();
      return (tb||0)-(ta||0);
    });
    return arr;
  }
  sortData(data);

  let page=1, pageSize=20, q='', periodeFilter='';
  const PAGE_CHOICES=[20,40,80,100];

  function uniquePeriodes(arr){
    return Array.from(new Set((arr||[]).map(x => fPeriode(x.periode)).filter(Boolean))).sort().reverse();
  }
  function applyFilter(){
    let arr = (data||[]).slice();
    if(periodeFilter) arr = arr.filter(x => fPeriode(x.periode) === String(periodeFilter));
    const qq = q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=>{
        return [r.nomor, fPeriode(r.periode), r.divisi, r.estate_full, r.status, r.ref_rkb]
          .some(v=> String(v||'').toLowerCase().includes(qq));
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

  // ====== Resolver nama actuals untuk RKH (items/bahan) ======
  let ACT_KEYS = { items: 'rkh_items', bahan: 'rkh_bahan' };
  async function resolveActualNames(){
    try{
      if (typeof STORE?.ensureWarm === 'function') {
        await STORE.ensureWarm();
      }
      const tryKeysItems = ['rkh_items','rkh_item','rkh_detail_items','rkh_details','rkh_detail','RKH_ITEMS','RKH_ITEM'];
      const tryKeysBahan = ['rkh_bahan','rkh_material','rkh_bhn','rkh_bahan_items','RKH_BAHAN','RKH_MATERIAL'];

      for (const k of tryKeysItems){
        const v = STORE.getActual?.(k);
        if (Array.isArray(v) && v.length){ ACT_KEYS.items = k; break; }
      }
      for (const k of tryKeysBahan){
        const v = STORE.getActual?.(k);
        if (Array.isArray(v) && v.length){ ACT_KEYS.bahan = k; break; }
      }
    }catch(_){}
  }

  // Inflate items+bahan dari cache actuals (untuk nomor tertentu) — bila draft tak punya detail
  async function detailFromActuals(nomor){
    try{
      await resolveActualNames();
      const itemsAll = STORE.getActual?.(ACT_KEYS.items) || [];
      const bahanAll = STORE.getActual?.(ACT_KEYS.bahan) || [];

      const rowsI = itemsAll.filter(i => String(i.nomor)===String(nomor));
      const bahanByIdx = {};
      bahanAll.filter(b => String(b.nomor)===String(nomor)).forEach(b=>{
        const k = String(b.item_idx||'');
        (bahanByIdx[k] = bahanByIdx[k] || []).push({
          item_idx: Number(b.item_idx||0),
          no_material: String(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no ?? ''),
          nama: b.nama || '',
          jumlah: Number(b.jumlah||0),
          satuan: b.satuan || ''
        });
      });

      const items = rowsI.map(r=>{
        const row = {
          idx: Number(r.idx||0),
          pekerjaan: r.pekerjaan||'',
          activity_type: r.activity_type||'',
          lokasi: r.lokasi||'', // RKH lokasi string
          volume: Number(r.volume||0),
          satuan: r.satuan||'',
          hk_unit: Number(r.hk_unit||0),
          pct_bhl: Number(r.pct_bhl||0),
          pct_sku: Number(r.pct_sku||0),
          pct_bhb: Number(r.pct_bhb||0),
          pengawas: r.pengawas||''
        };
        const hk = computeHK(row);
        return {...row, hk_bhl: hk.BHL, hk_sku: hk.SKU, hk_bhb: hk.BHB, hk_total: hk.total};
      });

      const bahan = Object.values(bahanByIdx).flat();
      return { items, bahan };
    }catch(_){ return { items:[], bahan:[] }; }
  }

  // ===== Flatten RKH rows untuk export/pdf (1 baris per item; bahan di-join per item_idx) =====
  const DETAIL_HEADERS = [
    'Activity Type','Jenis Pekerjaan','Lokasi','Volume Kerja','Satuan','HK/Unit',
    'BHL','SKU','BHB','No. Material','Nama Bahan','Jumlah','Sat. Bahan','Nama Pengawas'
  ];

  function flattenRkhRows(r){
    const items = Array.isArray(r.items) ? r.items : [];
    const bahan = Array.isArray(r.bahan) ? r.bahan : [];
    const bahanByIdx = {};
    bahan.forEach(b=>{
      const k = String(b.item_idx||'');
      (bahanByIdx[k] = bahanByIdx[k] || []).push({
        no_material: String(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no ?? ''),
        nama: b.nama || '',
        jumlah: (b.jumlah!==undefined && b.jumlah!==null) ? b.jumlah : '',
        satuan: b.satuan || ''
      });
    });

    if(!items.length){
      return [{
        'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
        'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
      }];
    }

    const MATERIAL_SEP = '\n';
    const rows = items.map((it, index)=>{
      const hk = computeHK(it);
      const bs = bahanByIdx[String(it.idx || (index+1))] || [];
      const noMat   = bs.map(b=>b.no_material).filter(Boolean).join(MATERIAL_SEP);
      const namaBhn = bs.map(b=>b.nama).filter(Boolean).join(MATERIAL_SEP);
      const jumlahB = bs.map(b=> (b.jumlah!=='' && b.jumlah!==null && b.jumlah!==undefined) ? String(b.jumlah) : '').filter(Boolean).join(MATERIAL_SEP);
      const satuanB = bs.map(b=>b.satuan).filter(Boolean).join(MATERIAL_SEP);

      return {
        'Activity Type'  : it.activity_type || it.activity || '',
        'Jenis Pekerjaan': it.pekerjaan || '',
        'Lokasi'         : it.lokasi || '',
        'Volume Kerja'   : Number(it.volume||0),
        'Satuan'         : it.satuan || '',
        'HK/Unit'        : Number(it.hk_unit||0),
        'BHL'            : Number(hk.BHL || 0),
        'SKU'            : Number(hk.SKU || 0),
        'BHB'            : Number(hk.BHB || 0),
        'No. Material'   : noMat,
        'Nama Bahan'     : namaBhn,
        'Jumlah'         : jumlahB,
        'Sat. Bahan'     : satuanB,
        'Nama Pengawas'  : it.pengawas || ''
      };
    });

    return rows.length ? rows : [{
      'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
      'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
    }];
  }

  // ===== Styles kecil (pager dll) =====
  (function ensureStyles(){
    if(document.getElementById('rkh-list-css')) return;
    const css = `
      .table-compact th, .table-compact td { white-space: nowrap; }
      .pager .page-link{cursor:pointer}
      .pager .disabled .page-link{pointer-events:none; opacity:.6}
      .icon-btn{ width:34px; height:30px; display:inline-flex; align-items:center; justify-content:center; }
      .i{font-size:16px; line-height:1;}
      @media (max-width: 768px){ .hide-sm{ display:none; } }
    `;
    const s = document.createElement('style');
    s.id='rkh-list-css'; s.textContent=css; document.head.appendChild(s);
  })();

  // ===== Build UI =====
  async function build(){
    await resolveCompanyName();
    const periodes = uniquePeriodes(data);
    root.innerHTML = `
      <div class="card shadow-sm"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h4 class="mb-0">${which==='outbox'?'Outbox RKH':'Draft RKH'}</h4>
          <div class="d-flex flex-wrap gap-2">
            ${which==='draft' ? `<button id="btn-xlsx" class="btn btn-sm btn-success">Export Excel</button>` : ''}
            ${which==='draft' ? `<button id="btn-pdf"  class="btn btn-sm btn-dark">Cetak PDF</button>` : ''}
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
              <input id="f-search" class="form-control" placeholder="nomor, periode, divisi, estate, status, ref rkb..." />
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
                <th>Nomor RKH</th>
                <th>Tanggal</th>
                <th>Periode</th>
                <th>Divisi</th>
                <th>HK (Total)</th>
                <th>Status</th>
                ${which==='outbox' ? '<th class="hide-sm">Keterangan Error</th>' : ''}
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

    // Bind top controls
    const sInput = U.qs('#f-search'); sInput.value = q;
    sInput.addEventListener('input', ()=>{ q=sInput.value; page=1; renderRows(); renderPager(); });
    U.qs('#f-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderRows(); renderPager(); };
    U.qs('#f-periode').onchange  = (e)=>{ periodeFilter=e.target.value; page=1; renderRows(); renderPager(); };
    if(which==='draft'){
      U.qs('#btn-xlsx').onclick = exportXlsx;
      U.qs('#btn-pdf').onclick  = printPdf;
    }

    renderRows(); renderPager();
  }

  // ===== Render rows/pager =====
  function renderRows(){
    const arr = applyFilter();
    const slice = getPageSlice(arr);
    const tb = U.qs('#rows');

    if(!slice.length){
      tb.innerHTML = `<tr><td colspan="${which==='outbox'?9:8}" class="text-center text-muted">Tidak ada data.</td></tr>`;
      U.qs('#info').textContent = `0 dari ${arr.length} RKH`;
      return;
    }

    tb.innerHTML = slice.map((r,idx)=>{
      const i = (page-1)*pageSize + idx;
      const hkStr = fmtN(r.hk_total);
      const btn = (name, title, action, enabled=true)=>{
  const dis = enabled ? '' : 'disabled';
  return `<button class="btn btn-outline-secondary icon-btn" title="${title}" data-a="${action}" data-nomor="${r.nomor}" data-i="${i}" ${dis}>
            <span class="i i-${name}">${ICON[name]}</span>
          </button>`;
};
      const badgeCls = String(r.status).toLowerCase()==='created' ? 'text-bg-success' : 'text-bg-secondary';
      return `<tr>
        <td>${i+1}</td>
        <td>${r.nomor||'-'}</td>
        <td>${fmtDateWIB_ddMMyyyy(r.tanggal)||'-'}</td>
        <td>${fPeriode(r.periode)||'-'}</td>
        <td>${r.divisi||'-'}</td>
        <td>${hkStr}</td>
        <td><span class="badge ${badgeCls}">${r.status||'-'}</span></td>
        ${which==='outbox' ? `<td class="hide-sm">${r.last_error||''}</td>` : ''}
        <td>
    <div class="btn-group btn-group-sm">
      ${btn('view','Lihat (detail)','view', true)}
      ${which==='draft' ? btn('edit','Edit','edit', true) : ''}
      ${which==='draft' ? btn('del','Hapus','del', !r.__serverLinked) : ''}
      ${which==='draft'
        ? btn('sync','Kirim/Sync ke server','sync', true)
        : btn('resend','Kirim Ulang','resend', true)
      }
      ${btn('open','Buka di Form','open', true)}
    </div>
  </td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('button').forEach(btn=>{
      const i = +btn.dataset.i; const a = btn.dataset.a;
      btn.onclick = ()=> handleAction(a, i);
    });

    const start=(page-1)*pageSize + 1;
    const end = start + slice.length - 1;
    U.qs('#info').textContent = `${start}–${end} dari ${arr.length} RKH`;
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
        el.onclick=()=>{ page=to; renderRows(); renderPager(); window.scrollTo({top:0,behavior:'smooth'}); };
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

  // ====== Actions ======
  async function handleAction(a, i){
    const arr = applyFilter();
    const row = arr[i];
    if(!row) return;

    if(a==='open'){
      // kirim buffer ke form
      const d = row._raw || {};
      const h = d.header || {};
      const hdr = {...h};
      hdr.__serverLinked = String(hdr.status||'').toLowerCase()==='created';
      d.header = hdr;
      U.S.set('rkh.form.buffer', d);
      location.hash = '#/rkh/form';
      return;
    }

    if(a==='view'){
      openViewModal(row._raw);
      return;
    }

    if(a==='edit'){
      U.S.set('rkh.form.buffer', row._raw);
      location.hash = '#/rkh/form';
      return;
    }

    if(a==='del' && which==='draft'){
      const all = U.S.get(draftKey, []);
      const j = all.findIndex(x => (x?.header?.nomor||'') === (row.nomor||''));
      if(j>=0){
        if(confirm('Hapus draft ini dari perangkat?')){
          all.splice(j,1); U.S.set(draftKey, all);
          data = (U.S.get(draftKey,  [])||[]).map(r=>{
            const h=r.header||{};
            return {
              nomor:h.nomor||'', ref_rkb:h.ref_rkb||'', tanggal:h.tanggal||'',
              periode:fPeriode(h.periode||''), divisi:h.divisi||h.divisi_id||'',
              estate_full:h.estate_full||'', status:h.status||'created',
              hk_total:sumHK(r.items||[]), updated_at:h.updated_at||r.updated_at||'',
              last_error:'', items:r.items||[], bahan:r.bahan||[], __serverLinked:!!h.__serverLinked, _raw:r
            };
          });
          renderRows(); renderPager();
        }
      }
      return;
    }

    if(a==='sync' && which==='draft'){
      try{
        U.progressOpen('Kirim RKH...'); U.progress(35,'Push');
        const d = row._raw || {};
        const r = await API.call('pushRKH', {
          row:  d.header || {},
          items:(d.items || []).map((it,idx)=>({
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
          bahan:(d.bahan || []).map(b=>({
            item_idx: Number(b.item_idx||0),
            no_material: String(b.no_material ?? b.kode ?? b.code ?? b.id ?? b.no ?? ''),
            nama: b.nama || '',
            jumlah: Number(b.jumlah||0),
            satuan: b.satuan || ''
          }))
        });
        if(!r.ok) throw new Error(r.error||'Gagal push');
        U.toast('Terkirim.','success');
      }catch(e){
        U.toast(e.message||e,'danger');
      }finally{
        U.progressClose(); U.progressHardClose();
      }
      return;
    }

    if(a==='resend' && which==='outbox'){
      try{
        U.progressOpen('Kirim ulang...'); U.progress(35,'Push');
        const d = row._raw || {};
        const r = await API.call('pushRKH', {
          row:  d.header || {},
          items:(d.items || []),
          bahan:(d.bahan || [])
        });
        if(r.ok){
          const all = U.S.get(outboxKey, []);
          const j = all.findIndex(x => String(x?.header?.nomor||'') === String(row.nomor||''));
          if(j>=0){ all.splice(j,1); U.S.set(outboxKey, all); }
          data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error).map(r=>{
            const h=r.header||{};
            return {
              nomor:h.nomor||'', ref_rkb:h.ref_rkb||'', tanggal:h.tanggal||'',
              periode:fPeriode(h.periode||''), divisi:h.divisi||h.divisi_id||'',
              estate_full:h.estate_full||'', status:h.status||'created',
              hk_total:sumHK(r.items||[]), updated_at:h.updated_at||r.updated_at||'',
              last_error:r.last_error||'', items:r.items||[], bahan:r.bahan||[], __serverLinked:!!h.__serverLinked, _raw:r
            };
          });
          renderRows(); renderPager();
          U.toast('Terkirim & dihapus dari Outbox.','success');
        }else{
          U.toast(r.error||'Gagal kirim ulang.','danger');
        }
      }catch(e){
        U.toast(e.message||e,'danger');
      }finally{
        U.progressClose(); U.progressHardClose();
      }
      return;
    }
  }

  // ===== View Modal =====
  function openViewModal(raw){
    const h = (raw && raw.header) || {};
    const it = (raw && raw.items) || [];
    const bh = (raw && raw.bahan) || [];
    const div = document.createElement('div');
    div.className='modal fade'; div.innerHTML=`
      <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Detail RKH · ${h.nomor||'-'}</h5>
          <button class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="small text-muted mb-2">
            Tanggal: <b>${h.tanggal||'-'}</b> · Periode: <b>${fPeriode(h.periode)||'-'}</b><br/>
            No RKH: <b>${h.nomor||'-'}</b> · Ref. RKB: <b>${h.ref_rkb||'-'}</b><br/>
            Estate: <b>${h.estate_full||'-'}</b> · Divisi: <b>${h.divisi||h.divisi_id||'-'}</b>
          </div>

          <h6>Daftar Pekerjaan</h6>
          <div class="table-responsive mb-3">
            <table class="table table-sm table-striped">
              <thead><tr>
                <th>#</th><th>Jenis Pekerjaan</th><th>Activity</th><th>Lokasi</th>
                <th class="t-right">Vol</th><th>Sat</th><th class="t-right">HK/Unit</th>
                <th class="t-right">%BHL</th><th class="t-right">%SKU</th><th class="t-right">%BHB</th>
                <th class="t-right">HK Total</th><th>Pengawas</th>
              </tr></thead>
              <tbody>
                ${it.map((r,i)=>{
                  const hk = computeHK(r);
                  return `<tr>
                    <td>${i+1}</td>
                    <td>${r.pekerjaan||''}</td>
                    <td>${r.activity_type||''}</td>
                    <td>${r.lokasi||''}</td>
                    <td class="t-right">${fmtN(r.volume||0)}</td>
                    <td>${r.satuan||''}</td>
                    <td class="t-right">${fmtN(r.hk_unit||0)}</td>
                    <td class="t-right">${fmtN(r.pct_bhl||0)}</td>
                    <td class="t-right">${fmtN(r.pct_sku||0)}</td>
                    <td class="t-right">${fmtN(r.pct_bhb||0)}</td>
                    <td class="t-right">${fmtN(hk.total)}</td>
                    <td>${r.pengawas||''}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <h6>Bahan</h6>
          <div class="table-responsive">
            <table class="table table-sm table-striped">
              <thead><tr><th>#</th><th>item_idx</th><th>No. Material</th><th>Nama</th><th class="t-right">Jumlah</th><th>Sat</th></tr></thead>
              <tbody>
                ${(bh||[]).map((b,i)=>`<tr>
                  <td>${i+1}</td><td>${b.item_idx||''}</td><td>${b.no_material||''}</td>
                  <td>${b.nama||''}</td><td class="t-right">${fmtN(b.jumlah||0)}</td><td>${b.satuan||''}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
        </div>
      </div></div>`;
    document.body.appendChild(div);
    const m=new bootstrap.Modal(div); m.show();
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }

  // === PATCH D: Resolver actuals & inflater detail RKH (letakkan di bawah ACTIONS atau sebelum export/print) ===
let RKH_ACT_KEYS = { header:'rkh', items:'rkh_items', bahan:'rkh_bahan' };

async function resolveRkhActualNames(){
  try{
    if (typeof STORE?.ensureWarm === 'function') await STORE.ensureWarm();
    const tryH = ['rkh','rkh_header','rkh_headers'];
    const tryI = ['rkh_items','rkh_item','rkh_detail_items','rkh_details','rkh_detail'];
    const tryB = ['rkh_bahan','rkh_material','rkh_bhn','rkh_bahan_items'];

    for(const k of tryH){ const v = STORE.getActual?.(k); if(Array.isArray(v) && v.length){ RKH_ACT_KEYS.header=k; break; } }
    for(const k of tryI){ const v = STORE.getActual?.(k); if(Array.isArray(v) && v.length){ RKH_ACT_KEYS.items =k; break; } }
    for(const k of tryB){ const v = STORE.getActual?.(k); if(Array.isArray(v) && v.length){ RKH_ACT_KEYS.bahan =k; break; } }
  }catch(_){}
}

async function detailFromActuals(nomor){
  try{
    await resolveRkhActualNames();
    const itemsAll = STORE.getActual?.(RKH_ACT_KEYS.items) || [];
    const bahanAll = STORE.getActual?.(RKH_ACT_KEYS.bahan) || [];
    const its = itemsAll.filter(x => String(x.nomor)===String(nomor)).map(x=>({
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
      hk_bhl: Number(x.hk_bhl||0),
      hk_sku: Number(x.hk_sku||0),
      hk_bhb: Number(x.hk_bhb||0),
      hk_total: Number(x.hk_total||0),
      pengawas: x.pengawas||''
    }));
    const bhn = bahanAll.filter(b => String(b.nomor)===String(nomor)).map(b=>({
      item_idx: Number(b.item_idx||0),
      no_material: String(b.no_material||b.kode||b.code||b.id||''),
      nama: b.nama||'',
      jumlah: Number(b.jumlah||0),
      satuan: b.satuan||''
    }));
    return {items:its, bahan:bhn};
  }catch(_){ return {items:[], bahan:[]}; }
}

// Utility: gabungkan 1 baris per item dengan bahan- bahan item tsb
function flattenRkhRows(header, items, bahan){
  const DETAIL_HEADERS = [
    'Activity Type','Jenis Pekerjaan','Lokasi','Volume Kerja','Satuan','HK/Unit',
    'BHL','SKU','BHB','No. Material','Nama Bahan','Jumlah','Sat. Bahan','Nama Pengawas'
  ];
  const rows = (items||[]).map(it=>{
    const listB = (bahan||[]).filter(b=> Number(b.item_idx||0) === Number(it.idx||0));
    const sep = '\n';
    const noMat   = listB.map(b=> b.no_material).filter(Boolean).join(sep);
    const nmBahan = listB.map(b=> b.nama).filter(Boolean).join(sep);
    const jmlBhn  = listB.map(b=> (b.jumlah===0 || b.jumlah) ? String(b.jumlah) : '').filter(Boolean).join(sep);
    const satBhn  = listB.map(b=> b.satuan).filter(Boolean).join(sep);
    return {
      'Activity Type'  : it.activity_type||'',
      'Jenis Pekerjaan': it.pekerjaan||'',
      'Lokasi'         : it.lokasi||'',
      'Volume Kerja'   : Number(it.volume||0),
      'Satuan'         : it.satuan||'',
      'HK/Unit'        : Number(it.hk_unit||0),
      'BHL'            : Number(it.hk_bhl||0),
      'SKU'            : Number(it.hk_sku||0),
      'BHB'            : Number(it.hk_bhb||0),
      'No. Material'   : noMat,
      'Nama Bahan'     : nmBahan,
      'Jumlah'         : jmlBhn,
      'Sat. Bahan'     : satBhn,
      'Nama Pengawas'  : it.pengawas||''
    };
  });
  return {DETAIL_HEADERS, rows};
}


  // ===== Export Excel (one sheet per RKH) =====
  function colLetter(n){
    let s=''; n = n + 1;
    while(n>0){ let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
    return s;
  }
  async function exportXlsx(){
  if (typeof XLSX === 'undefined'){ U.toast('Library XLSX belum tersedia.','warning'); return; }
  const arr = applyFilter(); if(!arr.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }

  const wb = XLSX.utils.book_new();
  for (let idx=0; idx<arr.length; idx++){
  const r = arr[idx];
  let items = (r._raw?.items)||[];
  let bahan = (r._raw?.bahan)||[];

  if(!(items && items.length)){
    const det = await detailFromActuals(r.nomor);
    items = det.items; bahan = det.bahan;
  } else if(!(bahan && bahan.length)){
    const det = await detailFromActuals(r.nomor);
    if(det.bahan && det.bahan.length) bahan = det.bahan;
  }

  const {DETAIL_HEADERS, rows} = flattenRkhRows(r._raw?.header||{}, items, bahan);

  const headerBlock = [
    ['RENCANA KERJA HARIAN'],
    [`Tanggal: ${fmtDateWIB_ddMMyyyy(r.tanggal)}`],
    [`Periode: ${r.periode||'-'}`, `Divisi: ${r.divisi||'-'}`],
    [`No. RKH: ${r.nomor||'-'}`, `Ref. RKB: ${(r._raw?.header?.ref_rkb)||'-'}`],
    [],
    DETAIL_HEADERS
  ];
  const detailData = rows.map(o => DETAIL_HEADERS.map(h => o[h]));
  const aoa = headerBlock.concat(detailData);

  // >>> Deklarasi sign sebelum dipakai
  let sign = { asisten: '' };
  try{
    sign = await resolveSignersByContext({
      estate_id: r.estate_id,
      rayon_id : r.rayon_id,
      divisi_id: r.divisi_id,
      divisi   : r.divisi,
      estate_full: r.estate_full
    }) || { asisten: '' };
  }catch(_){}

  // Tanda tangan Asisten
  aoa.push([]);
  aoa.push(['Asisten']);
  aoa.push([ signerLine(sign.asisten) ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

    // wrap kolom multiline
    const WRAP_HEADERS = ['Lokasi','No. Material','Nama Bahan','Sat. Bahan'];
    const wrapIdx = WRAP_HEADERS.map(h => DETAIL_HEADERS.indexOf(h)).filter(i=>i>=0);
    const dataStart = headerBlock.length + 1; // 1-based
    const dataEnd   = dataStart + (detailData.length||0) - 1;
    const colLetter = (n)=>{ let s=''; n=n+1; while(n>0){let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s; };
    for(const ci of wrapIdx){
      const col = colLetter(ci);
      for(let rr=dataStart; rr<=dataEnd; rr++){
        const addr = `${col}${rr}`; if(ws[addr]){
          ws[addr].s = Object.assign({}, ws[addr].s||{}, { alignment:{ wrapText:true, vertical:'top' } });
        }
      }
    }
    ws['!cols'] = [
      {wch:10},{wch:24},{wch:22},{wch:12},{wch:8},{wch:10},
      {wch:10},{wch:10},{wch:10},{wch:14},{wch:24},{wch:10},{wch:10},{wch:16}
    ];

    let sname = (r.nomor||`RKH${idx+1}`).replace(/[\\/?*\[\]]/g,'');
    if(sname.length>31) sname = sname.slice(-31);
    XLSX.utils.book_append_sheet(wb, ws, sname || `RKH${idx+1}`);
  }
  XLSX.writeFile(wb, `RKH_Detail_${periodeFilter||'ALL'}.xlsx`);
}

  // ===== Cetak PDF (one page per RKH) =====
  async function printPdf(){
  const arr = applyFilter(); if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

  const sections = await Promise.all(arr.map(async (r)=>{
  let items = (r._raw?.items)||[];
  let bahan = (r._raw?.bahan)||[];

  // Inflate bila kosong
  if(!(items && items.length)){
    const det = await detailFromActuals(r.nomor);
    items = det.items; bahan = det.bahan;
  } else if(!(bahan && bahan.length)){
    const det = await detailFromActuals(r.nomor);
    if(det.bahan && det.bahan.length) bahan = det.bahan;
  }

  // >>> PENTING: deklarasikan sign DI SINI (dalam callback dan sebelum dipakai)
  let sign = { asisten: '' };
  try{
    sign = await resolveSignersByContext({
      estate_id: r.estate_id,
      rayon_id : r.rayon_id,
      divisi_id: r.divisi_id,
      divisi   : r.divisi,
      estate_full: r.estate_full
    }) || { asisten: '' };
  }catch(_){ /* biarkan default */ }

  const {DETAIL_HEADERS, rows} = flattenRkhRows(r._raw?.header||{}, items, bahan);

  const fmtJumlah = (s)=> String(s??'').split('\n').map(t=>t.trim() ? U.fmt.id0(t) : '').join('\n');
  const bodyRows = rows.map(obj => `
    <tr>
      <td>${obj['Activity Type']||''}</td>
      <td>${obj['Jenis Pekerjaan']||''}</td>
      <td class="wrap">${U.htmlBR(obj['Lokasi']||'')}</td>
      <td class="num t-right">${U.fmt.id2(obj['Volume Kerja']||0)}</td>
      <td class="num">${obj['Satuan']||''}</td>
      <td class="num t-right">${U.fmt.id2(obj['HK/Unit']||0)}</td>
      <td class="num t-right">${U.fmt.id2(obj['BHL']||0)}</td>
      <td class="num t-right">${U.fmt.id2(obj['SKU']||0)}</td>
      <td class="num t-right">${U.fmt.id2(obj['BHB']||0)}</td>
      <td class="wrap">${U.htmlBR(obj['No. Material']||'')}</td>
      <td class="wrap">${U.htmlBR(obj['Nama Bahan']||'')}</td>
      <td class="num t-right">${U.htmlBR(fmtJumlah(obj['Jumlah']))}</td>
      <td class="num">${U.htmlBR(obj['Sat. Bahan']||'')}</td>
      <td>${obj['Nama Pengawas']||''}</td>
    </tr>
  `).join('');

  const refRkb = (r._raw?.header?.ref_rkb)||'-';
  return `
  <section class="page">
    <div class="hdr">
      <div class="hdr-left">
        <div class="title">RENCANA KERJA HARIAN</div>
        <table class="meta">
          <tr><td>Tanggal</td><td>:</td><td>${fmtDateWIB_ddMMyyyy(r.tanggal)}</td></tr>
          <tr><td>Periode</td><td>:</td><td>${r.periode||'-'}</td></tr>
          <tr><td>Divisi</td><td>:</td><td>${r.divisi||'-'}</td></tr>
          <tr><td>No. RKH</td><td>:</td><td>${r.nomor||'-'}</td></tr>
          <tr><td>Ref. RKB</td><td>:</td><td>${refRkb}</td></tr>
        </table>
      </div>

      <table class="signbox">
        <tr><th>Dibuat</th></tr>
        <tr><td class="nm">${(sign.asisten||'ASISTEN').toUpperCase()}</td></tr>
        <tr><td class="lbl" style="height:46px;">TTD:</td></tr>
        <tr><td class="role">${signerLine(sign.asisten)}</td></tr>
      </table>
    </div>

    <table class="grid">
      <colgroup>
        <col style="width:7%;">
        <col style="width:16%;">
        <col style="width:10%;">
        <col style="width:6%;">
        <col style="width:5%;">
        <col style="width:6%;">
        <col style="width:6%;">
        <col style="width:6%;">
        <col style="width:6%;">
        <col style="width:9%;">
        <col style="width:14%;">
        <col style="width:6%;">
        <col style="width:5%;">
        <col style="width:8%;">
      </colgroup>
      <thead>
        <tr class="h1">
          <th rowspan="2">Activity<br/>Type</th>
          <th rowspan="2">Jenis Pekerjaan</th>
          <th rowspan="2">Lokasi</th>
          <th colspan="2">Volume Kerja</th>
          <th colspan="4">HK / Borongan</th>
          <th colspan="4">Bahan</th>
          <th rowspan="2">Nama<br/>Pengawas</th>
        </tr>
        <tr class="h2">
          <th>Jumlah</th><th>Unit</th>
          <th>HK/UNIT</th><th>BHL</th><th>SKU</th><th>BHB</th>
          <th>No Material</th><th>Nama</th><th>Jumlah</th><th>Satuan</th>
        </tr>
      </thead>
      <tbody>${bodyRows || `<tr><td colspan="14" class="muted">Tidak ada detail.</td></tr>`}</tbody>
    </table>

    <div class="printed">Dicetak: ${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short'}).format(new Date())}</div>
  </section>`;
}));

  const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>RKH ${periodeFilter||'Semua'}</title>
<style>
  @page{ size:A4; margin:10mm 10mm 12mm 10mm; }
  *{ box-sizing:border-box; }
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#000; }
  .page{ page-break-after: always; }
  .hdr{ display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:8px; }
  .title{ font-size:16px; font-weight:700; margin:0 0 8px 0; letter-spacing:.3px; }
  .meta{ border-collapse:collapse; font-size:12px; }
  .meta td{ padding:1px 4px; }

  .signbox{ border-collapse:collapse; width:240px; table-layout:fixed; font-size:12px; }
  .signbox th, .signbox td{ border:1px solid #000; padding:6px 8px; vertical-align:top; }
  .signbox th{ text-align:center; font-weight:700; background:#f4f4f4; }
  .signbox .nm{ height:28px; font-weight:700; text-align:center; }
  .signbox .lbl{ height:38px; text-align:center; }
  .signbox .role{ text-align:center; }

  .grid{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .grid th, .grid td{ border:1px solid #000; padding:6px 6px; font-size:11px; vertical-align:top; }
  .grid thead .h1 th{ background:#f2f2f2; text-align:center; font-weight:700; }
  .grid thead .h2 th{ background:#f2f2f2; text-align:center; font-weight:700; }
  .grid thead { display: table-header-group; }
  .grid tr { page-break-inside: avoid; break-inside: avoid; }
  .grid td.wrap{ white-space:pre-wrap; word-break:break-word; }
  .grid td.num { font-variant-numeric: tabular-nums; white-space:nowrap; }
  .t-right{ text-align:right; }
  .muted{ color:#666; }
  .printed{ margin-top:6px; font-size:10px; color:#444; }
</style></head><body>
${sections.join('\n')}
<script>window.print();</script>
</body></html>`;
  const w = window.open('', '_blank'); w.document.write(html); w.document.close();
}

  // go
  build();
};

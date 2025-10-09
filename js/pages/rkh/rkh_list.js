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

  function readDraftSummaries(){
    const rows = U.S.get(draftKey, []) || [];
    return rows.map(r=>{
      const h = r.header || {};
      let hk = Number(h.hk_total || 0);
      if (!hk) {
        hk = (r.items||[]).reduce((a,it)=>{
            const base=(+it.volume||0)*(+it.hk_unit||0);
            return a + base*((+it.pct_bhl||0)/100) + base*((+it.pct_sku||0)/100) + base*((+it.pct_bhb||0)/100);
            }, 0);
        }
      return {
        nomor       : h.nomor || '',
        ref_rkb     : h.ref_rkb || '',
        tanggal     : h.tanggal || '',
        periode     : fPeriode(h.periode || ''),
        divisi      : h.divisi || h.divisi_id || '',
        divisi_id   : h.divisi_id || '',
        estate_full : h.estate_full || '',
        estate_id   : h.estate_id || '',
        rayon_id    : h.rayon_id || '',
        status      : h.status || 'draft',
        hk_total    : hk,
        created_at  : h.created_at || r.created_at || '',
        updated_at  : h.updated_at || r.updated_at || '',
        last_error  : r.last_error || '',
        items       : r.items || [],
        bahan       : r.bahan || [],
        __serverLinked: !!h.__serverLinked,
        __history   : false,
        _raw        : r
      };
    });
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
  async function resolveSignersByContext(ctx = {}){ /* (tidak berubah) */ 
    try{
      if (typeof STORE?.ensureWarm === 'function') {
        await STORE.ensureWarm();
      }
      const getM = STORE?.getMaster?.bind(STORE) || (()=>[]);
      const estates  = getM('yestate')  || [];
      const rayons   = getM('yrayon')   || [];
      const divisis  = getM('ydivisi')  || [];
      const orgMap   = getM('yorg_map') || [];
      const signersT = getM('ysigners') || getM('yorg_signers') || [];
      const prof = (typeof SESSION?.profile === 'function') ? (SESSION.profile() || {}) : {};

      const LC = v => v==null ? '' : String(v).toLowerCase();
      const eqLoose = (a,b)=> LC(a) === LC(b);

      let estateId =
        ctx.estate_id
        || (estates.find(e => (e.nama_panjang||e.nama) === ctx.estate_full)?.id)
        || prof.estate_id;

      const estateRow = estates.find(e =>
        eqLoose(e.id, estateId) || eqLoose(e.kode, estateId) || eqLoose(e.kd_estate, estateId)
      ) || {};

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

  function sumHK(items){
    return (items||[]).reduce((a,it)=>{
      const base = Number(it.volume||0)*Number(it.hk_unit||0);
      return a
        + base*(Number(it.pct_bhl||0)/100)
        + base*(Number(it.pct_sku||0)/100)
        + base*(Number(it.pct_bhb||0)/100);
    }, 0);
  }

  // >>> Penting: JANGAN isi data pakai await di luar fungsi. Biarkan build() yang ngurus.
  let data = [];

  // ===== Filtering / paging =====
  function sortData(arr){
    arr.sort((a,b)=>{
      const ta = new Date(a.updated_at||a.created_at||0).getTime();
      const tb = new Date(b.updated_at||b.created_at||0).getTime();
      return (tb||0)-(ta||0);
    });
    return arr;
  }

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
    // 1) Hitung data list dulu
    if (which === 'outbox') {
      data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error).map(r=>{
        const h=r.header||{};
        return {
          nomor:h.nomor||'', ref_rkb:h.ref_rkb||'', tanggal:h.tanggal||'',
          periode:fPeriode(h.periode||''), divisi:h.divisi||h.divisi_id||'',
          divisi_id:h.divisi_id||'', estate_full:h.estate_full||'', estate_id:h.estate_id||'',
          rayon_id:h.rayon_id||'',
          status:h.status||'draft',
          hk_total:(r.items||[]).reduce((a,it)=>{
            const base=(+it.volume||0)*(+it.hk_unit||0);
            return a + base*((+it.pct_bhl||0)/100) + base*((+it.pct_sku||0)/100) + base*((+it.pct_bhb||0)/100);
          },0),
          created_at:h.created_at||r.created_at||'',
          updated_at:h.updated_at||r.updated_at||'',
          last_error:r.last_error||'',
          items:r.items||[], bahan:r.bahan||[],
          __serverLinked:!!h.__serverLinked, __history:false, _raw:r
        };
      });
    } else {
      const drafts  = readDraftSummaries();
      const history = await readHistoryFromActuals();
      data = mergeUniqueByNomor(drafts, history);
    }

    // 2) Baru resolve nama perusahaan (bisa memakai sample dari data)
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
                ${which==='draft' ? '<th>Ref. No RKB</th>' : ''}
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
    await fillMissingHKTotals();
    renderRows(); renderPager();
  }

  async function fillMissingHKTotals(){
  const zeroes = (data||[]).filter(r=> !Number(r.hk_total) && r.nomor);
  if(!zeroes.length) return;
  try{
    await resolveRkhActualNames();
    const itemsAll = STORE.getActual?.(RKH_ACT_KEYS.items) || [];
    const byNomor = new Map();
    itemsAll.forEach(x=>{
      const no = String(x.nomor||'');
      const base = Number(x.volume||0) * Number(x.hk_unit||0);
      const bhl = base * (Number(x.pct_bhl||0)/100);
      const sku = base * (Number(x.pct_sku||0)/100);
      const bhb = base * (Number(x.pct_bhb||0)/100);
      const tot = (bhl+sku+bhb) || Number(x.hk_total||0) || 0;
      byNomor.set(no, (byNomor.get(no)||0) + tot);
    });
    let changed=false;
    data.forEach(r=>{
      if(!Number(r.hk_total) && byNomor.has(String(r.nomor))){
        r.hk_total = byNomor.get(String(r.nomor));
        changed = true;
      }
    });
    if(changed){ renderRows(); renderPager(); }
  }catch(_){ /* diamkan */ }
}


  // ===== Render rows/pager =====
  function renderRows(){ /* (tidak berubah) */ 
    const arr = applyFilter();
    const slice = getPageSlice(arr);
    const tb = U.qs('#rows');

    if(!slice.length){
      const baseCols = 8;
      const plusDraft = (which==='draft') ? 1 : 0;
      const plusOutbx = (which==='outbox') ? 1 : 0;
      const COLS = baseCols + plusDraft + plusOutbx;

      tb.innerHTML = `<tr><td colspan="${COLS}" class="text-center text-muted">Tidak ada data.</td></tr>`;
      U.qs('#info').textContent = `0 dari ${arr.length} RKH`;
      return;
    }

    tb.innerHTML = slice.map((r,idx)=>{
      const i = (page-1)*pageSize + idx;
      const hkStr = fmtN(r.hk_total);
      const btn = (name, title, action, enabled=true)=>{
          const dis = enabled ? '' : 'disabled';
          return `<button class="btn btn-outline-secondary icon-btn" title="${title}" data-a="${action}" data-i="${i}" ${dis}>
                  <span class="i i-${name}">${ICON[name]}</span>
                  </button>`;
      };
      const isCreated = String(r.status).toLowerCase()==='created';

      return `<tr>
          <td>${i+1}</td>
          <td>${r.nomor||'-'}</td>
          <td>${fmtDateWIB_ddMMyyyy(r.tanggal)||'-'}</td>
          <td>${fPeriode(r.periode)||'-'}</td>
          <td>${r.divisi||'-'}</td>
          ${which==='draft' ? `<td>${r.ref_rkb || '-'}</td>` : ''}
          <td>${hkStr}</td>
          <td><span class="badge ${isCreated?'text-bg-success':'text-bg-secondary'}">${r.status||'-'}</span>
          ${r.__history ? '<span class="badge text-bg-info ms-1">server</span>' : (r.__serverLinked ? '<span class="badge text-bg-primary ms-1">server</span>' : '')}</td>
          ${which==='outbox' ? `<td class="hide-sm">${r.last_error||''}</td>` : ''}
          <td>
          <div class="btn-group btn-group-sm">
          ${btn('view','Lihat (detail)','view', true)}
          ${which==='draft' ? btn('edit','Edit','edit', !isCreated) : ''}
          ${which==='draft' ? btn('del','Hapus','del', !isCreated && !r.__serverLinked) : ''}
          ${which==='draft' ? btn('sync','Kirim/Sync ke server','sync', !isCreated) : btn('resend','Kirim Ulang','resend', true)}
          ${btn('open','Buka di Form','open', true)}
          ${btn('refresh','Perbarui Status','refresh', true)}
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

  function renderPager(){ /* (tidak berubah) */ 
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

  // === [PATCH E1] Converter draft -> form buffer (tetap)
  function _lokasiToArray(lok) { /* ... */ 
    if (Array.isArray(lok)) return lok;
    const s = String(lok || '').trim();
    if (!s) return [];
    return s.split(',').map(x => x.trim()).filter(Boolean).map(name => ({ type:'', name, luas: undefined }));
  }
  function _num(n){ const v = Number(n); return Number.isFinite(v) ? v : 0; }

  function draftToFormBuffer(rawDraft){ /* ... (tetap seperti versi Anda) ... */ 
    const h = (rawDraft && rawDraft.header) || {};
    const items = (rawDraft.items || []).map((it, idx) => {
      const out = {
        pekerjaan: it.pekerjaan || '',
        activity_type: it.activity_type || it.activity || '',
        lokasi: _lokasiToArray(it.lokasi),
        volume: _num(it.volume),
        satuan: String(it.satuan || ''),
        hk_unit: _num(it.hk_unit),
        pct_bhl: _num(it.pct_bhl),
        pct_sku: _num(it.pct_sku),
        pct_bhb: _num(it.pct_bhb),
        pengawas: String(it.pengawas || ''),
        bahan: Array.isArray(it.bahan) ? it.bahan.map(b => ({
          nama: String(b.nama || ''),
          no_material: String(b.no_material || b.kode || b.code || b.id || b.no || ''),
          jumlah: _num(b.jumlah),
          satuan: String(b.satuan || '')
        })) : []
      };
      out.hk  = computeHK(out);
      out.idx = _num(it.idx) || (idx+1);
      return out;
    });

    const F = {
      nomor: String(h.nomor || ''),
      tanggal: String(h.tanggal || ''),
      periode: String(h.periode || ''),
      ref_rkb: String(h.ref_rkb || ''),
      divisi: String(h.divisi || h.divisi_id || ''),
      estate_full: String(h.estate_full || ''),
      divisi_id: String(h.divisi_id || ''),
      estate_id: String(h.estate_id || ''),
      rayon_id: String(h.rayon_id || ''),
      items
    };
    F.__serverLinked = !!h.__serverLinked;
    F.__fromListEdit = true;
    return F;
  }

  // ===== Actions =====
  async function handleAction(a, i){ /* (isi tetap, tidak perlu perubahan) */ 
    const arr = applyFilter();
    const row = arr[i];
    if(!row) return;

    if (a === 'open') {
      const fb = draftToFormBuffer(row._raw || {});
      U.S.set('rkh.form.buffer', fb);
      location.hash = '#/rkh/form';
      return;
    }

    if (a === 'view') {
      openViewModal(row._raw);
      return;
    }

    if (a === 'edit') {
      const fb = draftToFormBuffer(row._raw || {});
      U.S.set('rkh.form.buffer', fb);
      location.hash = '#/rkh/form';
      return;
    }

    if(a==='del' && which==='draft'){ /* ... (tetap) ... */ 
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

    if(a==='sync' && which==='draft'){ /* ... (tetap) ... */ 
      try{
        U.progressOpen('Kirim RKH...'); U.progress(35,'Push');

        const all = U.S.get(draftKey, []) || [];
        const idxLocal = all.findIndex(x => 
          String(x?.header?.nomor||'') === String(row.nomor||'') &&
          String(x?.header?.tanggal||'') === String(row.tanggal||'')
        );
        const raw = (idxLocal>=0 ? all[idxLocal] : row._raw) || {};
        const h   = raw.header || {};
        let items = Array.isArray(raw.items) ? raw.items : [];
        let bahan = Array.isArray(raw.bahan) ? raw.bahan : [];

        const lokasiToString = (lok)=> {
          if(Array.isArray(lok)) return lok.map(x=>x?.name||x).filter(Boolean).join(', ');
          return String(lok||'');
        };

        if(!bahan.length){
          (items||[]).forEach((it, idxIt)=>{
            (it.bahan||[]).forEach(b=>{
              bahan.push({
                item_idx: idxIt+1,
                no_material: String(b.no_material || b.kode || b.code || b.id || b.no || ''),
                nama: String(b.nama||''),
                jumlah: Number(b.jumlah||0),
                satuan: String(b.satuan||'')
              });
            });
          });
        }

        const req = {
          row:  h,
          items: (items||[]).map((it, idxIt)=>({
            idx: it.idx || (idxIt+1),
            pekerjaan: it.pekerjaan||'',
            activity_type: it.activity_type||'',
            lokasi: lokasiToString(it.lokasi),
            volume: Number(it.volume||0),
            satuan: it.satuan||'',
            hk_unit: Number(it.hk_unit||0),
            pct_bhl: Number(it.pct_bhl||0),
            pct_sku: Number(it.pct_sku||0),
            pct_bhb: Number(it.pct_bhb||0),
            pengawas: it.pengawas||''
          })),
          bahan: (bahan||[]).map(b=>({
            item_idx: Number(b.item_idx||0),
            no_material: String(b.no_material || b.kode || b.code || b.id || b.no || ''),
            nama: b.nama || '',
            jumlah: Number(b.jumlah||0),
            satuan: b.satuan || ''
          }))
        };

        const resp = await API.call('pushRKH', req);
        if(!resp?.ok) throw new Error(resp?.error || 'Gagal push');

        if(idxLocal>=0){
          all[idxLocal].header.status = 'created';
          all[idxLocal].header.__serverLinked = true;
          all[idxLocal].header.updated_at = new Date().toISOString();
          if(resp.nomor){ all[idxLocal].header.nomor = resp.nomor; }
          U.S.set(draftKey, all);
        }

        data = (U.S.get(draftKey,  [])||[]).map(r=>{
          const h=r.header||{};
          return {
            nomor:h.nomor||'', ref_rkb:h.ref_rkb||'', tanggal:h.tanggal||'',
            periode:fPeriode(h.periode||''), divisi:h.divisi||h.divisi_id||'',
            divisi_id:h.divisi_id||'', estate_full:h.estate_full||'', estate_id:h.estate_id||'',
            rayon_id:h.rayon_id||'',
            status:h.status||'draft',
            hk_total:sumHK(r.items||[]), updated_at:h.updated_at||r.updated_at||'',
            last_error:'', items:r.items||[], bahan:r.bahan||[], __serverLinked:!!h.__serverLinked, _raw:r
          };
        });
        renderRows(); renderPager();

        U.toast('RKH tersinkron ke server. Status berubah menjadi CREATED.','success');
      }catch(e){
        U.toast(e.message||e,'danger');
      }finally{
        U.progressClose(); U.progressHardClose();
      }
      return;
    }

    if (a === 'refresh') { /* ... (tetap) ... */ 
      try{
        U.progressOpen('Perbarui status...'); U.progress(30,'Ambil status');
        const resp = await API.call('pullMaster', {});
        if(resp?.ok && resp.actuals?.rkh){
          const found = (resp.actuals.rkh||[]).find(x => String(x.nomor)===String(row.nomor));
          if(found){
            if (which === 'outbox') {
              const all = U.S.get(outboxKey, []);
              const j = all.findIndex(x => String(x?.header?.nomor||'') === String(row.nomor||''));
              if(j>=0){ all.splice(j,1); U.S.set(outboxKey, all); }
              data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error);
            } else {
              const all = U.S.get(draftKey, [])||[];
              const j = all.findIndex(x => String(x?.header?.nomor||'') === String(row.nomor||''));
              if(j>=0){
                all[j].header.status = found.status || all[j].header.status;
                all[j].header.updated_at = new Date().toISOString();
                all[j].header.__serverLinked = true;
                U.S.set(draftKey, all);
              }
              const drafts  = readDraftSummaries();
              const history = await readHistoryFromActuals();
              data = mergeUniqueByNomor(drafts, history);
            }
            sortData(data); renderRows(); renderPager();
            U.toast('Status diperbarui.','info');
          }else{
            U.toast('Nomor tidak ditemukan pada scope server Anda.','warning');
          }
        }else{
          U.toast('Gagal ambil status dari server.','danger');
        }
      }finally{
        U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 220);
      }
      return;
    }

    if(a==='resend' && which==='outbox'){ /* ... (tetap) ... */ 
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
async function openViewModal(raw){
  const h0 = (raw && raw.header) || {};
  const nomor = String(h0.nomor || raw?.nomor || '');
  let items = Array.isArray(raw?.items) ? raw.items : [];
  let bahan = Array.isArray(raw?.bahan) ? raw.bahan : [];

  // Jika draft/history tidak menyertakan detail → ambil dari STORE actual
  if (!items.length || !bahan.length) {
    try {
      const det = await detailFromActuals(nomor);
      if (!items.length) items = det.items || [];
      if (!bahan.length) bahan = det.bahan || [];
    } catch (e) {
      console.warn('Gagal ambil detail actuals:', e);
    }
  }

  // Helper angka 0 -> '-' else 2 desimal
  function fmtDash(n){
    const v = Number(n);
    if(!isFinite(v) || Math.abs(v) < 1e-12) return '-';
    return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2, maximumFractionDigits:2}).format(v);
  }

  // Normalisasi data tabel
  const itemsNorm = normalizeItemsForExport(items);
  const bahanNorm = normalizeBahanForExport(bahan);

  // Kelompokkan bahan per item_idx
  const bahanByIdx = {};
  (bahanNorm||[]).forEach(b=>{
    const k = String(Number(b.item_idx||0));
    (bahanByIdx[k] = bahanByIdx[k] || []).push(b);
  });

  // Build modal
  const div = document.createElement('div');
  div.className='modal fade';
  div.innerHTML = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Detail RKH · ${h0.nomor||'-'}</h5>
          <button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <style>
            .t-right{ text-align:right; }
            .muted{ color:#666; }
            .toggle-bhn.btn{ --bs-btn-padding-y:.15rem; --bs-btn-padding-x:.45rem; --bs-btn-font-size:.8rem; line-height:1; width:28px; text-align:center; }
            tr.bhn-row{ display:none; } tr.bhn-row.open{ display:table-row; }
            tr.bhn-row td{ background:#f9fafb; border-top:0; }
            .table-bahan{ width:100%; border-collapse:collapse; }
            .table-bahan th, .table-bahan td{ border:1px solid #dee2e6; padding:6px; font-size:.9rem; }
            .table-bahan th{ background:#f3f4f6; }
          </style>

          <div class="small text-muted mb-2">
            Tanggal: <b>${fmtDateWIB_ddMMyyyy(h0.tanggal)||'-'}</b> · Periode: <b>${fPeriode(h0.periode)||'-'}</b><br/>
            No RKH: <b>${h0.nomor||'-'}</b> · Ref. RKB: <b>${h0.ref_rkb||'-'}</b><br/>
            Estate: <b>${h0.estate_full||'-'}</b> · Divisi: <b>${h0.divisi||h0.divisi_id||'-'}</b>
          </div>

          <h6>Daftar Pekerjaan</h6>
          <div class="table-responsive mb-1">
            <table class="table table-sm table-striped align-middle">
              <thead>
                <tr>
                  <th style="width:62px">#</th>
                  <th>Jenis Pekerjaan</th>
                  <th>Activity</th>
                  <th>Lokasi</th>
                  <th class="t-right">Vol</th>
                  <th>Sat</th>
                  <th class="t-right">HK/Unit</th>
                  <th class="t-right">%BHL</th>
                  <th class="t-right">%SKU</th>
                  <th class="t-right">%BHB</th>
                  <th class="t-right">HK Total</th>
                  <th>Pengawas</th>
                </tr>
              </thead>
              <tbody>
                ${itemsNorm.map((r,i)=>{
                  // Penting: kalau r.idx==0 (atau falsy) fallback ke i+1
                  const idx = Number(r.idx) ? Number(r.idx) : (i+1);
                  const hkTot = (Number(r.hk_total)||0) || computeHK(r).total;
                  const listBhn = (bahanByIdx[String(idx)] || []);
                  const hasBhn  = listBhn.length > 0;

                  const mainRow = `
                  <tr>
                    <td>
                      <div class="d-flex align-items-center gap-1">
                        <button type="button" class="btn btn-outline-secondary toggle-bhn" 
                                data-idx="${idx}" aria-expanded="false" title="${hasBhn ? 'Lihat bahan' : 'Tidak ada bahan'}"
                                ${hasBhn ? '' : 'disabled'}>+</button>
                        <span>${i+1}</span>
                      </div>
                    </td>
                    <td>${r.pekerjaan||''}</td>
                    <td>${r.activity_type||''}</td>
                    <td>${r.lokasi||''}</td>
                    <td class="t-right">${fmtDash(r.volume)}</td>
                    <td>${r.satuan||''}</td>
                    <td class="t-right">${fmtDash(r.hk_unit)}</td>
                    <td class="t-right">${fmtDash(r.pct_bhl)}</td>
                    <td class="t-right">${fmtDash(r.pct_sku)}</td>
                    <td class="t-right">${fmtDash(r.pct_bhb)}</td>
                    <td class="t-right">${fmtDash(hkTot)}</td>
                    <td>${r.pengawas||''}</td>
                  </tr>`;

                  const bahanTable = hasBhn ? `
                    <table class="table-bahan">
                      <thead>
                        <tr>
                          <th style="width:50px">No</th>
                          <th style="width:140px">No. Material</th>
                          <th>Nama Bahan</th>
                          <th style="width:120px" class="t-right">Jumlah</th>
                          <th style="width:90px">Satuan</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${listBhn.map((b,ii)=>`
                          <tr>
                            <td>${ii+1}</td>
                            <td>${b.no_material||''}</td>
                            <td>${b.nama||''}</td>
                            <td class="t-right">${fmtDash(b.jumlah)}</td>
                            <td>${b.satuan||''}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : `<div class="muted">Tidak ada bahan untuk item ini.</div>`;

                  const detailRow = `
                    <tr class="bhn-row" data-idx="${idx}">
                      <td colspan="12">${bahanTable}</td>
                    </tr>`;

                  return mainRow + detailRow;
                }).join('') || `<tr><td colspan="12" class="muted">Tidak ada detail.</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="muted small">Klik tombol <b>+</b> di samping nomor untuk melihat/menyembunyikan bahan.</div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  // Toggle bahan
  div.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.toggle-bhn');
    if(!btn) return;
    const idx = btn.getAttribute('data-idx');
    const row = div.querySelector(`tr.bhn-row[data-idx="${idx}"]`);
    if(!row) return;
    const isOpen = row.classList.toggle('open');
    btn.textContent = isOpen ? '−' : '+';
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.title = isOpen ? 'Sembunyikan bahan' : 'Lihat bahan';
  });

  // Inisiasi modal (pastikan pakai bootstrap.bundle)
  const ModalCtor = (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal : null;
  if (ModalCtor){
    ModalCtor.getOrCreateInstance(div).show();
    div.addEventListener('hidden.bs.modal', ()=> div.remove(), {once:true});
  }else{
    // fallback minimal
    div.classList.add('show'); div.style.display='block';
  }
}


  // === PATCH D: Resolver actuals & inflater detail RKH (dipakai juga export/pdf) ===
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

  function meUser(){ return (SESSION.profile()?.username || '').toLowerCase(); }

  async function readHistoryFromActuals(){
    try{
      await resolveRkhActualNames();
    }catch(_){}
    const all = STORE.getActual?.(RKH_ACT_KEYS.header) || [];
    const mine = all.filter(x => String(x.username||'').toLowerCase() === meUser());
    return mine.map(x => ({
      nomor       : x.nomor || '',
      ref_rkb     : x.ref_rkb || '',
      tanggal     : x.tanggal || x.created_at || '',
      periode     : fPeriode(x.periode || ''),
      divisi      : x.divisi || x.divisi_id || '',
      divisi_id   : x.divisi_id || '',
      estate_full : x.estate_full || '',
      estate_id   : x.estate_id || '',
      rayon_id    : x.rayon_id || '',
      status      : x.status || 'created',
      hk_total    : +x.hk_total || 0,
      created_at  : x.created_at || '',
      updated_at  : x.updated_at || '',
      last_error  : '',
      items       : [],
      bahan       : [],
      __serverLinked: true,
      __history   : true,
      _raw        : { header: x, items: [], bahan: [] }
    }));
  }

  function mergeUniqueByNomor(primaryArr, secondaryArr){
    const used = new Set((primaryArr||[]).map(r => String(r.nomor)));
    const extra = (secondaryArr||[]).filter(r => !used.has(String(r.nomor)));
    return (primaryArr||[]).concat(extra);
  }

  async function detailFromActuals(nomor){
    try{
      await resolveRkhActualNames();
      const itemsAll = STORE.getActual?.(RKH_ACT_KEYS.items) || [];
      const bahanAll = STORE.getActual?.(RKH_ACT_KEYS.bahan) || [];
      const its = itemsAll.filter(x => String(x.nomor)===String(nomor)).map(x=>({
        idx: +x.idx||0, pekerjaan: x.pekerjaan||'', activity_type: x.activity_type||'',
        lokasi: x.lokasi||'', volume: +x.volume||0, satuan: x.satuan||'',
        hk_unit:+x.hk_unit||0, pct_bhl:+x.pct_bhl||0, pct_sku:+x.pct_sku||0, pct_bhb:+x.pct_bhb||0,
        hk_bhl:+x.hk_bhl||0, hk_sku:+x.hk_sku||0, hk_bhb:+x.hk_bhb||0, hk_total:+x.hk_total||0,
        pengawas: x.pengawas||''
      }));
      const bhn = bahanAll.filter(b => String(b.nomor)===String(nomor)).map(b=>({
        item_idx:+b.item_idx||0, no_material:String(b.no_material||b.kode||b.code||b.id||''), nama:b.nama||'',
        jumlah:+b.jumlah||0, satuan:b.satuan||''
      }));
      return {items:its, bahan:bhn};
    }catch(_){ return {items:[], bahan:[]}; }
  }

  function lokasiToString(lok){
    if (Array.isArray(lok)) return lok.map(x => (x && (x.name||x)) ).filter(Boolean).join(', ');
    return String(lok||'');
  }
  function normalizeItemsForExport(items){
    return (Array.isArray(items)?items:[]).map((it, idx) => {
      const vol = _num(it.volume);
      const hkU = _num(it.hk_unit);
      const pB  = _num(it.pct_bhl);
      const pS  = _num(it.pct_sku);
      const pH  = _num(it.pct_bhb);
      const hk  = computeHK({volume:vol, hk_unit:hkU, pct_bhl:pB, pct_sku:pS, pct_bhb:pH});
      return {
        idx: _num(it.idx) || (idx+1),
        pekerjaan: it.pekerjaan || '',
        activity_type: it.activity_type || it.activity || '',
        lokasi: lokasiToString(it.lokasi),
        volume: vol,
        satuan: String(it.satuan||''),
        hk_unit: hkU,
        pct_bhl: pB, pct_sku: pS, pct_bhb: pH,
        hk_bhl: hk.BHL, hk_sku: hk.SKU, hk_bhb: hk.BHB, hk_total: hk.total,
        pengawas: String(it.pengawas||'')
      };
    });
  }
  function normalizeBahanForExport(bahan){
    return (Array.isArray(bahan)?bahan:[]).map(b => ({
      item_idx: _num(b.item_idx) || _num(b.idx) || 0,
      no_material: String(b.no_material || b.kode || b.code || b.id || b.no || ''),
      nama: String(b.nama || ''),
      jumlah: _num(b.jumlah),
      satuan: String(b.satuan || '')
    }));
  }

  // Satu-satunya flattenRkhRows yang dipakai (hapus duplikat sebelumnya)
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

  // format ke dd/MM/yy-HH:mm:ss (Asia/Jakarta)
  function fmtWIB(ts){
    if(!ts) return '';
    let d = ts instanceof Date ? ts : new Date(ts);
    if(isNaN(d)) return String(ts);
    const tz = 'Asia/Jakarta';
    const dd = new Intl.DateTimeFormat('id-ID',{timeZone:tz,day:'2-digit'}).format(d);
    const mm = new Intl.DateTimeFormat('id-ID',{timeZone:tz,month:'2-digit'}).format(d);
    const yy = new Intl.DateTimeFormat('id-ID',{timeZone:tz,year:'2-digit'}).format(d);
    const hh = new Intl.DateTimeFormat('id-ID',{timeZone:tz,hour:'2-digit',hour12:false}).format(d);
    const mi = new Intl.DateTimeFormat('id-ID',{timeZone:tz,minute:'2-digit'}).format(d);
    const ss = new Intl.DateTimeFormat('id-ID',{timeZone:tz,second:'2-digit'}).format(d);
    return `${dd}/${mm}/${yy}-${hh}:${mi}:${ss}`;
  }

  // ===== Export Excel =====
  function colLetter(n){
    let s=''; n = n + 1;
    while(n>0){ let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
    return s;
  }

  async function exportXlsx(){ /* (tetap, tapi otomatis pakai flattenRkhRows tunggal) */ 
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
      }else if(!(bahan && bahan.length)){
        const det = await detailFromActuals(r.nomor);
        if(det.bahan && det.bahan.length) bahan = det.bahan;
      }

      items = normalizeItemsForExport(items);
      bahan = normalizeBahanForExport(bahan);

      const { DETAIL_HEADERS: DH, rows } = flattenRkhRows(r._raw?.header||{}, items, bahan);

      const EST_NAME = (r.estate_full || '').toUpperCase();
      const PT_NAME  = (COMPANY_NAME || 'PT -').toUpperCase();

      const headerBlock = [
        [PT_NAME],
        [EST_NAME],
        ['RENCANA KERJA HARIAN'],
        [`Tanggal: ${fmtDateWIB_ddMMyyyy(r.tanggal)}`],
        [`Periode: ${r.periode||'-'}`],
        [`Divisi: ${r.divisi||'-'}`],
        [`No. RKH: ${r.nomor||'-'}`],
        [`Ref. RKB: ${(r._raw?.header?.ref_rkb)||'-'}`],
        [],
        DH
      ];

      const detailData = rows.map(o => DH.map(h => o[h]));
      const aoa = headerBlock.concat(detailData);

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

      aoa.push([]);
      aoa.push(['Asisten']);
      aoa.push([ signerLine(sign.asisten) ]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      const hdrRows   = headerBlock.length;
      const dataStart = hdrRows + 1;
      const dataEnd   = dataStart + (detailData.length||0) - 1;

      if (detailData.length){
        const A = (n)=>{ let s=''; n=n+1; while(n>0){let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s; };
        const totRow = dataEnd + 1;
        const labelAddr = `${A(5)}${totRow}`;
        ws[labelAddr] = Object.assign({}, ws[labelAddr]||{}, { t:'s', v:'TOTAL', s:{ font:{ bold:true } } });
        [6,7,8].forEach(ci => {
          const addr = `${A(ci)}${totRow}`;
          ws[addr] = Object.assign({}, ws[addr]||{}, {
            t:'n',
            f:`SUM(${A(ci)}${dataStart}:${A(ci)}${dataEnd})`,
            s:{ font:{ bold:true } }
          });
        });
      }

      const lastColIdx = DH.length - 1;
      ws['!merges'] = (ws['!merges']||[]).concat([
        { s:{r:0,c:0}, e:{r:0,c:lastColIdx} },
        { s:{r:1,c:0}, e:{r:1,c:lastColIdx} },
        { s:{r:2,c:0}, e:{r:2,c:lastColIdx} },
      ]);

      const A = (n)=>{ let s=''; n=n+1; while(n>0){let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s; };
      const A1 = `${A(0)}1`, A2 = `${A(0)}2`, A3 = `${A(0)}3`;
      ws[A1] = ws[A1] || { t:'s', v:PT_NAME };
      ws[A2] = ws[A2] || { t:'s', v:EST_NAME };
      ws[A3] = ws[A3] || { t:'s', v:'RENCANA KERJA HARIAN' };

      ws[A1].s = Object.assign({}, ws[A1].s||{}, { font:{ bold:true, sz:14 }, alignment:{ horizontal:'left' } });
      ws[A2].s = Object.assign({}, ws[A2].s||{}, { font:{ bold:false, sz:12 }, alignment:{ horizontal:'left' } });
      ws[A3].s = Object.assign({}, ws[A3].s||{}, { font:{ bold:true, sz:13 }, alignment:{ horizontal:'left' } });

      const WRAP_HEADERS = ['Lokasi','No. Material','Nama Bahan','Sat. Bahan'];
      const wrapIdx = WRAP_HEADERS.map(h => DH.indexOf(h)).filter(i=>i>=0);
      for(const ci of wrapIdx){
        const col = colLetter(ci);
        for(let rr=dataStart; rr<=dataEnd; rr++){
          const addr = `${col}${rr}`;
          if(ws[addr]){
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

  // ===== Cetak PDF =====
  async function printPdf(){ /* (tetap, otomatis pakai flattenRkhRows tunggal) */ 
    const arr = applyFilter(); if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

    const sections = await Promise.all(arr.map(async (r)=>{
      let items = (r._raw?.items)||[];
      let bahan = (r._raw?.bahan)||[];

      if(!(items && items.length)){
        const det = await detailFromActuals(r.nomor);
        items = det.items; bahan = det.bahan;
      }else if(!(bahan && bahan.length)){
        const det = await detailFromActuals(r.nomor);
        if(det.bahan && det.bahan.length) bahan = det.bahan;
      }

      items = normalizeItemsForExport(items);
      bahan = normalizeBahanForExport(bahan);

      const {DETAIL_HEADERS, rows} = flattenRkhRows(r._raw?.header||{}, items, bahan);

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

      const tBHL = rows.reduce((a,o)=> a + Number(o['BHL']||0), 0);
      const tSKU = rows.reduce((a,o)=> a + Number(o['SKU']||0), 0);
      const tBHB = rows.reduce((a,o)=> a + Number(o['BHB']||0), 0);

      const footerRow = rows.length ? `
      <tfoot>
          <tr class="total">
          <td class="t-right" colspan="6"><b>TOTAL</b></td>
          <td class="num t-right"><b>${U.fmt.id2(tBHL)}</b></td>
          <td class="num t-right"><b>${U.fmt.id2(tSKU)}</b></td>
          <td class="num t-right"><b>${U.fmt.id2(tBHB)}</b></td>
          <td colspan="5"></td>
          </tr>
      </tfoot>` : '';

      const refRkb = (r._raw?.header?.ref_rkb)||'-';
      const signedAt =
        r._raw?.header?.created_at || r.created_at ||
        r._raw?.header?.updated_at || r.updated_at || '';

      return `
      <section class="page">
        <div class="hdr">
          <div class="hdr-left">
            <div class="org">
                <div class="pt">${(COMPANY_NAME||'PT -').toUpperCase()}</div>
                <div class="est">${(r.estate_full||'').toUpperCase()}</div>
            </div>
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
            <tr><td class="lbl">TTD:<br>${signedAt ? (fmtWIB(signedAt)) : '' || '&nbsp;'}</td></tr>
            <tr><td class="role">ASISTEN</td></tr>
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
          ${footerRow}
        </table>

        <div class="printed">Dicetak: ${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short'}).format(new Date())}</div>
      </section>`;
    }));

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
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

      .signbox{ border-collapse:collapse; width:240px; table-layout:fixed; font-size:12px;}
      .signbox th, .signbox td{ border:1px solid #000; padding:6px 8px; vertical-align:top;}
      .signbox th{ text-align:center; font-weight:700; background:#f4f4f4;}
      .signbox .nm{ height:36px; font-weight:700; text-align:center; letter-spacing:.2px;}
      .signbox .lbl{ height:44px; text-align:center; line-height:1.25;}
      .signbox .role{ text-align:center; font-weight:700; }

      .org { margin:0 0 6px 0; }
      .org .pt  { font-size:14px; font-weight:700; letter-spacing:.2px; }
      .org .est { font-size:12px; font-weight:600; margin-top:2px; }
      .title    { font-size:16px; font-weight:700; margin:6px 0 8px 0; letter-spacing:.3px; }

      .grid tfoot td{ border:1px solid #000; padding:6px 6px; font-size:11px; }
      .grid tr.total td{ background:#f2f2f2; font-weight:700; }

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

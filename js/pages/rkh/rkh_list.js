// js/pages/rkh/rkh_list.js
window.Pages = window.Pages || {};
Pages.rkhList = function(which='draft'){
  const root = U.qs('#app-root');
  const draftKey  = 'rkh.drafts';
  const outboxKey = 'rkh.outbox';

  // ===== STATE UI =====
  let page=1, pageSize=20, q='', periodeFilter='';
  const PAGE_CHOICES=[20,40,80,100];

  // ===== DATA SOURCE =====
  // Draft lokal
  let data = (which==='outbox')
    ? (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error)
    : (U.S.get(draftKey,  [])||[]);

  // Normalisasi agar gampang ditampilkan
  data = (data||[]).map(r=>{
    const h = r.header || {};
    return {
      nomor: h.nomor || '',
      tanggal: h.tanggal || '',
      periode: h.periode || '',
      divisi: h.divisi || h.divisi_id || '',
      estate_full: h.estate_full || '',
      status: h.status || 'created',
      hk_total: sumHK(r.items||[]),
      updated_at: h.updated_at || r.updated_at || '',
      last_error: r.last_error || '',
      _raw: r
    };
  });

  function sumHK(items){
    return (items||[]).reduce((a,it)=>{
      const vol = Number(it.volume||0);
      const hk_unit = Number(it.hk_unit||0);
      const base = vol * hk_unit;
      const bhl = base * (Number(it.pct_bhl||0)/100);
      const sku = base * (Number(it.pct_sku||0)/100);
      const bhb = base * (Number(it.pct_bhb||0)/100);
      return a + bhl + sku + bhb;
    }, 0);
  }
  function fmtN(n){ return U.fmt.id2(n||0); }

  function uniquePeriodes(arr){
    return Array.from(new Set((arr||[]).map(x => (x.periode||'')).filter(Boolean))).sort().reverse();
  }

  function sortData(arr){
    arr.sort((a,b)=>{
      return new Date(b.updated_at||0) - new Date(a.updated_at||0);
    });
    return arr;
  }
  sortData(data);

  function applyFilter(){
    let arr = data.slice();
    if(periodeFilter) arr = arr.filter(x => String(x.periode) === String(periodeFilter));
    const qq = q.trim().toLowerCase();
    if(qq){
      arr = arr.filter(r=>{
        return [r.nomor, r.periode, r.divisi, r.estate_full, r.status]
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

  // ===== BUILD UI =====
  function build(){
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
              <input id="f-search" class="form-control" placeholder="nomor, periode, divisi, estate, status..." />
            </div>
          </div>
          <div class="col-md-2">
            <label class="form-label">Baris / halaman</label>
            <select id="f-pagesize" class="form-select form-select-sm">
              ${[20,40,80,100].map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle">
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

    U.qs('#f-search').value = q;
    U.qs('#f-search').oninput = (e)=>{ q=e.target.value; page=1; renderRows(); renderPager(); };
    U.qs('#f-pagesize').onchange = (e)=>{ pageSize=+e.target.value||20; page=1; renderRows(); renderPager(); };
    U.qs('#f-periode').onchange  = (e)=>{ periodeFilter=e.target.value; page=1; renderRows(); renderPager(); };

    if(which==='draft'){
      U.qs('#btn-xlsx').onclick = exportXlsx;
      U.qs('#btn-pdf').onclick  = printPdf;
    }

    renderRows(); renderPager();
  }

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
      const btn = (label, a, enabled=true)=> `<button class="btn btn-outline-secondary btn-sm me-1" data-a="${a}" data-i="${i}" ${enabled?'':'disabled'}>${label}</button>`;
      return `<tr>
        <td>${i+1}</td>
        <td>${r.nomor||'-'}</td>
        <td>${r.tanggal||'-'}</td>
        <td>${r.periode||'-'}</td>
        <td>${r.divisi||'-'}</td>
        <td>${hkStr}</td>
        <td><span class="badge ${String(r.status).toLowerCase()==='created'?'text-bg-success':'text-bg-secondary'}">${r.status||'-'}</span></td>
        ${which==='outbox' ? `<td class="hide-sm">${r.last_error||''}</td>` : ''}
        <td>
          ${btn('Lihat','view')}
          ${which==='draft' ? btn('Edit','edit') : ''}
          ${which==='draft' ? btn('Hapus','del') : ''}
          ${which==='draft' ? btn('Sync','sync', true) : btn('Kirim Ulang','resend', true)}
          ${btn('Buka di Form','open')}
        </td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('button').forEach(btn=>{
      const i = +btn.dataset.i;
      const a = btn.dataset.a;
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
    const nums = Array.from(new Set([1, pc, page-1, page, page+1].filter(p=>p>=1&&p<=pc))).sort((a,b)=>a-b);
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

  // ===== ACTIONS =====
  async function handleAction(a, i){
    const arr = applyFilter();
    const row = arr[i];
    if(!row) return;

    if(a==='open'){
      // kirim buffer ke form
      const d = row._raw || {};
      const h = d.header || {};
      // taruh sedikit meta agar form menandai __serverLinked bila status created
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
          data = all.map(x=>{
            const h=x.header||{};
            return { nomor:h.nomor||'', tanggal:h.tanggal||'', periode:h.periode||'', divisi:h.divisi||h.divisi_id||'', estate_full:h.estate_full||'', status:h.status||'created', hk_total:sumHK(x.items||[]), updated_at:h.updated_at||x.updated_at||'', last_error:'', _raw:x };
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
            no_material: b.no_material || '',
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
          data = (U.S.get(outboxKey, [])||[]).filter(x=> !!x.last_error).map(x=>{
            const h=x.header||{};
            return { nomor:h.nomor||'', tanggal:h.tanggal||'', periode:h.periode||'', divisi:h.divisi||h.divisi_id||'', estate_full:h.estate_full||'', status:h.status||'created', hk_total:sumHK(x.items||[]), updated_at:h.updated_at||x.updated_at||'', last_error:x.last_error||'', _raw:x };
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

  // ===== VIEW MODAL (ringkas) =====
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
            Tanggal: <b>${h.tanggal||'-'}</b> · Periode: <b>${h.periode||'-'}</b> · Ref RKB: <b>${h.ref_rkb||'-'}</b><br/>
            Estate: <b>${h.estate_full||'-'}</b> · Divisi: <b>${h.divisi||h.divisi_id||'-'}</b>
          </div>

          <h6>Items</h6>
          <div class="table-responsive mb-3">
            <table class="table table-sm table-striped">
              <thead><tr>
                <th>#</th><th>Pekerjaan</th><th>Activity</th><th>Lokasi</th>
                <th class="t-right">Vol</th><th>Sat</th><th class="t-right">HK Unit</th>
                <th class="t-right">%BHL</th><th class="t-right">%SKU</th><th class="t-right">%BHB</th>
                <th class="t-right">HK Total</th><th>Pengawas</th>
              </tr></thead>
              <tbody>
                ${it.map((r,i)=>{
                  const base = Number(r.volume||0)*Number(r.hk_unit||0);
                  const hk = base*(Number(r.pct_bhl||0)/100)+base*(Number(r.pct_sku||0)/100)+base*(Number(r.pct_bhb||0)/100);
                  return `<tr>
                    <td>${i+1}</td><td>${r.pekerjaan||''}</td><td>${r.activity_type||''}</td>
                    <td>${r.lokasi||''}</td>
                    <td class="t-right">${r.volume||0}</td><td>${r.satuan||''}</td>
                    <td class="t-right">${r.hk_unit||0}</td>
                    <td class="t-right">${r.pct_bhl||0}</td>
                    <td class="t-right">${r.pct_sku||0}</td>
                    <td class="t-right">${r.pct_bhb||0}</td>
                    <td class="t-right">${U.fmt.id2(hk)}</td>
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
                  <td>${b.nama||''}</td><td class="t-right">${b.jumlah||0}</td><td>${b.satuan||''}</td>
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

  // ===== EXPORT XLSX / PRINT PDF (opsional ringkas, pakai total ringkasan) =====
  async function exportXlsx(){
    if (typeof XLSX === 'undefined'){ U.toast('Library XLSX belum tersedia.','warning'); return; }
    const arr = applyFilter(); if(!arr.length){ U.toast('Tidak ada data.','warning'); return; }
    const wb = XLSX.utils.book_new();
    const aoa = [
      ['RKH DRAFT'],
      ['Periode:', periodeFilter || 'Semua'],
      [],
      ['Nomor','Tanggal','Periode','Divisi','Estate','HK Total','Status']
    ];
    aoa.push(...arr.map(r=>[
      r.nomor, r.tanggal, r.periode, r.divisi, r.estate_full, r.hk_total, r.status
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:24},{wch:12},{wch:10},{wch:12},{wch:20},{wch:12},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'RKH');
    XLSX.writeFile(wb, `RKH_${periodeFilter||'ALL'}.xlsx`);
  }

  function printPdf(){
    const arr = applyFilter(); if(!arr.length){ U.toast('Tidak ada data.','warning'); return; }
    const rows = arr.map(r=>`
      <tr>
        <td>${r.nomor}</td><td>${r.tanggal}</td><td>${r.periode}</td>
        <td>${r.divisi}</td><td>${r.estate_full}</td><td class="t-right">${U.fmt.id2(r.hk_total)}</td><td>${r.status}</td>
      </tr>
    `).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>RKH ${periodeFilter||'Semua'}</title>
      <style>
        @page{ size:A4; margin:12mm; }
        body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
        table{ width:100%; border-collapse:collapse; }
        th,td{ border:1px solid #888; padding:6px 7px; font-size:11px; }
        th{ background:#f2f2f2; }
        .t-right{ text-align:right; }
      </style></head><body>
      <h3>RKH DRAFT</h3>
      <div>Periode: ${periodeFilter||'Semua'}</div>
      <table><thead><tr>
        <th>Nomor</th><th>Tanggal</th><th>Periode</th><th>Divisi</th><th>Estate</th><th>HK Total</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.print();</script>
    </body></html>`;
    const w=window.open('','_blank'); w.document.write(html); w.document.close();
  }

  // go
  build();
};

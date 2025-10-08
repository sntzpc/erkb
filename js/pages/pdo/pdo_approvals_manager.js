// js/pages/pdo/pdo_approvals_manager.js
window.Pages = window.Pages || {};
Pages.pdoApprovalsManager = function () {
  const root = U.qs("#app-root");
  const profile = SESSION.profile();
  if (!profile) { location.hash = "#/login"; return; }

  // === helpers cache & outbox ===
  const ACT_KEY = 'kpl.actual.pdo';        // cache header PDO (server list)
  const OUTBOX_ACT = 'kpl.outbox.actions'; // antrian aksi offline (approve/comment)

  function getActualPdo(){ return U.S.get(ACT_KEY, []) || []; }
  function setActualPdo(arr){ U.S.set(ACT_KEY, arr||[]); }
  function mergeIntoActualPdo(rows){
    const cur = getActualPdo();
    const map = new Map(cur.map(x=>[String(x.nomor), x]));
    (rows||[]).forEach(r=>{
      const k = String(r.nomor);
      map.set(k, { ...(map.get(k)||{}), ...r });
    });
    setActualPdo(Array.from(map.values()));
  }
  function queueAction(action, payload){
    const q = U.S.get(OUTBOX_ACT, []) || [];
    q.unshift({ action, payload, ts: new Date().toISOString() });
    U.S.set(OUTBOX_ACT, q);
  }

  // format helpers (fallback jika U.fmt tidak ada)
  const fmt = {
    periode: (p)=> (U.fmt && U.fmt.periodeYM) ? U.fmt.periodeYM(p) : toPeriodeWIB(p),
    idr: (n)=> (U.fmt && U.fmt.idr) ? U.fmt.idr(n) : Number(n||0).toLocaleString('id-ID')
  };
  function toPeriodeWIB(p) {
    if (!p) return "-";
    const s = String(p).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if (isNaN(d)) return s;
    const y = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",year:"numeric"}).format(d);
    const m = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",month:"2-digit"}).format(d);
    return `${y}-${m}`;
  }

  async function load(preferLocal = true) {
    try {
      let rows = [];
      if (preferLocal) {
        const cached = getActualPdo();
        if (Array.isArray(cached) && cached.length) {
          // status menunggu Manager di backend = 'askep_approved'
          rows = cached.filter(x => String(x.status||'').toLowerCase() === 'askep_approved');
        }
      }
      if (!rows.length) {
        U.progressOpen("Tarik data..."); U.progress(20, "Ambil data (server)");
        const r = await API.call("pdoListForManager", {}); // header list
        if (!r.ok) throw new Error(r.error || "Gagal tarik data");
        rows = r.rows || [];
        // gabungkan ke cache actual PDO
        mergeIntoActualPdo(rows);
        U.progress(80, "Simpan lokal");
      }
      render(rows);
    } catch (e) {
      U.toast(e.message || "Gagal memuat", "danger");
      root.innerHTML = '<div class="alert alert-danger">Gagal tarik data.</div>';
    } finally {
      U.progress(100, "Selesai"); setTimeout(() => U.progressClose(), 300);
    }
  }

  async function showDetail(nomor){
    try{
      U.progressOpen('Muat detail...'); U.progress(30,'Ambil dari server');
      const r = await API.call('getPdoDetail', { nomor });
      if(!r.ok) throw new Error(r.error||'Gagal ambil detail');
      openDetailModal(r.header||{}, r.items||[]);
    }catch(e){ U.toast(e.message||e,'danger'); }
    finally{ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250); }
  }

  function openDetailModal(h, items){
    const totalHK  = (items||[]).filter(i=>String(i.tipe_item)==='HK').reduce((a,b)=> a+Number(b.total_rp||0),0);
    const totalBor = (items||[]).filter(i=>String(i.tipe_item)==='BOR').reduce((a,b)=> a+Number(b.total_rp||0),0);
    const totalPremi = Number(h.premi_panen||0) + Number(h.premi_non_panen||0);
    const grand = totalHK + totalBor + totalPremi;

    const rowsHK = (items||[]).filter(i=>String(i.tipe_item)==='HK').map((it,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${it.pekerjaan||''}</td>
        <td>${it.satuan||''}</td>
        <td class="text-end">${Number(it.luas_ha||0).toFixed(2)}</td>
        <td class="text-end">${Number(it.hk||0)}</td>
        <td>${it.tipe_hk||''}</td>
        <td class="text-end">${fmt.idr(it.total_rp||0)}</td>
      </tr>
    `).join('');

    const rowsBor = (items||[]).filter(i=>String(i.tipe_item)==='BOR').map((it,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${it.pekerjaan||''}</td>
        <td>${it.satuan||''}</td>
        <td class="text-end">${Number(it.qty||0)}</td>
        <td class="text-end">${fmt.idr(it.tarif_borongan||0)}</td>
        <td class="text-end">${fmt.idr(it.total_rp||0)}</td>
      </tr>
    `).join('');

    const html = `
      <div class="modal fade" id="pdo-detail-modal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Detail PDO</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2 small text-muted">
              Nomor: <b>${h.nomor||'-'}</b><br/>
              Divisi: <b>${h.divisi_id||'-'}</b> &middot; Periode: <b>${fmt.periode(h.periode)}</b><br/>
              Premi Panen: <b>${fmt.idr(h.premi_panen||0)}</b> &middot; Premi Non: <b>${fmt.idr(h.premi_non_panen||0)}</b><br/>
              <span>Total:</span> <b>${fmt.idr(grand)}</b>
            </div>

            <h6 class="mt-3">Rincian HK</h6>
            <div class="table-responsive"><table class="table table-sm">
              <thead><tr><th>#</th><th>Pekerjaan</th><th>Satuan</th><th class="text-end">Luas (Ha)</th><th class="text-end">HK</th><th>Tipe HK</th><th class="text-end">Total (Rp)</th></tr></thead>
              <tbody>${rowsHK || '<tr><td colspan="7" class="text-muted">Tidak ada item HK.</td></tr>'}</tbody>
            </table></div>

            <h6 class="mt-4">Rincian Borongan</h6>
            <div class="table-responsive"><table class="table table-sm">
              <thead><tr><th>#</th><th>Pekerjaan</th><th>Satuan</th><th class="text-end">Qty</th><th class="text-end">Tarif</th><th class="text-end">Total (Rp)</th></tr></thead>
              <tbody>${rowsBor || '<tr><td colspan="6" class="text-muted">Tidak ada item Borongan.</td></tr>'}</tbody>
            </table></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button></div>
        </div></div>
      </div>`;
    const holder = document.createElement('div'); holder.innerHTML = html;
    document.body.appendChild(holder.firstElementChild);
    const el = document.getElementById('pdo-detail-modal');
    const modal = new bootstrap.Modal(el);
    el.addEventListener('hidden.bs.modal', ()=> el.remove());
    modal.show();
  }

  async function doComment(nomor){
    const text = prompt('Tulis komentar perbaikan untuk Asisten:');
    if(!text) return;
    try{
      const r = await API.call('pdoManagerComment', { nomor, text });
      if(!r.ok) throw new Error(r.error||'Gagal');
      // update cache → status balik ke draft (mengikuti backend pdoManagerComment)
      const act = getActualPdo();
      const idx = act.findIndex(x=> String(x.nomor)===String(nomor));
      if(idx>=0){ act[idx].status='DRAFT'; act[idx].updated_at=new Date().toISOString(); setActualPdo(act); }
      const tr = root.querySelector(`button[data-n="${nomor}"]`)?.closest('tr');
      if (tr) tr.remove();
      U.toast('Komentar terkirim.','success');
    }catch(e){
      queueAction('pdoManagerComment', { nomor, text }); // offline queue
      const act = getActualPdo();
      const idx = act.findIndex(x=> String(x.nomor)===String(nomor));
      if(idx>=0){ act[idx].status='DRAFT'; act[idx].updated_at=new Date().toISOString(); setActualPdo(act); }
      const tr = root.querySelector(`button[data-n="${nomor}"]`)?.closest('tr');
      if (tr) tr.remove();
      U.toast('Offline: komentar diantrikan ke Outbox.','warning');
    }
  }

  async function doApprove(nomor){
    const tr = root.querySelector(`button[data-n="${nomor}"]`)?.closest('tr');
    const btns = tr ? tr.querySelectorAll('button') : [];
    const setBusy = (v)=> btns.forEach(b=> b.disabled=v);
    try{
      setBusy(true);
      const r = await API.call('pdoManagerApprove', { nomor });
      if(!r.ok) throw new Error(r.error||'Gagal');

      const act = getActualPdo();
      const idx = act.findIndex(x=> String(x.nomor)===String(nomor));
      if(idx>=0){ act[idx].status='DONE'; act[idx].updated_at=new Date().toISOString(); setActualPdo(act); }

      if (tr) tr.remove();
      U.toast('Approved.','success');
    }catch(e){
      queueAction('pdoManagerApprove', { nomor }); // offline queue
      const act = getActualPdo();
      const idx = act.findIndex(x=> String(x.nomor)===String(nomor));
      if(idx>=0){ act[idx].status='DONE'; act[idx].updated_at=new Date().toISOString(); setActualPdo(act); }
      if (tr) tr.remove();
      U.toast('Offline: approval diantrikan ke Outbox.','warning');
    }finally{
      setBusy(false);
    }
  }

  function render(rows) {
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h4 class="mb-0">Approval PDO - Manager</h4>
        <div class="d-flex gap-2">
          <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead class="table-light">
            <tr><th>No</th><th>Nomor</th><th>Divisi</th><th>Periode</th><th class="text-end">Total (Rp)</th><th>Aksi</th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div></div>`;

    U.qs("#btn-reload").onclick = () => load(false);

    // sort terbaru dulu
    rows.sort((a,b)=>{
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return (tb||0)-(ta||0);
    });

    const tb = U.qs("#rows");
    tb.innerHTML = rows.map((r,i)=>{
      const perStr = fmt.periode(r.periode);
      const totStr = fmt.idr(r.total_rp || 0);
      return `
        <tr>
          <td>${i+1}</td>
          <td>${r.nomor}</td>
          <td>${r.divisi_id || "-"}</td>
          <td>${perStr}</td>
          <td class="text-end">${totStr}</td>
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" data-a="view" data-n="${r.nomor}">Lihat</button>
              <button class="btn btn-outline-primary" data-a="comment" data-n="${r.nomor}">Komentar</button>
              <button class="btn btn-success" data-a="approve" data-n="${r.nomor}">Approve</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    tb.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const a = btn.dataset.a;
        const nomor = btn.dataset.n;
        if(a==='view'){ showDetail(nomor); return; }
        if(a==='comment'){ doComment(nomor); return; }
        if(a==='approve'){ doApprove(nomor); return; }
      });
    });
  }

  load(true);
};

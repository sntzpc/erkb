// js/pages/approvals_manager.js
window.Pages = window.Pages || {};
Pages.approvalsManager = function () {
  const root = U.qs("#app-root");
  const ACT_KEY = 'kpl.actual.rkb';
  const OUTBOX_ACT = 'kpl.outbox.actions';

  function getActualRkb(){ return U.S.get(ACT_KEY, []) || []; }
  function setActualRkb(arr){ U.S.set(ACT_KEY, arr||[]); }
  function mergeIntoActualRkb(rows){
    const cur = getActualRkb();
    const map = new Map(cur.map(x=>[String(x.nomor), x]));
    (rows||[]).forEach(r=> map.set(String(r.nomor), { ...(map.get(String(r.nomor))||{}), ...r }));
    setActualRkb(Array.from(map.values()));
  }
  function queueAction(action, payload){
    const q = U.S.get(OUTBOX_ACT, []) || [];
    q.unshift({ action, payload, ts: new Date().toISOString() });
    U.S.set(OUTBOX_ACT, q);
  }

  async function load(preferLocal=true) {
    try {
      await STORE.ensureWarm();
      let rows = [];
      if(preferLocal){
        const cached = getActualRkb();
        if(Array.isArray(cached) && cached.length){
          rows = cached.filter(x=> String(x.status||'').toLowerCase()==='askep_approved');
        }
      }
      if(!rows.length){
        U.progressOpen("Tarik data..."); U.progress(20, "Ambil data (server)");
        const r = await API.call("listForManager", {});
        if (!r.ok) throw new Error(r.error || "gagal");
        rows = r.rows || [];
        mergeIntoActualRkb(rows);
      }
      render(rows);
    } catch (e) {
      U.toast(e.message, "danger");
      root.innerHTML = '<div class="alert alert-danger">Gagal tarik data.</div>';
    } finally {
      U.progress(100, "Selesai"); setTimeout(() => U.progressClose(), 300);
    }
  }

  function toPeriodeWIB(p){
    if (!p) return "-";
    const s = String(p).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if (isNaN(d)) return s;
    const y = new Intl.DateTimeFormat("id-ID",{ timeZone:"Asia/Jakarta",year:"numeric"}).format(d);
    const m = new Intl.DateTimeFormat("id-ID",{ timeZone:"Asia/Jakarta",month:"2-digit"}).format(d);
    return `${y}-${m}`;
  }

  async function showDetail(nomor){
    // cache-first
    const cached = getActualRkb().find(x=> String(x.nomor)===String(nomor));
    if(cached && Array.isArray(cached.items) && cached.items.length){
      openDetailModal({ header:{divisi:cached.divisi, periode:cached.periode, hk_total:cached.hk_total, estate_full:cached.estate_full}, items:cached.items, bahan:[] });
      return;
    }
    try{
      U.progressOpen("Muat detail..."); U.progress(30,"Ambil dari server");
      const r = await API.call("getRkbDetail", { nomor });
      if (!r.ok) throw new Error(r.error || "Gagal ambil detail");
      openDetailModal({ header:r.header||{}, items:r.items||[], bahan:r.bahan||[] });
    }catch(e){ U.toast(e.message||e,"danger"); }
    finally{ U.progress(100,"Selesai"); setTimeout(()=>U.progressClose(), 250); }
  }

  function openDetailModal({header:h, items, bahan}){
    const rowsItems = (items||[]).map(it=>`
      <tr><td>${it.idx}</td><td>${it.pekerjaan||""}</td><td>${it.activity_type||""}</td>
          <td>${it.lokasi||""}</td>
          <td>${it.volume||""} ${it.satuan||""}</td>
          <td>${it.hk_unit||""}</td>
          <td>${it.pct_bhl||0}% / ${it.pct_sku||0}% / ${it.pct_bhb||0}%</td>
          <td>${Number(it.hk_total||0).toFixed(2)}</td></tr>`).join("");
    const rowsBhn = (bahan||[]).map(b=>`
      <tr><td>${b.item_idx}</td><td>${b.nama||""}</td><td>${b.jumlah||""}</td><td>${b.satuan||""}</td></tr>`).join("");

    const html = `
      <div class="modal fade" id="rkb-detail-modal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Detail RKB ${h?.nomor||''}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-2 small text-muted">
              Divisi: <b>${h.divisi||"-"}</b> &middot; Periode: <b>${toPeriodeWIB(h.periode)}</b> &middot; HK Total: <b>${Number(h.hk_total||0).toFixed(2)}</b><br/>
              Estate: ${h.estate_full || ""}
            </div>
            <h6 class="mt-3">Pekerjaan</h6>
            <div class="table-responsive"><table class="table table-sm">
              <thead><tr><th>#</th><th>Pekerjaan</th><th>Tipe</th><th>Lokasi</th><th>Volume</th><th>HK/Unit</th><th>% BHL/SKU/BHB</th><th>HK Total</th></tr></thead>
              <tbody>${rowsItems || '<tr><td colspan="8" class="text-muted">Tidak ada item.</td></tr>'}</tbody>
            </table></div>
            <h6 class="mt-4">Bahan</h6>
            <div class="table-responsive"><table class="table table-sm">
              <thead><tr><th>Item #</th><th>Nama</th><th>Jumlah</th><th>Satuan</th></tr></thead>
              <tbody>${rowsBhn || '<tr><td colspan="4" class="text-muted">Tidak ada bahan.</td></tr>'}</tbody>
            </table></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button></div>
        </div></div>
      </div>`;
    const holder = document.createElement("div"); holder.innerHTML = html;
    document.body.appendChild(holder.firstElementChild);
    const el = document.getElementById("rkb-detail-modal");
    const modal = new bootstrap.Modal(el);
    el.addEventListener("hidden.bs.modal", () => el.remove());
    modal.show();
  }

  function render(rows) {
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h4 class="mb-0">Approval Mgr</h4>
        <div class="d-flex gap-2">
          <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead><tr><th>No</th><th>Nomor</th><th>Divisi</th><th>Periode</th><th>HK Total</th><th>Aksi</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </div></div>`;

    U.qs("#btn-reload").onclick = () => load(false);

    rows.sort((a,b)=>{
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return (tb||0)-(ta||0);
    });

    const tb = U.qs("#rows");
    tb.innerHTML = rows.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.nomor}</td>
        <td>${r.divisi || "-"}</td>
        <td>${toPeriodeWIB(r.periode)}</td>
        <td>${Number(r.hk_total || 0).toFixed(2)}</td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-a="view" data-i="${i}">Lihat</button>
            <button class="btn btn-outline-primary" data-a="comment" data-i="${i}">Komentar</button>
            <button class="btn btn-success" data-a="approve" data-i="${i}">Approve</button>
          </div>
        </td>
      </tr>`).join('');

    tb.querySelectorAll("button").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const i = +btn.dataset.i;
        const a = btn.dataset.a;
        const r = rows[i];
        const tr = btn.closest("tr");
        const btns = tr.querySelectorAll("button");
        const setBusy = v => btns.forEach(b => b.disabled = v);

        if(a==='view'){ showDetail(r.nomor); return; }

        if(a==='comment'){
          const text = prompt("Tulis komentar perbaikan untuk Asisten:"); if(!text) return;
          try{
            setBusy(true);
            const s = await API.call("managerComment", { nomor:r.nomor, text });
            if(!s.ok) throw new Error(s.error||"Gagal");

            const act = getActualRkb();
            const idx = act.findIndex(x=> x.nomor===r.nomor);
            if(idx>=0){ act[idx].status='draft'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }

            tr.remove();
            U.toast("Komentar terkirim.","success");
          }catch(e){
            queueAction('managerComment', { nomor:r.nomor, text });
            const act = getActualRkb();
            const idx = act.findIndex(x=> x.nomor===r.nomor);
            if(idx>=0){ act[idx].status='draft'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }
            tr.remove();
            U.toast("Offline: komentar diantrikan ke Outbox.","warning");
          }finally{ setBusy(false); }
          return;
        }

        if(a==='approve'){
          try{
            setBusy(true);
            const s = await API.call("managerApprove", { nomor:r.nomor });
            if(!s.ok) throw new Error(s.error||"Gagal");

            const act = getActualRkb();
            const idx = act.findIndex(x=> x.nomor===r.nomor);
            if(idx>=0){ act[idx].status='full_approved'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }

            tr.remove();
            U.toast("Approved.","success");
          }catch(e){
            queueAction('managerApprove', { nomor:r.nomor });
            const act = getActualRkb();
            const idx = act.findIndex(x=> x.nomor===r.nomor);
            if(idx>=0){ act[idx].status='full_approved'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }
            tr.remove();
            U.toast("Offline: approval diantrikan ke Outbox.","warning");
          }finally{ setBusy(false); }
        }
      });
    });
  }

  load(true);
};

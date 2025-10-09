// js/pages/approvals_askep.js
window.Pages = window.Pages || {};
Pages.rkbApprovalsAskep = function () {
  const root = U.qs("#app-root");
  const profile = SESSION.profile();
  if (!profile) { location.hash = "#/login"; return; }

  // === helpers cache & outbox ===
  const ACT_KEY = 'kpl.actual.rkb';
  const OUTBOX_ACT = 'kpl.outbox.actions'; // antrian aksi offline (approve/comment)

  function getActualRkb(){ return U.S.get(ACT_KEY, []) || []; }
  function setActualRkb(arr){ U.S.set(ACT_KEY, arr||[]); }
  function mergeIntoActualRkb(rows){
    const cur = getActualRkb();
    const map = new Map(cur.map(x=>[String(x.nomor), x]));
    (rows||[]).forEach(r=>{
      const k = String(r.nomor);
      map.set(k, { ...(map.get(k)||{}), ...r });
    });
    setActualRkb(Array.from(map.values()));
  }
  function queueAction(action, payload){
    const q = U.S.get(OUTBOX_ACT, []) || [];
    q.unshift({ action, payload, ts: new Date().toISOString() });
    U.S.set(OUTBOX_ACT, q);
  }

  async function load(preferLocal = true) {
    try {
      let rows = [];
      if (preferLocal) {
        const cached = getActualRkb();
        if (Array.isArray(cached) && cached.length) {
          rows = cached.filter(x => String(x.status||'').toLowerCase() === 'submitted');
        }
      }
      if (!rows.length) {
        U.progressOpen("Tarik data..."); U.progress(20, "Ambil data (server)");
        const r = await API.call("listForAskep", {}); // header list saja
        if (!r.ok) throw new Error(r.error || "gagal");
        rows = r.rows || [];
        // gabungkan ke cache actual RKB (supaya halaman lain ikut “hangat”)
        mergeIntoActualRkb(rows);
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

  function toPeriodeWIB(p) {
    if (!p) return "-";
    const s = String(p).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s); if (isNaN(d)) return s;
    const y = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",year:"numeric"}).format(d);
    const m = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",month:"2-digit"}).format(d);
    return `${y}-${m}`;
  }

  async function showDetail(nomor){
    // coba dari cache (kalau ada struktur itemnya), kalau tidak ada, baru server
    const cached = getActualRkb().find(x=> String(x.nomor)===String(nomor));
    if (cached && Array.isArray(cached.items) && cached.items.length){
      openDetailModal({
        header: { divisi: cached.divisi, periode: cached.periode, hk_total: cached.hk_total, estate_full: cached.estate_full },
        items: cached.items, bahan: [] // kalau bahan tidak ada di cache, biarkan kosong
      });
      return;
    }
    // server fallback
    try{
      U.progressOpen('Muat detail...'); U.progress(30,'Ambil dari server');
      const r = await API.call('getRkbDetail', { nomor });
      if(!r.ok) throw new Error(r.error||'Gagal ambil detail');
      openDetailModal({ header:r.header||{}, items:r.items||[], bahan:r.bahan||[] });
    }catch(e){ U.toast(e.message||e,'danger'); }
    finally{ U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 250); }
  }

  // === REPLACE the whole function ===
function openDetailModal({header: h, items, bahan}){
  // helper angka: 0 -> "-" ; selain itu 2 desimal (id-ID)
  function fmtDash(n){
    const v = Number(n);
    if(!isFinite(v) || Math.abs(v) < 1e-12) return '-';
    return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2, maximumFractionDigits:2}).format(v);
  }
  // lokasi bisa string/array, samakan jadi string
  function lokasiToString(lok){
    if(Array.isArray(lok)) return lok.map(x => (x && (x.name||x)) ).filter(Boolean).join(', ');
    return String(lok||'');
  }

  const itemsArr = Array.isArray(items) ? items : [];
  const bahanArr = Array.isArray(bahan) ? bahan : [];

  // kelompokkan bahan per item_idx
  const bahanByIdx = {};
  bahanArr.forEach(b=>{
    const k = String(Number(b.item_idx||0));
    (bahanByIdx[k] = bahanByIdx[k] || []).push(b);
  });

  const holder = document.createElement('div');
  holder.innerHTML = `
  <div class="modal fade" id="rkb-detail-modal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Detail RKB ${h?.nomor||''}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <style>
          .t-right{ text-align:right; }
          .muted  { color:#666; }
          .toggle-bhn.btn{
            --bs-btn-padding-y:.15rem; --bs-btn-padding-x:.45rem; --bs-btn-font-size:.8rem;
            line-height:1; width:28px; text-align:center;
          }
          tr.bhn-row{ display:none; }
          tr.bhn-row.open{ display:table-row; }
          tr.bhn-row td{ background:#f9fafb; border-top:0; }
          .table-bahan{ width:100%; border-collapse:collapse; }
          .table-bahan th, .table-bahan td{ border:1px solid #dee2e6; padding:6px; font-size:.9rem; }
          .table-bahan th{ background:#f3f4f6; }
        </style>

        <div class="mb-2 small text-muted">
          Divisi: <b>${h.divisi||'-'}</b> &middot; Periode: <b>${toPeriodeWIB(h.periode)}</b> &middot; HK Total: <b>${fmtDash(h.hk_total)}</b><br/>
          Estate: ${h.estate_full||''}
        </div>

        <h6 class="mt-3">Pekerjaan</h6>
        <div class="table-responsive">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th style="width:62px">#</th>
                <th>Pekerjaan</th>
                <th>Tipe</th>
                <th>Lokasi</th>
                <th class="t-right">Volume</th>
                <th>Sat</th>
                <th class="t-right">HK/Unit</th>
                <th class="t-right">% BHL/SKU/BHB</th>
                <th class="t-right">HK Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsArr.map((it,i)=>{
                const idx = Number(it.idx||i+1);
                const listB = bahanByIdx[String(idx)] || [];
                const hasB = listB.length>0;

                const mainRow = `
                  <tr>
                    <td>
                      <div class="d-flex align-items-center gap-1">
                        <button type="button" class="btn btn-outline-secondary toggle-bhn"
                                data-idx="${idx}" aria-expanded="false"
                                title="${hasB ? 'Lihat bahan' : 'Tidak ada bahan'}"
                                ${hasB? '' : 'disabled'}>+</button>
                        <span>${idx}</span>
                      </div>
                    </td>
                    <td>${it.pekerjaan||''}</td>
                    <td>${it.activity_type||''}</td>
                    <td>${lokasiToString(it.lokasi)}</td>
                    <td class="t-right">${fmtDash(it.volume)}</td>
                    <td>${it.satuan||''}</td>
                    <td class="t-right">${fmtDash(it.hk_unit)}</td>
                    <td class="t-right">
                      ${fmtDash(it.pct_bhl)}% / ${fmtDash(it.pct_sku)}% / ${fmtDash(it.pct_bhb)}%
                    </td>
                    <td class="t-right">${fmtDash(it.hk_total)}</td>
                  </tr>`;

                const bahanTable = hasB ? `
                  <table class="table-bahan">
                    <thead>
                      <tr>
                        <th style="width:50px">No</th>
                        <th style="width:180px">No. Material</th>
                        <th>Nama</th>
                        <th style="width:120px" class="t-right">Jumlah</th>
                        <th style="width:90px">Satuan</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${listB.map((b,ii)=>`
                        <tr>
                          <td>${ii+1}</td>
                          <td>${b.no_material||b.kode||b.code||b.id||''}</td>
                          <td>${b.nama||''}</td>
                          <td class="t-right">${fmtDash(b.jumlah)}</td>
                          <td>${b.satuan||''}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                ` : `<div class="muted">Tidak ada bahan untuk item ini.</div>`;

                const detailRow = `
                  <tr class="bhn-row" data-idx="${idx}">
                    <td colspan="9">${bahanTable}</td>
                  </tr>`;

                return mainRow + detailRow;
              }).join('') || '<tr><td colspan="9" class="text-muted">Tidak ada item.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="muted small mt-1">Klik tombol <b>+</b> di samping nomor untuk melihat/menyembunyikan bahan.</div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button></div>
    </div></div>
  </div>`;

  const el = holder.firstElementChild;
  document.body.appendChild(el);
  const modal = new bootstrap.Modal(el);

  // Toggle expand/collapse
  el.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.toggle-bhn');
    if(!btn) return;
    const idx = btn.getAttribute('data-idx');
    const row = el.querySelector(`tr.bhn-row[data-idx="${idx}"]`);
    if(!row) return;
    const isOpen = row.classList.toggle('open');
    btn.textContent = isOpen ? '−' : '+';
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.title = isOpen ? 'Sembunyikan bahan' : 'Lihat bahan';
  });

  el.addEventListener('hidden.bs.modal', ()=> el.remove());
  modal.show();
}


  function render(rows) {
  root.innerHTML = `
  <div class="card shadow-sm"><div class="card-body">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h4 class="mb-0">Approval RKB - Askep</h4>
      <div class="d-flex gap-2">
        <button id="btn-reload" class="btn btn-sm btn-outline-secondary">Muat Ulang (Server)</button>
      </div>
    </div>
    <div class="table-responsive"><table class="table table-sm table-hover">
      <thead><tr><th>No</th><th>Nomor</th><th>Divisi</th><th>Periode</th><th>HK Total</th><th>Aksi</th></tr></thead>
      <tbody id="rows"></tbody></table></div>
  </div></div>`;

  U.qs("#btn-reload").onclick = () => load(false);

  rows.sort((a,b)=>{
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return (tb||0)-(ta||0);
  });

  const tb = U.qs("#rows");
  tb.innerHTML = rows.map((r,i)=>{
    const perStr = U.fmt.periodeYM(r.periode);     // ← YYYY-MM (WIB)
    const hkStr  = U.fmt.hk(r.hk_total || 0);      // ← ribuan + 2 desimal
    return `
      <tr>
        <td>${i+1}</td>
        <td>${r.nomor}</td>
        <td>${r.divisi || "-"}</td>
        <td>${perStr}</td>
        <td>${hkStr}</td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-a="view" data-i="${i}">Lihat</button>
            <button class="btn btn-outline-primary" data-a="comment" data-i="${i}">Komentar</button>
            <button class="btn btn-success" data-a="approve" data-i="${i}">Approve</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  tb.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const i = +btn.dataset.i;
      const a = btn.dataset.a;
      const r = rows[i];
      const tr = btn.closest('tr');
      const btns = tr.querySelectorAll('button');
      const setBusy = (v)=> btns.forEach(b=> b.disabled = v);

      if(a==='view'){ showDetail(r.nomor); return; }

      if(a==='comment'){
        const text = prompt('Tulis komentar perbaikan untuk Asisten:');
        if(!text) return;
        try{
          setBusy(true);
          const s = await API.call('askepComment', { nomor: r.nomor, text });
          if(!s.ok) throw new Error(s.error||'Gagal');

          const act = getActualRkb();
          const idx = act.findIndex(x=> x.nomor===r.nomor);
          if(idx>=0){ act[idx].status='draft'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }

          tr.remove();
          U.toast('Komentar terkirim.','success');
        }catch(e){
          queueAction('askepComment', { nomor:r.nomor, text });
          const act = getActualRkb();
          const idx = act.findIndex(x=> x.nomor===r.nomor);
          if(idx>=0){ act[idx].status='draft'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }
          tr.remove();
          U.toast('Offline: komentar diantrikan ke Outbox.','warning');
        }finally{
          setBusy(false);
        }
        return;
      }

      if(a==='approve'){
        try{
          setBusy(true);
          const s = await API.call('askepApprove', { nomor: r.nomor });
          if(!s.ok) throw new Error(s.error||'Gagal');

          const act = getActualRkb();
          const idx = act.findIndex(x=> x.nomor===r.nomor);
          if(idx>=0){ act[idx].status='askep_approved'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }

          tr.remove();
          U.toast('Approved.','success');
        }catch(e){
          queueAction('askepApprove', { nomor:r.nomor });
          const act = getActualRkb();
          const idx = act.findIndex(x=> x.nomor===r.nomor);
          if(idx>=0){ act[idx].status='askep_approved'; act[idx].updated_at=new Date().toISOString(); setActualRkb(act); }
          tr.remove();
          U.toast('Offline: approval diantrikan ke Outbox.','warning');
        }finally{
          setBusy(false);
        }
      }
    });
  });
}


  load(true);
};
Pages.approvalsAskep = Pages.rkbApprovalsAskep; // alias lama → baru

// js/pages/settings.maintenance.js
window.Pages = window.Pages || {};
Pages.settingsMaintenance = function(){
  const root = U.qs('#app-root');
  const s = SESSION.profile(); if(!s){ location.hash='#/login'; return; }
  if((s.role||'').toLowerCase() !== 'admin'){
    root.innerHTML = `<div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Pemeliharaan Data</h4><div class="text-muted">Akses terbatas. Khusus Admin.</div></div></div>`;
    return;
  }

  root.innerHTML = `
  <div class="card shadow-sm"><div class="card-body">
    <h4 class="mb-2">Pemeliharaan Data</h4>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button id="btn-backfill-scope" class="btn btn-outline-warning">
        Backfill Scope RKB (plant_id / rayon_id / estate_id / divisi_id)
      </button>
      <div class="small text-muted">
        Isi kolom scope pada data RKB lama agar muncul di halaman Approval Askep/Manager.
      </div>
    </div>
    <div class="mt-3 small text-muted" id="status-line"></div>
  </div></div>`;

  U.qs('#btn-backfill-scope').onclick = async ()=>{
    if(!confirm('Jalankan backfill scope RKB sekarang?')) return;
    try{
      U.progressOpen('Backfill scope...'); U.progress(40,'Proses di server');
      const r = await API.call('rkbBackfillScope', {});
      if(r.ok){
        U.toast(`Backfill selesai. Updated: ${r.updated} dari ${r.scanned} baris.`,'success');
        setStatus(`Backfill: ${r.updated}/${r.scanned} baris diperbarui.`);
      }else{
        U.toast(r.error||'Gagal backfill','danger');
        setStatus('Backfill gagal.');
      }
    }catch(e){
      U.toast(e.message||e,'danger'); setStatus('Backfill gagal.');
    }finally{
      U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 300);
    }
  };

  function setStatus(msg){ const el = U.qs('#status-line'); if(el) el.textContent = msg||''; }
};

// js/pages/settings.reset.js
window.Pages = window.Pages || {};
Pages.settingsReset = function(){
  const root = U.qs('#app-root');
  const s = SESSION.profile(); if(!s){ location.hash='#/login'; return; }
  if((s.role||'').toLowerCase() !== 'admin'){
    root.innerHTML = `<div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Reset Password</h4><div class="text-muted">Akses terbatas. Khusus Admin.</div></div></div>`;
    return;
  }

  root.innerHTML = `
  <div class="card shadow-sm"><div class="card-body">
    <h4 class="mb-2">Reset Password User</h4>
    <div class="small text-muted mb-2">Password akan direset ke <code>user123</code>.</div>
    <div class="d-flex flex-wrap gap-2 align-items-end">
      <div style="max-width:260px" class="w-100 w-sm-auto">
        <label class="form-label">Username</label>
        <input id="rp-username" class="form-control" placeholder="mis. sbse_div1" />
      </div>
      <button id="btn-reset-pass" class="btn btn-warning">Reset ke default</button>
      <div class="small text-muted">Hanya mengubah password. Data lain tidak berubah.</div>
    </div>
  </div></div>`;

  U.qs('#btn-reset-pass').onclick = async ()=>{
    const u = (U.qs('#rp-username').value||'').trim();
    if(!u){ U.toast('Masukkan username.','warning'); return; }
    try{
      U.progressOpen('Reset password...'); U.progress(30,'Proses server');
      const r = await API.call('resetPassword', { username: u });
      if(!r.ok) throw new Error(r.error||'Gagal reset');
      U.toast(`Password ${u} direset ke "user123".`,'success');
    }catch(e){ U.toast(e.message||e,'danger'); }
    finally{ U.progressClose(); }
  };
};

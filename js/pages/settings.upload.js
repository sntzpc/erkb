// js/pages/settings.upload.js
window.Pages = window.Pages || {};
Pages.settingsUpload = function(){
  const root = U.qs('#app-root');
  const s = SESSION.profile(); if(!s){ location.hash='#/login'; return; }
  if((s.role||'').toLowerCase() !== 'admin'){
    root.innerHTML = `<div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Upload Data</h4><div class="text-muted">Akses terbatas. Khusus Admin.</div></div></div>`;
    return;
  }

  const MASTER_LIST = ['yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ybahan','yorg_map','yrates'];
  let currentSheet = 'ybahan';
  let uploadedRows = [];

  build();

  function build(){
    root.innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">Upload Data Master (.xlsx)</h4>
      <div class="small text-muted mb-3">File Excel harus memiliki header di baris pertama. Jika nama sheet berbeda, sistem akan menggunakan sheet pertama.</div>

      <div class="row g-3 align-items-end">
        <div class="col-md-4">
          <label class="form-label">Target Master</label>
          <select id="sheet-name" class="form-select">
            ${MASTER_LIST.map(n=>`<option value="${n}" ${n===currentSheet?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-8 d-flex flex-wrap gap-2">
          <input id="file-xlsx" type="file" accept=".xlsx" class="form-control" style="max-width:320px">
          <button id="btn-upload" class="btn btn-outline-dark">Baca File</button>
          <button id="btn-replace" class="btn btn-danger" disabled>Timpa Master (Replace)</button>
        </div>
      </div>

      <hr/>
      <div id="preview" class="small text-muted">Belum ada data upload.</div>
    </div></div>`;
    U.qs('#sheet-name').onchange = (e)=> currentSheet = e.target.value;
    U.qs('#btn-upload').onclick = handleUpload;
    U.qs('#btn-replace').onclick = replaceWithUploaded;
  }

  function previewInfo(rows){
    const el = U.qs('#preview');
    if(!rows.length){ el.innerHTML = 'Belum ada data upload.'; return; }
    const cols = Object.keys(rows[0]||{});
    el.innerHTML = `
      <div class="mb-1">Preview: <b>${rows.length}</b> baris, <b>${cols.length}</b> kolom.</div>
      <pre class="border rounded p-2 bg-light" style="max-height:220px;overflow:auto">${JSON.stringify(rows.slice(0,5), null, 2)}</pre>
    `;
  }

  function handleUpload(){
    const inp = U.qs('#file-xlsx');
    const file = inp.files && inp.files[0];
    if(!file){ U.toast('Pilih file .xlsx terlebih dulu.','warning'); return; }
    if(typeof XLSX === 'undefined'){ U.toast('Parser XLSX belum tersedia. Tambahkan script xlsx.','danger'); return; }

    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const sheetName = wb.SheetNames.includes(currentSheet) ? currentSheet : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, {defval:''});
        if(!json.length){ U.toast('Sheet kosong.','warning'); return; }
        uploadedRows = json;
        U.toast(`Upload OK: ${sheetName} · ${uploadedRows.length} baris siap timpa.`,'info');
        U.qs('#btn-replace').disabled = false;
        previewInfo(uploadedRows);
      }catch(err){
        U.toast('Gagal membaca XLSX: '+(err.message||err),'danger');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function replaceWithUploaded(){
    if(!uploadedRows.length){ U.toast('Belum ada data upload.','warning'); return; }
    if(!confirm(`Timpa master "${currentSheet}" dengan ${uploadedRows.length} baris dari file upload?`)) return;
    try{
      U.progressOpen('Mengunggah...'); U.progress(30,'Kirim data ke server');
      const r = await API.call('replaceMaster', { name: currentSheet, rows: uploadedRows });
      if(!r.ok) throw new Error(r.error||'Gagal menimpa');
      // update cache lokal juga
      U.S.set(`kpl.master.${currentSheet}`, uploadedRows);
      U.toast('Sheet berhasil ditimpa dari upload.','success');
      uploadedRows = [];
      U.qs('#btn-replace').disabled = true;
      U.qs('#file-xlsx').value = '';
      previewInfo([]);
    }catch(e){ U.toast(e.message||e,'danger'); }
    finally{ U.progressClose(); }
  }
};

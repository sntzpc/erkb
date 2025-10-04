// js/pages/dummies.js
window.Pages = window.Pages || {};

// Komponen kecil untuk placeholder card
function _placeholderCard(title, bodyHtml='Halaman ini akan segera tersedia.') {
  return `
    <div class="card shadow-sm"><div class="card-body">
      <h4 class="mb-2">${title}</h4>
      <div class="text-muted">${bodyHtml}</div>
      <div class="mt-3">
        <button class="btn btn-sm btn-outline-secondary" onclick="history.back()">Kembali</button>
      </div>
    </div></div>`;
}
Pages._dummy = function(title){ U.qs('#app-root').innerHTML = _placeholderCard(title); };

// ===== PDO =====
Pages.pdoForm = function(){
  U.qs('#app-root').innerHTML = _placeholderCard('PDO · Form', 'Formulir PDO akan ditambahkan di sini.');
};
Pages.pdoDraft = function(){
  U.qs('#app-root').innerHTML = _placeholderCard('PDO · Draft', 'Daftar draft PDO akan ditampilkan di sini.');
};

// ===== RKH =====
Pages.rkhForm = function(){
  U.qs('#app-root').innerHTML = _placeholderCard('RKH · Form', 'Formulir RKH akan ditambahkan di sini.');
};
Pages.rkhDraft = function(){
  U.qs('#app-root').innerHTML = _placeholderCard('RKH · Draft', 'Daftar draft RKH akan ditampilkan di sini.');
};

// ===== KTU Rekap PDO =====

Pages.ktuRekapPDO = function(){
  U.qs('#app-root').innerHTML = `
    <div class="card shadow-sm"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h4 class="mb-0">KTU · Rekap PDO</h4>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" disabled>Filter</button>
          <button class="btn btn-sm btn-outline-dark" disabled>Export Excel</button>
          <button class="btn btn-sm btn-outline-dark" disabled>Cetak PDF</button>
        </div>
      </div>
      <div class="alert alert-info">Rekap PDO (periode/divisi/rayon/estate) akan diimplementasikan di tahap berikutnya.</div>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead><tr><th>Periode</th><th>Divisi</th><th>Item</th><th>Jumlah</th><th>Satuan</th></tr></thead>
          <tbody><tr><td>2025-01</td><td>DIV-01</td><td>-</td><td>-</td><td>-</td></tr></tbody>
        </table>
      </div>
    </div></div>`;
};

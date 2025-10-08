
// js/exporter.pdo.js
window.Exporter = window.Exporter || {};

(function(){
  function fmtCurrency(x){ return (window.U && U.formatCurrency) ? U.formatCurrency(x) : (x||0).toLocaleString('id-ID'); }
  function nowStampWIB(){
    const tz = "Asia/Jakarta"; const d = new Date();
    const dd = new Intl.DateTimeFormat("id-ID",{timeZone:tz, day:"2-digit"}).format(d);
    const mm = new Intl.DateTimeFormat("id-ID",{timeZone:tz, month:"2-digit"}).format(d);
    const yyyy = new Intl.DateTimeFormat("id-ID",{timeZone:tz, year:"numeric"}).format(d);
    const hh = new Intl.DateTimeFormat("id-ID",{timeZone:tz, hour:"2-digit", hour12:false}).format(d);
    const mi = new Intl.DateTimeFormat("id-ID",{timeZone:tz, minute:"2-digit"}).format(d);
    const ss = new Intl.DateTimeFormat("id-ID",{timeZone:tz, second:"2-digit"}).format(d);
    return `${dd}${mm}${yyyy}.${hh}${mi}${ss}`;
  }

  // === Export 1 PDO to XLSX (layout mengikuti template pengguna secara garis besar) ===
  Exporter.toXlsxPDO = function(F){
    if(typeof XLSX==='undefined'){ alert('SheetJS XLSX belum dimuat'); return; }
    const rows = [];
    rows.push(["PT. (Nama Perusahaan)"]);
    rows.push(["(Nama Estate)"]);
    rows.push([]);
    rows.push(["PERMINTAAN DANA OPERASIONAL"]);
    rows.push([]);
    rows.push(["Periode", ":", F.periode||'']);
    rows.push(["Divisi", ":", F.divisi_kode||'']);
    rows.push(["No. PDO", ":", F.nomor||'']);
    rows.push(["Ref. RKB", ":", F.ref_rkb||'']);
    rows.push(["Upah Per HK", ":", `BHL: ${F.upah_hk_bhl||0} | SKU: ${F.upah_hk_sku||0}`]);
    rows.push(["Target Produksi", ":", F.target_produksi_ton||0, "Ton"]);
    rows.push([]);
    rows.push(["Premi Panen", ":", F.premi_panen||0]);
    rows.push(["Premi Non Panen", ":", F.premi_non_panen||0]);
    rows.push(["ACTIVITY TYPE","JENIS PEKERJAAN","LUAS (HA)","JLH HK","TOTAL (RP)","SATUAN","TARIF"]);
    (F.items||[]).forEach(it=>{
      rows.push([it.activity_type||'', it.pekerjaan||'', it.luas_ha||0, it.jlh_hk||0, it.total_rp||0, it.satuan_borongan||'', it.tarif_borongan||0]);
    });
    const grand = (F.items||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
    rows.push([]);
    rows.push(["TOTAL PDO:", "", "", "", grand]);

    rows.push([]);
    rows.push(["TTD Manager", "", "TTD Askep", "", "TTD Asisten"]);
    rows.push(["(timestamp)", "", "(timestamp)", "", "(timestamp)"]);
    rows.push([nowStampWIB(), "", nowStampWIB(), "", nowStampWIB()]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PDO');
    XLSX.writeFile(wb, `${(F.nomor||'PDO')}.xlsx`);
  };

  // === Export 1 PDO to PDF (sederhana) ===
  Exporter.toPdfPDO = function(F){
    if(typeof jsPDF==='undefined'){ alert('jsPDF belum dimuat'); return; }
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text("PERMINTAAN DANA OPERASIONAL", 14, 16);
    doc.setFontSize(10);
    doc.text(`Periode: ${F.periode||''}`, 14, 24);
    doc.text(`Divisi: ${F.divisi_kode||''}`, 14, 30);
    doc.text(`No. PDO: ${F.nomor||''}`, 14, 36);
    doc.text(`Ref. RKB: ${F.ref_rkb||''}`, 14, 42);

    let y=52;
    doc.text("Activity | Pekerjaan | Luas | HK | Total", 14, y); y+=6;
    (F.items||[]).forEach(it=>{
      const line = `${it.activity_type||''} | ${it.pekerjaan||''} | ${it.luas_ha||0} | ${it.jlh_hk||0} | ${fmtCurrency(it.total_rp||0)}`;
      doc.text(line, 14, y); y+=6;
      if(y>270){ doc.addPage(); y=20; }
    });
    y+=4;
    const grand = (F.items||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);
    doc.setFontSize(11);
    doc.text(`TOTAL PDO: ${fmtCurrency(grand)}`, 14, y);

    y+=16;
    const ts = nowStampWIB();
    doc.setFontSize(9);
    doc.text(`TTD Manager: ${ts}`, 14, y);
    doc.text(`TTD Askep: ${ts}`, 80, y);
    doc.text(`TTD Asisten: ${ts}`, 150, y);

    doc.save(`${(F.nomor||'PDO')}.pdf`);
  };

  // === Export Rekap KTU ===
  Exporter.exportRekapPDOXlsx = function(rows){
    if(typeof XLSX==='undefined'){ alert('SheetJS XLSX belum dimuat'); return; }
    const head = ["Periode","No. PDO","Divisi","Rayon","Estate","Total PDO (Rp)"];
    const data = rows.map(r=>[r.periode||'', r.nomor||'', r.divisi_kode||'', r.rayon_kode||'', r.estate_nama||'', Number(r.total_rp||0)]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap PDO');
    XLSX.writeFile(wb, `Rekap_PDO.xlsx`);
  };
  Exporter.exportRekapPDOPdf = function(rows){
    if(typeof jsPDF==='undefined'){ alert('jsPDF belum dimuat'); return; }
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text("Rekap PDO", 14, 16);
    doc.setFontSize(9);
    let y=24;
    rows.forEach(r=>{
      const line = `${r.periode||''} | ${r.nomor||''} | ${r.divisi_kode||''} | ${r.rayon_kode||''} | ${r.estate_nama||''} | ${Number(r.total_rp||0).toLocaleString('id-ID')}`;
      doc.text(line, 14, y); y+=6; if(y>270){ doc.addPage(); y=20; }
    });
    doc.save('Rekap_PDO.pdf');
  };
})();

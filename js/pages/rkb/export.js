// ============================================================================
// File: /js/features/rkb-export.js
// Purpose: Modul mandiri untuk Export Excel (.xlsx) dan Cetak PDF RKB
// Dependencies global yang dipakai:
//   - U (utils: U.toast, U.htmlBR, U.fmt.id0, U.fmt.id2)
//   - STORE (master & actuals cache)  -> STORE.ensureWarm(), STORE.getMaster(), STORE.getActual(), STORE.getActualsRkb()
//   - SESSION (profile user)          -> SESSION.profile()
//   - XLSX (SheetJS) untuk export Excel
// Catatan:
//   - Modul ini TIDAK mengandalkan variabel "data/applyFilter" dari rkb_list.js.
//     Caller WAJIB mengirimkan array "records" (hasil filter) ke fungsi export/print.
//   - Periode label untuk nama file/judul bisa dikirim via options.periodeLabel.
// ============================================================================

(function(global){
  const RKBExport = {};

  // --------------------------------------------------------------------------
  // [A] KONFIGURASI DAN STATE INTERNAL
  // --------------------------------------------------------------------------
  let COMPANY_NAME = 'PT -';

  // Urutan header detail (harus konsisten antara Excel dan PDF)
  const DETAIL_HEADERS = [
    'Activity Type','Jenis Pekerjaan','Lokasi','Volume Kerja','Satuan','HK/Unit',
    'BHL','SKU','BHB','No. Material','Nama Bahan','Jumlah','Sat. Bahan','Nama Pengawas'
  ];

  // Kolom yang perlu wrap text karena multiline
  const WRAP_HEADERS = ['Lokasi','No. Material','Nama Bahan','Sat. Bahan'];

  // --------------------------------------------------------------------------
  // [B] UTILITAS GENERIK
  // --------------------------------------------------------------------------
  // Safely return first non-empty field
  function pickFirst(obj, keys){
    for(const k of keys){
      const v = obj?.[k];
      if(v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  // Normalisasi berbagai kemungkinan nama "No. Material"
  function getNoMaterial(b){
    return String(pickFirst(b, [
      'no_material','noMaterial',
      'kode','code','material_no','materialNo',
      'no','id'
    ]) || '');
  }

  // Tanda tangan: tampilkan "(nama)" atau titik-titik jika kosong
  function signerLine(name){
    return `(${name && String(name).trim() ? String(name).trim() : '........................'})`;
  }

  // Konversi index kolom (0-based) ke huruf Excel (A, B, ..., AA, AB, ...)
  function colLetter(n){
    let s=''; n = n + 1;
    while(n>0){ let r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
    return s;
  }

  // Format waktu: dd/MM/yy-HH:mm:ss WIB
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

  // Hitung HK per item
  function computeHK(it){
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const BHL = base * ((Number(it.pct_bhl)||0)/100);
    const SKU = base * ((Number(it.pct_sku)||0)/100);
    const BHB = base * ((Number(it.pct_bhb)||0)/100);
    return { BHL, SKU, BHB, total:(BHL+SKU+BHB) };
  }

  // Normalisasi periode ke YYYY-MM (Asia/Jakarta)
  function fPeriode(p){
    if(!p) return '';
    const s = String(p).trim();
    if(/^\d{4}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if(isNaN(d)) return s;
    const tz = 'Asia/Jakarta';
    const y = new Intl.DateTimeFormat('id-ID', { timeZone: tz, year: 'numeric' }).format(d);
    const m = new Intl.DateTimeFormat('id-ID', { timeZone: tz, month: '2-digit' }).format(d);
    return `${y}-${m}`;
  }

  // --------------------------------------------------------------------------
  // [C] MASTER/PROFILE RESOLVER
  // --------------------------------------------------------------------------
  async function ensureWarm(){
    try{ if (typeof STORE?.ensureWarm === 'function'){ await STORE.ensureWarm(); } }catch(_){}
  }

  // Resolve COMPANY_NAME dari master (yplant) berdasar plant_id (profil / estate / sample records)
  async function resolveCompanyName(sampleRecords = []){
    try{
      await ensureWarm();
      const getM = STORE?.getMaster?.bind(STORE);
      const plants  = getM ? (getM('yplant')  || []) : [];
      const estates = getM ? (getM('yestate') || []) : [];

      // 1) dari profile langsung
      let pid = SESSION.profile()?.plant_id;

      // 2) dari profile estate_id (jika ada)
      if(!pid){
        const eid = SESSION.profile()?.estate_id;
        if(eid){
          const est = estates.find(e => String(e.id) === String(eid));
          pid = est?.plant_id;
        }
      }

      // 3) tebak dari sample record (estate_id/estate_full)
      if(!pid && Array.isArray(sampleRecords) && sampleRecords.length){
        const sample = sampleRecords.find(r => r.estate_id || r.estate_full) || {};
        if(sample.estate_id){
          const est = estates.find(e => String(e.id) === String(sample.estate_id));
          pid = est?.plant_id;
        }else if(sample.estate_full){
          const est = estates.find(e => (e.nama_panjang || e.nama) === sample.estate_full);
          pid = est?.plant_id;
        }
      }

      // 4) fallback: hanya 1 plant
      let plant = plants.find(p => String(p.id) === String(pid));
      if(!plant && plants.length === 1){ plant = plants[0]; }

      if(plant){ COMPANY_NAME = plant.nama_panjang || plant.nama || COMPANY_NAME; }
    }catch(_){ /* keep default */ }
  }

  // Ambil nama penandatangan berdasarkan konteks (estate/divisi/rayon)
  async function resolveSignersByContext(ctx = {}){
    try{
      await ensureWarm();
      const getM = STORE?.getMaster?.bind(STORE) || (()=>[]);
      const estates  = getM('yestate')  || []; // manager: nama_mgr
      const rayons   = getM('yrayon')   || []; // askep : nama_askep
      const divisis  = getM('ydivisi')  || []; // asisten: nama_asisten
      const orgMap   = getM('yorg_map') || [];
      const signersT = getM('ysigners') || getM('yorg_signers') || [];

      const prof = (typeof SESSION?.profile === 'function') ? (SESSION.profile() || {}) : {};
      const LC = v => v==null ? '' : String(v).toLowerCase();
      const eqLoose = (a,b)=> LC(a) === LC(b);

      // Estate
      let estateId =
        ctx.estate_id
        || (estates.find(e => (e.nama_panjang||e.nama) === ctx.estate_full)?.id)
        || prof.estate_id;

      const estateRow = estates.find(e =>
        eqLoose(e.id, estateId) || eqLoose(e.kode, estateId) || eqLoose(e.kd_estate, estateId)
      ) || {};

      // Divisi
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

      // Rayon
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
          const r = rayons.find(x =>
            eqLoose(x.id, c) || eqLoose(x.rayon_id, c)
            || eqLoose(x.kode, c) || eqLoose(x.kd_rayon, c)
            || LC(x.nama||x.nama_rayon) === LC(c)
          );
          if(r){ rayonId = r.id || r.rayon_id || r.kode || r.kd_rayon; break; }
        }
      }

      // Ambil nama dari master
      const manager = estateRow.nama_mgr || '';

      const rayonRow = rayons.find(r =>
        eqLoose(r.id, rayonId) || eqLoose(r.rayon_id, rayonId)
        || eqLoose(r.kode, rayonId) || eqLoose(r.kd_rayon, rayonId)
      ) || {};

      let askep   = rayonRow.nama_askep || '';
      let asisten = divRow.nama_asisten || '';

      // Fallback dari ysigners/yorg_map bila perlu
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

  // --------------------------------------------------------------------------
  // [D] ACTUALS RESOLVER & DETAIL INFLATER
  // --------------------------------------------------------------------------
  let ACT_KEYS = { items: 'rkb_items', bahan: 'rkb_bahan' };

  async function resolveActualNames(){
    try{
      await ensureWarm();
      const tryKeysItems = ['rkb_items','rkb_item','rkb_detail_items','rkb_details','rkb_detail'];
      const tryKeysBahan = ['rkb_bahan','rkb_material','rkb_bhn','rkb_bahan_items'];

      for (const k of tryKeysItems){
        const v = STORE.getActual?.(k);
        if (Array.isArray(v) && v.length){ ACT_KEYS.items = k; break; }
      }
      for (const k of tryKeysBahan){
        const v = STORE.getActual?.(k);
        if (Array.isArray(v) && v.length){ ACT_KEYS.bahan = k; break; }
      }
    }catch(_){ /* keep default */ }
  }

  // Inflate items+bahan dari cache actuals untuk satu nomor RKB
  async function itemsFromActuals(nomor){
    try{
      await resolveActualNames();

      const itemsAll = STORE.getActual?.(ACT_KEYS.items) || [];
      const bahanAll = STORE.getActual?.(ACT_KEYS.bahan) || [];

      const rowsI = itemsAll.filter(i => String(i.nomor)===String(nomor));
      if(!rowsI.length) return [];

      const bahanByIdx = {};
      bahanAll.filter(b => String(b.nomor)===String(nomor)).forEach(b=>{
        const k = String(b.item_idx||'');
        (bahanByIdx[k] = bahanByIdx[k] || []).push({
          nama: b.nama || '',
          jumlah: Number(b.jumlah||0),
          satuan: b.satuan || '',
          no_material: getNoMaterial(b)
        });
      });

      return rowsI.map(r=>{
        const lokasiArr = (String(r.lokasi||'').split(',').map(s=>s.trim()).filter(Boolean) || [])
          .map(nm => ({type:'', name:nm, luas:undefined}));

        const it = {
          pekerjaan: r.pekerjaan || '',
          activity_type: r.activity_type || '',
          lokasi: lokasiArr,
          volume: Number(r.volume||0),
          satuan: r.satuan || '',
          hk_unit: Number(r.hk_unit||0),
          pct_bhl: Number(r.pct_bhl||0),
          pct_sku: Number(r.pct_sku||0),
          pct_bhb: Number(r.pct_bhb||0),
          bahan: bahanByIdx[String(r.idx||'')] || [],
          pengawas: r.pengawas || ''
        };
        it.hk = computeHK(it);
        return it;
      });
    }catch(_){ return []; }
  }

  // --------------------------------------------------------------------------
  // [E] FLATTENER: RKB -> BARIS-BARIS DETAIL
  // --------------------------------------------------------------------------
  function flattenRkbRows(r){
    const items = Array.isArray(r.items) ? r.items : [];
    if(!items.length){
      return [{
        'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
        'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
      }];
    }

    // kelompok berdasarkan (activity_type, pekerjaan)
    const groups = new Map();
    items.forEach(it=>{
      const key = [
        String(it.activity_type || it.activity || ''),
        String(it.pekerjaan || '')
      ].join('|:|');

      if(!groups.has(key)){
        groups.set(key, {
          first: it,
          items: [it],
          bahanList: [],
          lokasiSet: new Set(),
          volumeList: []
        });
      }else{
        groups.get(key).items.push(it);
      }

      const g = groups.get(key);
      (it.lokasi || []).forEach(l => {
        const nm = (l && l.name) ? l.name : String(l||'');
        if(nm) g.lokasiSet.add(nm);
      });
      g.volumeList.push(Number(it.volume || 0));

      if(Array.isArray(it.bahan) && it.bahan.length){
        it.bahan.forEach(b=>{
          g.bahanList.push({
            no_material: getNoMaterial(b),
            nama: b?.nama || '',
            jumlah: (b?.jumlah!==undefined && b?.jumlah!==null) ? b.jumlah : '',
            satuan: b?.satuan || ''
          });
        });
      }
    });

    // hasilkan 1 baris per grup
    const MATERIAL_SEP = '\n';
    const rows = [];

    for(const [,g] of groups){
      const it0 = g.first;
      const lokasiArr = Array.from(g.lokasiSet);
      const lokasiStr = lokasiArr.join(', ');

      let volumeKerja = 0;
      if(lokasiArr.length > 1){
        volumeKerja = g.volumeList.reduce((a,n)=>a + (Number(n)||0), 0);
      }else{
        volumeKerja = Number(g.volumeList[0] || 0);
      }

      const satuan   = it0.satuan || '';
      const hkUnit   = Number(it0.hk_unit || 0);
      const pct_bhl  = Number(it0.pct_bhl || 0);
      const pct_sku  = Number(it0.pct_sku || 0);
      const pct_bhb  = Number(it0.pct_bhb || 0);

      const base = (Number(volumeKerja)||0) * (hkUnit||0);
      const BHL  = base * (pct_bhl/100);
      const SKU  = base * (pct_sku/100);
      const BHB  = base * (pct_bhb/100);

      const noMat    = g.bahanList.map(b => b.no_material).filter(Boolean).join(MATERIAL_SEP);
      const namaBhn  = g.bahanList.map(b => b.nama).filter(Boolean).join(MATERIAL_SEP);
      const jumlahB  = g.bahanList.map(b => (b.jumlah!=='' && b.jumlah!==null && b.jumlah!==undefined) ? String(b.jumlah) : '').filter(s=>s!=='').join(MATERIAL_SEP);
      const satuanB  = g.bahanList.map(b => b.satuan).filter(Boolean).join(MATERIAL_SEP);

      rows.push({
        'Activity Type'  : it0.activity_type || it0.activity || '',
        'Jenis Pekerjaan': it0.pekerjaan || '',
        'Lokasi'         : lokasiStr,
        'Volume Kerja'   : volumeKerja,
        'Satuan'         : satuan,
        'HK/Unit'        : hkUnit,
        'BHL'            : Number(BHL || 0),
        'SKU'            : Number(SKU || 0),
        'BHB'            : Number(BHB || 0),
        'No. Material'   : noMat,
        'Nama Bahan'     : namaBhn,
        'Jumlah'         : jumlahB,
        'Sat. Bahan'     : satuanB,
        'Nama Pengawas'  : it0.pengawas || ''
      });
    }

    if(!rows.length){
      rows.push({
        'Activity Type':'','Jenis Pekerjaan':'','Lokasi':'','Volume Kerja':'','Satuan':'','HK/Unit':'',
        'BHL':'','SKU':'','BHB':'','No. Material':'','Nama Bahan':'','Jumlah':'','Sat. Bahan':'','Nama Pengawas':''
      });
    }
    return rows;
  }

  // --------------------------------------------------------------------------
  // [F] TIMESTAMP TANDA TANGAN (ASISTEN/ASKEP/MANAGER)
  // --------------------------------------------------------------------------
  function pickFirstNonEmpty(obj, keys){
    for(const k of keys){
      const v = obj && obj[k];
      if(v!==undefined && v!==null && String(v).trim()!=='') return v;
    }
    return '';
  }

  function resolveSignTimes(row){
    const out = { asisten_ts:'', askep_ts:'', manager_ts:'' };

    // 1) dari row langsung
    out.asisten_ts = pickFirstNonEmpty(row, ['created_ts','asisten_ts','created_at']);
    out.askep_ts   = pickFirstNonEmpty(row, ['askep_ts','askep_approved_at','approved_at']);
    out.manager_ts = pickFirstNonEmpty(row, ['manager_ts','manager_approved_at','full_approved_at']);

    // 2) fallback dari actuals.rkb
    try{
      const allRkb = (STORE?.getActualsRkb && STORE.getActualsRkb()) || [];
      const r = allRkb.find(x => String(x.nomor)===String(row.nomor));
      if(r){
        out.asisten_ts = out.asisten_ts || pickFirstNonEmpty(r, ['created_ts','asisten_ts','created_at']);
        out.askep_ts   = out.askep_ts   || pickFirstNonEmpty(r, ['askep_ts','askep_approved_at','approved_at']);
        out.manager_ts = out.manager_ts || pickFirstNonEmpty(r, ['manager_ts','manager_approved_at','full_approved_at']);
      }
    }catch(_){}

    // 3) fallback dari komentar (rkb_comments) — catatan: ini bisa timestamp komentar terakhir
    try{
      const comments = (STORE?.getActual && STORE.getActual('rkb_comments')) || [];
      const mine = comments.filter(c => String(c.nomor)===String(row.nomor));
      const tsOf = (role)=>{
        const rows = mine.filter(c => String(c.role||'').toLowerCase()===role);
        rows.sort((a,b)=> new Date(b.updated_at||b.created_at||0) - new Date(a.updated_at||a.created_at||0));
        const top = rows[0];
        return pickFirstNonEmpty(top||{}, ['ts','timestamp','updated_at','created_at']);
      };
      out.askep_ts   = out.askep_ts   || tsOf('askep');
      out.manager_ts = out.manager_ts || tsOf('manager');
    }catch(_){}

    return {
      asisten_ts: out.asisten_ts ? fmtWIB(out.asisten_ts) : '',
      askep_ts  : out.askep_ts   ? fmtWIB(out.askep_ts)   : '',
      manager_ts: out.manager_ts ? fmtWIB(out.manager_ts) : ''
    };
  }

  // --------------------------------------------------------------------------
  // [G] PUBLIC API: EXPORT EXCEL
  // --------------------------------------------------------------------------
  // records: array hasil filter (tiap elemen = header RKB, d.items boleh kosong)
  // options: { periodeLabel?: string }
  RKBExport.exportXlsx = async function(records, options = {}){
    await resolveCompanyName(records||[]);
    if (typeof XLSX === 'undefined'){ U.toast('Library XLSX belum tersedia.','warning'); return; }

    const arr = Array.isArray(records) ? records : [];
    if(!arr.length){ U.toast('Tidak ada data untuk diekspor.','warning'); return; }

    const wb = XLSX.utils.book_new();

    // satu sheet per RKB
    for (let idx = 0; idx < arr.length; idx++) {
      const r = arr[idx];

      const sign = await resolveSignersByContext({
        estate_id:   r.estate_id,
        rayon_id  :  r.rayon_id,
        divisi_id :  r.divisi_id,
        divisi    :  r.divisi,
        estate_full: r.estate_full
      });

      // inflate items dari actuals bila kosong
      const items = (Array.isArray(r.items) && r.items.length)
        ? r.items
        : (await itemsFromActuals(r.nomor));

      const rowsObj = flattenRkbRows({ ...r, items });

      // Header sheet
      const headerBlock = [
        [COMPANY_NAME],
        [r.estate_full || ''],
        ['RENCANA KERJA BULANAN'],
        [`Periode: ${fPeriode(r.periode)||'-'}`, `Divisi: ${r.divisi||'-'}`, `No RKB: ${r.nomor||'-'}`],
        [],
        DETAIL_HEADERS
      ];

      const detailData = rowsObj.map(obj => DETAIL_HEADERS.map(h => obj[h]));
      const aoa = headerBlock.concat(detailData);

      // footer tanda tangan
      aoa.push([]);
      aoa.push(['Asisten','','','Askep','','','Manager']);
      aoa.push([
        signerLine(sign.asisten), '', '',
        signerLine(sign.askep),   '', '',
        signerLine(sign.manager)
      ]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // wrap kolom multiline
      const wrapIdx = WRAP_HEADERS.map(h => DETAIL_HEADERS.indexOf(h)).filter(i => i >= 0);
      const dataStartRow = headerBlock.length + 1;
      const dataEndRow   = dataStartRow + (detailData.length || 0) - 1;

      for (const ci of wrapIdx) {
        const col = colLetter(ci);
        for (let rrow = dataStartRow; rrow <= dataEndRow; rrow++) {
          const addr = `${col}${rrow}`;
          if (ws[addr]) {
            ws[addr].t = 's';
            ws[addr].s = Object.assign({}, ws[addr].s || {}, { alignment:{ wrapText:true, vertical:'top' } });
          }
        }
      }

      // tinggi baris nyaman
      if (!ws['!rows']) ws['!rows'] = [];
      for (let rrow = dataStartRow-1; rrow <= dataEndRow-1; rrow++) {
        ws['!rows'][rrow] = Object.assign({}, ws['!rows'][rrow] || {}, { hpt: 18 });
      }

      // lebar kolom
      ws['!cols'] = [
        {wch:18},{wch:28},{wch:26},{wch:14},{wch:10},{wch:10},
        {wch:12},{wch:12},{wch:12},{wch:14},{wch:28},{wch:10},{wch:12},{wch:20}
      ];

      // nama sheet
      let sname = (r.nomor || `RKB${idx+1}`).replace(/[\\/?*\[\]]/g,'');
      if (sname.length > 31) sname = sname.slice(-31);
      XLSX.utils.book_append_sheet(wb, ws, sname || `RKB${idx+1}`);
    }

    const label = options.periodeLabel || 'ALL';
    XLSX.writeFile(wb, `RKB_Detail_${label}.xlsx`);
  };

  // --------------------------------------------------------------------------
  // [H] PUBLIC API: CETAK PDF
  // --------------------------------------------------------------------------
  RKBExport.printPdf = async function(records, options = {}){
    await resolveCompanyName(records||[]);
    const arr = Array.isArray(records) ? records : [];
    if(!arr.length){ U.toast('Tidak ada data untuk dicetak.','warning'); return; }

    const sections = await Promise.all(arr.map(async (r) => {
      const sign = await resolveSignersByContext({
        estate_id:   r.estate_id,
        rayon_id:    r.rayon_id,
        divisi_id:   r.divisi_id,
        divisi:      r.divisi,
        estate_full: r.estate_full
      });
      const sigts = resolveSignTimes(r);

      // inflate items bila kosong
      const items = (Array.isArray(r.items) && r.items.length)
        ? r.items
        : (await itemsFromActuals(r.nomor));

      // format angka "Jumlah" per-baris bila multiline
      const fmtJumlah = (s) => String(s ?? '')
        .split('\n')
        .map(t => t.trim() ? U.fmt.id0(t) : '')
        .join('\n');

      const rows = flattenRkbRows({ ...r, items }).map(obj => `
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

      return `
        <section class="page">
          <div class="hdr">
            <div class="hdr-left">
              <div class="company">${(COMPANY_NAME||'').toUpperCase()}</div>
              <div class="estate">${(r.estate_full||'').toUpperCase()}</div>
              <div class="title">RENCANA KERJA BULANAN</div>

              <table class="meta">
                <tr><td>Periode</td><td>:</td><td>${fPeriode(r.periode)||'-'}</td></tr>
                <tr><td>Divisi</td><td>:</td><td>${r.divisi||'-'}</td></tr>
                <tr><td>No RKB</td><td>:</td><td>${r.nomor||'-'}</td></tr>
              </table>
            </div>

            <table class="signbox">
              <tr>
                <th>Disetujui</th>
                <th>Diperiksa</th>
                <th>Dibuat</th>
              </tr>
              <tr>
                <td class="nm">${(sign.manager||'').toUpperCase()}</td>
                <td class="nm">${(sign.askep||'').toUpperCase()}</td>
                <td class="nm">${(sign.asisten||'').toUpperCase()}</td>
              </tr>
              <tr>
                <td class="lbl">TTD:<br>${sigts.manager_ts || '&nbsp;'}</td>
                <td class="lbl">TTD:<br>${sigts.askep_ts   || '&nbsp;'}</td>
                <td class="lbl">TTD:<br>${sigts.asisten_ts || '&nbsp;'}</td>
              </tr>
              <tr>
                <td class="role">MANAGER</td>
                <td class="role">ASKEP</td>
                <td class="role">ASISTEN</td>
              </tr>
            </table>
          </div>

          <table class="grid">
            <colgroup>
              <col style="width:6%;">
              <col style="width:16%;">
              <col style="width:9%;">
              <col style="width:6%;">
              <col style="width:4%;">
              <col style="width:5%;">
              <col style="width:5%;">
              <col style="width:5%;">
              <col style="width:5%;">
              <col style="width:9%;">
              <col style="width:14%;">
              <col style="width:5%;">
              <col style="width:4%;">
              <col style="width:7%;">
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
                <th>Jumlah</th>
                <th>Unit</th>
                <th>HK/UNIT</th>
                <th>BHL</th>
                <th>SKU</th>
                <th>BHB</th>
                <th>No Material</th>
                <th>Nama</th>
                <th>Jumlah</th>
                <th>Satuan</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="14" class="muted">Tidak ada detail.</td></tr>`}</tbody>
          </table>

          <div class="printed">Dicetak: ${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta', dateStyle:'medium', timeStyle:'short'}).format(new Date())}</div>
        </section>
      `;
    }));

    const titleLabel = options.periodeLabel || 'Semua';
    const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>RKB Detail ${titleLabel}</title>
<style>
  @page{ size:A4; margin:10mm 10mm 12mm 10mm; }
  *{ box-sizing:border-box; }
  body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#000; }
  .page{ page-break-after: always; }

  /* Header */
  .hdr{ display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:8px; }
  .company{ font-size:16px; font-weight:700; margin:0 0 2px 0; }
  .estate{ font-size:12px; color:#222; margin:0 0 8px 0; }
  .title{ font-size:16px; font-weight:700; text-align:center; margin:6px 0 10px 0; letter-spacing:.3px; }
  .meta{ border-collapse:collapse; font-size:12px; }
  .meta td{ padding:1px 4px; }

  /* Sign box */
  .signbox{ border-collapse:collapse; width:330px; table-layout:fixed; font-size:12px; }
  .signbox th, .signbox td{ border:1px solid #000; padding:6px 8px; vertical-align:top; }
  .signbox th{ text-align:center; font-weight:700; background:#f4f4f4; }
  .signbox .nm{ height:40px; font-weight:700; text-align:center; }
  .signbox .lbl{ height:38px; text-align:center; }
  .signbox .role{ text-align:center; font-weight:700; }

  /* Grid */
  .grid{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .grid th, .grid td{ border:1px solid #000; padding:6px 6px; font-size:11px; vertical-align:top; }
  .grid thead .h1 th{ background:#f2f2f2; text-align:center; font-weight:700; }
  .grid thead .h2 th{ background:#f2f2f2; text-align:center; font-weight:700; }
  .grid thead { display: table-header-group; }
  .grid tr { page-break-inside: avoid; break-inside: avoid; }
  .grid td.num { font-variant-numeric: tabular-nums; white-space:nowrap; }
  .grid td.wrap{ white-space:pre-wrap; word-break:break-word; }
  .grid th, .grid td { overflow-wrap:anywhere; padding:5px 5px; font-size:10.5px; }

  .muted{ color:#666; }
  .printed{ margin-top:6px; font-size:10px; color:#444; }
</style></head>
<body>
${sections.join('\n')}
<script>window.print();</script>
</body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  // --------------------------------------------------------------------------
  // [I] EKSPOR MODUL KE GLOBAL
  // --------------------------------------------------------------------------
  global.RKBExport = RKBExport;

})(window);

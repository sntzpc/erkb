/**
 * RKB App - Google Apps Script backend
 * Deploy as web app (execute as Me, accessible to Anyone with the link)
 * Set Script Properties:
 *   TELEGRAM_BOT_TOKEN = 8462317463:AAFC3DIBom5uCsMKgCfJmB5jXymXyRccsz0
 *   TELEGRAM_CHAT_TEST = optional chat id for testing
 */

const SHEETS = {
  USERS: 'users',
  SESS: 'sessions',
  RKB: 'rkb',
  COMMENTS: 'rkb_comments',
  RKB_ITEMS: 'rkb_items',
  RKB_BAHAN: 'rkb_bahan'
};

const MASTER_SHEETS = [
  'yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ybahan','yorg_map','yrates'
];


function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const token = body.token||'';

    // === BOOTSTRAP: pastikan semua sheet ada ===
    ensureAllSheets();

    const user = validateSession(token, action);

    const map = {
      login, resetPassword, changePassword, pullMaster, pushRKB,
      listForAskep, askepApprove, askepComment,
      listForManager, managerApprove, managerComment,
      ktuRekap, rkbBackfillScope, getRkbDetail,
      inboxList, inboxMarkRead, inboxUnreadCount,
      // Admin Master CRUD
      listMaster, replaceMaster, upsertMaster, deleteMaster,
      // PDO
      pushPDO,pdoListForAskep, pdoAskepApprove,pdoListForManager, pdoManagerApprove, ktuRekapPDO
    };
    if(!map[action]) return json({ok:false, error:'Unknown action'});
    return json(map[action](body, user));
  }catch(err){
    return json({ok:false, error:String(err)});
  }
}


function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Utilities **/
function ss(){ return SpreadsheetApp.getActive(); }
function sh(name){
  const s = ss().getSheetByName(name) || ss().insertSheet(name);
  return s;
}
function headers(s, arr){
  const r1 = s.getRange(1,1,1,arr.length); r1.setValues([arr]);
  r1.setFontWeight('bold');
}

function getAll(s){
  const lastRow = s.getLastRow();
  const lastCol = s.getLastColumn();
  if(lastRow < 2 || lastCol < 1) return [];
  const head = s.getRange(1,1,1,lastCol).getValues()[0];
  const vals = s.getRange(2,1,lastRow-1,lastCol).getValues();
  return vals.map(row => Object.fromEntries(row.map((v,i)=>[head[i], v])));
}

function upsertRow(s, keyField, obj){
  const all = getAll(s);
  const head = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  const idx = all.findIndex(r=> String(r[keyField])===String(obj[keyField]));
  const row = idx>=0 ? idx+2 : s.getLastRow()+1;
  const vals = head.map(h=> obj[h]!==undefined ? obj[h] : '');
  s.getRange(row,1,1,head.length).setValues([vals]);
  return {updated: idx>=0, row};
}
function sha256(text){
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return raw.map(b=> ('0'+(b&0xFF).toString(16)).slice(-2)).join('');
}
function mastersAsMap(){
  const m = {};
  MASTER_SHEETS.forEach(n=> m[n] = getAll(sh(n)));
  // bikin index cepat:
  m._idx = {
    estateById: Object.fromEntries(m.yestate.map(x=>[x.id, x])),
    rayonById:  Object.fromEntries(m.yrayon.map(x=>[x.id, x])),
    divById:    Object.fromEntries(m.ydivisi.map(x=>[x.id, x])),
    userByName: Object.fromEntries(m.yorg_map.map(x=>[(x.username||'').toString().toLowerCase(), x]))
  };
  return m;
}
function nowIso(){ return new Date().toISOString(); }
function addDays(d, n){ return new Date(d.getTime()+ (n*24*60*60*1000)); }
function prop(key){ return PropertiesService.getScriptProperties().getProperty(key); }
function sendTelegram(chatId, text){
  const token = prop('TELEGRAM_BOT_TOKEN'); if(!token) return {ok:false, error:'No BOT token'};
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {chat_id: chatId, text: text, parse_mode:'HTML', disable_web_page_preview: true};
  try{
    UrlFetchApp.fetch(url, {method:'post', contentType:'application/json', payload: JSON.stringify(payload), muteHttpExceptions:true});
  }catch(e){}
}

/** Bootstrap minimal sheets **/
function ensureUsers(){
  const s = sh(SHEETS.USERS);
  if(s.getLastRow()<1) headers(s, ['username','password_hash','role','divisi','estate_full','telegram_id','rayon','pt']);
  return s;
}
function ensureSessions(){
  const s = sh(SHEETS.SESS);
  if(s.getLastRow()<1) headers(s, ['token','username','expiresAt']);
  return s;
}
function ensureRKB(){
  const s = sh(SHEETS.RKB);
  if(s.getLastRow()<1){
    headers(s,[
      'nomor','periode',
      'plant_id','estate_id','rayon_id','divisi_id',
      'divisi','estate_full',
      // kolom single-item dibiarkan untuk legacy, tapi tidak dipakai pada multi
      'pekerjaan','activity_type',
      'volume','satuan','hk_unit','pct_bhl','pct_sku','pct_bhb',
      'hk_bhl','hk_sku','hk_bhb','pengawas',
      'status','username','created_at','updated_at'
    ]);
    return s;
  }
  // Sheet sudah ada → pastikan kolom wajib tersedia
  ensureRkbColumns_();
  return s;
}

function ensureComments(){
  const s = sh(SHEETS.COMMENTS);
  if(s.getLastRow()<1){
    headers(s, ['id','nomor','role','username','to_username','comment','created_at','read_at']);
    return s;
  }
  // MIGRASI: tambahkan kolom kalau belum ada
  const lastCol = s.getLastColumn();
  const head = s.getRange(1,1,1,lastCol).getValues()[0];
  const NEED = ['id','to_username','read_at'];
  const missing = NEED.filter(h=> !head.includes(h));
  if(missing.length){
    s.insertColumnsAfter(lastCol || 1, missing.length);
    const newHead = head.concat(missing);
    s.getRange(1,1,1,newHead.length).setValues([newHead]).setFontWeight('bold');
  }
  return s;
}

function ensureRKBItems(){
  const s = sh(SHEETS.RKB_ITEMS);
  if(s.getLastRow()<1) headers(s,[
    'nomor','idx','pekerjaan','activity_type',
    'lokasi',           // gabungan nama lokasi (koma)
    'volume','satuan',
    'hk_unit','pct_bhl','pct_sku','pct_bhb',
    'hk_bhl','hk_sku','hk_bhb','hk_total',
    'pengawas','created_at'
  ]);
  return s;
}
function ensureRKBBahan(){
  const s = sh(SHEETS.RKB_BAHAN);
  if(s.getLastRow()<1) headers(s,[
    'nomor','item_idx','nama','jumlah','satuan','created_at'
  ]);
  return s;
}
function ensureMasters(){
  // Cukup pastikan sheet ada. Header dibiarkan mengikuti file master kamu.
  MASTER_SHEETS.forEach(n=> sh(n));
}

/** Auth **/
function login(body){
  ensureMasters(); ensureSessions();
  const m = mastersAsMap();
  const users = m.yorg_map || [];

  const u = (body.username||'').toString().trim().toLowerCase();
  const p = (body.password||'').toString();

  let found = users.find(x => (x.username||'').toString().toLowerCase() === u);

  // Bootstrap admin kalau yorg_map kosong
  if(!found && users.length===0 && u==='admin' && p==='user123'){
    // tidak tulis sheet; langsung issue session "admin" sementara
    const profile = {
      username:'admin', role:'Admin',
      plant_id:'', estate_id:'', rayon_id:'', divisi_id:''
    };
    return issueSession(profile);
  }

  if(!found) return {ok:false, error:'User tidak ditemukan'};
  if(String(found.isActive).toLowerCase()!=='true') return {ok:false, error:'User non-aktif'};

  const hash = sha256(p);
  if((found.passwordHash||'').toString().toLowerCase() !== hash) return {ok:false, error:'Password salah'};

  const profile = {
    username: found.username,
    role:     found.role || 'Asisten',
    plant_id: found.plant_id || '',
    estate_id:found.estate_id || '',
    rayon_id: found.rayon_id || '',
    divisi_id:found.divisi_id || ''
  };

  return issueSession(profile);
}


function issueSession(userRow){
  const t = Utilities.getUuid();
  const exp = addDays(new Date(), 3); // 3 days
  const sess = ensureSessions();
  const head = sess.getRange(1,1,1,sess.getLastColumn()).getValues()[0];
  const obj = {token:t, username:userRow.username, expiresAt:exp.toISOString()};
  const vals = head.map(h=> obj[h]!==undefined?obj[h]:'');
  sess.appendRow(vals);
  const profile = {username:userRow.username, role:userRow.role, divisi:userRow.divisi, estate_full:userRow.estate_full};
  return {ok:true, token:t, expiresAt:exp.toISOString(), profile};
}
function validateSession(token, action){
  if(action==='login') return null;

  const s = ensureSessions();
  const lastRow = s.getLastRow();
  const lastCol = s.getLastColumn();

  if (lastRow < 2) throw 'Sesi tidak valid'; // belum ada sesi sama sekali

  const head = s.getRange(1,1,1,lastCol).getValues()[0];
  const vals = s.getRange(2,1,lastRow-1,lastCol).getValues();
  const rows = vals.map(r => Object.fromEntries(r.map((v,i)=>[head[i], v])));

  const found = rows.find(x => x.token === token);
  if(!found) throw 'Sesi tidak valid';
  if(new Date(found.expiresAt).getTime() < Date.now()) throw 'Sesi kedaluwarsa';

  return found;
}


/** Admin utilities **/
function resetPassword(body, user){
  // Hanya Admin
  const me = getUserFromSession(user);
  if(String(me.role||'').toLowerCase()!=='admin') return {ok:false, error:'Unauthorized'};

  const target = (body.username||'').toString().trim().toLowerCase();
  if(!target) return {ok:false, error:'Username required'};

  ensureMasters();
  const s = sh('yorg_map');
  const all = getAll(s);
  const row = all.find(x=> (x.username||'').toString().toLowerCase() === target);
  if(!row) return {ok:false, error:'User tidak ditemukan'};

  row.passwordHash = sha256('user123');
  upsertRow(s, 'username', row);
  return {ok:true};
}
function changePassword(body, sess){
  // user login mengganti password sendiri
  const me = getUserFromSession(sess);
  const uName = (me.username||'').toString().trim().toLowerCase();
  const oldp = (body.oldPassword||'').toString();
  const newp = (body.newPassword||'').toString();

  if(!oldp || !newp) return {ok:false, error:'Lengkapi password lama & baru'};

  ensureMasters();
  const s = sh('yorg_map');
  const all = getAll(s);
  const row = all.find(x=> (x.username||'').toString().toLowerCase() === uName);
  if(!row) return {ok:false, error:'User tidak ditemukan'};

  const oldHash = sha256(oldp);
  if(String(row.passwordHash||'').toLowerCase() !== oldHash) return {ok:false, error:'Password lama salah'};

  row.passwordHash = sha256(newp);
  upsertRow(s, 'username', row);
  return {ok:true};
}
function getUserFromSession(sess){
  const m = mastersAsMap();
  const u = m._idx.userByName[(sess.username||'').toLowerCase()];
  if(!u){
    // fallback minimal dari token (misal admin bootstrap)
    return {username:sess.username, role:'Admin', plant_id:'', estate_id:'', rayon_id:'', divisi_id:''};
  }
  return u; // berisi role + *_id + telegram_* + user_*
}


/** Master pull **/
function pullMaster(body, sess){
  ensureMasters(); ensureRKB(); ensureComments(); ensureRKBItems(); ensureRKBBahan();

  const me = getUserFromSession(sess);

  // === 1) Kumpulkan semua master dulu ===
  const mastersAll = {};
  MASTER_SHEETS.forEach(n => mastersAll[n] = getAll(sh(n)));

  function only(arr, pred){ return (arr||[]).filter(pred); }
  function idSet(arr, key){ return new Set((arr||[]).map(x=> x[key])); }

  let masters = {};
  // ===== MASTER sesuai role (tetap sama seperti sebelumnya) =====
  if (String(me.role||'') === 'Admin') {
    masters = mastersAll;

  } else if (String(me.role||'') === 'Asisten') {
    const divId   = String(me.divisi_id||'');
    const rayonId = String(me.rayon_id||'');
    const estateId= String(me.estate_id||'');

    masters.ydivisi  = only(mastersAll.ydivisi,  x=> String(x.id||'') === divId);
    masters.ykomplek = only(mastersAll.ykomplek, x=> String(x.divisi_id||'') === divId);
    const komplekIds = idSet(masters.ykomplek, 'id');
    masters.yblok    = only(mastersAll.yblok,    x=> komplekIds.has(x.komplek_id));
    masters.yrayon   = only(mastersAll.yrayon,   x=> String(x.id||'') === rayonId);
    masters.yestate  = only(mastersAll.yestate,  x=> String(x.id||'') === estateId);
    const est = (masters.yestate||[])[0];
    masters.yplant   = est ? only(mastersAll.yplant, p=> String(p.id||'') === String(est.plant_id||'')) : [];

    masters.yactivity = mastersAll.yactivity;
    masters.ybahan    = mastersAll.ybahan;
    masters.yrates    = only(mastersAll.yrates, r=> String(r.divisi_id||'') === divId);
    masters.yorg_map  = only(mastersAll.yorg_map, u =>
      String(u.divisi_id||'') === divId || String(u.rayon_id||'') === rayonId || String(u.estate_id||'') === estateId
    );

  } else {
    // Askep / Manager / KTU → scope Estate
    const estateId = String(me.estate_id||'');

    masters.yestate  = only(mastersAll.yestate,  x=> String(x.id||'') === estateId);
    masters.yrayon   = only(mastersAll.yrayon,   x=> String(x.estate_id||'') === estateId);
    masters.ydivisi  = only(mastersAll.ydivisi,  x=> String(x.estate_id||'') === estateId);
    const divIds = idSet(masters.ydivisi, 'id');

    masters.ykomplek = only(mastersAll.ykomplek, x=> divIds.has(x.divisi_id));
    const komplekIds = idSet(masters.ykomplek, 'id');
    masters.yblok    = only(mastersAll.yblok,    x=> komplekIds.has(x.komplek_id));

    const est = (masters.yestate||[])[0];
    masters.yplant   = est ? only(mastersAll.yplant, p=> String(p.id||'') === String(est.plant_id||'')) : [];

    masters.yactivity = mastersAll.yactivity;
    masters.ybahan    = mastersAll.ybahan;
    masters.yrates    = only(mastersAll.yrates, r=> divIds.has(r.divisi_id));
    masters.yorg_map  = only(mastersAll.yorg_map, u=> String(u.estate_id||'') === estateId);
  }

  // === 2) Data aktual (RKB) sesuai role, seperti sebelumnya ===
  const allRkb = getAll(sh(SHEETS.RKB));
  let rkb;
  if (String(me.role||'') === 'Admin') {
    rkb = allRkb.slice(-1000);
  } else if (String(me.role||'') === 'Asisten') {
    rkb = allRkb.filter(x => String(x.divisi_id||'') === String(me.divisi_id||'')).slice(-500);
  } else {
    rkb = allRkb.filter(x => String(x.estate_id||'') === String(me.estate_id||'')).slice(-1000);
  }

  // Set nomor untuk filter detail
  const nomorSet = new Set((rkb||[]).map(r => String(r.nomor)));

  // === 3) Detail RKB: items & bahan (hanya untuk nomor yang lolos filter) ===
  const allItems = getAll(sh(SHEETS.RKB_ITEMS));
  const rkb_items = allItems.filter(i => nomorSet.has(String(i.nomor)));

  const allBahan = getAll(sh(SHEETS.RKB_BAHAN));
  const rkb_bahan = allBahan.filter(b => nomorSet.has(String(b.nomor)));

  // === 4) Komentar (pesan) untuk user ini (mirip inboxList) ===
  const allComments = getAll(sh(SHEETS.COMMENTS));
  let rkb_comments = allComments.filter(c =>
    String(c.to_username||'').toLowerCase() === String(me.username||'').toLowerCase()
  );

  // Lengkapi join minimal agar FE langsung pakai (periode/divisi/estate_full)
  const mapR = Object.fromEntries(rkb.map(rr => [String(rr.nomor), rr]));
  rkb_comments.forEach(x=>{
    const rr = mapR[String(x.nomor)] || {};
    x.periode = rr.periode || '';
    x.divisi  = rr.divisi  || '';
    x.estate_full = rr.estate_full || '';
  });

  // === 5) Counter: unread inbox untuk badge
  const inboxUnread = rkb_comments.filter(x => !x.read_at).length;

  return {
    ok: true,
    masters,
    actuals: {
      rkb,
      rkb_items,
      rkb_bahan,
      rkb_comments
    },
    counters: {
      inboxUnread
    }
  };
}

/** Push RKB from Asisten **/
function pushRKB(body, user){
  ensureRKB(); ensureRkbColumns_(); ensureRKBItems(); ensureRKBBahan();

  const me = getUserFromSession(user);
  const row = body.row||{};
  const items = body.items || row.items || []; // array pekerjaan (multi-item)

  const m = mastersAsMap();
  const est = m._idx.estateById[String(me.estate_id||'')];
  const estateFullFinal = row.estate_full || (est ? (est.nama_panjang || est.nama || '') : '');

  const s = sh(SHEETS.RKB);

  // === Ringkasan 1 baris per RKB (belum di-upsert; hk_total dihitung dulu) ===
  const summary = {
    nomor: row.nomor, periode: row.periode,
    plant_id: me.plant_id||'',
    estate_id: me.estate_id||'',
    rayon_id: me.rayon_id||'',
    divisi_id: me.divisi_id||'',
    divisi: row.divisi||me.divisi_id||'',
    estate_full: estateFullFinal||'',
    // kosongkan kolom single-item legacy
    pekerjaan: '', activity_type: '',
    volume: '', satuan: '', hk_unit: '', pct_bhl:'', pct_sku:'', pct_bhb:'',
    hk_bhl:'', hk_sku:'', hk_bhb:'', pengawas:'',
    status: 'submitted',
    username: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso()
  };

  // === Hapus detail lama, siapkan sheet detail ===
  clearDetailsByNomor(row.nomor);

  const si = ensureRKBItems();
  const sb = ensureRKBBahan();

  // header (sudah dipastikan ada oleh ensure*)
  const headI = si.getRange(1,1,1,si.getLastColumn()).getValues()[0];
  const headB = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];

  let insertI = [];
  let insertB = [];

  // === Build detail + hitung hk_total per item ===
  (items||[]).forEach((it, idx)=>{
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const hk_bhl = base * ((Number(it.pct_bhl)||0)/100);
    const hk_sku = base * ((Number(it.pct_sku)||0)/100);
    const hk_bhb = base * ((Number(it.pct_bhb)||0)/100);
    const hk_total = hk_bhl + hk_sku + hk_bhb;

    const lokasiStr = (it.lokasi||[]).map(l=>l.name).join(', ');

    const objI = {
      nomor: row.nomor,
      idx: idx+1,
      pekerjaan: it.pekerjaan||'',
      activity_type: it.activity_type||'',
      lokasi: lokasiStr,
      volume: it.volume||'',
      satuan: it.satuan||'',
      hk_unit: it.hk_unit||'',
      pct_bhl: it.pct_bhl||'',
      pct_sku: it.pct_sku||'',
      pct_bhb: it.pct_bhb||'',
      hk_bhl, hk_sku, hk_bhb, hk_total,
      pengawas: it.pengawas||'',
      created_at: nowIso()
    };
    insertI.push(headI.map(h=> objI[h]!==undefined ? objI[h] : ''));

    (it.bahan||[]).forEach(b=>{
      const objB = {
        nomor: row.nomor,
        item_idx: idx+1,
        nama: b.nama||'',
        jumlah: b.jumlah||'',
        satuan: b.satuan||'',
        created_at: nowIso()
      };
      insertB.push(headB.map(h=> objB[h]!==undefined ? objB[h] : ''));
    });
  });

  // === Hitung hk_total summary (robust langsung dari items) ===
  const hkTotalSummary = (items||[]).reduce((acc, it)=>{
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const pctSum = (Number(it.pct_bhl)||0) + (Number(it.pct_sku)||0) + (Number(it.pct_bhb)||0);
    return acc + (base * (pctSum/100));
  }, 0);

  summary.hk_total = hkTotalSummary;

  // === Tulis/Upsert ringkasan (sekarang sudah ada hk_total) ===
  upsertRow(s, 'nomor', summary);

  // === Tulis detail ===
  function appendRows(sheet, rowsArr){
    if(!rowsArr.length) return;
    var startRow = sheet.getLastRow() + 1;
    var needLast = startRow + rowsArr.length - 1;
    var maxRows  = sheet.getMaxRows();
    if(needLast > maxRows){
      sheet.insertRowsAfter(maxRows, needLast - maxRows);
    }
    sheet.getRange(startRow, 1, rowsArr.length, rowsArr[0].length).setValues(rowsArr);
  }
  appendRows(si, insertI);
  appendRows(sb, insertB);

  notifyNewRKB(summary, me);
  return {ok:true};
}

function notifyNewRKB(o, me){
  try{
    const m = mastersAsMap();
    const asis = m._idx.userByName[(me.username||'').toLowerCase()];
    // Askep di rayon yang sama:
    const askep = m.yorg_map.filter(x => (x.role||'')==='Askep' && x.rayon_id===me.rayon_id);
    const msg = `📋 RKB BARU DIAJUKAN
No: ${o.nomor}
Divisi: ${o.divisi||me.divisi_id} - ${o.estate_full||''}
Asisten: ${me.username}
Status: Menunggu Approval Askep`;

    const ids = []
      .concat(asis?.telegram_asisten||[])
      .concat(askep.map(a=>a.telegram_askep).filter(Boolean));
    ids.forEach(id=> sendTelegram(id, msg));
  }catch(e){}
}


/** Approval lists **/
function listForAskep(body, sess){
  const me = getUserFromSession(sess);
  let rows = getAll(sh(SHEETS.RKB))
    .filter(x => String(x.status||'').toLowerCase()==='submitted');

  // Admin lihat semua; Askep difilter rayon
  if (String(me.role||'').toLowerCase() !== 'admin') {
    rows = rows.filter(x => String(x.rayon_id||'') === String(me.rayon_id||''));
  }

  // jika hk_total kosong, hitung dari rkb_items (fallback)
  const items = getAll(sh(SHEETS.RKB_ITEMS));
  const hkByNomor = {};
  items.forEach(it=>{
    hkByNomor[it.nomor] = (hkByNomor[it.nomor]||0) + Number(it.hk_total||0);
  });
  rows.forEach(x=> {
    const hk = Number(x.hk_total||0);
    x.hk_total = hk>0 ? hk : Number(hkByNomor[x.nomor]||0);
  });

  return {ok:true, rows};
}


function askepComment(body, sess){
  ensureComments();
  const me = getUserFromSession(sess);
  const nomor = body.nomor, text = (body.text||'').toString();
  if(!nomor || !text) return {ok:false, error:'Nomor & komentar wajib'};

  const rkb = getAll(sh(SHEETS.RKB)).find(x=> String(x.nomor)===String(nomor));
  if(!rkb) return {ok:false, error:'RKB tidak ditemukan'};

  const id = Utilities.getUuid();
  const toUser = rkb.username||'';
  upsertRow(sh(SHEETS.COMMENTS),'id',{
    id, nomor, role:'Askep', username:me.username, to_username:toUser,
    comment:text, created_at: nowIso(), read_at:''
  });

  // notify telegram (tetap)
  const org = getAll(sh('yorg_map'));
  const asis = org.find(x=> (x.username||'').toString().toLowerCase() === (toUser||'').toString().toLowerCase());
  const ids = [asis?.telegram_id, me.telegram_id].filter(Boolean);
  const msg = `💬 Komentar Askep\nNo: ${nomor}\nKomentar: ${text}`;
  ids.forEach(id=> sendTelegram(id, msg));

  // status balik draft
  rkb.status='draft'; rkb.updated_at=nowIso(); upsertRow(sh(SHEETS.RKB),'nomor', rkb);
  return {ok:true};
}
function askepApprove(body, sess){
  const me = getUserFromSession(sess);
  const nomor = body.nomor;
  const s = sh(SHEETS.RKB);
  const all = getAll(s);
  const r = all.find(x=> String(x.nomor)===String(nomor)); if(!r) return {ok:false, error:'RKB tidak ditemukan'};
  if(String(r.rayon_id||'') !== String(me.rayon_id||'')) return {ok:false, error:'Unauthorized (rayon mismatch)'};

  r.status='askep_approved'; r.updated_at=nowIso(); upsertRow(s, 'nomor', r);

  const m = mastersAsMap();
  const asis = m._idx.userByName[(r.username||'').toLowerCase()];
  const manager = m.yorg_map.filter(x => String(x.role||'')==='Manager' && String(x.estate_id||'')===String(r.estate_id||''));
  const ids = []
    .concat(asis?.telegram_asisten||[])
    .concat(m._idx.userByName[(me.username||'').toLowerCase()]?.telegram_askep||[])
    .concat(manager.map(mm=>mm.telegram_manager).filter(Boolean));

  const msg = `✅ Askep APPROVE
No: ${nomor}
Status: Menunggu Approval Manager`;
  ids.forEach(id=> sendTelegram(id, msg));
  return {ok:true};
}


function listForManager(body, sess){
  const me = getUserFromSession(sess);
  let rows = getAll(sh(SHEETS.RKB))
    .filter(x => String(x.status||'').toLowerCase()==='askep_approved');

  // Admin lihat semua; Manager difilter estate
  if (String(me.role||'').toLowerCase() !== 'admin') {
    rows = rows.filter(x => String(x.estate_id||'') === String(me.estate_id||''));
  }

  const items = getAll(sh(SHEETS.RKB_ITEMS));
  const hkByNomor = {};
  items.forEach(it=>{
    hkByNomor[it.nomor] = (hkByNomor[it.nomor]||0) + Number(it.hk_total||0);
  });
  rows.forEach(x=>{
    const hk = Number(x.hk_total||0);
    x.hk_total = hk>0 ? hk : Number(hkByNomor[x.nomor]||0);
  });

  return {ok:true, rows};
}
function managerComment(body, sess){
  ensureComments();
  const me = getUserFromSession(sess);
  const nomor = body.nomor, text = (body.text||'').toString();
  if(!nomor || !text) return {ok:false, error:'Nomor & komentar wajib'};

  const rkb = getAll(sh(SHEETS.RKB)).find(x=> String(x.nomor)===String(nomor));
  if(!rkb) return {ok:false, error:'RKB tidak ditemukan'};

  const id = Utilities.getUuid();
  const toUser = rkb.username||'';
  upsertRow(sh(SHEETS.COMMENTS),'id',{
    id, nomor, role:'Manager', username:me.username, to_username:toUser,
    comment:text, created_at: nowIso(), read_at:''
  });

  const org = getAll(sh('yorg_map'));
  const asis = org.find(x=> (x.username||'').toString().toLowerCase() === (toUser||'').toString().toLowerCase());
  const ids = [asis?.telegram_id, me.telegram_id].filter(Boolean);
  const msg = `💬 Komentar Manager\nNo: ${nomor}\nKomentar: ${text}`;
  ids.forEach(id=> sendTelegram(id, msg));

  rkb.status='draft'; rkb.updated_at=nowIso(); upsertRow(sh(SHEETS.RKB),'nomor', rkb);
  return {ok:true};
}
function managerApprove(body, sess){
  const me = getUserFromSession(sess);
  const nomor = body.nomor;
  const s = sh(SHEETS.RKB);
  const all = getAll(s);
  const r = all.find(x=> String(x.nomor)===String(nomor)); if(!r) return {ok:false, error:'RKB tidak ditemukan'};
  if(String(r.estate_id||'') !== String(me.estate_id||'')) return {ok:false, error:'Unauthorized (estate mismatch)'};

  r.status='full_approved'; r.updated_at=nowIso(); upsertRow(s, 'nomor', r);

  const m = mastersAsMap();
  const asis = m._idx.userByName[(r.username||'').toLowerCase()];
  const ktu  = m.yorg_map.filter(x => String(x.role||'')==='KTU' && String(x.estate_id||'')===String(r.estate_id||''));

  const ids = []
    .concat(asis?.telegram_asisten||[])
    .concat(m._idx.userByName[(me.username||'').toLowerCase()]?.telegram_manager||[])
    .concat(ktu.map(k=>k.telegram_ktu).filter(Boolean));

  const msg = `🎉 Manager FULL APPROVE
No: ${nomor}
Status: Full Approve`;
  ids.forEach(id=> sendTelegram(id, msg));
  return {ok:true};
}
/** KTU Rekap **/
function ktuRekap(body, sess){
  const rows = getAll(sh(SHEETS.RKB)).filter(x=> x.status==='full_approved');
  const nomorSet = new Set(rows.map(r=> r.nomor));
  const itemsB = getAll(sh(SHEETS.RKB_BAHAN)).filter(b=> nomorSet.has(b.nomor));

  const items = [];
  const sum = {};

  // Per item bahan, butuh map pekerjaan dari rkb_items
  const itemsI = getAll(sh(SHEETS.RKB_ITEMS)).filter(i=> nomorSet.has(i.nomor));
  // pekerjaanByNomorIdx: key "nomor|idx" => pekerjaan
  const pekerjaanByKey = Object.fromEntries(itemsI.map(i=> [`${i.nomor}|${i.idx}`, i.pekerjaan]));

  itemsB.forEach(b=>{
    const keyNI = `${b.nomor}|${b.item_idx}`;
    const pekerjaan = pekerjaanByKey[keyNI] || '';
    items.push({ nomor:b.nomor, divisi: (rows.find(r=>r.nomor===b.nomor)||{}).divisi, periode:(rows.find(r=>r.nomor===b.nomor)||{}).periode, pekerjaan, nama:b.nama, jumlah:b.jumlah, satuan:b.satuan||'' });
    const key = (b.nama||'') + '|' + (b.satuan||'');
    sum[key] = (sum[key]||0) + Number(b.jumlah||0);
  });

  const total = Object.entries(sum).map(([k,v])=>{
    const [nama, satuan] = k.split('|'); return {nama, total:v, satuan};
  });
  return {ok:true, items, total};
}

/** ================== Admin: Master CRUD ================== **/
function isAdmin(userSess){
  const m = mastersAsMap();
  const u = m._idx.userByName[(userSess.username||'').toLowerCase()];
  const role = (u?.role || 'Asisten');
  return String(role).toLowerCase()==='admin';
}

// GET semua baris pada satu sheet master
function listMaster(body, user){
  if(!isAdmin(user)) return {ok:false, error:'Unauthorized'};
  const name = (body.name||'').toString();
  if(!name) return {ok:false, error:'Name required'};
  ensureMasters();
  const s = sh(name);
  const rows = getAll(s);
  return {ok:true, rows};
}

// REPLACE seluruh isi sheet dengan rows baru (header = union keys)
function replaceMaster(body, user){
  if(!isAdmin(user)) return {ok:false, error:'Unauthorized'};
  const name = (body.name||'').toString();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if(!name) return {ok:false, error:'Name required'};
  ensureMasters();
  const s = sh(name);

  // hitung header
  const set = new Set();
  rows.forEach(o=> Object.keys(o||{}).forEach(k=> set.add(k)));
  const head = Array.from(set);
  if(head.length===0){ // kosongkan sheet saja
    s.clear(); headers(s, ['nama']); return {ok:true, rows:0};
  }

  // tulis header & data
  s.clear();
  headers(s, head);
  if(rows.length>0){
    const vals = rows.map(r=> head.map(h=> r[h]!==undefined? r[h] : ''));
    s.getRange(2,1,vals.length, head.length).setValues(vals);
  }
  return {ok:true, rows: rows.length};
}

// UPSERT satu baris berdasarkan keyField
function upsertMaster(body, user){
  if(!isAdmin(user)) return {ok:false, error:'Unauthorized'};
  const name = (body.name||'').toString();
  const keyField = (body.keyField||'').toString();
  const row = body.row||{};
  if(!name || !keyField) return {ok:false, error:'Name & keyField required'};
  ensureMasters();
  const s = sh(name);

  // pastikan header memuat semua field (tambahkan kolom baru jika perlu)
  const lastCol = s.getLastColumn();
  let head = lastCol>0 ? s.getRange(1,1,1,lastCol).getValues()[0] : [];
  const need = Object.keys(row||{}).filter(k=> !head.includes(k));
  if(need.length){
    // tambah kolom di akhir
    s.insertColumnsAfter(lastCol||1, need.length);
    head = head.concat(need);
    // tulis ulang header
    s.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold');
  }

  const res = upsertRow(s, keyField, row);
  return {ok:true, updated: res.updated, row:res.row};
}

// DELETE baris berdasarkan keyField=value
function deleteMaster(body, user){
  if(!isAdmin(user)) return {ok:false, error:'Unauthorized'};
  const name = (body.name||'').toString();
  const keyField = (body.keyField||'').toString();
  const value = body.value;
  if(!name || !keyField) return {ok:false, error:'Name & keyField required'};
  ensureMasters();
  const s = sh(name);
  const all = getAll(s);
  const idx = all.findIndex(r=> String(r[keyField])===String(value));
  if(idx<0) return {ok:false, error:'Row not found'};
  // hapus row di sheet (offset header 1, data mulai baris 2)
  s.deleteRow(idx+2);
  return {ok:true};
}

// ===== Helper untuk clear detail by nomor =====
function clearDetailsByNomor(nomor){
  const si = ensureRKBItems();
  const sb = ensureRKBBahan();

  // Hapus semua baris yg match nomor (scan + delete dari bawah agar index aman)
  function clearSheetByNomor(sheet, nomor){
    const all = getAll(sheet);
    for(let i=all.length-1;i>=0;i--){
      if(String(all[i].nomor)===String(nomor)){
        sheet.deleteRow(i+2);
      }
    }
  }
  clearSheetByNomor(si, nomor);
  clearSheetByNomor(sb, nomor);
}

function ensureAllSheets(){
  // panggil semua ensure* agar sheet + header tercipta
  ensureMasters();     // yplant, yestate, dst (hanya membuat tab; header mengikuti file master)
  ensureSessions();    // sessions
  ensureUsers();       // users (opsional, utk utilitas admin)
  ensureRKB();         // rkb (ringkasan RKB per nomor)
  ensureComments();    // rkb_comments
  ensureRKBItems();    // rkb_items (detail pekerjaan)
  ensureRKBBahan();    // rkb_bahan (detail bahan)
}

// ====== [HELPER] Resolve scope (estate_id/rayon_id/divisi_id + estate_full) dari baris RKB atau username ======
function resolveScopeFromRow_(r) {
  const m = mastersAsMap();

  // Prioritas: gunakan apa yang sudah ada di baris
  let divId = String(r.divisi_id||'').trim();
  let estId = String(r.estate_id||'').trim();
  let rayId = String(r.rayon_id||'').trim();
  let plantId = String(r.plant_id||'').trim();

  // 1) Jika punya divisi_id → tarik estate/rayon dari ydivisi
  if (divId && (!estId || !rayId)) {
    const div = m.ydivisi.find(d => String(d.id||'')===divId);
    if (div) {
      estId = estId || String(div.estate_id||'');
      rayId = rayId || String(div.rayon_id||'');
    }
  }

  // 2) Jika masih kosong, coba dari username (owner RKB)
  if ((!estId || !rayId || !divId || !plantId) && r.username) {
    const u = m._idx.userByName[(String(r.username)||'').toLowerCase()];
    if (u) {
      divId   = divId   || String(u.divisi_id||'');
      estId   = estId   || String(u.estate_id||'');
      rayId   = rayId   || String(u.rayon_id||'');
      plantId = plantId || String(u.plant_id||'');
    }
  }

  // 3) Jika hanya ada "divisi" (string kode/nama) → cocokkan ke ydivisi
  if (!divId && r.divisi) {
    const dv = m.ydivisi.find(d =>
      String(d.id||'')===String(r.divisi)
      || String(d.kode||'').toLowerCase()===String(r.divisi).toLowerCase()
      || String(d.nama||'').toLowerCase()===String(r.divisi).toLowerCase()
    );
    if (dv) {
      divId = String(dv.id||'');
      estId = estId || String(dv.estate_id||'');
      rayId = rayId || String(dv.rayon_id||'');
    }
  }

  // Lengkapi estate_full bila kosong
  let estate_full = String(r.estate_full||'').trim();
  if (!estate_full && estId) {
    const est = m._idx.estateById[estId];
    estate_full = est ? (est.nama_panjang || est.nama || estId) : estate_full;
  }

  return {
    plant_id:  plantId || '',
    divisi_id: divId   || '',
    estate_id: estId   || '',
    rayon_id:  rayId   || '',
    estate_full: estate_full || ''
  };
}


// ====== [ACTION] Backfill kolom scope pada sheet RKB untuk baris lama ======
function rkbBackfillScope(body, sess) {
  if (!isAdmin(sess)) return {ok:false, error:'Unauthorized'};
  ensureRKB(); ensureRkbColumns_();

  const s = sh(SHEETS.RKB);
  const all = getAll(s);
  if (!all.length) return {ok:true, updated:0, scanned:0};

  // siapkan map hk_total by nomor dari rkb_items
  const si = sh(SHEETS.RKB_ITEMS);
  const items = getAll(si);
  const hkMap = {};
  items.forEach(it => {
    const n = it.nomor;
    const hk = Number(it.hk_total||0);
    hkMap[n] = (hkMap[n]||0) + hk;
  });

  let updated = 0;
  const head = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];

  const newRows = all.map(r => {
    // scope (termasuk plant_id)
    const needScope = !r.plant_id || !r.estate_id || !r.rayon_id || !r.divisi_id || !r.estate_full;
    const scope = needScope ? resolveScopeFromRow_(r) : {};
    // hk_total
    const currentHk = Number(r.hk_total||0);
    const hk_total = currentHk>0 ? currentHk : Number(hkMap[r.nomor]||0);

    if (!needScope && currentHk>0) return r; // tidak ada perubahan

    const merged = Object.assign({}, r, scope, { hk_total });
    updated += 1;
    return merged;
  });

  if (updated>0) {
    const vals = newRows.map(row => head.map(h => row[h]!==undefined ? row[h] : ''));
    s.getRange(2,1,vals.length, head.length).setValues(vals);
  }
  return {ok:true, updated, scanned: all.length};
}


// ===== Upgrade header sheet RKB agar kolom scope wajib selalu ada =====
function ensureRkbColumns_() {
  const s = sh(SHEETS.RKB);
  const lastCol = s.getLastColumn();
  if (!lastCol) return;
  const head = s.getRange(1,1,1,lastCol).getValues()[0];

  const REQUIRED = [
    'plant_id','estate_id','rayon_id','divisi_id',
    'divisi','estate_full',
    'hk_total',                      // ← wajib ada di ringkasan RKB
    'status','username','created_at','updated_at'
  ];

  const have = new Set((head||[]).filter(Boolean));
  const missing = REQUIRED.filter(h => !have.has(h));
  if (!missing.length) return;

  s.insertColumnsAfter(lastCol || 1, missing.length);
  const newHead = head.concat(missing);
  s.getRange(1,1,1,newHead.length).setValues([newHead]).setFontWeight('bold');
}

// Hitung hk_total item dengan fallback untuk data lama
function calcHkTotal_(it){
  const explicit = Number(it.hk_total||0);
  if(!isNaN(explicit) && explicit>0) return explicit;

  // coba dari komponen hk_*
  const a = Number(it.hk_bhl||0), b = Number(it.hk_sku||0), c = Number(it.hk_bhb||0);
  const sum = a+b+c;
  if(sum>0) return sum;

  // terakhir dari volume * hk_unit * (pct-total/100)
  const vol = Number(it.volume||0);
  const hkUnit = Number(it.hk_unit||0);
  const pct = Number(it.pct_bhl||0)+Number(it.pct_sku||0)+Number(it.pct_bhb||0);
  return vol * hkUnit * (pct/100);
}

function getRkbDetail(body, sess){
  const nomor = (body.nomor||'').toString().trim();
  if(!nomor) return {ok:false, error:'nomor required'};

  const me = getUserFromSession(sess);
  const r = getAll(sh(SHEETS.RKB)).find(x=> String(x.nomor)===nomor);
  if(!r) return {ok:false, error:'RKB tidak ditemukan'};

  // Akses: Admin boleh semua; Askep harus satu rayon; Manager/KTU harus satu estate; Asisten hanya miliknya
  const role = String(me.role||'').toLowerCase();
  const isOwner = String(r.username||'').toLowerCase() === String(me.username||'').toLowerCase();
  const allowed =
    role==='admin' ||
    (role==='askep'   && String(r.rayon_id||'')  === String(me.rayon_id||'')) ||
    (role==='manager' && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='ktu'     && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='asisten' && isOwner);

  if(!allowed) return {ok:false, error:'Unauthorized'};

  const items = getAll(sh(SHEETS.RKB_ITEMS)).filter(i => String(i.nomor)===nomor);
  const bahan = getAll(sh(SHEETS.RKB_BAHAN)).filter(b => String(b.nomor)===nomor);

  // pastikan hk_total summary
  const hk_total = items.reduce((a,i)=> a + Number(i.hk_total||0), 0);
  const header = Object.assign({}, r, { hk_total });

  return {ok:true, header, items, bahan};
}

// === INBOX API ===
function inboxList(body, sess){
  ensureComments(); ensureRKB();
  const me = getUserFromSession(sess);
  const onlyUnread = !!body.onlyUnread;

  // ambil komentar untuk saya
  let rows = getAll(sh(SHEETS.COMMENTS))
    .filter(x => String(x.to_username||'').toLowerCase() === String(me.username||'').toLowerCase());

  if(onlyUnread) rows = rows.filter(x => !x.read_at);

  // join info RKB minimal (divisi, periode)
  const mapR = Object.fromEntries(getAll(sh(SHEETS.RKB)).map(r=>[String(r.nomor), r]));
  rows.forEach(x=>{
    const r = mapR[String(x.nomor)]||{};
    x.periode = r.periode||'';
    x.divisi  = r.divisi||'';
    x.estate_full = r.estate_full||'';
  });

  // urut terbaru
  rows.sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {ok:true, rows};
}

function inboxMarkRead(body, sess){
  ensureComments();
  const me = getUserFromSession(sess);
  const id = (body.id||'').toString();
  const nomor = (body.nomor||'').toString();
  const created_at = (body.created_at||'').toString(); // fallback matcher

  const s = sh(SHEETS.COMMENTS);
  const all = getAll(s);
  let target = null;

  if(id){
    target = all.find(x=> String(x.id)===id);
  }
  if(!target){
    // fallback utk data lama yg belum punya id
    target = all.find(x =>
      String(x.nomor)===nomor &&
      String(x.to_username||'').toLowerCase()===String(me.username||'').toLowerCase() &&
      String(x.created_at)===created_at
    );
  }
  if(!target) return {ok:false, error:'Pesan tidak ditemukan'};

  target.read_at = nowIso();
  upsertRow(s, 'id', target);
  return {ok:true};
}

function inboxUnreadCount(body, sess){
  ensureComments();
  const me = getUserFromSession(sess);
  const rows = getAll(sh(SHEETS.COMMENTS))
    .filter(x => String(x.to_username||'').toLowerCase() === String(me.username||'').toLowerCase())
    .filter(x => !x.read_at);
  return {ok:true, count: rows.length};
}


// === [BEGIN PDO MODULE] =====================================================
const PDO_SHEETS = {
  PDO: 'pdo',
  PDO_ITEMS: 'pdo_items'
};

function ensurePDO(){
  const s = sh(PDO_SHEETS.PDO);
  if(s.getLastRow()<1){
    headers(s, [
      'nomor','periode','estate_id','rayon_id','divisi_id',
      'ref_rkb','upah_hk_bhl','upah_hk_sku','target_produksi_ton',
      'premi_panen','premi_non_panen',
      'total_rp','status','asst_ts','askep_ts','manager_ts',
      'created_by','created_at','updated_at'
    ]);
  }
  return s;
}
function ensurePDOItems(){
  const s = sh(PDO_SHEETS.PDO_ITEMS);
  if(s.getLastRow()<1){
    headers(s, [
      'nomor','idx','activity_type','pekerjaan','satuan_borongan','tarif_borongan',
      'luas_ha','jlh_hk','total_rp'
    ]);
  }
  return s;
}

function pushPDO(body, sess){
  ensurePDO(); ensurePDOItems();
  const me = getUserFromSession(sess);
  const row = body.row||{};
  const items = body.items||[];

  // Hitung total
  const total = (items||[]).reduce((a,b)=> a + Number(b.total_rp||0), 0);

  const nomor = row.nomor || `PDO-${(me.divisi||'XX')}-${nowStampWIB()}`;

  const summary = {
    nomor,
    periode: row.periode||'',
    estate_id: Number(row.estate_id||me.estate_id||0),
    rayon_id: Number(row.rayon_id||me.rayon_id||0),
    divisi_id: row.divisi_id||me.divisi||'',
    ref_rkb: row.ref_rkb||'',
    upah_hk_bhl: Number(row.upah_hk_bhl||0),
    upah_hk_sku: Number(row.upah_hk_sku||0),
    target_produksi_ton: Number(row.target_produksi_ton||0),
    premi_panen: Number(row.premi_panen||0),
    premi_non_panen: Number(row.premi_non_panen||0),
    total_rp: total,
    status: 'ASKP', // menunggu Askep
    asst_ts: nowStampWIB(),
    askep_ts: '',
    manager_ts: '',
    created_by: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  // Upsert header
  const s = ensurePDO();
  upsertRow(s, 'nomor', summary);

  // Replace details
  const si = ensurePDOItems();
  const all = getAll(si).filter(x=> String(x.nomor)!==String(nomor));
  // clear & reinsert – quick way
  si.clear(); headers(si, ['nomor','idx','activity_type','pekerjaan','satuan_borongan','tarif_borongan','luas_ha','jlh_hk','total_rp']);
  const rows = all.map(x=>[x.nomor,x.idx,x.activity_type,x.pekerjaan,x.satuan_borongan,x.tarif_borongan,x.luas_ha,x.jlh_hk,x.total_rp]);
  (items||[]).forEach((it,i)=>{
    rows.push([nomor, i+1, it.activity_type||'', it.pekerjaan||'', it.satuan_borongan||'', Number(it.tarif_borongan||0), Number(it.luas_ha||0), Number(it.jlh_hk||0), Number(it.total_rp||0)]);
  });
  if(rows.length){
    si.getRange(1,1,1,9).setValues([['nomor','idx','activity_type','pekerjaan','satuan_borongan','tarif_borongan','luas_ha','jlh_hk','total_rp']]);
    if(rows.length>0) si.getRange(2,1,rows.length,9).setValues(rows);
  }

  return {ok:true};
}

function pdoListForAskep(body, sess){
  ensurePDO();
  const me = getUserFromSession(sess);
  const m = getAll(ensurePDO())
    .filter(x => String(x.rayon_id||'')===String(me.rayon_id||''))
    .filter(x => String(x.status||'')==='ASKP');
  return {ok:true, rows:m};
}

function pdoAskepApprove(body, sess){
  ensurePDO();
  const s = ensurePDO();
  const nomor = body.nomor||'';
  const head = getAll(s);
  const idx = head.findIndex(x=> String(x.nomor)===String(nomor));
  if(idx<0) return {ok:false, error:'not found'};
  const row = head[idx];
  row.status='MGR';
  row.askep_ts = nowStampWIB();
  row.updated_at = nowIso();
  upsertRow(s, 'nomor', row);
  return {ok:true};
}

function pdoListForManager(body, sess){
  ensurePDO();
  const me = getUserFromSession(sess);
  const m = getAll(ensurePDO())
    .filter(x => String(x.estate_id||'')===String(me.estate_id||''))
    .filter(x => String(x.status||'')==='MGR');
  return {ok:true, rows:m};
}

function pdoManagerApprove(body, sess){
  ensurePDO();
  const s = ensurePDO();
  const nomor = body.nomor||'';
  const head = getAll(s);
  const idx = head.findIndex(x=> String(x.nomor)===String(nomor));
  if(idx<0) return {ok:false, error:'not found'};
  const row = head[idx];
  row.status='DONE';
  row.manager_ts = nowStampWIB();
  row.updated_at = nowIso();
  upsertRow(s, 'nomor', row);
  return {ok:true};
}

function ktuRekapPDO(body, sess){
  ensurePDO();
  const m = mastersAsMap();
  const rows = getAll(ensurePDO()).map(r=>{
    const est = m._idx.estateById[String(r.estate_id||'')]||{};
    const ray = m._idx.rayonById[String(r.rayon_id||'')]||{};
    return {
      nomor: r.nomor,
      periode: r.periode||'',
      divisi_id: r.divisi_id||'',
      rayon_kode: ray.kode||ray.kd_rayon||'',
      estate_nama: est.nama||est.nama_panjang||'',
      total_rp: Number(r.total_rp||0),
    };
  });
  return {ok:true, rows};
}

// WIB timestamp "DDMMYYYY.hhmmss"
function nowStampWIB(){
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const d = new Date();
  const zone = Utilities.formatDate(d, tz, 'ddMMyyyy.HHmmss');
  return zone;
}
// === [END PDO MODULE] =======================================================


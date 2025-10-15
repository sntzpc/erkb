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
      pushPDO, pushPDOv2, pdoListForAskep, pdoAskepApprove, pdoAskepComment,
      pdoListForManager, pdoManagerApprove, pdoManagerComment, ktuRekapPDO,
      getPdoDetail,

      // RKH
      createRKHFromRKB, pushRKH, getRkhDetail,

        // === Full Replace API ===
      pdoReplace,
      rkbReplace 

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

// WIB timestamp "DD/MM/YY-hh:mm:ss" → untuk tanda tangan digital
function sigWIB(){
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(new Date(), tz, 'dd/MM/yy-HH:mm:ss');
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
      'pekerjaan','activity_type',
      'volume','satuan','hk_unit','pct_bhl','pct_sku','pct_bhb',
      'hk_bhl','hk_sku','hk_bhb','pengawas',
      'hk_total',
      'status','username',
      // --- digital signatures (baru) ---
      'asisten_ts','askep_ts','manager_ts',
      'created_at','updated_at'
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
  if (s.getLastRow() < 1) {
    headers(s,[
      'nomor','item_idx','no_material','nama','jumlah','satuan','created_at'
    ]);
    return s;
  }
  // MIGRASI: tambah kolom no_material jika belum ada
  const lastCol = s.getLastColumn();
  const head = s.getRange(1,1,1,lastCol).getValues()[0];
  if (!head.includes('no_material')) {
    s.insertColumnsAfter(lastCol || 1, 1);
    const newHead = head.concat(['no_material']);
    s.getRange(1,1,1,newHead.length).setValues([newHead]).setFontWeight('bold');
  }
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
  const profile = {
    username: userRow.username,
    role: userRow.role,
    plant_id: userRow.plant_id || '',
    estate_id: userRow.estate_id || '',
    rayon_id: userRow.rayon_id || '',
    divisi_id: userRow.divisi_id || '',
    divisi: userRow.divisi || '',          // jika ada kolom ini
    estate_full: userRow.estate_full || ''
  };
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


function rkbReplace(body, sess){
  ensureRKB(); ensureRkbColumns_(); ensureRKBItems(); ensureRKBBahan();
  const me = getUserFromSession(sess);
  const H = body.header || {};
  const L = Array.isArray(body.items) ? body.items : [];

  const nomor = (H.nomor||'').toString().trim();
  if (!nomor) return {ok:false, error:'nomor wajib'};

  // Hapus detail lama
  clearDetailsByNomor(nomor);

  // Hitung hk_total header dari items baru
  const hk_total = L.reduce((acc, it) => {
    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const pct  = (Number(it.pct_bhl)||0) + (Number(it.pct_sku)||0) + (Number(it.pct_bhb)||0);
    return acc + base * (pct/100);
  }, 0);

  // Lengkapi scope bila kosong
  const scope = resolveScopeFromRow_(Object.assign({}, H, {username: me.username}));

  const header = Object.assign({
    nomor,
    periode: H.periode||'',
    status: (H.status||'draft'),
    username: me.username||'',
    asisten_ts: H.asisten_ts || sigWIB(),
    askep_ts: H.askep_ts || '',
    manager_ts: H.manager_ts || '',
    created_at: nowIso(),
    updated_at: nowIso()
  }, scope, { hk_total });

  upsertRow(sh(SHEETS.RKB), 'nomor', header);

  // Tulis items + bahan (insert all)
  const si = ensureRKBItems();
  const sb = ensureRKBBahan();
  const hi = si.getRange(1,1,1,si.getLastColumn()).getValues()[0];
  const hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];

  const rowsI = [];
  const rowsB = [];

  L.forEach((it, i) => {
    const idx = Number(it.idx || (i+1));
    const lokasiStr = lokasiToString_(it.lokasi);

    const base = (Number(it.volume)||0) * (Number(it.hk_unit)||0);
    const hk_bhl = base * ((Number(it.pct_bhl)||0)/100);
    const hk_sku = base * ((Number(it.pct_sku)||0)/100);
    const hk_bhb = base * ((Number(it.pct_bhb)||0)/100);
    const hk_tot = hk_bhl + hk_sku + hk_bhb;

    const objI = {
      nomor, idx,
      pekerjaan: it.pekerjaan||'',
      activity_type: it.activity_type||'',
      lokasi: lokasiStr,
      volume: it.volume||'',
      satuan: it.satuan||'',
      hk_unit: it.hk_unit||'',
      pct_bhl: it.pct_bhl||'',
      pct_sku: it.pct_sku||'',
      pct_bhb: it.pct_bhb||'',
      hk_bhl, hk_sku, hk_bhb, hk_total: hk_tot,
      pengawas: it.pengawas||'',
      created_at: nowIso()
    };
    rowsI.push(hi.map(h => objI[h]!==undefined ? objI[h] : ''));

    (it.bahan||[]).forEach(b => {
      const objB = {
        nomor,
        item_idx: idx,
        no_material: getNoMaterial_(b),
        nama: b.nama||'',
        jumlah: b.jumlah||'',
        satuan: b.satuan||'',
        created_at: nowIso()
      };
      rowsB.push(hb.map(h => objB[h]!==undefined ? objB[h] : ''));
    });
  });

  if (rowsI.length){
    const startI = si.getLastRow()+1;
    si.getRange(startI,1,rowsI.length,hi.length).setValues(rowsI);
  }
  if (rowsB.length){
    const startB = sb.getLastRow()+1;
    sb.getRange(startB,1,rowsB.length,hb.length).setValues(rowsB);
  }

  return {ok:true, nomor, hk_total, status: header.status};
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
    masters.yrates = only(mastersAll.yrates, r => {
  const div = String(r.divisi_id||'');
  const est = String(r.estate_id||'');
  const pl  = String(r.plant_id ||'');
  // global: semua kosong
  if(!div && !est && !pl) return true;
  // spesifik divisi
  if(div) return div === divId;
  // spesifik estate (tanpa divisi)
  if(est) return est === estateId;
  // spesifik plant (tanpa estate & divisi)
  if(pl)  return pl  === String(me.plant_id||'');
  return false;
});
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
    masters.yrates = only(mastersAll.yrates, r => {
  const div = String(r.divisi_id||'');
  const est = String(r.estate_id||'');
  const pl  = String(r.plant_id ||'');
  // global
  if(!div && !est && !pl) return true;
  // bila baris punya divisi: harus termasuk divIds estate ini
  if(div) return divIds.has(div);
  // bila hanya estate: harus match estate saya
  if(est) return est === estateId;
  // bila hanya plant: match plant saya (ambil dari estate jika perlu)
  const plantOfEstate = ((masters.yestate||[])[0]||{}).plant_id || me.plant_id || '';
  if(pl)  return pl === String(plantOfEstate||'');
  return false;
});
    masters.yorg_map  = only(mastersAll.yorg_map, u=> String(u.estate_id||'') === estateId);
  }

  // === 2a) Data aktual (RKB) sesuai role, seperti sebelumnya ===
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

  // === 2b) Data aktual (PDO) sesuai role ===
const allPdo = getAll(sh(PDO_SHEETS.PDO));
let pdo;
if (String(me.role||'') === 'Admin') {
  pdo = allPdo.slice(-1000);
} else if (String(me.role||'') === 'Asisten') {
  pdo = allPdo.filter(x => String(x.divisi_id||'') === String(me.divisi_id||'')).slice(-500);
} else {
  pdo = allPdo.filter(x => String(x.estate_id||'') === String(me.estate_id||'')).slice(-1000);
}
const pdoNomorSet = new Set((pdo||[]).map(r => String(r.nomor)));
const pdo_items = getAll(sh(PDO_SHEETS.PDO_ITEMS)).filter(i => pdoNomorSet.has(String(i.nomor)));
const pdo_comments_all = getAll(sh(PDO_SHEETS.PDO_COMMENTS));
let pdo_comments = pdo_comments_all.filter(c =>
  String(c.to_username||'').toLowerCase() === String(me.username||'').toLowerCase()
);
// opsional join info periode/divisi untuk badge
const mapP = Object.fromEntries(pdo.map(pp => [String(pp.nomor), pp]));
pdo_comments.forEach(x=>{
  const rr = mapP[String(x.nomor)] || {};
  x.periode = rr.periode || '';
  x.divisi  = rr.divisi_id || '';
});

// === 2c) Data aktual (RKH) sesuai role ===
ensureRKH(); ensureRKHItems(); ensureRKHBahan();
const allRkh = getAll(sh(RKH_SHEETS.RKH));
let rkh;
if (String(me.role||'') === 'Admin') {
  rkh = allRkh.slice(-1000);
} else if (String(me.role||'') === 'Asisten') {
  rkh = allRkh.filter(x => String(x.divisi_id||'') === String(me.divisi_id||'')).slice(-500);
} else {
  rkh = allRkh.filter(x => String(x.estate_id||'') === String(me.estate_id||'')).slice(-1000);
}
const rkhNomorSet = new Set((rkh||[]).map(r => String(r.nomor)));
const rkh_items = getAll(sh(RKH_SHEETS.RKH_ITEMS)).filter(i => rkhNomorSet.has(String(i.nomor)));
const rkh_bahan = getAll(sh(RKH_SHEETS.RKH_BAHAN)).filter(b => rkhNomorSet.has(String(b.nomor)));


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
    // === RKB ===
      rkb,  rkb_items,  rkb_bahan,  rkb_comments,

    // === PDO ===
    pdo, pdo_items, pdo_comments,

    // RKH
    rkh, rkh_items, rkh_bahan
    },
    counters: {
      inboxUnread
    }
  };
}

function getNoMaterial_(b){
  const keys = ['no_material','noMaterial','material_no','materialNo','kode','code','no','id'];
  for (var i=0;i<keys.length;i++){
    var v = b && b[keys[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
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
  pekerjaan:'', activity_type:'', volume:'', satuan:'', hk_unit:'', pct_bhl:'', pct_sku:'', pct_bhb:'',
  hk_bhl:'', hk_sku:'', hk_bhb:'', pengawas:'',
  hk_total: 0,                               // dihitung setelah loop items
  status: 'submitted',
  username: me.username||'',
  // --- digital signatures ---
  asisten_ts: row.created_ts || sigWIB(),    // TTD Asisten saat submit
  askep_ts: '',                              // diisi saat Askep approve
  manager_ts: '',                            // diisi saat Manager approve
  created_at: nowIso(),
  updated_at: nowIso()
};


  // === Hapus detail lama, siapkan sheet detail ===
  clearDetailsByNomor(row.nomor);
  
  // Hapus semua detail PDO untuk 1 nomor
  function pdoClearDetails_(nomor){
    const s = ensurePDOItems();
    const all = getAll(s);
    for (let i = all.length - 1; i >= 0; i--){
      if (String(all[i].nomor) === String(nomor)){
        s.deleteRow(i + 2); // +2 karena header di baris 1
      }
    }
  }

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

    const lokasiStr = lokasiToString_(it.lokasi);

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
        no_material: getNoMaterial_(b),   // ← isi kolom no_material
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

  r.status = 'askep_approved';  r.askep_ts = sigWIB();   r.updated_at = nowIso();  upsertRow(s, 'nomor', r);

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

  r.status = 'full_approved'; r.manager_ts = sigWIB(); r.updated_at = nowIso(); upsertRow(s, 'nomor', r);

  const m = mastersAsMap();
  const asis = m._idx.userByName[(r.username||'').toLowerCase()];
  const ktu  = m.yorg_map.filter(x => String(x.role||'')==='KTU' && String(x.estate_id||'')===String(r.estate_id||''));

  const ids = []
    .concat(asis?.telegram_asisten||[])
    .concat(m._idx.userByName[(me.username||'').toLowerCase()]?.telegram_manager||[])
    .concat(ktu.map(k=>k.telegram_ktu).filter(Boolean));

  const msg = `🎉 Manager FULL APPROVE No: ${nomor} Status: Full Approve`;
  ids.forEach(id=> sendTelegram(id, msg));
  return {ok:true};
}
/** KTU Rekap **/
function ktuRekap(body, sess){
  // Pastikan sheet ada
  ensureRKB(); ensureRKBItems(); ensureRKBBahan();

  // Ambil RKB yang sudah FULL APPROVE saja
  const rkbRows = getAll(sh(SHEETS.RKB))
    .filter(x => String(x.status||'').toLowerCase() === 'full_approved');

  // Index cepat header RKB per nomor
  const mapR = Object.fromEntries(rkbRows.map(r => [String(r.nomor), r]));
  const nomorSet = new Set(Object.keys(mapR));

  // Ambil detail bahan & items untuk pekerjaan
  const itemsB = getAll(sh(SHEETS.RKB_BAHAN)).filter(b => nomorSet.has(String(b.nomor)));
  const itemsI = getAll(sh(SHEETS.RKB_ITEMS)).filter(i => nomorSet.has(String(i.nomor)));

  // pekerjaanByKey: "nomor|idx" => pekerjaan
  const pekerjaanByKey = Object.fromEntries(
    itemsI.map(i => [`${i.nomor}|${i.idx}`, i.pekerjaan])
  );

  const items = [];
  const sum = {};

  itemsB.forEach(b => {
    const head = mapR[String(b.nomor)] || {};
    const keyNI = `${b.nomor}|${b.item_idx}`;
    const pekerjaan = pekerjaanByKey[keyNI] || '';

    const nama   = b.nama || '';
    const satuan = b.satuan || '';
    const jumlah = Number(b.jumlah || 0);
    const no_material = String(b.no_material || ''); // ← KIRIMKAN KE FE

    items.push({
      nomor: b.nomor,
      periode: head.periode || '',
      divisi: head.divisi || head.divisi_id || '',
      pekerjaan,
      no_material,               // ← field baru di payload
      nama,
      jumlah,
      satuan
    });

    // Agregasi total estate (tetap seperti sebelumnya — per nama+satuan)
    const key = nama + '|' + satuan;
    sum[key] = (sum[key] || 0) + jumlah;
  });

  const total = Object.entries(sum).map(([k, v]) => {
    const [nama, satuan] = k.split('|'); return { nama, total: v, satuan };
  });

  return { ok: true, items, total };
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
  
  // RKB
  ensureRKB(); ensureComments(); ensureRKBItems(); ensureRKBBahan();  
  
  // PDO
  ensurePDO(); ensurePDOItems(); ensurePDOComments();

  // RKH
  ensureRKH();  ensureRKHItems();  ensureRKHBahan();
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
    const n = String(it.nomor);
    const hk = Number(it.hk_total || 0);
    hkMap[n] = (hkMap[n] || 0) + hk;
  });

  let updated = 0;
  const head = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];

  // backfill hanya kolom scope & hk_total
  const newRows = all.map(r => {
    const needScope =
      !r.plant_id || !r.estate_id || !r.rayon_id || !r.divisi_id || !r.estate_full;
    const scope = needScope ? resolveScopeFromRow_(r) : {};

    const currentHk = Number(r.hk_total || 0);
    const hk_total = currentHk > 0 ? currentHk : Number(hkMap[String(r.nomor)] || 0);

    if (!needScope && currentHk > 0) return r; // tidak ada perubahan

    updated += 1;
    return Object.assign({}, r, scope, { hk_total });
  });

  if (updated > 0) {
    const vals = newRows.map(row => head.map(h => row[h] !== undefined ? row[h] : ''));
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
    'hk_total',
    'status','username',
    // --- digital signatures (baru) ---
    'asisten_ts','askep_ts','manager_ts',
    'created_at','updated_at'
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
  PDO_ITEMS: 'pdo_items',
  PDO_COMMENTS: 'pdo_comments'
};

function pdoReplace(body, sess){
  ensurePDO(); ensurePDOItems();
  const me   = getUserFromSession(sess);
  const row  = body.row   || {};
  const it   = body.items || {};
  const hk   = Array.isArray(it.hk) ? it.hk : [];
  const bor  = Array.isArray(it.borongan) ? it.borongan : [];

  const nomor = (row.nomor || '').toString().trim();
  if (!nomor) return {ok:false, error:'nomor wajib'};
  const refRkb = (row.ref_rkb || '').toString().trim();

  // Enforce: 1 RKB = 1 PDO (kecuali jika update nomor yg sama)
  if (refRkb){
    const sHdr = ensurePDO();
    const allHdr = getAll(sHdr);
    const dupe = allHdr.find(r =>
      String(r.ref_rkb||'').toLowerCase() === refRkb.toLowerCase() &&
      String(r.nomor) !== nomor
    );
    if (dupe) return {ok:false, error:`Ref. RKB ${refRkb} sudah memiliki PDO ${dupe.nomor}`};
  }

  // Totals
  const totalHK   = hk.reduce((a,b)=> a + Number(b.total_rp||0), 0);
  const totalBor  = bor.reduce((a,b)=> a + Number(b.total_rp||0), 0);
  const premiP    = Number(row.premi_panen||0);
  const premiN    = Number(row.premi_non_panen||0);
  const totalRp   = totalHK + totalBor + premiP + premiN;

  const status = (row.status ? String(row.status) : 'submitted');

  // Header summary (upsert)
  const summary = {
    nomor,
    periode: row.periode||'',
    estate_id: String(row.estate_id ?? me.estate_id ?? '').trim(),
    rayon_id:  String(row.rayon_id  ?? me.rayon_id  ?? '').trim(),
    divisi_id: row.divisi_id || me.divisi_id || me.divisi || '',
    ref_rkb: refRkb,
    upah_hk_bhl: Number(row.upah_hk_bhl||0),
    upah_hk_sku: Number(row.upah_hk_sku||0),
    target_produksi_ton: Number(row.target_produksi_ton||0),
    premi_panen: premiP,
    premi_non_panen: premiN,
    total_rp: totalRp,
    status: status,                                 // ← penting
    asst_ts: row.created_ts || nowSigWIB(),         // TTD Asisten
    // Jangan ubah ts Askep/Manager di replace biasa; biarkan kosong jika belum approve lagi:
    askep_ts: row.askep_ts || '',
    manager_ts: row.manager_ts || '',
    created_by: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  upsertRow(ensurePDO(), 'nomor', summary);

  // REPLACE detail
  clearPDOItemsByNomor(nomor);
  const sItm = ensurePDOItems();
  const head = sItm.getRange(1,1,1,sItm.getLastColumn()).getValues()[0];

  const rows = [];

  // HK
  hk.forEach((r, i) => {
    const obj = {
      nomor,
      tipe_item: 'HK',
      activity_type: (r.activity_type||''),
      idx: i+1,
      pekerjaan: (r.pekerjaan||''),
      satuan: (r.satuan||''),
      luas_ha: Number(r.luas_ha||0),
      hk: Number(r.hk||0),
      tipe_hk: String(r.tipe||'').toUpperCase(), // 'SKU' | 'BHL'
      total_rp: Number(r.total_rp||0),
      qty: '',                     // kosong utk HK
      tarif_borongan: ''           // kosong utk HK
    };
    rows.push(head.map(h => obj[h]!==undefined ? obj[h] : ''));
  });

  // BORONGAN
  bor.forEach((r, j) => {
    const obj = {
      nomor,
      tipe_item: 'BOR',
      activity_type: (r.activity_type||''),
      idx: j+1,
      pekerjaan: (r.pekerjaan||''),
      satuan: (r.satuan||''),
      luas_ha: '',                 // kosong utk BOR
      hk: '',                      // kosong utk BOR
      tipe_hk: '',                 // kosong utk BOR
      total_rp: Number(r.total_rp||0),
      qty: Number(r.qty||0),
      tarif_borongan: Number(r.tarif_borongan||0)
    };
    rows.push(head.map(h => obj[h]!==undefined ? obj[h] : ''));
  });

  if (rows.length){
    const start = sItm.getLastRow() + 1;
    sItm.getRange(start, 1, rows.length, head.length).setValues(rows);
  }

  return {ok:true, nomor, total_rp: totalRp, status};
}

// WIB timestamp "DD/MM/YY-hh:mm:ss" → untuk tanda tangan digital
function nowSigWIB(){
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(new Date(), tz, 'dd/MM/yy-HH:mm:ss');
}

// WIB timestamp "DDMMYYYY.hhmmss" → tetap disediakan bila diperlukan (nomor dll)
function nowStampWIB(){
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(new Date(), tz, 'ddMMyyyy.HHmmss');
}

function ensurePDO(){
  const s = sh(PDO_SHEETS.PDO);
  if (s.getLastRow() < 1){
    headers(s, [
      'nomor','periode','estate_id','rayon_id','divisi_id',
      'ref_rkb','upah_hk_bhl','upah_hk_sku','target_produksi_ton',
      'premi_panen','premi_non_panen',
      'total_rp','status','asst_ts','askep_ts','manager_ts',
      'created_by','created_at','updated_at'
    ]);
  }
  // format kolom estate_id (C) & rayon_id (D) sebagai text
  const maxRows = Math.max(s.getMaxRows(), 1000);
  s.getRange(1, 3, maxRows, 2).setNumberFormat('@');
  return s;
}


function ensurePDOItems(){
  const s = sh(PDO_SHEETS.PDO_ITEMS);
  if (s.getLastRow() < 1){
    headers(s, [
      'nomor','tipe_item','activity_type','idx','pekerjaan','satuan',
      'luas_ha','hk','tipe_hk','total_rp','qty','tarif_borongan'
    ]);
  }
  return s;
}

function ensurePDOComments(){
  const s = sh(PDO_SHEETS.PDO_COMMENTS);
  if (s.getLastRow() < 1){
    headers(s, ['id','nomor','role','username','to_username','comment','created_at','read_at']);
  } else {
    // jaga-jaga kalau sheet lama belum punya kolom opsional
    const lastCol = s.getLastColumn();
    const head = s.getRange(1,1,1,lastCol).getValues()[0];
    const NEED = ['id','to_username','read_at'];
    const missing = NEED.filter(h=> !head.includes(h));
    if(missing.length){
      s.insertColumnsAfter(lastCol || 1, missing.length);
      const newHead = head.concat(missing);
      s.getRange(1,1,1,newHead.length).setValues([newHead]).setFontWeight('bold');
    }
  }
  return s;
}


/**
 * Backward-compatible (KLASIK): payload body.items = array "gabungan"
 * Tetap dipertahankan agar klien lama masih bisa push.
 */
function pushPDO(body, sess){
  // Konversi ke struktur baru lalu delegasikan ke pushPDOv2
  const row = body.row || {};
  const itemsLegacy = body.items || []; // [{activity_type, pekerjaan, satuan_borongan, tarif_borongan, luas_ha, jlh_hk, total_rp}]

  const hk = [];
  const bor = [];

  (itemsLegacy || []).forEach((it, i) => {
    const activity_type = it.activity_type || '';  // ← ambil di sini
    const pekerjaan = it.pekerjaan || '';
    const satuan = it.satuan_borongan || '';
    const luas_ha = Number(it.luas_ha || 0);
    const hkVal = Number(it.jlh_hk || 0);
    const tb = Number(it.tarif_borongan || 0);
    const tot = Number(it.total_rp || 0);

    // Heuristik: jika punya HK → masukkan HK (tipe tidak diketahui → kosong)
    if (hkVal > 0){
      hk.push({ activity_type, pekerjaan, satuan, luas_ha, hk: hkVal, tipe:'', total_rp: (tot>0 ? tot : Math.round(hkVal * 0)) });
    }

    // Jika ada tarif borongan & total → masukkan Borongan (qty tidak diketahui)
    if (tb > 0 && tot > 0){
      const qty = Math.round(tot / tb);
      bor.push({ activity_type, pekerjaan, satuan, qty, tarif_borongan: tb, total_rp: tot });
    }
  });

  const payloadV2 = { row, items:{ hk, borongan: bor } };
  return pushPDOv2(payloadV2, sess);
}

/**
 * Struktur BARU:
 * body = { row: {...}, items: { hk:[], borongan:[] } }
 * - hk:      [{ pekerjaan, satuan, luas_ha, hk, tipe:'SKU'|'BHL'|'', total_rp }]
 * - borongan:[{ pekerjaan, satuan, qty, tarif_borongan, total_rp }]
 */
function pushPDOv2(body, sess){
  ensurePDO(); ensurePDOItems();
  const me = getUserFromSession(sess);
  const row = body.row || {};
  const items = body.items || {};
  const hk = items.hk || [];
  const bor = items.borongan || [];

  // Hitung total
  const totalHK  = hk.reduce((a,b)=> a + Number(b.total_rp||0), 0);
  const totalBor = bor.reduce((a,b)=> a + Number(b.total_rp||0), 0);
  const totalPremi = Number(row.premi_panen||0) + Number(row.premi_non_panen||0);
  const total = totalHK + totalBor + totalPremi;

  // Nomor: gunakan yang dikirim, jika kosong fallback pola lama (front-end sekarang sudah auto)
  const nomor = row.nomor || `PDO-${(me.divisi||'XX')}-${nowStampWIB()}`;

  // Header (summary)
  const summary = {
    nomor,
    periode: row.periode||'',
    estate_id: String(row.estate_id ?? me.estate_id ?? '').trim(),
    rayon_id:  String(row.rayon_id  ?? me.rayon_id  ?? '').trim(),
    divisi_id: row.divisi_id||me.divisi||'',
    ref_rkb: row.ref_rkb||'',
    upah_hk_bhl: Number(row.upah_hk_bhl||0),
    upah_hk_sku: Number(row.upah_hk_sku||0),
    target_produksi_ton: Number(row.target_produksi_ton||0),
    premi_panen: Number(row.premi_panen||0),
    premi_non_panen: Number(row.premi_non_panen||0),
    total_rp: total,
    status: 'submitted',              // menunggu Askep
    asst_ts: row.created_ts || nowSigWIB(), // tanda tangan Asisten, pakai format DD/MM/YY-hh:mm:ss
    askep_ts: row.askep_ts || '',
    manager_ts: row.manager_ts || '',
    created_by: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  // Upsert header
  const sHdr = ensurePDO();
  upsertRow(sHdr, 'nomor', summary);

  // Rebuild detail sheet (pertahankan data nomor lain, konversi bila skema lama)
  const sItm = ensurePDOItems();
  const oldAll = getAll(sItm) || [];

  // Konversi semua baris lama ke skema baru (jika sheet sebelumnya pakai kolom lama)
  const keep = oldAll.filter(x => String(x.nomor) !== String(nomor)).map(x => {
    // deteksi apakah baris sudah skema baru
    const hasNewCols = ('tipe_item' in x) || ('qty' in x) || ('tarif_borongan' in x) || ('tipe_hk' in x) || ('activity_type' in x);
if (hasNewCols){
  return [
    x.nomor || '', x.tipe_item || '', x.activity_type || '', Number(x.idx||0), x.pekerjaan||'', x.satuan||'',
    Number(x.luas_ha||0), Number(x.hk||0), String(x.tipe_hk||''), Number(x.total_rp||0),
    Number(x.qty||0), Number(x.tarif_borongan||0)
  ];
}else{
  return [
    x.nomor || '', (Number(x.jlh_hk||0)>0 ? 'HK' : 'BOR'),
    String(x.activity_type||x.activity||''),   // ← best-effort dari skema lama
    Number(x.idx||0), x.pekerjaan||'', x.satuan_borongan||'',
    Number(x.luas_ha||0), Number(x.jlh_hk||0), '', Number(x.total_rp||0),
    (Number(x.tarif_borongan||0)>0 && Number(x.total_rp||0)>0) ? Math.round(Number(x.total_rp)/Number(x.tarif_borongan)) : 0,
    Number(x.tarif_borongan||0)
  ];
}
  });

  

  // Build baris baru untuk nomor ini
  const rowsNew = [];
(hk||[]).forEach((it,i)=>{
  rowsNew.push([
    nomor, 'HK', it.activity_type||'', i+1,
    it.pekerjaan||'', it.satuan||'',
    Number(it.luas_ha||0), Number(it.hk||0), String(it.tipe||''), Number(it.total_rp||0),
    0, 0
  ]);
});
(bor||[]).forEach((it,i)=>{
  rowsNew.push([
    nomor, 'BOR', it.activity_type||'', (hk.length + i + 1),
    it.pekerjaan||'', it.satuan||'',
    0, 0, '', Number(it.total_rp||0),
    Number(it.qty||0), Number(it.tarif_borongan||0)
  ]);
});

  // Tulis ulang sheet items dengan header skema baru
sItm.clear();
headers(sItm, [
  'nomor','tipe_item','activity_type','idx','pekerjaan','satuan',
  'luas_ha','hk','tipe_hk','total_rp','qty','tarif_borongan'
]);
  const allRows = keep.concat(rowsNew);
  if (allRows.length){
    sItm.getRange(2,1,allRows.length,12).setValues(allRows);
  }

  return {ok:true, nomor};
}

function pdoAskepComment(body, sess){
  ensurePDOComments(); ensurePDO();
  const me = getUserFromSession(sess);
  const nomor = body.nomor, text = (body.text||'').toString();
  if(!nomor || !text) return {ok:false, error:'Nomor & komentar wajib'};

  const p = getAll(sh(PDO_SHEETS.PDO)).find(x=> String(x.nomor)===String(nomor));
  if(!p) return {ok:false, error:'PDO tidak ditemukan'};

  const id = Utilities.getUuid();
  const toUser = p.created_by || '';
  upsertRow(sh(PDO_SHEETS.PDO_COMMENTS),'id',{
    id, nomor, role:'Askep', username:me.username, to_username:toUser,
    comment:text, created_at: nowIso(), read_at:''
  });

  // kembalikan status ke draft (asisten perbaiki)
  p.status = 'draft';
  p.updated_at = nowIso();
  upsertRow(sh(PDO_SHEETS.PDO),'nomor', p);

  return {ok:true};
}

function pdoManagerComment(body, sess){
  ensurePDOComments(); ensurePDO();
  const me = getUserFromSession(sess);
  const nomor = body.nomor, text = (body.text||'').toString();
  if(!nomor || !text) return {ok:false, error:'Nomor & komentar wajib'};

  const p = getAll(sh(PDO_SHEETS.PDO)).find(x=> String(x.nomor)===String(nomor));
  if(!p) return {ok:false, error:'PDO tidak ditemukan'};

  const id = Utilities.getUuid();
  const toUser = p.created_by || '';
  upsertRow(sh(PDO_SHEETS.PDO_COMMENTS),'id',{
    id, nomor, role:'Manager', username:me.username, to_username:toUser,
    comment:text, created_at: nowIso(), read_at:''
  });

  // kembalikan status ke draft (asisten perbaiki)
  p.status = 'draft';
  p.updated_at = nowIso();
  upsertRow(sh(PDO_SHEETS.PDO),'nomor', p);

  return {ok:true};
}


function pdoListForAskep(body, sess){
  ensurePDO();
  const me = getUserFromSession(sess);
  const m = getAll(ensurePDO())
    .filter(x => String(x.rayon_id||'')===String(me.rayon_id||''))
    .filter(x => String(x.status||'')==='submitted');
  return {ok:true, rows:m};
}

function pdoAskepApprove(body, sess){
  const s = ensurePDO();
  const nomor = body.nomor||'';
  const head = getAll(s);
  const idx = head.findIndex(x=> String(x.nomor)===String(nomor));
  if(idx<0) return {ok:false, error:'not found'};
  const row = head[idx];
  row.status='askep_approved';
  row.askep_ts = nowSigWIB();  // TTD Askep
  row.updated_at = nowIso();
  upsertRow(s, 'nomor', row);
  return {ok:true};
}

function pdoListForManager(body, sess){
  ensurePDO();
  const me = getUserFromSession(sess);
  const m = getAll(ensurePDO())
    .filter(x => String(x.estate_id||'')===String(me.estate_id||''))
    .filter(x => String(x.status||'')==='askep_approved');
  return {ok:true, rows:m};
}

function pdoManagerApprove(body, sess){
  const s = ensurePDO();
  const nomor = body.nomor||'';
  const head = getAll(s);
  const idx = head.findIndex(x=> String(x.nomor)===String(nomor));
  if(idx<0) return {ok:false, error:'not found'};
  const row = head[idx];
  row.status='full_approved';
  row.manager_ts = nowSigWIB(); // TTD Manager
  row.updated_at = nowIso();
  upsertRow(s, 'nomor', row);
  return {ok:true};
}

function ktuRekapPDO(body, sess){
  ensurePDO();
  const m = mastersAsMap();

  // Ambil semua PDO, lalu mapping ke payload ringkas untuk FE
  const rows = getAll(ensurePDO()).map(r=>{
    const est = m._idx.estateById[String(r.estate_id||'')] || {};
    const ray = m._idx.rayonById[String(r.rayon_id||'')]   || {};

    return {
      nomor      : r.nomor,
      periode    : r.periode || '',
      divisi_id  : r.divisi_id || '',
      rayon_kode : (ray.kode || ray.kd_rayon || ''),
      // penting: pakai nama_panjang dulu agar match dengan filter FE
      estate_nama: (est.nama_panjang || est.nama || ''),
      total_rp   : Number(r.total_rp || 0),

      // === tambahkan status ke FE ===
      // biarkan apa adanya (lowercase). FE sudah normalize ke UPPER.
      status     : (r.status || '')    // 'draft' | 'submitted' | 'askep_approved' | 'full_approved' | ...
    };
  });

  return { ok:true, rows };
}


function getPdoDetail(body, sess){
  const nomor = (body.nomor||'').toString().trim();
  if(!nomor) return {ok:false, error:'nomor required'};

  const me = getUserFromSession(sess);
  const r = getAll(sh(PDO_SHEETS.PDO)).find(x=> String(x.nomor)===nomor);
  if(!r) return {ok:false, error:'PDO tidak ditemukan'};

  // Akses: Admin semua; Askep filter rayon; Manager/KTU filter estate; Asisten hanya miliknya
  const role = String(me.role||'').toLowerCase();
  const isOwner = String(r.created_by||'').toLowerCase() === String(me.username||'').toLowerCase();
  const allowed =
    role==='admin' ||
    (role==='askep'   && String(r.rayon_id||'')  === String(me.rayon_id||'')) ||
    (role==='manager' && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='ktu'     && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='asisten' && isOwner);
  if(!allowed) return {ok:false, error:'Unauthorized'};

  const items = getAll(sh(PDO_SHEETS.PDO_ITEMS)).filter(i => String(i.nomor)===nomor);
  const comments = getAll(sh(PDO_SHEETS.PDO_COMMENTS)).filter(c => String(c.nomor)===nomor);

  // hitung ulang total dari items + premi (jaga konsistensi)
  const totalHK  = items.filter(i=>String(i.tipe_item)==='HK').reduce((a,b)=>a+Number(b.total_rp||0),0);
  const totalBor = items.filter(i=>String(i.tipe_item)==='BOR').reduce((a,b)=>a+Number(b.total_rp||0),0);
  const totalPremi = Number(r.premi_panen||0) + Number(r.premi_non_panen||0);
  const header = Object.assign({}, r, { total_rp: totalHK+totalBor+totalPremi });

  return {ok:true, header, items, comments};
}

function clearPDOItemsByNomor(nomor){
  const s = ensurePDOItems();
  const all = getAll(s);
  for (let i = all.length - 1; i >= 0; i--){
    if (String(all[i].nomor) === String(nomor)) s.deleteRow(i+2);
  }
}


// === [END PDO MODULE] =====================================================



// === [START RKH MODULE] =====================================================

const RKH_SHEETS = {
  RKH: 'rkh',
  RKH_ITEMS: 'rkh_items',
  RKH_BAHAN: 'rkh_bahan'
};

function ensureRKH(){
  const s = sh(RKH_SHEETS.RKH);
  if (s.getLastRow() < 1){
    headers(s, [
      'nomor','tanggal','periode',
      'plant_id','estate_id','rayon_id','divisi_id',
      'divisi','estate_full',
      'ref_rkb',                 // referensi RKB
      'status',                  // 'created'
      'username','created_at','updated_at'
    ]);
  }
  return s;
}
function ensureRKHItems(){
  const s = sh(RKH_SHEETS.RKH_ITEMS);
  if (s.getLastRow() < 1){
    headers(s,[
      'nomor','idx','pekerjaan','activity_type',
      'lokasi',           // gabungan nama lokasi (koma)
      'volume','satuan',
      'hk_unit','pct_bhl','pct_sku','pct_bhb',
      'hk_bhl','hk_sku','hk_bhb','hk_total',
      'pengawas','created_at'
    ]);
  }
  return s;
}
function ensureRKHBahan(){
  const s = sh(RKH_SHEETS.RKH_BAHAN);
  if (s.getLastRow() < 1){
    headers(s,[
      'nomor','item_idx','no_material','nama','jumlah','satuan','created_at'
    ]);
  } else {
    // jaga-jaga migrasi no_material
    const lastCol = s.getLastColumn();
    const head = s.getRange(1,1,1,lastCol).getValues()[0];
    if (!head.includes('no_material')) {
      s.insertColumnsAfter(lastCol || 1, 1);
      const newHead = head.concat(['no_material']);
      s.getRange(1,1,1,newHead.length).setValues([newHead]).setFontWeight('bold');
    }
  }
  return s;
}

// Helper: YYYY-MM dari Date
function yyyymmFromDate_(d){
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(d, tz, 'yyyy-MM');
}

function lokasiToString_(lok){
  if (Array.isArray(lok)){
    return lok
      .map(l => {
        if (l == null) return '';
        if (typeof l === 'string') return l;
        if (typeof l === 'object') return String(l.name || l.nama || l.blok || l.label || l.id || '');
        return String(l);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof lok === 'string') return lok;
  if (lok && typeof lok === 'object') return String(lok.name || lok.nama || lok.blok || lok.label || lok.id || '');
  return '';
}

function createRKHFromRKB(body, sess){
  ensureRKH(); ensureRKHItems(); ensureRKHBahan(); ensureRKB(); ensureRKBItems(); ensureRKBBahan();

  const me = getUserFromSession(sess);
  const ref_rkb = (body.ref_rkb||'').toString().trim();
  const tanggalStr = (body.tanggal||'').toString().trim(); // ISO atau yyyy-mm-dd
  if(!ref_rkb || !tanggalStr) return {ok:false, error:'ref_rkb & tanggal wajib'};

  const tanggal = new Date(tanggalStr);
  if (isNaN(tanggal.getTime())) return {ok:false, error:'Format tanggal tidak valid'};

  // Ambil header RKB + items + bahan
  const rkb = getAll(sh(SHEETS.RKB)).find(r => String(r.nomor)===ref_rkb);
  if (!rkb) return {ok:false, error:'RKB tidak ditemukan'};

  // Scope (estate/rayon/divisi/plant) – pakai helper yang sudah ada
  const scope = resolveScopeFromRow_(rkb);

  const itemsR = getAll(sh(SHEETS.RKB_ITEMS)).filter(i => String(i.nomor)===ref_rkb);
  const bahanR = getAll(sh(SHEETS.RKB_BAHAN)).filter(b => String(b.nomor)===ref_rkb);

  // Nomor RKH
  const nomor = `RKH-${(scope.divisi_id||'XX')}-${nowStampWIB()}`;

  // Ringkasan RKH
  const summary = {
    nomor,
    tanggal: Utilities.formatDate(tanggal, Session.getScriptTimeZone()||'Asia/Jakarta', 'yyyy-MM-dd'),
    periode: yyyymmFromDate_(tanggal),
    plant_id:  scope.plant_id||'',
    estate_id: scope.estate_id||'',
    rayon_id:  scope.rayon_id||'',
    divisi_id: scope.divisi_id||'',
    divisi:    rkb.divisi || scope.divisi_id || '',
    estate_full: scope.estate_full || rkb.estate_full || '',
    ref_rkb: ref_rkb,
    status: 'created',           // final di Asisten
    username: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  upsertRow(ensureRKH(), 'nomor', summary);

  // Siapkan header kolom detail
  const si = ensureRKHItems();
  const sb = ensureRKHBahan();
  const headI = si.getRange(1,1,1,si.getLastColumn()).getValues()[0];
  const headB = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];

  // Buat rows detail: volume dibagi 20
  const insertsI = [];
  (itemsR||[]).forEach((it, idx)=>{
    const vol = Number(it.volume||0) / 20; // ← skala harian
    const hk_unit = Number(it.hk_unit||0);
    const base = vol * hk_unit;
    const pct_bhl = Number(it.pct_bhl||0);
    const pct_sku = Number(it.pct_sku||0);
    const pct_bhb = Number(it.pct_bhb||0);
    const hk_bhl = base * (pct_bhl/100);
    const hk_sku = base * (pct_sku/100);
    const hk_bhb = base * (pct_bhb/100);
    const hk_total = hk_bhl + hk_sku + hk_bhb;

    const objI = {
      nomor, idx: idx+1,
      pekerjaan: it.pekerjaan||'',
      activity_type: it.activity_type||'',
      lokasi: it.lokasi||'',
      volume: vol,
      satuan: it.satuan||'',
      hk_unit,
      pct_bhl, pct_sku, pct_bhb,
      hk_bhl, hk_sku, hk_bhb, hk_total,
      pengawas: it.pengawas||'',
      created_at: nowIso()
    };
    insertsI.push(headI.map(h => objI[h]!==undefined ? objI[h] : ''));
  });

  // Bahan: jumlah dibagi 20 juga? (Jika bahan dipakai proporsional harian)
  // Jika TIDAK ingin dibagi 20, hapus pembagian di bawah.
  const insertsB = [];
  (bahanR||[]).forEach(b=>{
    const objB = {
      nomor,
      item_idx: Number(b.item_idx||0),
      no_material: b.no_material || '',
      nama: b.nama || '',
      jumlah: Number(b.jumlah||0) / 20,   // ← skala harian (ubah jika ingin tetap)
      satuan: b.satuan || '',
      created_at: nowIso()
    };
    insertsB.push(headB.map(h => objB[h]!==undefined ? objB[h] : ''));
  });

  // Tulis detail
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
  appendRows(si, insertsI);
  appendRows(sb, insertsB);

  return {ok:true, nomor};
}

function pushRKH(body, sess){
  ensureRKH(); ensureRKHItems(); ensureRKHBahan();

  const me = getUserFromSession(sess);
  const row = body.row || {};
  const items = body.items || [];
  const bahan = body.bahan || [];

  // nomor
  const nomor = row.nomor || `RKH-${(row.divisi||'XX')}-${nowStampWIB()}`;

  // derive periode dari tanggal
  const tanggal = new Date(row.tanggal || new Date());
  const periode = row.periode || yyyymmFromDate_(tanggal);

  // scope dari row atau username
  const scope = resolveScopeFromRow_(row.username ? { username: row.username, divisi_id: row.divisi_id, estate_id: row.estate_id, rayon_id: row.rayon_id, plant_id: row.plant_id, estate_full: row.estate_full } : row);

  const summary = {
    nomor,
    tanggal: Utilities.formatDate(tanggal, Session.getScriptTimeZone()||'Asia/Jakarta', 'yyyy-MM-dd'),
    periode,
    plant_id:  scope.plant_id||'',
    estate_id: scope.estate_id||'',
    rayon_id:  scope.rayon_id||'',
    divisi_id: scope.divisi_id||'',
    divisi:    row.divisi || scope.divisi_id || '',
    estate_full: scope.estate_full || row.estate_full || '',
    ref_rkb: row.ref_rkb || '',
    status: 'created',
    username: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  upsertRow(ensureRKH(), 'nomor', summary);

  // Hapus detail lama untuk nomor ini, lalu tulis baru
  const si = ensureRKHItems();
  const sb = ensureRKHBahan();

  function clearByNomor_(sheet){
    const all = getAll(sheet);
    for (let i=all.length-1;i>=0;i--){
      if (String(all[i].nomor)===String(nomor)) sheet.deleteRow(i+2);
    }
  }
  clearByNomor_(si);
  clearByNomor_(sb);

  const headI = si.getRange(1,1,1,si.getLastColumn()).getValues()[0];
  const headB = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];

  const rowsI = (items||[]).map((it, idx)=>{
    const vol = Number(it.volume||0);
    const hk_unit = Number(it.hk_unit||0);
    const base = vol * hk_unit;
    const pct_bhl = Number(it.pct_bhl||0);
    const pct_sku = Number(it.pct_sku||0);
    const pct_bhb = Number(it.pct_bhb||0);
    const hk_bhl = base * (pct_bhl/100);
    const hk_sku = base * (pct_sku/100);
    const hk_bhb = base * (pct_bhb/100);
    const hk_total = hk_bhl + hk_sku + hk_bhb;

    const objI = {
      nomor, idx: (it.idx || idx+1),
      pekerjaan: it.pekerjaan||'',
      activity_type: it.activity_type||'',
      lokasi: lokasiToString_(it.lokasi),
      volume: vol,
      satuan: it.satuan||'',
      hk_unit,
      pct_bhl, pct_sku, pct_bhb,
      hk_bhl, hk_sku, hk_bhb, hk_total,
      pengawas: it.pengawas||'',
      created_at: nowIso()
    };
    return headI.map(h => objI[h]!==undefined ? objI[h] : '');
  });

  const rowsB = (bahan||[]).map(b=>{
    const objB = {
      nomor,
      item_idx: Number(b.item_idx||b.idx||0),
      no_material: b.no_material || '',
      nama: b.nama || '',
      jumlah: Number(b.jumlah||0),
      satuan: b.satuan || '',
      created_at: nowIso()
    };
    return headB.map(h => objB[h]!==undefined ? objB[h] : '');
  });

  if (rowsI.length) si.getRange(si.getLastRow()+1, 1, rowsI.length, rowsI[0].length).setValues(rowsI);
  if (rowsB.length) sb.getRange(sb.getLastRow()+1, 1, rowsB.length, rowsB[0].length).setValues(rowsB);

  return {ok:true, nomor};
}


function getRkhDetail(body, sess){
  const nomor = (body.nomor||'').toString().trim();
  if(!nomor) return {ok:false, error:'nomor required'};

  const me = getUserFromSession(sess);
  const r = getAll(sh(RKH_SHEETS.RKH)).find(x=> String(x.nomor)===nomor);
  if(!r) return {ok:false, error:'RKH tidak ditemukan'};

  // Akses: Admin semua; Askep = rayon; Manager/KTU = estate; Asisten = owner
  const role = String(me.role||'').toLowerCase();
  const isOwner = String(r.username||'').toLowerCase() === String(me.username||'').toLowerCase();
  const allowed =
    role==='admin' ||
    (role==='askep'   && String(r.rayon_id||'')  === String(me.rayon_id||'')) ||
    (role==='manager' && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='ktu'     && String(r.estate_id||'') === String(me.estate_id||'')) ||
    (role==='asisten' && isOwner);

  if(!allowed) return {ok:false, error:'Unauthorized'};

  const items = getAll(sh(RKH_SHEETS.RKH_ITEMS)).filter(i => String(i.nomor)===nomor);
  const bahan = getAll(sh(RKH_SHEETS.RKH_BAHAN)).filter(b => String(b.nomor)===nomor);

  // hk_total summary
  const hk_total = items.reduce((a,i)=> a + Number(i.hk_total||0), 0);
  const header = Object.assign({}, r, { hk_total });

  return {ok:true, header, items, bahan};
}

// === [END RKH MODULE] =====================================================
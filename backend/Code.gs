/**
 * RKB App - Google Apps Script backend
 * Deploy as web app (execute as Me, accessible to Anyone with the link)
 * Set Script Properties:
 *   TELEGRAM_BOT_TOKEN = 8462317463:AAFC3DIBom5uCsMKgCfJmB5jXymXyRccsz0
 *   TELEGRAM_CHAT_TEST = optional chat id for testing
 */

const SHEETS = {
  SESS: 'sessions',
  RKB: 'rkb',
  COMMENTS: 'rkb_comments'
};

const MASTER_SHEETS = [
  'yplant','yestate','yrayon','ydivisi','ykomplek','yblok','yactivity','ymaterial','yorg_map','yrates'
];

function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const token = body.token||'';
    const user = validateSession(token, action);

    const map = {
      login, resetPassword, pullMaster, pushRKB,
      listForAskep, askepApprove, askepComment,
      listForManager, managerApprove, managerComment,
      ktuRekap
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
  const last = s.getLastRow();
  if(last<2) return [];
  const vals = s.getRange(2,1,last-1,s.getLastColumn()).getValues();
  const head = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  return vals.map(r=> Object.fromEntries(r.map((v,i)=>[head[i], v])));
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
  if(s.getLastRow()<1) headers(s,[
    'nomor','periode',
    'plant_id','estate_id','rayon_id','divisi_id',
    'divisi','estate_full',
    'pekerjaan','activity_type', // (opsional; legacy single item)
    'volume','satuan','hk_unit','pct_bhl','pct_sku','pct_bhb',
    'hk_bhl','hk_sku','hk_bhb','pengawas',
    'bahan_json','lokasi_json',
    'items_json',                // <— NEW: daftar item (multi-pekerjaan)
    'status','username','created_at','updated_at'
  ]);
  return s;
}
function ensureComments(){
  const s = sh(SHEETS.COMMENTS);
  if(s.getLastRow()<1) headers(s, ['nomor','role','username','comment','created_at']);
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
  // Only admin
  const u = getUserFromSession(user);
  if(u.role!=='Admin') return {ok:false, error:'Unauthorized'};
  const target = (body.username||'').toString();
  const s = ensureUsers();
  const all = getAll(s);
  const found = all.find(x=> x.username===target);
  if(!found) return {ok:false, error:'User tidak ditemukan'};
  found.password_hash = sha256('user123');
  upsertRow(s, 'username', found);
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
function pullMaster(body, user){
  ensureMasters(); ensureRKB();
  const masters = {};
  MASTER_SHEETS.forEach(n=> masters[n] = getAll(sh(n)));
  // actuals example: last 60 days
  const rkb = getAll(sh(SHEETS.RKB)).slice(-500);
  return {ok:true, masters, actuals: {rkb}};
}

/** Push RKB from Asisten **/
function pushRKB(body, user){
  ensureRKB();
  const me = getUserFromSession(user);
  const row = body.row||{};
  const items = body.items || row.items || []; // array pekerjaan (multi-item)

  const s = sh(SHEETS.RKB);

  // Jika multi-item: simpan ringkasan di satu baris, detail item di items_json.
  if(items && items.length){
    const obj = {
      nomor: row.nomor, periode: row.periode,
      plant_id: me.plant_id||'',
      estate_id: me.estate_id||'',
      rayon_id: me.rayon_id||'',
      divisi_id: me.divisi_id||'',
      divisi: row.divisi||me.divisi_id||'',
      estate_full: row.estate_full||'',
      // field single-item dibiarkan kosong (legacy)
      pekerjaan: '', activity_type: '',
      volume: '', satuan: '', hk_unit: '', pct_bhl:'', pct_sku:'', pct_bhb:'',
      hk_bhl:'', hk_sku:'', hk_bhb:'', pengawas:'',
      bahan_json: '[]', lokasi_json: '[]',
      items_json: JSON.stringify(items),
      status: 'submitted',
      username: me.username||'',
      created_at: nowIso(),
      updated_at: nowIso()
    };
    upsertRow(s, 'nomor', obj);
    notifyNewRKB(obj, me);
    return {ok:true};
  }

  // fallback: single item (legacy)
  const hk_bhl = (row.volume||0) * (row.hk_unit||0) * ((row.pct_bhl||0)/100);
  const hk_sku = (row.volume||0) * (row.hk_unit||0) * ((row.pct_sku||0)/100);
  const hk_bhb = (row.volume||0) * (row.hk_unit||0) * ((row.pct_bhb||0)/100);
  const obj = {
    nomor: row.nomor, periode: row.periode,
    plant_id: me.plant_id||'',
    estate_id: me.estate_id||'',
    rayon_id: me.rayon_id||'',
    divisi_id: me.divisi_id||'',
    divisi: row.divisi||me.divisi_id||'',
    estate_full: row.estate_full||'',
    pekerjaan: row.pekerjaan, activity_type: row.activity_type||'',
    volume: row.volume, satuan: row.satuan, hk_unit: row.hk_unit,
    pct_bhl: row.pct_bhl, pct_sku: row.pct_sku, pct_bhb: row.pct_bhb,
    hk_bhl, hk_sku, hk_bhb, pengawas: row.pengawas||'',
    bahan_json: JSON.stringify(row.bahan||[]),
    lokasi_json: JSON.stringify(row.lokasi||[]),
    items_json: '[]',
    status: 'submitted',
    username: me.username||'',
    created_at: nowIso(),
    updated_at: nowIso()
  };
  upsertRow(s, 'nomor', obj);
  notifyNewRKB(obj, me);
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
  const rows = getAll(sh(SHEETS.RKB)).filter(x => x.status==='submitted' && (x.rayon_id===me.rayon_id));
  rows.forEach(x=> x.hk_total = (Number(x.hk_bhl)||0)+(Number(x.hk_sku)||0)+(Number(x.hk_bhb)||0));
  return {ok:true, rows};
}

function askepComment(body, sess){
  ensureComments();
  const user = getUserFromSession(sess);
  const nomor = body.nomor, text = body.text||'';
  upsertRow(sh(SHEETS.COMMENTS),'created_at',{ nomor, role:'Askep', username:user.username, comment:text, created_at: nowIso()});
  // notify
  const r = getAll(sh(SHEETS.RKB)).find(x=> x.nomor===nomor);
  if(r){
    const org = getAll(sh('yorg_map'));
    const asis = org.find(x=> (x.username||'').toString().toLowerCase() === (r.username||'').toString().toLowerCase());
    const ids = [asis?.telegram_id, user.telegram_id].filter(Boolean);
    const msg = `💬 Komentar Askep\nNo: ${nomor}\nKomentar: ${text}`;
    ids.forEach(id=> sendTelegram(id, msg));
    // set status back to draft (needs resubmit)
    r.status='draft'; r.updated_at=nowIso(); upsertRow(sh(SHEETS.RKB),'nomor', r);
  }
  return {ok:true};
}
function askepApprove(body, sess){
  const me = getUserFromSession(sess);
  const nomor = body.nomor;
  const s = sh(SHEETS.RKB);
  const all = getAll(s);
  const r = all.find(x=> x.nomor===nomor); if(!r) return {ok:false, error:'RKB tidak ditemukan'};
  // (opsional) validasi rayon_id sama
  if(r.rayon_id !== me.rayon_id) return {ok:false, error:'Unauthorized (rayon mismatch)'};

  r.status='askep_approved'; r.updated_at=nowIso(); upsertRow(s, 'nomor', r);

  const m = mastersAsMap();
  const asis = m._idx.userByName[(r.username||'').toLowerCase()];
  const manager = m.yorg_map.filter(x => (x.role||'')==='Manager' && x.estate_id===r.estate_id);
  const ids = []
    .concat(asis?.telegram_asisten||[])
    .concat(me.telegram_askep||[])
    .concat(manager.map(mm=>mm.telegram_manager).filter(Boolean));

  const msg = `✅ Askep APPROVE
No: ${nomor}
Status: Menunggu Approval Manager`;
  ids.forEach(id=> sendTelegram(id, msg));
  return {ok:true};
}


function listForManager(body, sess){
  const me = getUserFromSession(sess);
  const rows = getAll(sh(SHEETS.RKB)).filter(x => x.status==='askep_approved' && (x.estate_id===me.estate_id));
  rows.forEach(x=> x.hk_total = (Number(x.hk_bhl)||0)+(Number(x.hk_sku)||0)+(Number(x.hk_bhb)||0));
  return {ok:true, rows};
}

function managerComment(body, sess){
  ensureComments();
  const user = getUserFromSession(sess);
  const nomor = body.nomor, text = body.text||'';
  upsertRow(sh(SHEETS.COMMENTS),'created_at',{ nomor, role:'Manager', username:user.username, comment:text, created_at: nowIso()});
  // notify
  const r = getAll(sh(SHEETS.RKB)).find(x=> x.nomor===nomor);
  if(r){
    const org = getAll(sh('yorg_map'));
    const asis = org.find(x=> (x.username||'').toString().toLowerCase() === (r.username||'').toString().toLowerCase());
    const ids = [asis?.telegram_id, user.telegram_id].filter(Boolean);
    const msg = `💬 Komentar Manager\nNo: ${nomor}\nKomentar: ${text}`;
    ids.forEach(id=> sendTelegram(id, msg));
    r.status='draft'; r.updated_at=nowIso(); upsertRow(sh(SHEETS.RKB),'nomor', r);
  }
  return {ok:true};
}
function managerApprove(body, sess){
  const me = getUserFromSession(sess);
  const nomor = body.nomor;
  const s = sh(SHEETS.RKB);
  const all = getAll(s);
  const r = all.find(x=> x.nomor===nomor); if(!r) return {ok:false, error:'RKB tidak ditemukan'};
  if(r.estate_id !== me.estate_id) return {ok:false, error:'Unauthorized (estate mismatch)'};

  r.status='full_approved'; r.updated_at=nowIso(); upsertRow(s, 'nomor', r);

  const m = mastersAsMap();
  const asis = m._idx.userByName[(r.username||'').toLowerCase()];
  const ktu  = m.yorg_map.filter(x => (x.role||'')==='KTU' && x.estate_id===r.estate_id);

  const ids = []
    .concat(asis?.telegram_asisten||[])
    .concat(me.telegram_manager||[])
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
  const items = [];
  const sum = {};

  rows.forEach(r=>{
    const itemsJson = (r.items_json||'').trim();
    if(itemsJson && itemsJson !== '[]'){
      // multi-item
      const its = JSON.parse(itemsJson);
      its.forEach(it=>{
        const bahan = it.bahan || [];
        bahan.forEach(b=>{
          items.push({ nomor:r.nomor, divisi:r.divisi, periode:r.periode, pekerjaan:it.pekerjaan, nama:b.nama, jumlah:b.jumlah, satuan:b.satuan||'' });
          const key = (b.nama||'') + '|' + (b.satuan||'');
          sum[key] = (sum[key]||0) + Number(b.jumlah||0);
        });
      });
    }else{
      // legacy single item
      const bahan = JSON.parse(r.bahan_json||'[]');
      bahan.forEach(b=>{
        items.push({ nomor:r.nomor, divisi:r.divisi, periode:r.periode, pekerjaan:r.pekerjaan, nama:b.nama, jumlah:b.jumlah, satuan:b.satuan||'' });
        const key = (b.nama||'') + '|' + (b.satuan||'');
        sum[key] = (sum[key]||0) + Number(b.jumlah||0);
      });
    }
  });

  const total = Object.entries(sum).map(([k,v])=>{
    const [nama, satuan] = k.split('|'); return {nama, total:v, satuan};
  });
  return {ok:true, items, total};
}


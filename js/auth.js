window.SESSION = (function(){
  const KEY='rkb.session';
  const get = ()=> U.S.get(KEY, null);
  const set = (s)=> U.S.set(KEY, s);
  const clear = ()=> U.S.del(KEY);
  const profile = ()=> get()?.profile || null;
  const token   = ()=> get()?.token || null;
  const isActive = ()=> {
    const s = get(); if(!s) return false;
    return (new Date(s.expiresAt).getTime() > Date.now());
  };
  return { get, set, clear, profile, token, isActive };
})();

window.API = (function(){
  async function call(action, payload={}){
    if(!window.GAS_URL) throw new Error('GAS_URL belum di-set.');
    const token = SESSION.token();
    const body = { action, token, ...payload };
    const res = await fetch(GAS_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error('Jaringan gagal.');
    return res.json();
  }
  return { call };
})();

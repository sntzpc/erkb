// js/storage.js
window.STORE = {
  // ---------- MASTER ----------
  masterKey(name){ return `kpl.master.${name}`; },
  setMaster(name, rows){ U.S.set(this.masterKey(name), rows||[]); },
  getMaster(name){ return U.S.get(this.masterKey(name), []); },

  // ---------- ACTUALS (generic) ----------
  actualKey(name){ return `kpl.actual.${name}`; },
  setActual(name, rows){ U.S.set(this.actualKey(name), rows||[]); },
  getActual(name){ return U.S.get(this.actualKey(name), []); },

  // Backward-compatible helper khusus RKB
  setActualsRkb(rows){ this.setActual('rkb', rows); },
  getActualsRkb(){ return this.getActual('rkb'); },

  // ---------- COUNTERS (opsional: unread inbox, dll) ----------
  counterKey(name){ return `kpl.counter.${name}`; },
  setCounter(name, value){ localStorage.setItem(this.counterKey(name), String(value)); },
  getCounter(name){ 
    const v = localStorage.getItem(this.counterKey(name));
    return v==null ? null : (isNaN(+v) ? v : +v);
  },

  // ---------- TIMESTAMP ----------
  setStamp(){ localStorage.setItem('kpl.cache.ts', String(Date.now())); },
  getStamp(){ return +(localStorage.getItem('kpl.cache.ts')||0); },

  // ---------- PULL SEMUA ----------
  async pullAll(){
    try{
      U.progressOpen('Menarik master & data aktual...');
      U.progress(20,'Minta server');
      const r = await API.call('pullMaster', {});
      if(!r.ok) throw new Error(r.error||'Gagal tarik');

      const { masters, actuals, counters } = r;

      // simpan master
      Object.entries(masters||{}).forEach(([k,v])=> this.setMaster(k, v||[]));

      // simpan SEMUA actuals yang diberikan backend (generic)
      Object.entries(actuals||{}).forEach(([k,v])=> this.setActual(k, v||[]));

      // simpan counters (opsional)
      if (counters && typeof counters.inboxUnread !== 'undefined'){
        this.setCounter('inboxUnread', counters.inboxUnread);
      }

      this.setStamp();

      U.progress(90,'Simpan ke lokal');
      U.toast('Master & data aktual tersimpan.','success');
      return r;
    }finally{
      U.progress(100,'Selesai'); setTimeout(()=>U.progressClose(), 300);
    }
  },

  // ---------- ENSURE WARM (cache hangat) ----------
  async ensureWarm(){
    const hasAnyMaster = Object.keys(localStorage).some(k=> k.startsWith('kpl.master.'));
    const hasAnyActual = Object.keys(localStorage).some(k=> k.startsWith('kpl.actual.'));
    if(!hasAnyMaster || !hasAnyActual){
      return this.pullAll();
    }
    return {ok:true, cached:true};
  }
};

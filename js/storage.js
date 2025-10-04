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

  // ---------- DRAFTS (lokal) ----------
  getDrafts(){ return U.S.get('rkb.drafts', []) || []; },
  setDrafts(rows){ U.S.set('rkb.drafts', rows || []); },

  /**
   * Serap RKB berstatus 'draft' dari server → masuk ke draft lokal.
   * - Menandai item sebagai __serverLinked agar tidak bisa dihapus.
   * - Jika sudah ada di lokal, hanya update ringkasan bila server lebih baru.
   */
  absorbServerDrafts(serverRkbs = []){
    const incoming = (serverRkbs || []).filter(x => String(x.status||'').toLowerCase() === 'draft');
    if (!incoming.length) return {added:0, updated:0};

    const drafts = this.getDrafts();
    const idxMap = new Map(drafts.map(r => [String(r.nomor), r]));

    let added = 0, updated = 0;
    const nowIso = new Date().toISOString();

    incoming.forEach(srv => {
      const key = String(srv.nomor);
      const payload = {
        nomor: srv.nomor,
        periode: srv.periode,
        divisi: srv.divisi,
        estate_full: srv.estate_full,
        status: 'draft',
        hk_total: Number(srv.hk_total || 0),
        __serverLinked: true,
        __serverUpdatedAt: srv.updated_at || srv.created_at || nowIso,
        created_at: srv.created_at || nowIso,
        updated_at: nowIso,
        // catatan: items tidak ikut ditarik di sini (hemat), akan diambil saat edit via getRkbDetail jika diperlukan
        items: Array.isArray(srv.items) ? srv.items : []
      };

      if (!idxMap.has(key)){
        drafts.unshift(payload);
        added++;
      } else {
        const cur = idxMap.get(key);
        const tSrv = new Date(payload.__serverUpdatedAt||0).getTime();
        const tLoc = new Date(cur.updated_at||0).getTime();
        if (tSrv > tLoc){
          const keepItems = Array.isArray(cur.items) ? cur.items : [];
          Object.assign(cur, payload, { items: keepItems.length ? keepItems : payload.items });
          updated++;
        } else {
          cur.__serverLinked = true; // tetap tandai agar tidak bisa dihapus
        }
      }
    });

    this.setDrafts(drafts);
    return {added, updated};
  },

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

      // >>> Serap RKB draft dari server ke draft lokal (agar bisa diedit, tapi tidak bisa dihapus)
      if (actuals && Array.isArray(actuals.rkb)){
        this.absorbServerDrafts(actuals.rkb);
      }

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

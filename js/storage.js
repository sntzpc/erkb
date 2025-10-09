// js/storage.js
// -----------------------------------------------------------------------------
// STORE: Abstraksi penyimpanan master, actuals, drafts, counters, dan cache.
// - Kunci LocalStorage konsisten: kpl.master.*, kpl.actual.*, kpl.counter.*
// - Paritas RKB & RKH: serap draft server → draft lokal (read-only flag)
// - Utilitas ensureWarm() & ensureActuals(requiredKeys)
// - Backward-compat API: setActualsRkb/getActualsRkb, getDrafts/setDrafts (RKB)
// -----------------------------------------------------------------------------

(function initStore(){
  'use strict';

  const LS = {
    get(k, def){ try{ const v = localStorage.getItem(k); return v==null ? def : JSON.parse(v); }catch(_){ return def; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){ /* ignore quota */ } }
  };

  const KEY = {
    master  : (name)=> `kpl.master.${name}`,
    actual  : (name)=> `kpl.actual.${name}`,
    counter : (name)=> `kpl.counter.${name}`,
    stamp   : 'kpl.cache.ts',

    // legacy RKB drafts
    rkbDrafts : 'rkb.drafts',
    // RKH drafts
    rkhDrafts : 'rkh.drafts',
  };

  // -----------------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------------
  function nowIso(){ return new Date().toISOString(); }
  function toNum(n){ const v = Number(n); return Number.isFinite(v) ? v : 0; }

  // -----------------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------------
  window.STORE = {

    // ---------- MASTER ----------
    masterKey(name){ return KEY.master(name); },
    setMaster(name, rows){ LS.set(KEY.master(name), rows || []); },
    getMaster(name){ return LS.get(KEY.master(name), []) || []; },

    // ---------- ACTUALS (generic) ----------
    actualKey(name){ return KEY.actual(name); },
    setActual(name, rows){ LS.set(KEY.actual(name), rows || []); },
    getActual(name){ return LS.get(KEY.actual(name), []) || []; },

    // Existence check for actual keys (even if empty [])
    hasActualKey(name){
      return localStorage.getItem(this.actualKey(name)) != null;
    },

    /**
     * Pastikan actual-actual tertentu tersedia di localStorage.
     * Jika salah satu belum ada → tarik semua via pullAll().
     */
    async ensureActuals(required = []){
      const ok = (required||[]).every(k => this.hasActualKey(k));
      if(!ok){ return this.pullAll(); }
      return { ok:true, cached:true };
    },

    // ---------- Backward-compatible (khusus RKB) ----------
    setActualsRkb(rows){ this.setActual('rkb', rows); },
    getActualsRkb(){ return this.getActual('rkb'); },

    // ---------- DRAFTS (RKB : legacy) ----------
    getDrafts(){ return LS.get(KEY.rkbDrafts, []) || []; },
    setDrafts(rows){ LS.set(KEY.rkbDrafts, rows || []); },

    /**
     * Serap RKB (status 'draft') dari server → masuk ke draft lokal RKB.
     * - Tandai __serverLinked agar tidak bisa dihapus dari UI.
     * - Update ringkasan bila server lebih baru (berdasarkan updated_at).
     */
    absorbServerDrafts(serverRkbs = []){
      const incoming = (serverRkbs || []).filter(x => String(x.status||'').toLowerCase() === 'draft');
      if (!incoming.length) return {added:0, updated:0};

      const drafts = this.getDrafts();
      const idxMap = new Map(drafts.map(r => [String(r.nomor), r]));
      let added = 0, updated = 0;
      const tsNow = nowIso();

      incoming.forEach(srv => {
        const key = String(srv.nomor || '');
        const payload = {
          nomor        : srv.nomor,
          periode      : srv.periode,
          divisi       : srv.divisi,
          estate_full  : srv.estate_full,
          status       : 'draft',
          hk_total     : toNum(srv.hk_total),
          __serverLinked   : true,
          __serverUpdatedAt: srv.updated_at || srv.created_at || tsNow,
          created_at   : srv.created_at || tsNow,
          updated_at   : tsNow,
          items        : Array.isArray(srv.items) ? srv.items : [] // hemat: detail lengkap diambil saat edit
        };

        if (!idxMap.has(key)){
          drafts.unshift(payload);
          added++;
        } else {
          const cur  = idxMap.get(key);
          const tSrv = new Date(payload.__serverUpdatedAt||0).getTime();
          const tLoc = new Date(cur.updated_at||0).getTime();
          if (tSrv > tLoc){
            const keepItems = Array.isArray(cur.items) ? cur.items : [];
            Object.assign(cur, payload, { items: keepItems.length ? keepItems : payload.items });
            updated++;
          } else {
            cur.__serverLinked = true; // tetap tandai
          }
        }
      });

      this.setDrafts(drafts);
      return {added, updated};
    },

    // ---------- DRAFTS (RKH : baru) ----------
    getDraftsRkh(){ return LS.get(KEY.rkhDrafts, []) || []; },
    setDraftsRkh(rows){ LS.set(KEY.rkhDrafts, rows || []); },

    /**
     * Serap RKH (status 'draft') dari server → draft lokal RKH.
     * - Simpan dalam struktur { header, items, bahan, last_error } agar serasi dengan form RKH.
     * - Tandai __serverLinked pada header agar tidak bisa dihapus.
     */
    absorbServerDraftsRkh(serverRkhs = []){
      const incoming = (serverRkhs || []).filter(x => String(x.status||'').toLowerCase() === 'draft');
      if (!incoming.length) return {added:0, updated:0};

      const drafts = this.getDraftsRkh();
      const idxMap = new Map(drafts.map(r => [String(r?.header?.nomor||''), r]));
      let added = 0, updated = 0;
      const tsNow = nowIso();

      incoming.forEach(srv => {
        const key = String(srv.nomor || '');
        const payload = {
          header: {
            nomor       : srv.nomor || '',
            ref_rkb     : srv.ref_rkb || '',
            tanggal     : srv.tanggal || srv.created_at || '',
            periode     : srv.periode || '',
            divisi      : srv.divisi || srv.divisi_id || '',
            divisi_id   : srv.divisi_id || '',
            estate_full : srv.estate_full || '',
            estate_id   : srv.estate_id || '',
            rayon_id    : srv.rayon_id || '',
            status      : 'draft',
            __serverLinked    : true,
            __serverUpdatedAt : srv.updated_at || srv.created_at || tsNow,
            created_at  : srv.created_at || tsNow,
            updated_at  : tsNow
          },
          items     : Array.isArray(srv.items) ? srv.items : [],
          bahan     : Array.isArray(srv.bahan) ? srv.bahan : [],
          last_error: ''
        };

        if (!idxMap.has(key)){
          drafts.unshift(payload);
          added++;
        } else {
          const cur  = idxMap.get(key);
          const tSrv = new Date(payload.header.__serverUpdatedAt||0).getTime();
          const tLoc = new Date(cur.header?.updated_at||0).getTime();
          if (tSrv > tLoc){
            const keepItems = Array.isArray(cur.items) ? cur.items : [];
            const keepBhn   = Array.isArray(cur.bahan) ? cur.bahan : [];
            const merged    = {
              ...payload,
              items : keepItems.length ? keepItems : payload.items,
              bahan : keepBhn.length   ? keepBhn   : payload.bahan
            };
            Object.assign(cur, merged);
            updated++;
          } else {
            cur.header = cur.header || {};
            cur.header.__serverLinked = true;
          }
        }
      });

      this.setDraftsRkh(drafts);
      return {added, updated};
    },

    // ---------- COUNTERS ----------
    setCounter(name, value){
      try{ localStorage.setItem(KEY.counter(name), String(value)); }catch(_){}
    },
    getCounter(name){
      const v = localStorage.getItem(KEY.counter(name));
      return v==null ? null : (isNaN(+v) ? v : +v);
    },

    // ---------- TIMESTAMP ----------
    setStamp(){ try{ localStorage.setItem(KEY.stamp, String(Date.now())); }catch(_){} },
    getStamp(){ return +(localStorage.getItem(KEY.stamp)||0); },

    // ---------- PULL SEMUA ----------
    /**
     * Menarik master, actuals, counters dari server & menyimpannya ke local.
     * - Menulis kpl.master.*, kpl.actual.*, dan kpl.counter.* (opsional)
     * - Menyerap draft server: RKB & RKH → ke draft lokal.
     */
    async pullAll(){
      try{
        U.progressOpen('Menarik master & data aktual...');
        U.progress(20,'Minta server');

        const r = await API.call('pullMaster', {});
        if(!r?.ok) throw new Error(r?.error || 'Gagal tarik');

        const { masters, actuals, counters } = r;

        // simpan master
        Object.entries(masters||{}).forEach(([k,v]) => this.setMaster(k, v||[]));

        // simpan SEMUA actuals dari backend (generic)
        Object.entries(actuals||{}).forEach(([k,v]) => this.setActual(k, v||[]));

        // Serap draft server → draft lokal
        if (actuals && Array.isArray(actuals.rkb)){
          this.absorbServerDrafts(actuals.rkb);
        }
        if (actuals && Array.isArray(actuals.rkh)){
          this.absorbServerDraftsRkh(actuals.rkh);
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
    /**
     * Minimal check: bila belum ada satupun master/actual → pullAll().
     * Catatan: ini tidak menjamin kunci actual tertentu sudah ada.
     * Gunakan ensureActuals([...]) untuk memastikan kunci spesifik tersedia.
     */
    async ensureWarm(){
      const hasAnyMaster = Object.keys(localStorage).some(k=> k.startsWith('kpl.master.'));
      const hasAnyActual = Object.keys(localStorage).some(k=> k.startsWith('kpl.actual.'));
      if(!hasAnyMaster || !hasAnyActual){
        return this.pullAll();
      }
      return { ok:true, cached:true };
    }
  };

})();

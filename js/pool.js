/* ============ PRODUCTION PASS — generic object pool ============
   Kills per-frame Instantiate/Destroy churn for short-lived combat objects.
   Pool<T> reuses dead instances instead of allocating new ones every shot. */
(function () {
  class Pool {
    constructor(factory, reset, cap = 96) {
      this.factory = factory;   // () => object
      this.reset = reset;       // (obj, ...args) => void — rearm for reuse
      this.cap = cap;
      this.free = [];
      this.live = new Set();
    }
    obtain(...args) {
      let obj = this.free.pop();
      if (!obj) {
        if (this.live.size >= this.cap * 4) { /* hard ceiling: recycle oldest */ }
        obj = this.factory();
      }
      this.reset(obj, ...args);
      this.live.add(obj);
      return obj;
    }
    release(obj) {
      if (!obj || !this.live.has(obj)) return false;
      this.live.delete(obj);
      if (this.free.length < this.cap) this.free.push(obj);
      return true;
    }
    releaseAll(list) {
      for (let i = list.length - 1; i >= 0; i--) this.release(list[i]);
    }
    get liveCount() { return this.live.size; }
    get freeCount() { return this.free.length; }
  }
  NR.Pool = Pool;
  NR.pool = {
    pools: {},
    of(name, factory, reset, cap) {
      if (!this.pools[name]) this.pools[name] = new Pool(factory, reset, cap || 96);
      return this.pools[name];
    },
    pooledCount() {
      let n = 0;
      for (const k of Object.keys(this.pools)) n += this.pools[k].free.length;
      return n;
    },
  };
})();

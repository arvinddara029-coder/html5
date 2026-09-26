/* ================= NEON RONIN — utils + assets ================= */
window.NR = window.NR || {};
(function (U) {
  const TAU = Math.PI * 2;
  U.TAU = TAU;
  U.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.randi = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  U.chance = (p) => Math.random() < p;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.damp = (a, b, k, dt) => U.lerp(a, b, 1 - Math.exp(-k * dt));
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  U.approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
  U.ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  // segment endpoint: angle 0 = straight down, positive = right
  U.seg = (x, y, ang, len) => [x + Math.sin(ang) * len, y + Math.cos(ang) * len];
  U.roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  U.fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  U.fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* -------- asset preloader -------- */
  const imgs = {};
  U.assets = {
    imgs,
    get: (n) => imgs[n],
    load(list, onprog) {
      let done = 0;
      const tick = () => { done++; onprog && onprog(done / list.length); };
      return Promise.all(list.map((it) => new Promise((res) => {
        const im = new Image();
        im.onload = () => { imgs[it.name] = im; tick(); res(); };
        im.onerror = () => { tick(); res(); };
        im.src = it.src;
      })));
    },
  };
})((window.NR.util = {}));

/* ============ NEON RONIN — pre-rendered glow sprites (perf: no runtime shadowBlur) ============ */
(function () {
  const S = (NR.sprites = {});
  function make(size, fn) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    fn(c.getContext("2d"), size);
    return c;
  }
  S.init = function () {
    S.glow = {};
    const cols = {
      cyan: "0,255,244", magenta: "255,45,149", white: "255,255,255",
      yellow: "255,225,77", red: "255,80,95", orange: "255,150,60",
      purple: "150,80,255", green: "80,255,150", blue: "80,160,255",
    };
    for (const k in cols) {
      S.glow[k] = make(128, (g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, `rgba(${cols[k]},1)`);
        gr.addColorStop(0.25, `rgba(${cols[k]},0.5)`);
        gr.addColorStop(1, `rgba(${cols[k]},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      });
    }
    S.soft = make(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    // slash blade gradient used for katana
    S.blade = (function () {
      const c = document.createElement("canvas"); c.width = 128; c.height = 16;
      const g = c.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 128, 0);
      gr.addColorStop(0, "rgba(0,255,244,0)");
      gr.addColorStop(0.4, "#9ffff8");
      gr.addColorStop(1, "#ffffff");
      g.fillStyle = gr; g.fillRect(0, 6, 128, 4);
      return c;
    })();
  };
  S.drawGlow = function (ctx, name, x, y, r, alpha) {
    const img = S.glow[name];
    if (!img || r <= 0) return;
    ctx.globalAlpha = alpha === undefined ? 1 : Math.max(0, Math.min(1, alpha));
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
})();

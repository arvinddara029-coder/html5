/* ============ NEON RONIN — DOM UI screens + canvas HUD ============ */
(function () {
  const U = NR.util;
  const $ = (id) => document.getElementById(id);
  const SCREENS = ["load", "menu", "how", "set", "pause", "up", "over"];
  const ui = (NR.ui = {});

  ui.show = function (name) {
    for (const s of SCREENS) $("scr-" + s).classList.toggle("active", s === name);
  };
  ui.hideAll = () => ui.show(null);

  ui.setLoading = function (k) {
    $("loadfill").style.width = Math.round(k * 100) + "%";
  };

  /* ---------------- wiring ---------------- */
  ui.init = function () {
    const G = NR.game;
    const click = (id, fn) => $(id).addEventListener("click", () => { NR.audio.init(); NR.audio.play("ui"); fn(); });

    click("btn-start", () => G.start());
    click("btn-how", () => ui.show("how"));
    click("btn-how-back", () => ui.show(G.state === "pause" ? "pause" : "menu"));
    click("btn-set", () => ui.show("set"));
    click("btn-set-back", () => ui.show("menu"));
    click("btn-resume", () => G.togglePause());
    click("btn-restart-p", () => G.start());
    click("btn-menu-p", () => G.toMenu());
    click("btn-retry", () => G.start());
    click("btn-menu-o", () => G.toMenu());

    // settings toggles
    const mu = $("tgl-music"), sx = $("tgl-sfx");
    const syncTgl = () => {
      mu.textContent = NR.audio.musicOn ? "ON" : "OFF";
      sx.textContent = NR.audio.sfxOn ? "ON" : "OFF";
      mu.classList.toggle("on", NR.audio.musicOn);
      sx.classList.toggle("on", NR.audio.sfxOn);
    };
    mu.classList.add("on"); sx.classList.add("on");
    mu.addEventListener("click", () => { NR.audio.init(); NR.audio.toggleMusic(!NR.audio.musicOn); localStorage.setItem("nr_music", NR.audio.musicOn ? 1 : 0); syncTgl(); });
    sx.addEventListener("click", () => { NR.audio.init(); NR.audio.toggleSfx(!NR.audio.sfxOn); localStorage.setItem("nr_sfx", NR.audio.sfxOn ? 1 : 0); syncTgl(); NR.audio.play("ui"); });
    if (localStorage.getItem("nr_music") === "0") NR.audio.musicOn = false;
    if (localStorage.getItem("nr_sfx") === "0") NR.audio.sfxOn = false;
    syncTgl();

    // audio unlock on first interaction
    const unlock = () => { NR.audio.init(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    // hero art parallax tilt
    const frame = $("hero-frame"), hero = $("hero-img");
    window.addEventListener("mousemove", (e) => {
      if (!frame) return;
      const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
      frame.style.transform = `perspective(900px) rotateY(${-4 + nx * 7}deg) rotateX(${-ny * 5}deg)`;
      hero.style.transform = `translate(${nx * -14}px, ${ny * -10}px) scale(1.06)`;
    });

    // touch controls
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      document.body.classList.add("touch");
      document.querySelectorAll(".tbtn").forEach((el) => NR.input.bindTouchButton(el));
    }

    ui.refreshHigh();
  };

  ui.refreshHigh = function () {
    $("menu-high").textContent = U.fmt(NR.game.high || 0);
  };

  /* ---------------- upgrade cards ---------------- */
  ui.openUpgrades = function (defs, G) {
    ui.show("up");
    $("up-title").textContent = `WAVE ${G.wave} CLEARED — CHOOSE AN UPGRADE`;
    const wrap = $("cards");
    wrap.innerHTML = "";
    defs.forEach((d) => {
      const el = document.createElement("div");
      el.className = "card " + d.rar;
      el.innerHTML = `<span class="c-ico">${d.ico}</span>
        <div class="c-name">${d.name}</div>
        <div class="c-desc">${d.desc}</div>
        <span class="c-rar">${NR.upgrades.rarityLabel[d.rar]}</span>`;
      el.addEventListener("click", () => {
        d.apply(G.player);
        NR.audio.play("upgrade");
        ui.hideAll();
        G.closeUpgrade();
      });
      wrap.appendChild(el);
    });
  };

  /* ---------------- game over ---------------- */
  ui.showGameOver = function (G, newHigh) {
    $("st-score").textContent = U.fmt(G.score);
    $("st-wave").textContent = G.wave;
    $("st-kills").textContent = G.stats.kills;
    $("st-combo").textContent = "x" + G.stats.maxCombo;
    $("st-time").textContent = U.fmtTime(G.time);
    $("st-high").textContent = U.fmt(G.high);
    $("new-high").style.display = newHigh ? "block" : "none";
    ui.show("over");
  };

  /* =================================================
     CANVAS HUD
  ================================================= */
  const hud = (NR.hud = { banners: [], flashCol: null, flashA: 0, hurtVign: 0 });
  hud.flash = function (col) { hud.flashCol = col; hud.flashA = 1; };
  hud.banner = function (text, sub, col) {
    hud.banners.push({ text, sub: sub || "", col: col || "#00fff4", t: 0, life: 2.4 });
  };

  hud.update = function (dt) {
    hud.flashA = Math.max(0, hud.flashA - dt * 2.2);
    hud.hurtVign = Math.max(0, hud.hurtVign - dt * 1.4);
    for (let i = hud.banners.length - 1; i >= 0; i--) {
      hud.banners[i].t += dt;
      if (hud.banners[i].t > hud.banners[i].life) hud.banners.splice(i, 1);
    }
  };

  hud.draw = function (ctx, G, W, H) {
    const p = G.player;
    ctx.save();
    ctx.textBaseline = "middle";

    /* ---- health ---- */
    const hx = 22, hy = 22, hw = Math.min(300, W * 0.32), hh = 17;
    barBG(ctx, hx, hy, hw, hh);
    const hpK = U.clamp(p.hp / p.maxHp, 0, 1);
    // ghost damage bar
    p.ghostHp = p.ghostHp === undefined ? p.hp : U.damp(p.ghostHp, p.hp, 3, 1 / 60);
    const gk = U.clamp(p.ghostHp / p.maxHp, 0, 1);
    if (gk > hpK) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(hx + 2, hy + 2, (hw - 4) * gk, hh - 4); }
    const hg = ctx.createLinearGradient(hx, hy, hx + hw, hy);
    hg.addColorStop(0, "#ff2d5f"); hg.addColorStop(1, "#ff7a9d");
    ctx.fillStyle = hg;
    ctx.fillRect(hx + 2, hy + 2, (hw - 4) * hpK, hh - 4);
    // segments
    ctx.fillStyle = "rgba(5,8,18,0.6)";
    for (let s = 25; s < p.maxHp; s += 25) {
      const sx = hx + 2 + (hw - 4) * (s / p.maxHp);
      ctx.fillRect(sx, hy + 2, 2, hh - 4);
    }
    ctx.font = "700 11px Orbitron"; ctx.fillStyle = "#ffd6e0";
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, hx + 8, hy + hh / 2 + 1);

    /* ---- energy ---- */
    const ey = hy + hh + 7, ew = hw * 0.72, eh = 9;
    barBG(ctx, hx, ey, ew, eh);
    const ek = p.energy / p.maxEnergy;
    const full = ek >= 1;
    ctx.fillStyle = full ? "#bafffb" : "#00fff4";
    ctx.fillRect(hx + 2, ey + 2, (ew - 4) * ek, eh - 4);
    if (full) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "cyan", hx + ew / 2, ey + eh / 2, 40 + Math.sin(performance.now() / 90) * 10, 0.65);
      ctx.restore();
      ctx.font = "900 12px Orbitron"; ctx.fillStyle = "#00fff4";
      ctx.fillText("BLADE STORM READY — [L]", hx + ew + 12, ey + eh / 2);
    }

    /* ---- dash pips ---- */
    for (let i = 0; i < p.dashMax; i++) {
      const dx = hx + 9 + i * 22, dy = ey + eh + 15;
      ctx.beginPath(); ctx.arc(dx, dy, 6.5, 0, U.TAU);
      if (i < p.dashCharges) { ctx.fillStyle = "#00fff4"; ctx.fill(); }
      else {
        ctx.strokeStyle = "rgba(0,255,244,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
        if (i === p.dashCharges) { // recharging
          ctx.strokeStyle = "#00fff4"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(dx, dy, 6.5, -Math.PI / 2, -Math.PI / 2 + U.TAU * U.clamp(p.chargeT / (0.95 * p.dashCdMul), 0, 1)); ctx.stroke();
        }
      }
    }

    /* ---- score ---- */
    ctx.textAlign = "right";
    ctx.font = "900 26px Orbitron";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,255,244,0.7)"; ctx.shadowBlur = 14;
    ctx.fillText(U.fmt(G.score), W - 22, 30);
    ctx.shadowBlur = 0;
    ctx.font = "600 11px Orbitron"; ctx.fillStyle = "#637ea9";
    ctx.fillText("SCORE · BEST " + U.fmt(Math.max(G.high, G.score)), W - 22, 52);

    /* ---- wave ---- */
    ctx.textAlign = "center";
    ctx.font = "900 15px Orbitron";
    ctx.fillStyle = "#8fb0e8";
    const alive = G.enemies.length + G.spawnQueue.length;
    ctx.fillText(G.bossActive ? "⚠ BOSS ⚠" : `WAVE ${G.wave}  ·  HOSTILES ${alive}`, W / 2, 26);

    /* ---- combo ---- */
    if (G.combo > 1) {
      const cc = G.combo >= 20 ? "#ffe14d" : G.combo >= 10 ? "#ff2d95" : "#00fff4";
      ctx.textAlign = "right";
      ctx.font = `900 ${22 + Math.min(G.combo, 30)}px Orbitron`;
      ctx.fillStyle = cc;
      ctx.save();
      ctx.translate(W - 30, H * 0.24);
      ctx.rotate(0.04);
      ctx.shadowColor = cc; ctx.shadowBlur = 18;
      ctx.fillText(`${G.combo} HITS`, 0, 0);
      ctx.font = "700 15px Orbitron";
      ctx.fillText(`×${G.mult().toFixed(1)}`, 0, 34);
      ctx.restore();
      // combo timer bar
      const ck = U.clamp(G.comboT / G.comboWindow(), 0, 1);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(W - 30 - 120, H * 0.24 + 46, 120, 4);
      ctx.fillStyle = cc;
      ctx.fillRect(W - 30 - 120 * ck, H * 0.24 + 46, 120 * ck, 4);
    }

    /* ---- boss bar ---- */
    if (G.bossActive && G.bossRef) {
      const b = G.bossRef;
      const bw = Math.min(560, W * 0.6), bx = W / 2 - bw / 2, by = 46;
      ctx.fillStyle = "rgba(5,8,18,0.8)";
      ctx.fillRect(bx - 3, by - 3, bw + 6, 18);
      const bk = U.clamp(b.hp / b.maxHp, 0, 1);
      const bg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      bg2.addColorStop(0, b.phase === 2 ? "#ff2d95" : "#ff8f3d"); bg2.addColorStop(1, "#ff2d5f");
      ctx.fillStyle = bg2;
      ctx.fillRect(bx, by, bw * bk, 12);
      ctx.font = "900 11px Orbitron"; ctx.textAlign = "center"; ctx.fillStyle = "#ffd9c9";
      ctx.fillText(`SHOGUN-9 ${b.phase === 2 ? "— OVERDRIVE" : ""}`, W / 2, by + 26);
    }

    /* ---- banners ---- */
    ctx.textAlign = "center";
    for (const bn of hud.banners) {
      const k = bn.t / bn.life;
      const aIn = U.clamp(bn.t / 0.25, 0, 1);
      const aOut = U.clamp((bn.life - bn.t) / 0.4, 0, 1);
      ctx.globalAlpha = Math.min(aIn, aOut);
      const sc = U.ease.outBack(U.clamp(bn.t / 0.3, 0, 1));
      ctx.save();
      ctx.translate(W / 2, H * 0.32);
      ctx.scale(sc, sc);
      ctx.font = "900 54px Orbitron";
      ctx.shadowColor = bn.col; ctx.shadowBlur = 26;
      ctx.fillStyle = bn.col;
      ctx.fillText(bn.text, 0, 0);
      if (bn.sub) {
        ctx.font = "600 18px Rajdhani";
        ctx.fillStyle = "#dfe9ff"; ctx.shadowBlur = 8;
        ctx.fillText(bn.sub, 0, 42);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    /* ---- low-hp pulse ---- */
    if (p.hp < p.maxHp * 0.3 && !p.dead) {
      const pl = (Math.sin(performance.now() / 260) * 0.5 + 0.5) * 0.22;
      vignette(ctx, W, H, pl, "255,30,60");
    }
    /* hurt vignette */
    if (hud.hurtVign > 0) vignette(ctx, W, H, hud.hurtVign * 0.5, "255,30,60");
    /* full-screen flash */
    if (hud.flashA > 0 && hud.flashCol) {
      ctx.globalAlpha = hud.flashA;
      ctx.fillStyle = hud.flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  function barBG(ctx, x, y, w, h) {
    ctx.fillStyle = "rgba(5,8,18,0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,160,220,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function vignette(ctx, W, H, a, rgb) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
})();

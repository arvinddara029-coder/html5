/* ============ NEON RONIN — boot, fixed loop, render orchestration ============ */
(function () {
  const U = NR.util;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const G = NR.game;
  NR.view = { w: 1280, h: 940, scale: 1 };
  let dpr = 1;

  /* error toast (helps even players report issues) */
  const errBox = document.getElementById("errtoast");
  window.addEventListener("error", (e) => {
    errBox.style.display = "block";
    errBox.textContent = "⚠ " + (e.message || "unknown error") + (e.filename ? "\n" + e.filename.split("/").pop() + ":" + e.lineno : "");
  });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    let vh = cw > ch && ch < 550 ? 720 : 940;
    let vw = vh * (cw / ch);
    const arenaW = NR.world ? NR.world.W : 2560;
    if (vw > arenaW) { vw = arenaW; vh = vw * (ch / cw); }
    NR.view.w = vw; NR.view.h = vh;
    NR.view.scale = cw / vw;
  }
  window.addEventListener("resize", resize);
  NR.resize = resize;

  /* ---------------- boot ---------------- */
  function boot() {
    NR.sprites.init();
    NR.world.init();
    resize();
    NR.ui.init();
    NR.ui.setLoading(0.05);
    U.assets.load([
      { name: "bg_far", src: "assets/bg_far.jpg" },
      { name: "industrial", src: "assets/kenney/platformIndustrial_sheet.png" },
      { name: "bg_day", src: "assets/bg_day.jpg" },
      { name: "bg_garden", src: "assets/bg_garden.jpg" },
      { name: "bg_reactor", src: "assets/bg_reactor.jpg" },
      { name: "menu_hero", src: "assets/menu_hero.jpg" },
      { name: "emblem", src: "assets/emblem.jpg" },
    ], (k) => NR.ui.setLoading(0.05 + k * 0.95)).then(() => {
      NR.ui.setLoading(1);
      setTimeout(() => {
        G.toMenu();
        if (location.hash === "#auto") smokeTest();
      }, 250);
    });
    requestAnimationFrame(frame);
  }

  /* ---------------- smoke test (#auto): auto-start & fake inputs for validation ---------------- */
  function smokeTest() {
    G.start();
    const acts = ["right", "jump", "attack", "right", "attack", "dash", "attack", "left", "jump"];
    let i = 0;
    const iv = setInterval(() => {
      if (G.state !== "playing") { clearInterval(iv); return; }
      const a = acts[i++ % acts.length];
      NR.input.pressed[a] = true;
      NR.input.keys[a === "left" ? "ArrowLeft" : "ArrowRight"] = a === "left" || a === "right";
      if (i === 30) { G.player.energy = 100; NR.input.pressed["special"] = true; }
    }, 420);
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let rd = (now - last) / 1000;
    last = now;
    if (rd > 0.1) rd = 0.1; // big tab-switch hiccup clap
    if (NR.input.justPressed("mute")) {
      NR.ui.toggleMute();
    }
    const dt = G.state === "playing" ? G.effDt(rd) : rd;
    if (G.state !== "loading") G.update(dt, rd);
    if (G.state === "menu") NR.world.update(rd, NR.view); // ambient life behind menu
    NR.audio.muted = !NR.audio.sfxOn && !NR.audio.musicOn;
    NR.input.postUpdate();
    NR.hub.update(now);
    render();
  }

  function render() {
    if (G.state === "menu" && document.getElementById("scr-menu").classList.contains("active")) return;
    const view = NR.view, cam = G.cam;
    const s = dpr * view.scale;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;

    ctx.setTransform(s, 0, 0, s, 0, 0);
    // letterbox-ish bleed: fill voids around arena edges
    ctx.fillStyle = "#05060e";
    ctx.fillRect(cam.x - 80, cam.y - 80, view.w + 160, view.h + 160);
    ctx.translate(-(cam.x + cam.sx), -(cam.y + cam.sy));

    NR.world.drawBack(ctx, cam, view);

    if (G.state !== "menu" && G.player) {
      NR.adventure.draw(ctx, cam, view);
      for (const p of G.pickups) p.draw(ctx);
      for (const e of G.enemies) e.draw(ctx);
      for (const w of G.shockwaves) w.draw(ctx);
      if (!G.player.dead || G.deathT > 1.1) G.player.draw(ctx);
      for (const b of G.bolts) b.draw(ctx);
      for (const b of G.shots) b.draw(ctx);
      NR.fx.draw(ctx);
    } else {
      NR.fx.draw(ctx);
    }

    NR.world.drawFront(ctx, cam, view);

    // HUD in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.state !== "menu" && G.state !== "loading" && G.player)
      NR.hud.draw(ctx, G, cw, ch);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

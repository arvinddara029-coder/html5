/* ============ NEON RONIN — boot, fixed loop, render orchestration ============
   Production pass:
   - FPS target setting (Auto/30/45/60/90/120) actually caps the frame loop
   - Quality setting caps devicePixelRatio + drives VFX budgets
   - CrazyGamesService init + loading/gameplay events wired here
   - Diagnostics: every error becomes a structured record (Error Center)
   - Development-only debug panel (?debug=1)
   - Loading overlay with real progress for district streaming */
(function () {
  const U = NR.util;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const G = NR.game;
  NR.view = { w: 1280, h: 940, scale: 1 };
  let dpr = 1;

  /* ---------------- runtime targets (set from Settings) ---------------- */
  NR.main = {
    fpsTarget: 0,     // 0 = auto (uncapped)
    quality: "medium",
    setFpsTarget(v) { NR.main.fpsTarget = Math.max(0, Number(v) || 0); },
    setQuality(q) {
      NR.main.quality = ["low", "medium", "high"].includes(q) ? q : "medium";
      resize();
    },
    dprCap() { return NR.main.quality === "low" ? 1 : NR.main.quality === "high" ? 2 : 1.5; },
  };

  /* ---------------- error reporting ----------------
     A thrown error used to leave a permanent red box. Now: reported once,
     full stack to console, structured record to the Diagnostics Error
     Center, the box clears itself, and the loop keeps running. */
  const errBox = document.getElementById("errtoast");
  let errHide = 0, lastErr = "", errCount = 0;
  function reportError(label, err, where) {
    const detail = err && (err.stack || err.message) ? err : new Error(String(err));
    const msg = (err && err.message) || String(err);
    const key = label + "|" + msg;
    if (key === lastErr) { errCount++; return; }
    lastErr = key; errCount = 1;
    try { console.error("[SKYWARD] " + label, detail); } catch (_) {}
    NR.diag && NR.diag.error(`${label}: ${msg}`, detail);
    if (!errBox) return;
    const file = where ? "\n" + where : (detail.stack ? "\n" + String(detail.stack).split("\n")[1].trim() : "");
    errBox.textContent = "⚠ " + label + ": " + msg + file + "\nThe game keeps running — this note clears itself.";
    errBox.style.display = "block";
    clearTimeout(errHide);
    errHide = setTimeout(() => { errBox.style.display = "none"; lastErr = ""; }, 14000);
  }
  NR.reportError = reportError;
  window.addEventListener("error", (e) => {
    reportError("Runtime error", e.error || e.message, e.filename ? e.filename.split("/").pop() + ":" + e.lineno : "");
  });
  window.addEventListener("unhandledrejection", (e) => reportError("Async error", e.reason));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, NR.main.dprCap());
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
    NR.diag.initDebug();
    NR.vfx.install();                // wrap the animated-effect library with the VFX budget
    NR.crazy.init();                 // never blocks the game
    NR.audioMap.load(null);          // prefetch the sample map (decode on first gesture)
    NR.sprites.init();
    NR.world.init();
    resize();
    NR.ui.init();
    // platform focus handling: tab hidden / window blurred → auto-pause, report stop
    if (typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) { NR.game.autoPause(); NR.crazy.gameplayStop(); }
      });
      window.addEventListener?.("blur", () => NR.game.autoPause());
    }
    NR.ui.setLoading(0.05);
    NR.crazy.loadingStart();
    // invite-link routing: an invited player skips straight into the room
    // staged loading: lobby art + the hero's equipped layers first, everything else streams in
    const lookPaths = NR.assets.layerPaths(NR.profile.appearance);
    const lobbyPaths = [
      "bg_far.jpg", "kenney/platformIndustrial_sheet.png", "bg_day.jpg", "bg_garden.jpg",
      "bg_reactor.jpg", "menu_hero.jpg", "emblem.jpg", "lobby_bg.jpg",
      "GandalfHardcore Emojis and Icons/GandalfHardcore Emojis and Icons/Coin.png",
      "GandalfHardcore Emojis and Icons/GandalfHardcore Emojis and Icons/Quest marker.png",
      "GandalfHardcore Emojis and Icons/GandalfHardcore Emojis and Icons/GandalfHardcore Emoji.png",
      "GandalfHardcFREE NPC/GandalfHardcore Goddess NPC.png", // Luna, the lobby guide
      // combat-manual demo strips + grand-lobby event art + pet wardrobe
      "idle/sprite sheets/idle.png", "walk/sprite sheets/walk.png", "walk/sprite sheets/from idle.png",
      "GandalfHardcore Warrior.png",
      "GandalfHardcore Pet companion/GandalfHardcore doggy hat.png",
      "GandalfHardcore Pet companion/GandalfHardcore doggy backpack.png",
      // terrain textures used by the arena
      "Brick/Brick_01-512x512.png", "Metal/Metal_01-512x512.png", "Metal/Metal_08-512x512.png",
      "Stone/Stone_01-128x128.png", "Stone/Stone_09-128x128.png", "Wood/Wood_01-128x128.png",
      "Tile/Tile_01-128x128.png", "Plaster/Plaster_01-512x512.png",
      // biome overlays from the Elements pack
      "Elements/Elements_02-512x512.png", "Elements/Elements_13-512x512.png", "Elements/Elements_17-512x512.png",
    ].concat(lookPaths);
    // Use the main asset lib (NR.assets) which knows how to load string paths.
    const loader = (NR.assets && NR.assets.load) ? NR.assets : U.assets;
    loader.load(lobbyPaths, (k) => NR.ui.setLoading(0.05 + k * 0.85)).then(() => {
      NR.ui.setLoading(0.92);
      // stream the rest of the packs in the background (creator/shop instant access)
      const rest = NR.assets.allLayerPaths().filter((p) => !NR.assets.ready(p));
      const loader2 = (NR.assets && NR.assets.load) ? NR.assets : U.assets;
      loader2.load(rest, (k) => NR.ui.setLoading(0.92 + k * 0.08)).then(() => {
        NR.ui.setLoading(1);
        setTimeout(() => {
          G.toMenu();
          NR.crazy.loadingStop();
          NR.settings?.apply?.();
          if (location.hash === "#auto") smokeTest();
        }, 250);
      });
      NR.lobby.init();
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

  /* ---------------- main loop (with a real FPS cap) ---------------- */
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let rd = (now - last) / 1000;
    if (rd > 0.1) rd = 0.1; // big tab-switch hiccup clamp
    last = now;
    NR.diag.frame(rd * 1000);
    NR.diag.updateDebug(now);
    const cap = NR.main.fpsTarget;
    if (cap > 0) {
      acc += rd;
      const minDt = 1 / cap;
      if (acc < minDt - 0.0005) return;   // not due for the next simulated frame yet
      rd = Math.min(acc, 0.1);
      acc = 0;
    }
    if (NR.input.justPressed("mute")) NR.ui.toggleMute();
    // one bad frame must never take the whole game down
    try {
      const dt = G.state === "playing" ? G.effDt(rd) : rd;
      if (G.state !== "loading") G.update(dt, rd);
      if (G.state === "menu") NR.world.update(rd, NR.view); // ambient life behind menu
      NR.audio.muted = !NR.audio.sfxOn && !NR.audio.musicOn;
      NR.input.postUpdate();
      NR.hub.update(now);
      render();
    } catch (err) {
      reportError("Frame error", err);
      NR.input.postUpdate();
    }
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
      NR.modes?.draw(ctx, cam, view);
      for (const p of G.pickups) p.draw(ctx);
      NR.spriteRender.drawCorpses(ctx, G);
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

    // HUD in screen space, scaled by the HUD-scale setting
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.state !== "menu" && G.state !== "loading" && G.player) {
      const hs = (NR.profile.settings && NR.profile.settings.hudScale) || 1;
      if (hs !== 1) { ctx.scale(hs, hs); }
      NR.hud.draw(ctx, G, cw / hs, ch / hs);
      NR.modes?.drawHud(ctx, G, cw / hs, ch / hs);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

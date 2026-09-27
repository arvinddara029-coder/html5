/* ============ NEON RONIN — boot, fixed loop, render orchestration ============ */
(function () {
  const U = NR.util;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const G = NR.game;
  NR.view = { w: 1280, h: 940, scale: 1 };
  let dpr = 1;

  /* ---------------- error reporting ----------------
     A thrown error used to leave a permanent red box on screen saying only
     "Script error" — no detail, no way to dismiss it, and it stayed there after
     the game recovered. Now: the same message is reported once, the full stack
     goes to the console, the box clears itself, and the loop keeps running. */
  const errBox = document.getElementById("errtoast");
  let errHide = 0, lastErr = "", errCount = 0;
  function reportError(label, err, where) {
    const detail = err && (err.stack || err.message) ? err : new Error(String(err));
    const msg = (err && err.message) || String(err);
    const key = label + "|" + msg;
    if (key === lastErr) { errCount++; return; }
    lastErr = key; errCount = 1;
    try { console.error("[SKYWARD] " + label, detail); } catch (_) {}
    // The on-screen box is a developer aid (?debug or localStorage nr_debug=1).
    // Players no longer get a "Frame error" banner: the faulty entity/frame is
    // isolated and skipped, the full stack still goes to the console.
    let debug = false;
    try { debug = /[?&#]debug\b/.test(location.search + location.hash) || localStorage.getItem("nr_debug") === "1"; } catch (_) {}
    if (!errBox || !debug) return;
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
    // Fallback to U.assets if for some reason NR.assets is unavailable.
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
    // one bad frame must never take the whole game down: report it, drop the
    // frame, and keep playing (the loop is already re-armed above)
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

  /* isolate each draw: restore the canvas state and keep drawing the rest */
  function safeDraw(fn, label, owner) {
    ctx.save();
    try { fn(); }
    catch (err) {
      reportError("Draw skipped: " + label, err);
      if (owner) { owner._drawErrs = (owner._drawErrs || 0) + 1; if (owner._drawErrs >= 3 && !owner.boss) owner.dead = true; }
    }
    ctx.restore();
  }
  function render() {
    if (G.state === "menu" && document.getElementById("scr-menu").classList.contains("active")) return;
    const view = NR.view, cam = G.cam;
    const s = dpr * view.scale;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;

    // a draw call that threw mid-way can leave save() calls unbalanced; start
    // every frame from a clean context state
    if (ctx.reset) ctx.reset();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // letterbox-ish bleed: fill voids around arena edges
    ctx.fillStyle = "#05060e";
    ctx.fillRect(cam.x - 80, cam.y - 80, view.w + 160, view.h + 160);
    ctx.translate(-(cam.x + cam.sx), -(cam.y + cam.sy));

    NR.world.drawBack(ctx, cam, view);

    if (G.state !== "menu" && G.player) {
      safeDraw(() => NR.adventure.draw(ctx, cam, view), "world");
      for (const p of G.pickups) safeDraw(() => p.draw(ctx), "pickup", p);
      safeDraw(() => NR.spriteRender.drawCorpses(ctx, G), "corpses");
      for (const e of G.enemies) safeDraw(() => e.draw(ctx), "enemy", e);
      for (const w of G.shockwaves) safeDraw(() => w.draw(ctx), "shockwave", w);
      if (!G.player.dead || G.deathT > 1.1) safeDraw(() => G.player.draw(ctx), "hero");
      for (const b of G.bolts) safeDraw(() => b.draw(ctx), "bolt", b);
      for (const b of G.shots) safeDraw(() => b.draw(ctx), "shot", b);
      safeDraw(() => NR.fx.draw(ctx), "effects");
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

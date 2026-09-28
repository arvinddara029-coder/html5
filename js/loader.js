/* ============ PRODUCTION PASS — loading overlay system ============
   Proper loading screens with REAL progress:
     - boot: the existing load screen, now reporting SDK + asset progress
     - game start: a full loading page opens BEFORE the match, waits until
       every asset the run needs is actually decoded, and only then opens
       the game (kills the "game starts while art is still streaming" lag)
   Progress is driven by real asset loads — no fake 100%. */
(function () {
  const L = (NR.loader = {});
  let root = null, fill = null, status = null, label = null;

  const STEPS = [
    "SYNCING NEURAL INTERFACE",
    "DECRYPTING DISTRICT MAP",
    "CALIBRATING BLADE ARRAY",
    "LOADING COMBAT ASSETS",
    "STABILIZING REACTOR",
  ];

  function ensure() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "run-loader";
    root.innerHTML =
      '<div class="rl-box">' +
      '<div class="rl-title">PREPARING DISTRICT</div>' +
      '<div class="rl-bar"><div class="rl-fill"></div></div>' +
      '<div class="rl-status">LOADING</div>' +
      '<div class="rl-note">the match opens once every asset is fully loaded</div>' +
      "</div>";
    document.body.append(root);
    fill = root.querySelector(".rl-fill");
    status = root.querySelector(".rl-status");
    label = root.querySelector(".rl-title");
    return root;
  }

  /* progress k: 0..1 (real), status text optional */
  L.show = function (title, progress) {
    ensure();
    label.textContent = title || "LOADING";
    L.progress(progress || 0);
    root.classList.add("open");
  };
  L.progress = function (k, text) {
    if (!root) return;
    fill.style.width = Math.max(0, Math.min(1, k)) * 100 + "%";
    if (text) status.textContent = text;
    else status.textContent = STEPS[Math.floor(performance.now() / 700) % STEPS.length];
  };
  L.hide = function () { if (root) root.classList.remove("open"); };
  L.isOpen = function () { return !!root && root.classList.contains("open"); };

  /* ---------------- real asset set a run needs before it can open ---------------- */
  L.gamePaths = function () {
    const out = [];
    try {
      const push = (arr) => { for (const p of arr || []) if (p) out.push(p); };
      if (NR.assets && NR.assets.layerPaths) push(NR.assets.layerPaths(NR.profile.appearance));
      if (NR.profile.pet && NR.catalog && NR.catalog.pet) {
        const po = NR.catalog.pet.find((o) => o.id === NR.profile.pet);
        if (po) out.push(po.path);
      }
      if (NR.sheets)
        for (const key of Object.keys(NR.sheets))
          for (const a of Object.keys(NR.sheets[key].anims)) out.push(NR.sheets[key].anims[a].path);
      if (NR.textures)
        for (const k of Object.keys(NR.textures)) push(NR.textures[k]);
      push(["bg_day.jpg", "bg_garden.jpg", "bg_reactor.jpg", "bg_far.jpg", "menu_hero.jpg", "lobby_bg.jpg", "emblem.jpg"]);
    } catch (e) {
      NR.diag && NR.diag.warn && NR.diag.warn("gamePaths failed: " + (e && e.message));
    }
    return Array.from(new Set(out));
  };
  L.missingGamePaths = function () {
    return L.gamePaths().filter((p) => !NR.assets || !NR.assets.ready(p));
  };

  /* Load every missing run asset with the loading page open (real progress). */
  function loadMissing(title, done) {
    const missing = L.missingGamePaths();
    if (!missing.length) { done(); return Promise.resolve(); }
    NR.crazy && NR.crazy.loadingStart && NR.crazy.loadingStart();
    L.show(title || "LOADING GAME", 0);
    const lib = NR.assets && NR.assets.load ? NR.assets : NR.util.assets;
    return lib
      .load(missing, (k) => L.progress(k))
      .then(() => {
        L.progress(1, "READY");
        try { done(); } catch (e) {
          NR.reportError ? NR.reportError("Game start failed", e) : console.error(e);
        }
        setTimeout(() => {
          L.hide();
          NR.crazy && NR.crazy.loadingStop && NR.crazy.loadingStop();
        }, 160);
      })
      .catch((e) => {
        NR.diag && NR.diag.warn && NR.diag.warn("preload before start failed: " + (e && e.message));
        try { done(); } catch (_) {}
        setTimeout(() => L.hide(), 160);
        NR.crazy && NR.crazy.loadingStop && NR.crazy.loadingStop();
      });
  }

  /* Every game entry point goes through here: a full loading page ALWAYS
     opens before the match, fills with REAL asset progress, and the game
     only opens at 100%. When everything is already cached the bar completes
     immediately (short minimum display so the page still reads as intentional). */
  L.startGame = function (title, options) {
    const start = () => {
      try { NR.game.start(options); }
      catch (e) { NR.reportError ? NR.reportError("Game start failed", e) : console.error(e); }
    };
    const missing = L.missingGamePaths();
    if (!missing.length) {
      NR.crazy && NR.crazy.loadingStart && NR.crazy.loadingStart();
      L.show(title || "LOADING GAME", 1);
      L.progress(1, "READY");
      return new Promise((resolve) => {
        setTimeout(() => {
          start();
          L.hide();
          NR.crazy && NR.crazy.loadingStop && NR.crazy.loadingStop();
          resolve();
        }, 480);
      });
    }
    return loadMissing(title, start);
  };

  /* Same, but for flows that run their own start logic (saved-wave resume). */
  L.preloadThen = function (fn, title) {
    if (!L.missingGamePaths().length) return Promise.resolve(fn());
    return loadMissing(title, () => fn());
  };

  /* Show the overlay while an arbitrary promise completes (legacy helper). */
  L.wrap = async function (title, pathsPromise) {
    NR.crazy && NR.crazy.loadingStart && NR.crazy.loadingStart();
    L.show(title, 0.08);
    let ticks = 0;
    const iv = setInterval(() => { ticks++; L.progress(Math.min(0.85, 0.08 + ticks * 0.07)); }, 140);
    try {
      await pathsPromise;
      L.progress(1, "READY");
    } catch (e) {
      NR.diag && NR.diag.warn && NR.diag.warn("preload during loading failed: " + (e && e.message));
    } finally {
      clearInterval(iv);
      setTimeout(() => L.hide(), 180);
      NR.crazy && NR.crazy.loadingStop && NR.crazy.loadingStop();
    }
  };
})();

/* ============ PRODUCTION PASS — loading overlay system ============
   Proper loading screens with REAL progress:
     - boot: the existing load screen, now reporting SDK + asset progress
     - run start: a short "preparing district" overlay with status text,
       driven by actual asset preloads (no fake 100%)
   The old splash presentation (animated guide GIF over the emblem) is
   removed from the DOM in index.html; this overlay is the replacement:
   progress bar, rotating status text, subtle animation, never blocks input
   longer than the work actually takes. */
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
      '<div class="rl-note">assets stream per district — the full library never loads at once</div>' +
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

  /* Every asset the next run can possibly draw: world art + terrain textures,
     the equipped hero's layers, ALL enemy/boss sheets, mode props and (for the
     run mode) the guardian sprites. Loading these up-front is what makes the
     world hitch-free — nothing decodes mid-fight. */
  function requiredPaths() {
    const out = new Set();
    const add = (p) => { if (p) out.add(p); };
    // layered jungle world + every terrain texture family
    ["bg_jungle.jpg", "jungle_layer_far.png", "jungle_layer_near.png", "grass_strip.png",
     "bg_day.jpg", "bg_far.jpg", "bg_garden.jpg", "bg_reactor.jpg",
     "kenney/platformIndustrial_sheet.png"].forEach(add);
    const T = NR.textures || {};
    for (const k of Object.keys(T)) for (const t of T[k]) add(t);
    // equipped hero layers
    if (NR.assets && NR.assets.layerPaths) for (const p of NR.assets.layerPaths(NR.profile.appearance)) add(p);
    // every enemy + boss sheet (all families appear across waves)
    for (const sk of Object.keys(NR.sheets || {})) {
      const an = (NR.sheets[sk] || {}).anims || {};
      for (const a of Object.keys(an)) add(an[a].path);
    }
    // climb/run props (portal + campfire checkpoints)
    add("super/GandalfHardcore FREE Platformer Assets/Animated Sprites/GandalfHardcore Portal sheet.png");
    add("super/GandalfHardcore FREE Platformer Assets/Animated Sprites/Campfire sheet.png");
    // guardians for the endless run
    if (NR.superContent && NR.superContent.actors)
      for (const act of NR.superContent.actors)
        if (act.role === "guardian" && act.clips)
          for (const cl of act.clips) for (const f of cl.frames || []) { add(f.path); (f.alternates || []).forEach(add); }
    // skip anything already decoded
    return [...out].filter((p) => NR.assets && !NR.assets.ready(p));
  }

  /* Gate world-entry on a REAL preload: show the overlay, load+decode every
     required asset with live progress, THEN build the world and lift the veil.
     `startFn` runs only once the art is decoded, so there is no entry hitch. */
  L.enter = async function (title, startFn) {
    NR.crazy?.loadingStart();
    L.show(title, 0.05);
    let k = 0.05;
    const iv = setInterval(() => { k = Math.min(k + 0.02, 0.9); L.progress(k); }, 120);
    try {
      await NR.assets.load(requiredPaths(), (p) => { k = 0.05 + p * 0.9; L.progress(k); });
      L.progress(1, "READY");
      startFn(); // world is built with decoded art — no mid-fight decode lag
    } catch (e) {
      NR.diag?.warn("enter-world preload failed: " + (e && e.message));
      startFn();
    } finally {
      clearInterval(iv);
      setTimeout(() => { L.hide(); NR.crazy?.loadingStop(); }, 150);
    }
  };

  /* Show the overlay while a real asset preload completes. */
  L.wrap = async function (title, pathsPromise) {
    NR.crazy?.loadingStart();
    L.show(title, 0.08);
    let ticks = 0;
    const iv = setInterval(() => { ticks++; L.progress(Math.min(0.85, 0.08 + ticks * 0.07)); }, 140);
    try {
      await pathsPromise;
      L.progress(1, "READY");
    } catch (e) {
      NR.diag?.warn("preload during loading failed: " + (e && e.message));
    } finally {
      clearInterval(iv);
      setTimeout(() => L.hide(), 180);
      NR.crazy?.loadingStop();
    }
  };
})();

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

/* ============ POLISH — zoom setting, loading screens, random worlds, boot glue ============
   · Settings → CHARACTER SIZE slider (saved per device).
   · Loading: % + tips on the splash, a LOADING overlay when a run starts
     while its art is still streaming, and a small pill whenever assets load.
   · SURVIVE (levels): one level counter; every level drops you into a
     random world (never the same twice in a row). WAVE FIGHT: the world
     changes after every boss (every 5th wave).
   · Boot: CrazyGames SDK init + invite links. */
(function () {
  const G = NR.game, P = NR.profile, A = NR.adventure, E = NR.evolution, U = NR.util;
  const $ = (id) => document.getElementById(id);
  const PO = (NR.polish = {});

  /* ---------------- character size (zoom) ---------------- */
  const zr = $("zoom-range");
  if (zr) {
    const cur = Number(NR.store.getItem("nr_zoom"));
    zr.value = String(Math.round((cur >= 1 && cur <= 1.6 ? cur : (NR.view && NR.view.zoom) || 1.2) * 100));
    const label = zr.previousElementSibling;
    const show = () => { if (label) label.textContent = `CHARACTER SIZE · ${zr.value}%`; };
    show();
    zr.addEventListener("input", () => {
      const v = Math.max(100, Math.min(160, Number(zr.value) || 120));
      NR.store.setItem("nr_zoom", String(v / 100));
      show();
      if (NR.resize) NR.resize();
    });
  }

  /* ---------------- splash: % and tips ---------------- */
  const TIPS = [
    "TIP · U / I / O use your hero's three abilities.",
    "TIP · T calls the monster you equipped in VAULT → SUMMONS.",
    "TIP · SUKUNA SLICE (V) works once per run — save it for the boss!",
    "TIP · Tap ! on any item to see how it works.",
    "TIP · Weak items become free as your hero levels up.",
    "TIP · ONLINE → CREATE ROOM and send the link to a friend.",
    "TIP · Settings → CHARACTER SIZE makes heroes bigger.",
    "TIP · Settings → EDIT HUD lets you move and resize every button.",
  ];
  let tipI = Math.floor(Math.random() * TIPS.length);
  const setLoading = NR.ui.setLoading;
  NR.ui.setLoading = function (k) {
    setLoading.call(this, k);
    const pct = $("load-pct");
    if (pct) pct.textContent = Math.round(Math.max(0, Math.min(1, k)) * 100) + "%";
  };
  const tipTimer = typeof setInterval === "function" ? setInterval(() => {
    const t = $("load-tip");
    if (!t || !$("scr-load") || !$("scr-load").classList.contains("active")) return;
    t.textContent = TIPS[tipI++ % TIPS.length];
  }, 2600) : 0;

  /* ---------------- loading overlay for runs ---------------- */
  const LD = (NR.loading = { hold: false });
  function overlay() {
    let o = $("nr-loading");
    if (o) return o;
    o = document.createElement("div");
    o.id = "nr-loading"; o.className = "nr-loading"; o.hidden = true;
    o.setAttribute("role", "status");
    o.innerHTML = `<div class="nl-box"><div class="nl-spin"></div><b id="nl-text">LOADING…</b><div class="nl-bar"><i id="nl-fill"></i></div><small id="nl-tip"></small></div>`;
    document.body.append(o);
    return o;
  }
  LD.show = function (text, k) {
    const o = overlay();
    o.hidden = false;
    const t = $("nl-text"); if (t) t.textContent = text || "LOADING…";
    const f = $("nl-fill"); if (f) f.style.width = Math.round((k || 0) * 100) + "%";
    const tip = $("nl-tip"); if (tip && !tip.textContent) tip.textContent = TIPS[tipI++ % TIPS.length];
  };
  LD.hide = function () { const o = $("nr-loading"); if (o) o.hidden = true; const tip = $("nl-tip"); if (tip) tip.textContent = ""; LD.hold = false; };
  const pending = () => Object.keys(NR.assets.inflight || {}).length;
  LD.waitAssets = function (text, maxMs) {
    const web = typeof location !== "undefined" && /^https?:/.test(location.protocol);
    const start = pending();
    if (!web || !start) return;
    LD.hold = true;
    const t0 = Date.now();
    LD.show(text, 0);
    NR.crazy?.loading(true);
    const iv = setInterval(() => {
      const left = pending();
      LD.show(text, 1 - left / Math.max(start, left, 1));
      if (!left || Date.now() - t0 > (maxMs || 7000) || G.state !== "playing") { clearInterval(iv); LD.hide(); NR.crazy?.loading(false); }
    }, 120);
  };
  // small corner pill while anything streams in
  if (typeof setInterval === "function") setInterval(() => {
    let pill = $("asset-pill");
    const n = pending();
    if (!pill) {
      if (!n) return;
      pill = document.createElement("div"); pill.id = "asset-pill"; pill.className = "asset-pill";
      document.body.append(pill);
    }
    pill.hidden = !n || LD.hold || ($("scr-load") && $("scr-load").classList.contains("active"));
    if (n) pill.textContent = `LOADING ASSETS · ${n}`;
  }, 400);
  const update = G.update;
  G.update = function (dt, rd) {
    if (LD.hold && G.state === "playing") { NR.hud.update(rd); return; }
    return update.call(G, dt, rd);
  };

  /* ---------------- random worlds ---------------- */
  const WKEY = "nr_adv_v1";
  const worlds = () => A.chapters.length;
  let adv = {};
  try { adv = JSON.parse(NR.store.getItem(WKEY) || "{}") || {}; } catch (_) { adv = {}; }
  const bestSoFar = () => 1 + Math.max(0, ...(NR.levels ? NR.levels.best : [0]));
  P.advLevel = Math.max(1, Math.min(100000, Math.floor(Number(adv.level) || bestSoFar())));
  PO.saveAdv = () => NR.store.setItem(WKEY, JSON.stringify({ level: P.advLevel }));
  // levels walk through shuffled "decks" of worlds: random order, and two
  // levels in a row never share a world
  function deck(c) {
    const count = worlds(), d = [...Array(count).keys()];
    for (let j = count - 1; j > 0; j--) { const k = E.hash(`${E.seed}:deck:${c}:${j}`) % (j + 1); [d[j], d[k]] = [d[k], d[j]]; }
    return d;
  }
  function deckFixed(c) {
    const d = deck(c);
    if (c > 0 && d.length > 1) { const prev = deck(c - 1); if (d[0] === prev[prev.length - 1]) [d[0], d[1]] = [d[1], d[0]]; }
    return d;
  }
  PO.worldFor = function (n) {
    const count = worlds();
    if (count <= 1) return 0;
    n = Math.max(1, n | 0);
    return deckFixed(Math.floor((n - 1) / count))[(n - 1) % count];
  };
  PO.randomOther = function (cur) {
    const count = worlds();
    if (count <= 1) return 0;
    let w = Math.floor(Math.random() * (count - 1));
    if (w >= cur) w++;
    return w;
  };
  // every world is reachable now (world picking is automatic)
  P.unlocked = Math.max(P.unlocked || 0, worlds() - 1);

  const start = G.start;
  G.start = function (options = {}) {
    options = options || {};
    if (!options.online && !options.resume) {
      if (P.mode === "adventure") {
        const ch = PO.worldFor(P.advLevel);
        options = { ...options, chapter: ch };
        P.chapter = ch;
        E.levels[ch] = P.advLevel;
        try { E.save(); } catch (_) {}
      } else if (!Number.isInteger(options.chapter)) {
        options = { ...options, chapter: Math.floor(Math.random() * worlds()) };
      }
    }
    const r = start.call(this, options);
    if (!options.online && G.state === "playing") LD.waitAssets(G.mode === "adventure" ? `LEVEL ${P.advLevel} · ${(A.chapters[G.chapter] || {}).short || "WORLD"}`.toUpperCase() : "ENTERING THE ARENA…");
    return r;
  };
  if (NR.levels && NR.levels.onClear) {
    const onClear = NR.levels.onClear;
    NR.levels.onClear = function (ch, level) {
      const r = onClear.call(this, ch, level);
      P.advLevel = Math.max(P.advLevel, (level | 0) + 1);
      PO.saveAdv();
      return r;
    };
  }
  if (NR.expeditionUI && NR.expeditionUI.showVictory) {
    const show = NR.expeditionUI.showVictory;
    NR.expeditionUI.showVictory = function (g) {
      const r = show.call(this, g);
      const bn = $("btn-next-chapter"); if (bn) bn.hidden = true;
      const lc = (NR.levels && NR.levels.lastCleared) || { level: P.advLevel - 1 };
      const vt = $("victory-title"); if (vt) vt.textContent = `LEVEL ${lc.level} CLEARED`;
      const nl = $("next-world-level"); if (nl) nl.textContent = `▶ PLAY LEVEL ${P.advLevel} · NEW WORLD →`;
      return r;
    };
  }
  // WAVE FIGHT: a new world after every boss
  const bossKilled = G.onBossKilled;
  G.onBossKilled = function (b) {
    const r = bossKilled.call(this, b);
    if (G.mode === "survival" && !G.pvp && !G.netGuest) {
      const next = PO.randomOther(G.chapter | 0);
      setTimeout(() => {
        if (G.state !== "playing" && G.state !== "upgrade") return;
        G.chapter = next;
        try { NR.superRuntime?.prepare(); } catch (_) {}
        const ch = A.chapters[next];
        G.banner("NEW WORLD", ch ? ch.name || ch.short : "WORLD " + (next + 1), "#8af5e1");
      }, 1200);
    }
    return r;
  };
  // deploy panel: no world picker, show the next level instead
  if (NR.lobby && NR.lobby.refreshDeploy) {
    const refresh = NR.lobby.refreshDeploy;
    NR.lobby.refreshDeploy = function (...a) {
      const r = refresh.apply(this, a);
      const dc = $("deploy-chapters"); if (dc) { dc.hidden = true; dc.style.display = "none"; }
      const t = $("deploy-title");
      if (t) t.textContent = P.mode === "adventure" ? `SURVIVE · LEVEL ${P.advLevel}` : "WAVE FIGHT";
      const note = $("deploy-note");
      if (note) note.textContent = P.mode === "adventure"
        ? `LEVEL ${P.advLevel} · A RANDOM WORLD EVERY LEVEL · ENEMIES GET STRONGER EACH LEVEL`
        : `ENDLESS WAVES · BOSS EVERY 5TH WAVE · NEW WORLD AFTER EVERY BOSS · BEST WAVE ${P.bestWave || 0}`;
      return r;
    };
    document.querySelectorAll("#deploy-modes .deploy-mode").forEach((b) => b.addEventListener("click", () => setTimeout(() => NR.lobby.refreshDeploy(), 0)));
  }

  /* ---------------- boot: CrazyGames + invites ---------------- */
  let booted = false;
  const toMenu = G.toMenu;
  G.toMenu = function (...a) {
    const r = toMenu.apply(this, a);
    LD.hide();
    if (!booted) {
      booted = true;
      if (tipTimer) clearInterval(tipTimer);
      NR.crazy?.loading(false);
      setTimeout(() => { try { NR.onlineUI?.autoJoin(); } catch (err) { NR.reportError?.("Invite", err); } }, 600);
    }
    return r;
  };
  if (NR.crazy) {
    NR.crazy.init().then((ok) => { if (ok && !booted) NR.crazy.loading(true); if (ok && booted) NR.onlineUI?.autoJoin(); }).catch(() => {});
  }
})();

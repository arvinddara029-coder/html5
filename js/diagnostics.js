/* ============ PRODUCTION PASS — Diagnostics / Error Center ============
   Structured, crash-safe error + event log with a bounded ring buffer.
   - Every runtime error, SDK call failure and gameplay warning becomes a
     structured record: {time, type, msg, stack, scene, mode, sdk}
   - Persists the last N records in localStorage (never grows unbounded).
   - Copy All / Clear / Export JSON — surfaced in Settings → Diagnostics.
   - Redacts obvious token-like strings before storing or copying. */
(function () {
  const MAX_RECORDS = 120;
  const STORE_KEY = "nr_diag_v1";
  const D = (NR.diag = {
    records: [],
    counts: {},
    sdkStatus: "unavailable",
    redact: true,
  });

  /* ---- crash-safe persistence ---- */
  function load() {
    try {
      const raw = NR.store.getItem(STORE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) D.records = arr.slice(-MAX_RECORDS);
    } catch (_) { /* corrupted log is discarded, never fatal */ }
  }
  function persist() {
    try { NR.store.setItem(STORE_KEY, JSON.stringify(D.records.slice(-MAX_RECORDS))); }
    catch (_) { /* storage full/blocked: keep in memory only */ }
  }

  const TOKEN_RE = /(token|secret|password|apikey|api_key|authorization|bearer)[=: ]+\S+/gi;
  function redact(str) {
    if (!D.redact || typeof str !== "string") return str;
    return str.replace(TOKEN_RE, "$1=[REDACTED]");
  }

  function context() {
    const G = NR.game;
    return {
      scene: G ? G.state : "boot",
      mode: G && G.mode ? G.mode : "-",
      wave: G && G.wave ? G.wave : 0,
      level: G && G.level ? G.level : undefined,
      sdk: D.sdkStatus,
    };
  }

  /* type: ERROR | WARN | SDK | GAMEPLAY | NETWORK | INFO */
  D.log = function (type, msg, extra) {
    const rec = {
      t: new Date().toISOString(),
      type: String(type).slice(0, 12).toUpperCase(),
      msg: redact(String(msg).slice(0, 300)),
    };
    try {
      const ctx = context();
      rec.scene = ctx.scene; rec.mode = ctx.mode;
      if (ctx.wave) rec.wave = ctx.wave;
      if (ctx.level) rec.level = ctx.level;
      rec.sdk = ctx.sdk;
    } catch (_) {}
    if (extra) {
      if (extra instanceof Error) {
        rec.stack = redact(String(extra.stack || extra.message).slice(0, 500));
      } else if (typeof extra === "object") {
        try { rec.ctx = JSON.parse(redact(JSON.stringify(extra)).slice(0, 300)); } catch (_) {}
      } else rec.ctx = redact(String(extra).slice(0, 200));
    }
    D.records.push(rec);
    if (D.records.length > MAX_RECORDS) D.records.splice(0, D.records.length - MAX_RECORDS);
    D.counts[rec.type] = (D.counts[rec.type] || 0) + 1;
    persist();
    return rec;
  };
  D.error = (m, e) => D.log("ERROR", m, e);
  D.warn = (m, e) => D.log("WARN", m, e);
  D.sdk = (m, e) => D.log("SDK", m, e);
  D.game = (m, e) => D.log("GAMEPLAY", m, e);
  D.net = (m, e) => D.log("NETWORK", m, e);
  D.info = (m) => D.log("INFO", m);

  D.clear = function () { D.records = []; D.counts = {}; persist(); };

  D.exportJSON = function () {
    return JSON.stringify({ app: "neon-ronin", exported: new Date().toISOString(), sdk: D.sdkStatus, records: D.records }, null, 2);
  };
  D.copyAll = function () {
    const text = D.records.map((r) =>
      `[${r.t}] [${r.type}]${r.scene ? " scene=" + r.scene : ""}${r.mode !== "-" ? " mode=" + r.mode : ""} sdk=${r.sdk || "-"} — ${r.msg}${r.stack ? "\n  " + r.stack.replace(/\n/g, "\n  ") : ""}`
    ).join("\n");
    const done = () => NR.hub?.notify("Diagnostics copied to clipboard.");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  };
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      document.execCommand("copy"); ta.remove(); done && done();
    } catch (_) { NR.hub?.notify("Copy failed — use EXPORT instead."); }
  }
  D.downloadJSON = function () {
    try {
      const blob = new Blob([D.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "neon-ronin-diagnostics.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { D.error("Diagnostics export failed", e); NR.hub?.notify("Export failed."); }
  };

  /* ---- runtime metrics for the dev panel ---- */
  D.metrics = { fps: 0, frameMs: 0, enemies: 0, bolts: 0, particles: 0, effects: 0, pooled: 0, net: {} };
  D.frame = function (frameMs) {
    D.metrics.frameMs = frameMs;
    D.metrics.fps = frameMs > 0 ? Math.min(999, 1000 / frameMs) : 0;
    D.metrics.enemies = NR.game ? NR.game.enemies.length : 0;
    D.metrics.bolts = NR.game ? NR.game.bolts.length + NR.game.shots.length : 0;
    D.metrics.particles = NR.fx ? NR.fx.parts.length : 0;
    D.metrics.effects = NR.vfx ? NR.vfx.active : 0;
    D.metrics.pooled = NR.pool ? NR.pool.pooledCount() : 0;
  };

  /* ---- development-only debug panel (?debug=1 or #debug) ---- */
  let panel = null, panelTimer = 0, enabled = false;
  D.debugEnabled = () => enabled;
  D.initDebug = function () {
    try {
      const q = typeof URLSearchParams === "function" && typeof location !== "undefined"
        ? new URLSearchParams(location.search || "") : null;
      enabled = (q && q.get("debug") === "1")
        || (typeof location !== "undefined" && location.hash === "#debug")
        || (NR.store.getItem("nr_debug") === "1");
    } catch (_) { enabled = false; }
    if (!enabled) return;
    panel = document.createElement("div");
    panel.id = "debug-panel";
    panel.setAttribute("aria-hidden", "true");
    document.body.append(panel);
    D.info("Debug panel enabled (development mode)");
  };
  D.updateDebug = function (now) {
    if (!enabled || !panel) return;
    if (now - panelTimer < 250) return;
    panelTimer = now;
    const m = D.metrics, G = NR.game, net = NR.net;
    const lines = [
      `FPS ${m.fps.toFixed(0)} · ${m.frameMs.toFixed(1)}ms`,
      `enemies ${m.enemies} · bolts ${m.bolts} · parts ${m.particles} · fx ${m.effects} · pooled ${m.pooled}`,
      `state ${G ? G.state : "-"} · mode ${G && G.mode || "-"} · wave ${G && G.wave || 0} · level ${G && G.level || 1} · world ${(G && G.chapter || 0) + 1}`,
      `hero ${NR.heroes ? (NR.heroes.current()?.name || "-") : "-"} · seed ${NR.levelsys ? NR.levelsys.seedInfo() : "-"}`,
      `sdk ${D.sdkStatus}${NR.crazy && NR.crazy.user ? " · " + NR.crazy.user.username : ""}`,
      net && net.room ? `room ${net.room.code || "-"} · peers ${net.peerCount()} · ping ${net.ping() || "-"}ms · ${net.updateRate() || "-"}hz` : "room none",
      `errors ${D.counts.ERROR || 0} · sdk ${D.counts.SDK || 0} · net ${D.counts.NETWORK || 0}`,
    ];
    panel.textContent = lines.join("\n");
  };

  load();
  D.info("Diagnostics started");
})();

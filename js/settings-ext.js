/* ============ PRODUCTION PASS — extended settings + Diagnostics UI ============
   New settings (all functional, none decorative):
     FPS TARGET  Auto / 30 / 45 / 60 / 90 / 120  → real frame cap in main.js
     QUALITY     Low / Medium / High             → DPR + particle budget + VFX
     VFX QUALITY Low / Medium / High             → animated-clip budget
     SHADOWS     on/off                          → ground shadows + glow halos
     DAMAGE FX   on/off                          → hit vignette / shake on hurt
     HUD SCALE   70–140%                         → scales canvas HUD + touch UI
     DAMAGE TEXT / FLOATING NUMBERS / VFX INTENSITY sliders
   Diagnostics / Error Log (advanced): list + Copy All + Clear + Export JSON.
   Hooks are called from hub.js bindings created in index.html. */
(function () {
  const $ = (id) => document.getElementById(id);
  const P = NR.profile;
  const S = (NR.settings = {});

  const FPS_OPTIONS = [0, 30, 45, 60, 90, 120];
  const QUALITY = ["low", "medium", "high"];

  S.defaults = {
    fpsTarget: 0,          // 0 = auto (uncapped)
    quality: "medium",
    vfxQuality: "medium",
    shadows: true,
    damageEffects: true,
    hudScale: 1,
    damageText: true,
    floatingNumbers: true,
    vfxIntensity: 1,
  };

  S.get = function () {
    const out = Object.assign({}, S.defaults);
    if (P.settings && typeof P.settings === "object") Object.assign(out, P.settings);
    return out;
  };
  S.set = function (key, value) {
    P.settings = Object.assign(S.defaults, P.settings || {});
    P.settings[key] = value;
    NR.saveProfile();
    S.apply();
  };
  S.apply = function () {
    const s = S.get();
    NR.noShadows = !s.shadows; // consumed by the canvas renderers
    NR.vfx?.setQuality(Object.assign({ quality: s.vfxQuality, vfxIntensity: s.vfxIntensity }, s));
    document.documentElement.style.setProperty("--hud-scale", String(s.hudScale));
    document.documentElement.style.setProperty("--touch-scale", String(Math.min(1.35, Math.max(0.7, s.hudScale))));
    document.body.classList.toggle("no-shadows", !s.shadows);
    document.body.classList.toggle("no-damage-fx", !s.damageEffects);
    if (NR.main) NR.main.setFpsTarget(s.fpsTarget);
    if (NR.main) NR.main.setQuality(s.quality);
  };

  /* ---- UI wiring (elements exist in index.html) ---- */
  S.init = function () {
    const s = S.get();
    // FPS segmented control
    const fps = $("set-fps");
    if (fps) {
      fps.replaceChildren(...FPS_OPTIONS.map((v) => {
        const b = document.createElement("button");
        b.textContent = v === 0 ? "AUTO" : String(v);
        b.className = s.fpsTarget === v ? "sel" : "";
        b.addEventListener("click", () => {
          S.set("fpsTarget", v);
          NR.audio.play("uiClick");
          fps.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
        });
        return b;
      }));
    }
    // quality selects
    for (const [id, key, opts] of [["set-quality", "quality", QUALITY], ["set-vfx", "vfxQuality", QUALITY]]) {
      const el = $(id);
      if (!el) continue;
      el.replaceChildren(...opts.map((v) => {
        const b = document.createElement("button");
        b.textContent = v.toUpperCase();
        b.className = s[key] === v ? "sel" : "";
        b.addEventListener("click", () => {
          S.set(key, v);
          NR.audio.play("uiClick");
          el.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
        });
        return b;
      }));
    }
    // toggles
    for (const [id, key] of [["tgl-shadows", "shadows"], ["tgl-dmgfx", "damageEffects"], ["tgl-dmgtext", "damageText"], ["tgl-float", "floatingNumbers"]]) {
      const el = $(id);
      if (!el) continue;
      const sync = () => { el.textContent = s[key] ? "ON" : "OFF"; el.classList.toggle("on", !!s[key]); };
      sync();
      el.addEventListener("click", () => { S.set(key, !S.get()[key]); sync(); NR.audio.play("uiToggleOn"); });
    }
    // sliders
    for (const [id, key, min, max, step] of [["hud-scale", "hudScale", 0.7, 1.4, 0.05], ["vfx-intensity", "vfxIntensity", 0.4, 1.3, 0.05]]) {
      const el = $(id);
      if (!el) continue;
      el.min = min; el.max = max; el.step = step; el.value = s[key];
      const out = $(id + "-out");
      const show = () => { if (out) out.textContent = Math.round(el.value * 100) + "%"; };
      show();
      el.addEventListener("input", () => { S.set(key, parseFloat(el.value)); show(); });
    }
    S.initDiagnostics();
    S.apply();
  };

  /* ---- Diagnostics / Error Center ---- */
  S.initDiagnostics = function () {
    const box = $("diag-list");
    if (!box) return;
    const render = () => {
      const recs = (NR.diag.records || []).slice().reverse();
      box.replaceChildren(...recs.slice(0, 40).map((r) => {
        const el = document.createElement("div");
        el.className = "diag-row diag-" + (r.type || "info").toLowerCase();
        const time = String(r.t || "").slice(11, 19);
        el.innerHTML = `<span class="d-t">${time}</span><span class="d-type">${r.type}</span>` +
          `<span class="d-msg"></span><span class="d-ctx">${r.scene || ""}${r.mode && r.mode !== "-" ? " · " + r.mode : ""} · sdk ${r.sdk || "-"}</span>`;
        el.querySelector(".d-msg").textContent = r.msg;
        return el;
      }));
      if (!recs.length) {
        const e = document.createElement("div");
        e.className = "diag-row";
        e.textContent = "No errors recorded. Structured events appear here (last 120 kept).";
        box.append(e);
      }
      const clearBtn = $("btn-diag-clear"), copyBtn = $("btn-diag-copy"), expBtn = $("btn-diag-export");
      if (clearBtn) clearBtn.onclick = () => { NR.diag.clear(); render(); NR.hub.notify("Diagnostics cleared."); };
      if (copyBtn) copyBtn.onclick = () => NR.diag.copyAll();
      if (expBtn) expBtn.onclick = () => NR.diag.downloadJSON();
    };
    render();
    const panel = $("scr-set");
    if (panel && typeof MutationObserver === "function") {
      // refresh the log whenever settings opens
      new MutationObserver(render).observe(panel, { attributes: true, attributeFilter: ["class"] });
    }
  };
})();

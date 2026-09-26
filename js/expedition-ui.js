/* Static-only mission selection, operator roster, archive and expedition HUD. */
(function () {
  const $ = (id) => document.getElementById(id),
    P = NR.profile;
  const icon = (name) =>
    `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const X = (NR.expeditionUI = { recordFilter: "all" });
  X.init = function () {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
    document.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        P.mode = b.dataset.mode;
        NR.saveProfile();
        X.refresh();
        NR.audio.play("ui");
      }),
    );
    const opsBtn = $("btn-operators");
    if (opsBtn)
      opsBtn.addEventListener("click", () => {
        X.renderOperators();
        NR.ui.show("operators");
      });
    on("btn-operators-back", () => NR.ui.show("menu"));
    const cont = $("deploy-continue");
    if (cont) cont.addEventListener("click", () => NR.game.start({ resume: true }));
    on("btn-retry-checkpoint", () => NR.game.start({ resume: true }));
    on("btn-next-chapter", () => {
      P.mode = "adventure";
      P.chapter = Math.min(2, NR.game.chapter + 1);
      NR.saveProfile();
      NR.game.start({ chapter: P.chapter });
    });
    on("btn-victory-menu", () => NR.game.toMenu());
    on("btn-credits", () => NR.ui.show("credits"));
    on("btn-credits-back", () => NR.ui.show("set"));
    on("interaction-prompt", () => {
      if (NR.game.state === "playing") NR.input.pressed.interact = true;
    });
    document.querySelectorAll("[data-record-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        X.recordFilter = b.dataset.recordFilter;
        X.showRecords();
      }),
    );
    for (const [id, key] of [
      ["music-volume", "musicVolume"],
      ["sfx-volume", "sfxVolume"],
    ]) {
      const el = $(id);
      if (!el) continue;
      el.value = Math.round(P[key] * 100);
      el.addEventListener("input", () => {
        P[key] = Number(el.value) / 100;
        NR.audio.setVolumes();
        NR.saveProfile();
      });
    }
    if (NR.saveTransfer && NR.saveTransfer.init) NR.saveTransfer.init();
    X.refresh();
  };
  X.refresh = function () {
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === P.mode);
      b.classList.toggle("sel", b.dataset.mode === P.mode);
      b.setAttribute("aria-pressed", b.dataset.mode === P.mode);
    });
    if (NR.lobby && NR.lobby.refreshDeploy) NR.lobby.refreshDeploy();
    if (NR.lobby && NR.lobby.refreshCard) NR.lobby.refreshCard();
  };
  X.renderOperators = function () {
    const opEl = $("operator-options");
    if (!opEl) return;
    const focused = document.activeElement?.dataset.operator;
    opEl.replaceChildren(
      ...NR.characters.map((c) => {
        const b = document.createElement("button");
        b.className =
          "operator-card" + (P.character === c.id ? " selected" : "");
        b.dataset.operator = c.id;
        b.style.setProperty("--operator-color", c.color);
        b.setAttribute("aria-pressed", P.character === c.id);
        b.innerHTML = `<div class="operator-art"><img src="assets/operators/${c.id}.svg" alt="${c.name} armored operator"/><span>${P.character === c.id ? "● EQUIPPED" : c.tag}</span></div><div class="operator-info"><small>${c.role}</small><h3>${c.name}</h3><p>${c.perk}</p><div class="operator-spec"><span>ARMOR <b>${c.hp} HP</b></span><span>DAMAGE <b>×${c.damage.toFixed(2)}</b></span><span>MOBILITY <b>${c.jumps} JUMPS / ${c.dashes} DASH</b></span></div></div>`;
        b.addEventListener("click", () => {
          P.character = c.id;
          NR.saveProfile();
          X.renderOperators();
          X.refresh();
          NR.audio.play("ui");
        });
        return b;
      }),
    );
    if (focused)
      opEl
        .querySelector(`[data-operator="${focused}"]`)
        ?.focus({ preventScroll: true });
  };
  X.showRecords = function () {
    NR.ui.show("records");
    const board = $("leaderboard");
    if (!board) return;
    board.replaceChildren();
    document.querySelectorAll("[data-record-filter]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.recordFilter === X.recordFilter);
      b.setAttribute("aria-pressed", b.dataset.recordFilter === X.recordFilter);
    });
    const runs = NR.records.filter(
      (r) => X.recordFilter === "all" || r.mode === X.recordFilter,
    );
    if (!runs.length) {
      const p = document.createElement("p");
      p.className = "board-empty";
      p.textContent =
        "Your story starts with the next run. Complete a chapter or finish a survival run to set a local record.";
      board.append(p);
    }
    runs.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "board-row";
      const rank = document.createElement("span");
      rank.textContent = String(i + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.textContent = r.name;
      const meta = document.createElement("small");
      meta.textContent = `${r.mode === "adventure" ? "CHAPTER " + r.chapter : "WAVE " + r.wave} · ${String(r.difficulty).toUpperCase()} · ${r.victory ? "COMPLETE" : "RUN ENDED"}`;
      name.append(meta);
      const duration = document.createElement("span");
      duration.textContent = NR.util.fmtTime(r.duration);
      const score = document.createElement("strong");
      score.textContent = NR.util.fmt(r.score);
      row.append(rank, name, duration, score);
      board.append(row);
    });
    const ac = $("achievement-count");
    if (ac) ac.textContent = `${NR.unlockedAchievements.size} / ${NR.achievements.length}`;
    const ag = $("achievement-grid");
    if (ag) ag.replaceChildren(
      ...NR.achievements.map((a) => {
        const el = document.createElement("div");
        el.className =
          "achievement" +
          (NR.unlockedAchievements.has(a.id) ? " unlocked" : "");
        el.innerHTML =
          icon(a.icon) +
          `<div><b>${a.name}</b><p>${a.desc}</p><small>${NR.unlockedAchievements.has(a.id) ? "UNLOCKED" : "IN PROGRESS"}</small></div>`;
        return el;
      }),
    );
  };
  X.syncRun = function () {
    const G = NR.game;
    if (!G) return;
    document.body.classList.toggle("adventure-run", G.mode === "adventure");
    const power = NR.powers.find((p) => p.id === G.tactical);
    if (!power) return;
    const ti = $("tactical-icon");
    if (ti) ti.innerHTML = icon(power.icon);
    const tn = $("tactical-name");
    if (tn) tn.textContent = power.short;
    const jt = $("journey-tip");
    if (jt) jt.hidden = G.mode !== "adventure";
  };
  X.update = function () {
    const G = NR.game,
      A = NR.adventure,
      playing = G.state === "playing";
    const ip = $("interaction-prompt");
    const jt = $("journey-tip");
    const notif = $("notification");
    if (ip) ip.hidden = !playing || G.mode !== "adventure" || !A.prompt;
    if (jt) jt.hidden =
      !playing ||
      G.mode !== "adventure" ||
      A.tutorial <= 0 ||
      !!A.prompt ||
      (notif && notif.classList.contains("visible")) ||
      NR.hud.banners.length > 0;
    if (!playing || G.mode !== "adventure") return;
    const pct = Math.min(100, Math.round((G.player.x / NR.world.W) * 100));
    const es = $("expedition-sector");
    if (es) es.textContent = A.chapter.district;
    const er = $("expedition-relays");
    if (er) er.textContent = `RELAYS ${A.relays.filter((r) => r.active).length} / 3`;
    const ed = $("expedition-distance");
    if (ed) ed.textContent = pct + "%";
    const rp = $("route-progress");
    if (rp) rp.style.width = pct + "%";
    const rpl = $("route-player");
    if (rpl) rpl.style.left = pct + "%";
    const eo = $("expedition-objective");
    if (eo) eo.textContent = A.objective();
    document
      .querySelectorAll(".route-track>span")
      .forEach((el, i) => el.classList.toggle("online", A.relays[i] && A.relays[i].active));
    if (A.prompt && ip) {
      const span = ip.querySelector("span");
      if (span) span.textContent = A.prompt.label;
    }
  };
  X.showVictory = function (G) {
    const A = NR.adventure;
    const vt = $("victory-title");
    if (vt) vt.textContent = G.chapter === 2 ? "PROTOCOL ZERO: BROKEN" : "CHAPTER COMPLETE";
    const vs = $("victory-story");
    if (vs) vs.textContent =
      G.chapter === 2
        ? "The reactor is silent. For the first time in years, the city belongs to its people. Your story is now part of it."
        : `${A.chapter.name} is back online. A new route has opened beyond the wall.`;
    const caches = A.caches.filter((c) => c.open).length,
      shards = A.shards.filter((s) => s.collected).length;
    const vstats = $("victory-stats");
    if (vstats) vstats.innerHTML =
      `<div><strong>${NR.util.fmt(G.score)}</strong><span>SCORE</span></div><div><strong>${NR.util.fmtTime(G.time)}</strong><span>TIME</span></div><div><strong>${caches}/4</strong><span>CACHES</span></div><div><strong>${shards}/16</strong><span>SHARDS</span></div>`;
    const bn = $("btn-next-chapter");
    if (bn) bn.hidden = G.chapter >= 2;
    NR.ui.show("victory");
  };
})();

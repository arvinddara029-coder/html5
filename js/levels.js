/* ============ World levels — World 1 · Level 1, 2, 3 … endless ============
   Every world has an endless, auto-generated level track. Each level is a new
   seeded route (platforms, hazards, loot, patrol mix, scenery) with its own
   boss from the art packs, and enemies get tougher every level. Every 8th
   level is a WORLD BOSS level; beating Level 8 of a world opens the next
   world. Players pick any cleared level (or the next one) from the level
   track in the deploy panel. */
(function () {
  const E = NR.evolution, A = NR.adventure, B = NR.bosses;
  const GATE = 8, PER_PAGE = 8, KEY = "nr_levels_v1";
  const L = (NR.levels = { GATE, PER_PAGE });
  const read = () => { try { return JSON.parse(NR.store.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const saved = read();
  // best = highest cleared level per world. Older saves only stored the
  // "next" level, so anything below it counts as cleared.
  L.best = A.chapters.map((_, i) => {
    const b = Math.floor(Number(saved.best && saved.best[i]) || 0);
    return Math.max(0, Math.min(100000, Math.max(b, (E.levels[i] || 1) - 1)));
  });
  L.page = A.chapters.map((_, i) => Math.floor(((E.levels[i] || 1) - 1) / PER_PAGE));
  L.save = () => { try { NR.store.setItem(KEY, JSON.stringify({ best: L.best })); } catch (_) {} };
  L.maxPlayable = (ch) => Math.min(100000, (L.best[ch] || 0) + 1);
  L.select = function (ch, level) {
    level = Math.max(1, Math.min(L.maxPlayable(ch), Math.floor(level)));
    E.levels[ch] = level; E.save();
    L.page[ch] = Math.floor((level - 1) / PER_PAGE);
    return level;
  };
  L.opensNextWorld = (ch) => (L.best[ch] || 0) >= GATE;
  /* called by adventure completion (level = the level that was just played) */
  L.onClear = function (ch, level) {
    L.lastCleared = { ch, level };
    L.best[ch] = Math.max(L.best[ch] || 0, level);
    L.save();
  };
  L.bossPreview = (ch, level) => (B ? B.nameOf(B.forLevel(ch, level)) : "");

  /* ---------------- level track in the deploy panel ---------------- */
  const $ = (id) => document.getElementById(id);
  function mk(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  L.renderPicker = function () {
    const host = $("chapter-cards") || $("deploy-chapters");
    if (!host || !host.append) return;
    const P = NR.profile, ch = P.chapter || 0;
    let box = $("level-picker");
    if (!box || box.parentElement !== host) { box = mk("div", "level-picker"); box.id = "level-picker"; }
    // the level track sits right under the selected world card
    const card = host.querySelector ? host.querySelector(`[data-chapter="${ch}"]`) : null;
    if (card && card.after && card.parentElement === host) card.after(box);
    else if (box.parentElement !== host) host.append(box);
    const cur = E.levels[ch] || 1, best = L.best[ch] || 0, maxLv = L.maxPlayable(ch);
    const page = Math.max(0, L.page[ch] || 0), first = page * PER_PAGE + 1;
    const head = mk("div", "lm-label", `LEVEL — WORLD ${ch + 1} · ${best} CLEARED · LEVELS NEVER END`);
    const row = mk("div", "level-row");
    const prev = mk("button", "lv-nav", "‹");
    prev.setAttribute("aria-label", "Previous levels");
    prev.disabled = page === 0;
    prev.addEventListener("click", () => { L.page[ch] = Math.max(0, page - 1); L.renderPicker(); });
    row.append(prev);
    for (let n = first; n < first + PER_PAGE; n++) {
      const b = mk("button", "lv-node");
      const locked = n > maxLv, cleared = n <= best, boss = B && B.isWorldBossLevel(n);
      if (locked) b.classList.add("locked");
      if (cleared) b.classList.add("cleared");
      if (n === cur) b.classList.add("sel");
      if (boss) b.classList.add("boss");
      b.disabled = locked;
      b.dataset.level = String(n);
      b.setAttribute("aria-label", `Level ${n}${cleared ? " cleared" : locked ? " locked" : ""}${boss ? " world boss" : ""}`);
      b.append(mk("b", "", String(n)), mk("small", "", locked ? "🔒" : cleared ? "✔" : boss ? "👑" : "NEW"));
      b.addEventListener("click", () => { L.select(ch, n); NR.audio.play("ui"); L.renderPicker(); });
      row.append(b);
    }
    const next = mk("button", "lv-nav", "›");
    next.setAttribute("aria-label", "Next levels");
    next.disabled = first + PER_PAGE > maxLv + PER_PAGE;
    next.addEventListener("click", () => { L.page[ch] = page + 1; L.renderPicker(); });
    row.append(next);
    const worldBoss = B && B.isWorldBossLevel(cur);
    const info = mk("p", "lv-info",
      `WORLD ${ch + 1} · LEVEL ${cur}${worldBoss ? " · WORLD BOSS" : ""} · BOSS: ${L.bossPreview(ch, cur)} · ENEMIES +${Math.round((cur - 1) * 8)}% HP` +
      (ch < A.chapters.length - 1 && !L.opensNextWorld(ch) && ch >= P.unlocked ? ` · CLEAR LEVEL ${GATE} TO OPEN WORLD ${ch + 2} (${Math.min(best, GATE)}/${GATE})` : ""));
    box.replaceChildren(head, row, info);
  };
  if (NR.lobby && NR.lobby.refreshDeploy) {
    const refresh = NR.lobby.refreshDeploy;
    NR.lobby.refreshDeploy = function (...args) {
      refresh.apply(this, args);
      try { L.renderPicker(); } catch (err) { NR.reportError?.("Level picker", err); }
    };
  }

  /* ---------------- victory screen speaks in levels ---------------- */
  if (NR.expeditionUI && NR.expeditionUI.showVictory) {
    const show = NR.expeditionUI.showVictory;
    NR.expeditionUI.showVictory = function (G) {
      show.call(this, G);
      const lc = L.lastCleared || { ch: G.chapter, level: Math.max(1, (E.levels[G.chapter] || 2) - 1) };
      const vt = $("victory-title");
      if (vt) vt.textContent = `WORLD ${lc.ch + 1} · LEVEL ${lc.level} CLEARED`;
      const nl = $("next-world-level");
      if (nl) nl.textContent = `▶ PLAY LEVEL ${lc.level + 1} →`;
      const bn = $("btn-next-chapter");
      if (bn) bn.hidden = G.chapter >= A.chapters.length - 1 || G.chapter + 1 > NR.profile.unlocked;
      const vs = $("victory-story");
      if (vs && G.chapter < A.chapters.length - 1 && G.chapter + 1 > NR.profile.unlocked)
        vs.textContent += ` Clear Level ${GATE} to open World ${G.chapter + 2} (${Math.min(L.best[G.chapter], GATE)}/${GATE}).`;
    };
  }
})();

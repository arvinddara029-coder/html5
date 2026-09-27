# Evolution + Super expansion

## Player-facing controls

- **Settings → Ability Vault**, or **✦** during combat: equip/unequip up to **10** spells. **1–9, 0** or touch buttons cast them. Empty slots are allowed. Twelve spells unlock at hero levels 1–10, 12 and 15.
- **Settings → Custom HUD**: drag movement, combat and equipped spell buttons. Save, Cancel and Reset are supported. Bounded viewport-relative positions survive reload and screen rotation.
- **Settings → Super Heroes & Pets**: select measured-animation heroes, companion pets and level-gated legacy relic weapons. The operator's base combat class remains selected; Super heroes have additional signature bonuses. Selection applies to the next run.
- **?** explains relay restoration: +30 XP, +20 HP, dash/kunai refill, tactical cooldown reset, upgrade selection and the saved checkpoint. It also explains ability unlocks and wave continuation.
- **Continue Same Wave / Encounter** revives the current encounter, retaining surviving enemies/queued spawns and giving three seconds of protection. It does not reset the wave or grant its rewards twice.
- **Settings → Resume Saved Wave** after reload restarts the saved survival wave with the saved build. A wave-boundary snapshot and reward/XP high-water marks prevent replayed progress from paying again. Adventure continues from its relay checkpoint.
- **Next Level · Same World** after victory generates the next numbered level in the current world. **Next Chapter** travels to another unlocked world. All six worlds retain their unlocks across reload.

## Abilities and progression

Kills grant **12 XP immediately**. Level-up immediately adds four maximum HP per level, increases strike and storm scaling, strengthens spells and exposes newly unlocked spells in the Vault. Every five levels reduces spell cooldown by 4%, capped at 40%.

Every equipped catalog item has a stable two-trait stat signature. Weapons, auras, pets and relics also have an item-specific combination of one of ten magic behaviors, potency, radius, target count, duration and cooldown. Magic includes fire damage, time slow, healing, chains, launches, pulls, poison, dash recovery, energy recovery and low-health execution. Families are shared; this is not a claim of thousands of separately hand-authored mechanics.

Shop cards, creator tooltips, roster cards and the Vault explain the actual effect. Signature operator gear is used for combat bonuses, matching its visible appearance.

Wave/relay upgrades now include **Arcane Amplifier**, **Efficient Channel** and **Timeweave** for magic strength, energy cost and cooldown. These upgrades survive relay/survival checkpoints.

## Generated adventures

Stable world/level seeds vary platform count/position/size/motion, patrol and relay positions, hazard types/phases, loot placement, additional defenders, backgrounds, terrain and scenery. Required relays stay between encounter gates; the main ground remains traversable. Enemy health and damage increase with world level. A saved relay carries its route seed and level, so resume uses the same route rather than a different random map.

## Super assets — audited usage

The folder contains **2,497 files**, including artwork, alternate exports, source projects, previews, licenses and OS metadata. These are NOT all separate playable characters.

The generated runtime catalog currently includes:

- **80 actor definitions**: measured frame clips for heroes, pets, NPC helpers, enemies and **11 FBX-derived guardians**.
- **34 animated combat-effect sequences**, plus animated campfires, extraction portal and snow weather.
- **112 backgrounds**, **55 terrain sets**, **352 scenery entries** (including segmented prop atlases and tree cells).
- All **65** compatible 800×448 character layers registered before save validation.
- **12 selectable relic weapons**, relay portraits and pixel HUD artwork.
- Pixel-verified alternate sheet cells are actual rendering alternatives, not just archive thumbnails.

The game streams only current-district art. Later levels rotate through available assets; one level does not load every file.

### Important scope distinction

`assets/super-coverage.json` has a status for **every original file**. **1,686 files have runtime mappings**. Runtime-mapped means reachable through the renderer/content selection, not that every possible scene has been visually QA'd.

Remaining statuses are explicit: 288 reference previews, 256 documentation/metadata files, 188 source/alternate exports, 53 alternate sheet layouts, 18 unadapted material variants and 8 Blender project/backup sources. The remaining alternate layouts/material variants have **not all been individually adapted**. No arbitrary filename matching is used to claim them as playable.

The supplied FBX geometry is rendered into four-angle **hovering statue-style guardians**. These are not fully rig-animated 3D characters. The 11 derived sheets total under 1 MB. Source Blend files and additional material variants remain in the original folder; there is no claim that their full authoring content is running in the 2D engine.

### Build tools

- `python3 scripts/index-super.py`: complete file inventory.
- With Pillow installed: `python scripts/compile-super.py`: measured clip metadata, alpha-island prop segmentation, terrain cells, verified sheet aliases, layer registration and per-file coverage.
- FBX build: install build-only `three`, `esbuild`, `playwright`; bundle `scripts/render-model-browser.js` to `test-results/model-renderer.js`, serve the repo, then run `scripts/render-models.mjs` with a working Chromium. The renderer HTML host is described in that script. Re-run the metadata compiler afterward.

Runtime is still a static site with **no new external runtime dependency**. Three/Pillow/esbuild are build-time tools only. Original source art is not modified.

## Save and validation

Portable backups now preserve currency, owned equipment, all six chapter unlocks, appearance, Vault slots, HUD positions, world levels/seeds, Super selections, relay checkpoint, survival wave checkpoint and reward receipts. Imported data is validated before mutation. Old v1 backups remain supported. Live encounter entities are not serialized: closing the tab falls back to the saved wave boundary/relay.

## Verification

- `npm test`: **89 tests passing**. New tests cover slot limits, live level-up, casting/cooldown, deterministic routes, all actor frame paths and enemy simulation, FBX coverage, six-world/equipment/HUD backup, and replay-reward deduplication.
- `npm run test:evolution:browser`: **21 real-browser desktop/mobile checks passing**, including actual pointer drag, roster selection, hints, continuation, saved-wave reload and portable backup. Screenshots are in ignored `test-results/`.
- Browser validation used Chromium via `CHROMIUM_PATH` in this environment; the historical `tests/browser.mjs` still references removed pre-existing lobby selectors, so the new expansion test is separate.

## Credits

Original licenses/readmes are retained. In-game credits include Legacy Collection, GandalfHardcore, Anokolisa and the Mario's Madness model contributors **FunkyBunny, DarksArtworks, Sharkman**, with thanks to Marco Antonio and the mod team. Retain these attributions if distributing the derived guardian sprites.

---

## PRODUCTION PASS 2 — content expansion, jellyfish fix, codex UI (2026-09-27)

**Fixed**
- JELLYFALL FPS BUG (root cause): Drone and Wraith enemies called `this.spr.set("blink")`
  during their 0.4s spawn window, but both draw procedurally and have no sheet
  animator. Every spawn frame threw a TypeError; the frame loop's error handler
  then skipped the rest of the update — with a batch of the floating
  jellyfish/octopus-like wraiths spawning together this produced repeated
  dropped frames, error toasts and stutter. The spawn blink is now a glow-only
  window. Measured with 45 mixed enemies alive: avg 0.69 ms/frame JS,
  p99 4.4 ms, worst 9.1 ms (60 fps budget = 16.6 ms).
- ABILITY CAST CRASH: `VFX` was referenced 15× in abilities.js but never bound —
  every hero ability that used it (flame ward ticks, damage numbers, rings)
  threw. Bound to NR.vfx with a no-op stub fallback.
- MOUSE-MOVE SOUND SPAM: a document-wide `mouseover` listener played a hover cue
  on every button under a travelling cursor. Removed; hover cues are now opt-in
  per element via `[data-sfx-hover]`, clicks stay audible.

**Content**
- Hero roster 7 → 12: MIRA (storm witch), MARSHAL (guardian), MIYU (assassin),
  GRUSHA (brawler), RUNE (battlemage) — each with a mechanically distinct
  3-ability kit (15 new ability implementations, 5 new ability families:
  chainBolt/thunderStep/tempest, shieldBash/rallyBanner/pikeVolley,
  iaiSlash/petalVeil/bladeWaltz, boarCharge/warStomp/frenzy,
  arcaneBolt/runeWard/meteorForge). No two heroes share a full kit (test-pinned).
- HERO SELECT screen: live animated model preview (bigger than the cards),
  stat bars, kit with [E]/[Z]/[X] keycaps, perk text, locked heroes stay fully
  visible with their model + unlock level, smooth swap animation, relic-spell
  loadout + management link.
- ENEMY CODEX screen: every registered enemy with a live animated preview,
  first-seen stage, threat rating and behaviour notes; later-stage enemies are
  marked "ARRIVES LVL n" instead of hidden; the boss rotation and late-world
  super threats are listed.
- VAULT rework: the generic ABILITIES tab is gone (kits bind automatically with
  the hero); tabs are SKINS · HAIR · MASK · ARMOR · COSMETICS · PETS with the
  priced item cards, plus cross-links to Hero Select and the super roster.
- AUTO-RESUME: a saved wave-boundary checkpoint now surfaces as a prominent
  RESUME SAVED RUN banner in the lobby (wave, hero, score) — no menu digging.

**Readability / platform**
- Enemy art +14% with hitboxes +10% (art overhangs the box, so hits stay fair);
  hero render scale 1.06 → 1.16; boss bodies ~10% larger.
- Tab hidden / window blur auto-pauses gameplay and reports gameplayStop to the
  platform SDK.
- Lobby gets dedicated HEROES and ENEMIES nav entries; compact layout rules for
  short viewports (≤760px/≤640px heights) remove vertical scrolling.

**Tests**: 89 → 94 (all green). New regressions: drone/wraith spawn-window
survival, every-hero kit cast (VFX regression), unique-kit roster, enemy
readability scaling, hero-select + enemy-codex churn.

---

## PRODUCTION PASS 3 — PLAYER FEEDBACK ROUND (2026-09-27)

Direct response to the player feedback fix-list. 101/101 tests green (7 new regressions).

### Boss-fight lag — root causes fixed
- **HUD glow-text cache (`js/ui.js`)**: the HUD drew `shadowBlur` text EVERY frame
  (score 14px, combo 18px, banners 26px). Shadow blur is the single most expensive
  Canvas2D op and stacks with boss VFX — the "boss se fight me lag". Every unique
  string is now blurred once into a cached offscreen canvas and blitted with a cheap
  `drawImage` (bounded cache, plain-text fallback, never crashes the HUD).
- **Boss-bar gradient cached** per (phase, width); boss bar now shows the real
  `bossName` instead of hardcoded SHOGUN-9.
- **`SuperBoss.hurt` stray-global crash (`js/bossdefs.js`)**: `F && NR.fx.sparks(...)`
  referenced an undefined variable — a ReferenceError on every super-boss hit in the
  browser (error spam + hitching). Now gated on `profile.damageEffects` like the rest.
- Node harness (900 boss-fight frames): avg 0.25 ms, p99 2.0 ms, worst 5.9 ms
  (was 14.75 ms worst before the sparks/cleanup fixes).

### Enemy codex blank BOSS / SUPER THREATS sections — fixed
- The codex opens from the lobby BEFORE the game preloads sheets, so boss canvases
  and super-actor clips rendered blank in a real browser (node harness passed
  because it stubs assets). `openEnemies()` now fire-and-forget preloads every boss
  rotation sheet (`NR.assets.preload`) + super-actor clips
  (`NR.superRuntime.preloadActor`); previews redraw every rAF so art pops in as it
  decodes. `bossRotation()` is defensive (throws → empty list, never a blank modal).

### Abilities / spells — unlock by level OR coins
- Every evolution spell has a coin price (`level × 150`); locked cards show
  **BUY NOW · N COINS** + **FREE AT LEVEL X** (both paths work; purchase
  auto-equips, deducts coins, syncs to cloud save via `spellUnlocks`).
- **HUD kit button 1 never updated**: hub.js queried `[data-act="ability1"]` but the
  button's action id is `tactical` (KeyE binding) — so slot 1 read as permanently
  stuck. Selector map fixed to the real input actions.

### Different gameplay music
- `NR.audio.setMusicMode("menu" | "battle")`: menu keeps the airy synthwave;
  gameplay now plays a darker, driving combat loop (new Em/Gm/Dm progression,
  4-on-the-floor kick, offbeat bass stabs, riff lead). Wired at every
  gameplayStart/gameplayStop boundary.

### Online play — out of the play modal and fully working
- Lobby nav: ENEMIES replaced by a distinct **ONLINE PLAY** button (live-dot
  styling) that opens the online flow directly; enemy codex moved to a small link
  in the hero-select footer.
- **RANDOM quick-match** mode card — resolves to duo/1v1/2v2/4v4.
- Selecting a mode immediately re-labels the create/join step and CREATE ROOM
  announces the invite flow. Create → invite link → ready → start all wired
  (WebRTC transport + CrazyGames room metadata).
- **Wave-clear leaderboard** in the online modal: waves reached per player, sorted;
  personal validated archive + live party bests shared over the room channel
  (`best` events). Honest scope: CrazyGames provides no global leaderboard backend.

### Play modal — game-style
- Full-bleed dark panel, big art cards (bg_reactor / bg_garden), neon frame hovers,
  per-mode BEST chips from the run archive — no more "website" look.

### Settings / UI
- Error Log / Diagnostics section removed from Settings (internal `NR.diag`
  collection + dev debug panel remain).
- Overflow hardening: modal panels clamp to `min(96vw, …)` / `min(92vh, …)` with
  internal scrolling; hero-select and codex bodies scroll; leaderboard rows
  collapse on narrow screens.

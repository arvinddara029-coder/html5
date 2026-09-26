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

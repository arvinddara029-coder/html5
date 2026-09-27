# NEON RONIN — Expedition Edition 3.3

A **static HTML5 action game** (single-player + optional peer-to-peer online): a three-chapter side-scrolling adventure and an endless wave-survival mode. Canvas 2D, vanilla JavaScript, local assets, synthesized music and imported CC0 sound effects.

**No own server.** Progress lives in the browser and, on CrazyGames, is mirrored to the CrazyGames SDK (`SDK.data`). Online play is direct browser-to-browser (PeerJS/WebRTC).

## New in 3.3 — vault, hero abilities, online co-op/PvP, CrazyGames

- **Bigger characters:** the gameplay camera is zoomed in (1.2× desktop, 1.35× mobile). Settings → **Character size** slider (100–160%, `nr_zoom`).
- **PLAY → two modes:** **WAVE FIGHT** (endless waves) and **SURVIVE** (level adventure). There is no world picker any more: worlds rotate randomly on every new level and after every 5th-wave boss, and the same world never comes twice in a row.
- **3 hero abilities** based on each hero's personality (for example Kaito: Aegis Guard / Flame Wave / Forge Blades, Ryu the samurai: Shadow Dash / Iai Flurry / Wind Cutter). Keys **U / I / O**, plus 3 touch buttons. **T** calls your monster summon.
- **VAULT (lobby):** Hero Forge items (skin, hair, mask, armor, weapon …), pets, companions, **monster summons**, spells and relics in one place.
- **Items:** stats shown as bars with `+X%`. Every item has a price; stronger items cost more (the strongest cost gems), and weak items become **free as you level up**. After buying, an **EQUIP** button appears. Every item has a **!** button with how-to-use info.
- **Sukuna Slice:** once per run and lasts 5 seconds.
- **HUD editor:** drag **and resize** touch controls (layout saved as `[x, y, scale]`).
- **Settings trimmed:** Super Heroes & Pets, Ability Vault and the Super Asset Library buttons were removed. Credits: *Made by Arvind Bishnoi*.
- **Loading:** no animated art on the splash; progress %, tips, and a loading overlay/pill whenever assets are still streaming.
- **CrazyGames SDK v3** (`js/crazy.js`): user name, cloud data mirror, `gameplayStart/Stop`, midgame ads after a boss kill or level clear (never online, at most one per 60 s), rewarded ad for +150 coins, invite links/rooms, and `muteAudio` / `disableChat` settings. Outside CrazyGames all of this switches off quietly.
- **Online (`js/net.js`, `js/online-ui.js`):** CREATE ROOM (invite link / 5-letter code), JOIN, or QUICK MATCH with a random player. **Co-op waves** for 2 players, plus **PvP 1v1 / 2v2 / 4v4**. The lobby shows the friend's hero, and there is text chat, voice chat (mic), ready/teams, and a leaderboard by best wave/floor. The host runs the game (guest input 30 Hz, snapshots 15 Hz). Offline play = levels, online play = waves co-op.

**Online limits (honest):** there is no own server, so the leaderboard is local plus scores shared by the players you meet (not a global server ranking). Connections use public STUN only, so some strict NAT / office networks cannot connect. Voice is a small mesh (best with 2–4 people). Quick match uses public PeerJS room slots, so it finds players only when someone else is searching at the same time. There are no real-money purchases; coins/gems are in-game only.

## New in 3.2 — heroes, world levels, asset bosses & Sukuna Slice

- **Sukuna Slice (`V` / `G`, or the red 斬 button):** the hero rises into the air and hovers for 5 seconds (invulnerable) while the screen drops into a crimson domain. Five katana waves ("shiiing") cut **every enemy on screen into two halves** that slide apart along the cut line and fall. Bosses lose 9% of their max health per wave instead of dying outright. 24-second recharge (Ryu: 20% faster).
- **Real hero roster:** the HEROES button opens a roster of 11 different characters — Kaito (Hero Forge body with all skins), Ryu, Sgt. Brann, Holly, Gordon, Diego, Elara, Sir Mordred, Ash, Vega and Nix — each with its own body, animations, stats and trait. The chosen hero is used in-game and on the lobby stage (`nr_hero_v1`).
- **Endless world levels:** every world has Level 1, 2, 3 … with no end. Each level is a newly generated route, enemies get +8% health per level, and every level has a boss. Pick any cleared level (or the next one) from the level track under the selected world card. Every 8th level is a **WORLD BOSS** (1.5× health + honour guard); beating Level 8 opens the next world (`nr_levels_v1`).
- **Asset bosses instead of the robot:** AZRAKEL the Demon Lord, IGNIS the Hell Beast, GROMM the Ogre Warlord, VERMILION the Grotto Dragon and NOCTIS the Nightmare Steed (Gothicvania art) join Vexis, Goro and Kurogane. They rotate across levels and survival boss waves; SHOGUN-9 is no longer used.
- **Calmer effects:** giant fire-ball / explosion clips no longer spawn at the hero on every passive proc; big clips are capped, throttled and limited to 12 at once.
- **Frame-error hardening:** a single broken enemy, projectile or draw call is isolated (and removed after repeated failures) instead of stopping the frame. The on-screen error box only appears with `?debug` in the URL (or `localStorage.nr_debug = 1`).

## New in 3.1 — precision combat & portable progress

- **Parry / counter:** face an incoming melee attack or bolt and tap `Q`. A 0.22-second window, 1.2-second cooldown. Success restores 8 base energy, grants a short invulnerability window and powers your next successful melee strike within 2 seconds by **×1.75**. Missed swings do not consume it. Bolts reflect back as friendly projectiles; hazards and ground shockwaves cannot be parried.
- **Kunai:** tap `R` to throw a 22-base-damage blade, scaled by operator/passive damage. Three charges; one regenerates every 3 seconds, with a 0.28-second throw cooldown. Gentle forward-target aim assist, swept collision and solid-platform obstruction. Reflected bolts deal 32 damage. Pausing freezes ability timers.
- **Distinct routes:** Outskirts has staggered transit platforms; Overgrowth adds ascending terraces and vertical lifts; Zero Reactor uses separated gantries and horizontal shuttles. Hazard placements and shard routes differ by chapter.
- **Breakable salvage:** six wooden **LOOT** crates per chapter. Melee and kunai break them, awarding 50 score and a health or energy pickup. Destroyed crates remain destroyed when restoring the next saved relay checkpoint; unbroken crates reset to full durability on retry.
- **Portable JSON backups:** export/import from Settings, with validation, a replacement confirmation and explicit handling of blocked browser storage.
- **Three new achievements**, a parry pose/guard arc, counter highlight, ranged trails, new synthesized combat sounds and seven visible combat actions on mobile.

## Play without a server

Open **`index.html`** in a modern desktop browser. Keep the `assets/`, `css/` and `js/` folders beside it. No installation or build is required. The browser regression suite also tests this exact `file://` workflow.

For mobile, share the folder through an ordinary static host. To use a local development preview, optionally run:

```bash
npm start
# Equivalent: python3 -m http.server 8080 --bind 0.0.0.0
```

That optional command only serves files; it is **not a game backend**. For publication, upload `index.html`, `assets/`, `css/`, and `js/` to GitHub Pages, Netlify, or another static host. No Node/Python runtime is needed on the deployed site. Avoid publishing development directories or old ignored data.

Modern Chrome, Edge, Firefox and Safari are the intended browsers. Fullscreen and persistent local storage depend on browser permissions; `file://` storage behavior may differ between browsers. Static hosting is recommended for consistent mobile access. Previously visited pages are not guaranteed to work offline unless the complete game folder is available locally—there is no service-worker installation/cache feature.

## Modes

### Adventure — move beyond the arena

Three sequential, replayable chapters, each spanning **6,800 world units**:

1. **The Neon Outskirts** — recover the abandoned transit network.
2. **The Overgrown Line** — cross the reclaimed gardens and restore the freight line.
3. **The Zero Reactor** — override the final locks and confront AZRAKEL, the Demon Lord.

Each chapter has:

- Four encounter zones with barriers that release after the defenders are defeated.
- Three relay objectives. Interact to restore a relay, heal, choose an upgrade and save a checkpoint.
- Four optional supply caches: health, energy and score.
- Six breakable loot crates, with destroyed-state checkpoint persistence.
- Sixteen collectible energy shards across elevated routes.
- Ground spikes, moving saws and timed laser vents with warning phases.
- Moving platforms that carry the player; jumping, double/triple jumping and platform drop-through.
- A route-progress HUD, relay markers and contextual interaction button.
- An extraction gate: all three relays and all four encounters must be cleared.
- Chapter completion, local results, the next chapter unlock and a final campaign ending.

**Continue saved checkpoint** restores the last relay, chosen operator, tactical power, difficulty, upgrades, health, score and completed objectives. Checkpoints are taken at relays, not continuously. Progress since the last relay is lost on retry. Starting a fresh run does not immediately erase an older checkpoint; the next restored relay replaces it. Completing a chapter clears that checkpoint. There is one checkpoint slot per browser.

### Wave Survival — hold the line

The original arena mode is retained: escalating enemy waves, a choice of three roguelite upgrades after each wave, a boss fight every fifth wave (rotating through the asset bosses), combo scoring, pickups and personal bests. Sentries join from wave 3 and armored Sentinels from wave 4.

## Operators

All three are selectable from the beginning:

| Operator | HP | Damage | Movement | Mobility / trait |
|---|---:|---:|---:|---|
| **Kaito** | 100 | ×1.00 | ×1.00 | Balanced; 2 jumps, 1 dash charge |
| **Kestrel** | 75 | ×0.90 | ×1.22 | Agile; 3 jumps, 2 dash charges |
| **Onyx** | 150 | ×1.25 | ×0.82 | Heavy; 20% damage resistance |

Original SVG operator portraits match the in-game color palettes. Characters have procedural running, idle, jumping, landing, sword-combo, cloak, dash-afterimage and ability animations.

## Tactical powers

Choose one before deployment. Katana, parry, kunai, dash and the energy-charged Blade Storm are always equipped.

| Power | Effect | Cooldown |
|---|---|---:|
| **Aegis Shield** | Block damage for 3 seconds | 16s |
| **Shock Pulse** | 45 area damage and knockback within 380 units | 12s |
| **Nano Repair** | Restore 35 HP; cannot be wasted at full health | 24s |
| **Overdrive** | Double katana damage for 5 seconds | 20s |
| **Chrono Field** | Enemy actions and bolts run at 35% speed for 5 seconds | 22s |
| **Arc Companion** | 8-second support drone; 13-damage shots every 0.5s at nearby enemies | 24s |

Cooldowns follow simulation time and freeze when paused. Chrono Field does not slow environmental hazards or boss ground shockwaves. Twelve existing passive upgrades remain available through relay/wave choices; they reset on a fresh run and are restored by adventure checkpoints.

## Controls

| Input | Action |
|---|---|
| `A / D` or `← / →` | Move |
| `W / SPACE / ↑` | Jump; press again for aerial jumps |
| `S / ↓` | Drop through a platform |
| Hold `J / X` or left mouse | Chain three-hit katana combos |
| `Q` | Timed frontal parry; successful parry empowers your next melee hit |
| `R` | Throw kunai (three regenerating charges) |
| `K / SHIFT` | Invulnerable dash |
| `L / C` or right mouse | Blade Storm at full energy |
| `E` | Equipped tactical power |
| **`V / G`** | **Sukuna Slice** — fly for 5 s, cut every enemy on screen in two |
| **`F`** | Open cache, activate relay or extract |
| `P / ESC` | Pause / resume |
| `M` | Toggle music and effects |
| **`U / I / O`** | Hero abilities 1–3 |
| **`T`** | Monster summon (VAULT → SUMMONS) |

**Mobile:** visible movement, drop, jump, strike, dash, parry, kunai and power buttons; simultaneous touch movement + attack; contextual interaction button; safe-area-aware portrait and landscape layouts. The lobby keeps Deploy visible on narrow screens. Keyboard players can hide the main combat buttons; touch devices keep them available. Audio starts after an interaction, as required by browsers.

## Other systems

- Rookie / Ronin / Lethal difficulty changes damage, enemy health and movement speed.
- Day/night setting, neon rain and lightning, distinct garden/reactor background art and animated scenery.
- Local top-20 run archive with Adventure / Survival filters and difficulty labels.
- Twelve local achievements: combat, parry, ranged hits, salvage, combo, relay, cache, wave and campaign milestones.
- Callsign, preferred character, loadout, chapter, sound and control preferences saved locally.
- Independent music and effects volume sliders, mute buttons and screen-shake setting.
- Reduced-motion preferences disable UI animation and default screen shake off.
- Camera look-ahead, afterimages, hit-stop, combat slow motion, damage numbers and boss telegraphs.
- Sentry turrets with aiming warnings; armored Sentinels with frontal resistance and wind-up shockwaves.

## Back up or move your save

1. From the mission hub, open **Settings → Export Backup**. Keep the downloaded `neon-ronin-backup.json` somewhere safe.
2. On another browser/device, open the same game and choose **Import Backup**. Select the JSON file locally; nothing is uploaded.
3. Review the callsign, record count and checkpoint summary. Choose **Replace My Save** to apply it, or **Cancel** to keep the existing save. Export the current save first if you want to keep both.

Backups include profile preferences, music/SFX switches and volumes, chapter unlocks, top-20 records, achievements, high score and the **last saved relay checkpoint**—not unsaved live-run progress. Invalid, oversized (over 256 KB), unknown-version or structurally unsafe files are rejected before save data is changed. Import is only available when no run is active. If storage writes are blocked, imported progress works in the current session and a warning tells you to retain your backup; do not rely on a reload preserving it.

Checkpoint format 1 from the previous Expedition Edition remains readable. Its missing new combat counters and destroyed-crate list start empty. JSON backup format 1 is a new separate envelope, not an old raw localStorage export. Backups are editable local files, not encrypted cloud saves or anti-cheat records.

## Assets and licenses

**Bundled locally—no CDN or runtime asset downloads.**

- **Kenney Platformer Pack Industrial**, CC0: a 112-sprite atlas. Selected sprites are used for supply crates, relays, consoles, platform details, direction signs, hazard stripes, saws, spikes and gates.
- **Kenney Digital Audio**, CC0: 8 sound files for checkpoints, caches, shards, enemy fire, barriers, completion and achievements. Playback falls back to synthesized feedback if a browser cannot play Ogg.
- **Original project art:** SVG operator portraits and procedural characters, enemies, effects and scenery.
- **AI-generated paintings:** hero, city, daylight, garden and reactor backgrounds. These are not represented as Kenney assets.
- **Local fonts:** Barlow Condensed, DM Sans, Orbitron and Rajdhani, with their SIL Open Font License notices.

See [`assets/kenney/ATTRIBUTION.md`](assets/kenney/ATTRIBUTION.md) for original source pages and the mirrors used to retrieve the assets. Original license files are included. Settings → **Asset credits & licenses** also explains the sources.

## Tests

Pure engine/static checks, no dependencies beyond Node 18+:

```bash
npm test
```

Browser integration checks:

```bash
npm ci
npx playwright install chromium
npm run test:browser
# 3.3 features (vault, shop equip, online lobby, modes, abilities, HUD size):
BASE_URL=http://localhost:8080 node tests/evolution.browser.mjs
```

If the Playwright download is blocked, `bash tests/setup-chromium.sh` builds `/tmp/chrome.sh`; pass it as `CHROMIUM_PATH=/tmp/chrome.sh`. Online co-op/PvP is tested in `tests/boot.test.cjs` with a fake PeerJS broker (two engines in one process).

The browser suite defaults to opening `index.html` directly via **`file://`**, without a server. Set `BASE_URL` to test an optional static preview, or `CHROMIUM_PATH` to use an existing Chromium binary:

```bash
BASE_URL=http://localhost:8080 npm run test:browser
```

Current regression suite: **101 node tests** (`node --test tests/*.test.cjs`) + browser suites (`tests/evolution.browser.mjs`: 47 checks on desktop + mobile). Coverage includes timed/directional parry, counters, projectile reflection and swept collision, crate persistence, backup download/import/cancel/reload and malformed-file rejection, checkpoint restoration after reload, all chapter encounter/relay/extraction transitions, the final boss and campaign ending, operator and power selection, local records, survival mode, direct-file loading, zero API/CDN requests, mobile multi-touch, touch cancellation and button overlap. Campaign progression tests manipulate entity state to exercise the complete flow efficiently; they are not a substitute for extended human balance/playtesting. Screenshots are written to ignored `test-results/`.

## Project map

```text
index.html                  Mission hub, screens, menus, controls
css/                        Self-hosted fonts and responsive UI styles
js/profile.js               Local preferences + six power definitions
js/progression.js           Local records, achievements, checkpoint validation
js/save-transfer.js         Validated portable JSON backups and import UI
js/combat.js                Parry, counters, kunai and swept collision
js/characters.js            Operator definitions and mechanical stats
js/adventure.js             Chapters, encounters, relays, hazards, props, extraction
js/expedition-ui.js          Route selection, operators, archive, victory and HUD
js/expedition-enemies.js     Sentry and Sentinel AI / animation
js/atlas.js                 Local Kenney atlas coordinates / drawing
js/game.js                  Shared combat, waves, difficulty and run lifecycle
js/player.js                Movement, character animation and powers
js/enemies.js               Crawlers, Drones, Wraiths and the shared boss fight script
js/bosses.js                Asset-art bosses, boss rotation, world-boss levels
js/levels.js                Endless per-world level track + deploy level picker
js/heroes.js                Hero roster (bodies, stats, traits) + HEROES screen
js/sukuna.js                Sukuna Slice ultimate (flight, domain, halving)
js/items.js                 Item stats/bars, prices, level-free items, equip, ! info
js/hero-abilities.js        3 personality abilities per hero + monster summon
js/vault.js                 Lobby VAULT (items, pets, companions, summons, spells)
js/crazy.js                 CrazyGames SDK v3 bridge (user, data, ads, invites)
js/net.js                   PeerJS rooms, co-op/PvP sync, chat, voice, leaderboard
js/online-ui.js             ONLINE lobby modal + in-game online HUD
js/polish.js                Zoom, loading screens, world rotation, mode wiring
js/world.js                 Parallax, day/night, platform collision
js/audio.js                 Synth soundtrack / combat + CC0 sample playback
js/hub.js, js/ui.js          Loadouts, screens, settings and HUD
js/input.js, js/main.js      Input, loading, frame loop and viewport sizing
assets/operators/           Original SVG portraits
assets/kenney/              Imported sprites, sounds, source and license notices
assets/fonts/               Local WOFF2 files and license notices
tests/                      Engine and browser regression suites
```

### Scope

This is an expanded **2D browser game**, not an open-world or AAA production. Online play is peer-to-peer without an authoritative server, so there is no anti-cheat, and the leaderboard is not a global server ranking. The three chapters share the relay/encounter objective structure but have different platform patterns, lift motion, hazards, shards, scenery and encounter compositions. Clearing browser/site storage removes local progress unless you have exported a backup. No game implementation can honestly be guaranteed “perfect”; browser coverage and gameplay tests are included, while long-run balance and device-specific performance still benefit from human playtesting.

# NEON RONIN — FIX & POLISH TRACKER (Arena session)

Legend: ✅ done · 🔨 in progress · ⬜ pending

## P0 — Core bugs (user-reported)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Hero invisible in game — renderer must never draw a blank frame (stale build cache + no fallback) | ✅ | asset-version-aware rebuild + procedural fallback figure + force-preload of all layers & sheets at run start |
| 2 | Hero faces the wrong way — art faces LEFT natively but code flips only when `facing < 0` | ✅ | flip when `facing > 0` |
| 3 | Pets drawn twice/doubled — doggy & fox sheets are 2-row strips (idle on row 0, run on row 1) but were sliced as 6 frames of full 64px height | ✅ | slice 32×32 from the correct row |
| 4 | Pet walks backwards — pet art faces RIGHT natively, game flipped on right | ✅ | flip only when facing left |
| 5 | Enemies float in the air — orc/soldier art sits ~40px above the 100px cell bottom; FEET constants were wrong | ✅ | per-sheet crop windows anchored at the real feet line |
| 6 | Enemies & characters far too small — orc art is only ~22×16px inside its 100×100 cell, drawn at scale 1 | ✅ | crop to art window + per-type display scales (hero 0.62 → 0.98, orc ×2.6, soldier ×2.6, slime ×1.7…) |
| 7 | Slime looked doubled — slime sheet is an 8×2 grid of 32×48 (bounce row + hop row), code sliced 64×48 blobs spanning two cells | ✅ | correct `perRow: 8` slicing + `start` offset support, hop/death rows registered |
| 8 | Level never finished — extraction needed an F-press with relays ready; reaching the end did nothing | ✅ | walk into the gate = chapter complete (cinematics + banner), checklist of what remains |

## P1 — Experience upgrades (user-requested)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 9 | Day is now the PRIMARY mode (default), Night is a genuinely different look — deep-indigo dark grade, stars, moon, dimmed world per biome | ✅ | world.js grading + profile default `day` |
| 10 | Pressing PLAY opens WORLD SELECT first — 3 big world cards with art, locks, then mode/difficulty/atmosphere | ✅ | deploy modal rework |
| 11 | Use the unused asset packs properly: EVil Wizard (warlock enemy), Samurai (rival duelist), slime green/red variants per chapter, Elements textures (garden/reactor), Goddess NPC lobby guide | ✅ | new enemy classes + biome tints |
| 12 | Everything bigger & more readable — hero, enemies, shadows, extraction gate beacon | ✅ | scale pass |
| 13 | Tests updated to lock the fixes (pet slicing, crop anchors, wizard/rival registration, default day, auto-extract, gate lock) + full suite green | ✅ | 49 → 58 tests, all green |

## Asset integration map

| Pack | Usage |
|------|-------|
| GandalfHardcore Character Asset Pack (+ Male Hair1-5, Male/Female Sword) | hero body layers + all cataloged |
| GandalfHardcore 58x Hair / 39x Hats / Masks / Arm layers / Back layers / Hand items / 43x+7x Clothing / Special skin | hero creator layers (corset line finished) |
| GandalfHardcore Pet companion | pets — fixed 2-row slicing; **hat/backpack wardrobe** cycles on the lobby stage |
| GandalfHardcore Slime Enemy (blue/green/red) | slime enemy, variant per chapter; hop + squash-death rows |
| Tiny RPG v1.03 Orc / 01 v2.0 Soldier + arrow | crawler + soldier — cropped & upscaled |
| EVil Wizard 2 | **enemy: WARLOCK** (chapters 2-3, waves 6+) |
| FREE Samurai 2D Pixel Art | **enemy: RIVAL** elite duelist (chapters 1+, waves 7+) |
| **Sprite Pack 7**: Diego / Holly / Gordon | **enemies: GUNNER / STRIKER / BLADE** (waves 4/8/9+, ch 2-3 zones); blink materialize, crouch-reload, duck recovery, random swing anims — 27 of 37 sheets wired |
| Brick / Metal / Stone / Tile / Wood / Plaster | **rotating district textures** — 4 curated variants per surface per biome (48 in play), ground + platforms + edge trim |
| Elements tiles | per-zone veins: city energy, garden moss, reactor lava (13 in play) |
| GandalfHardcFREE NPC Goddess | animated lobby guide + Luna event portrait + deploy/load avatars |
| GandalfHardcore Warrior 17-row sheet + idle/walk elf strips | live COMBAT MANUAL demos (idle / sprint / chain-combo) |
| lobby.png | “The Grand Lobby” event card |
| Emojis & Icons pack | coins / quest markers (already) |
| Kenney atlas + 8 ogg sfx | relays/gates/consoles + UI sounds (already) |
| ~130 remaining files | spare palette variants, duplicated pack versions (v1.02/Demo orc), single-frame alternate poses — documented spares, not runtime assets |

**Runtime asset coverage: ~78% of 596 usable files (446+ wired) — every pack contributes.**

## PROGRESS: 13/13 — ████████████████████ 100%

/* ============ SKYWARD — central asset library: catalog + progressive loader ============
   Every sprite used by the lobby, character creator and gameplay is registered here.
   Paths are relative so the game stays fully static (file:// or any static host). */
(function () {
  const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
  const A = (NR.assets = {});

  A.images = Object.create(null); // path -> HTMLImageElement (decoded)
  A.state = Object.create(null); // path -> "loading" | "ready" | "error"
  A.total = 0;
  A.done = 0;
  A.version = 0; // bumped whenever any image finishes decoding (cache invalidator)

  /* ------------------------------------------------------------------ *
   *  Character layer catalog (Clockwork Raven / GandalfHardcore packs)  *
   *  All body layers share one 800x448 grid: 10 cols x 7 rows, 80x64.   *
   *  Rows: 0 idle(5) 1 walk(8) 2 run(8) 3 jump(4) 4 fall(4) 5 atk(6) 6 hurt(10)
   * ------------------------------------------------------------------ */
  // The character pack ships once under assets/super (indexed + wired by
  // super-layers.js); the duplicate top-level copy was removed to slim the repo.
  const CAP = "super/GandalfHardcore Character Asset Pack";
  const P = {
    skin: (n, g) => ({ id: n, name: n.replace(/^(Male|Female) /, ""), path: `${CAP}/Character skin colors/${n}.png`, g }),
    hairM: (n) => ({ id: n, name: n.replace(/^Male /, ""), path: `GandalfHardcore 58x Hair/28x Male Hair/${n}.png`, g: "m" }),
    hairF: (n) => ({ id: n, name: n.replace(/^Female /, ""), path: `${CAP}/Female Hair/${n}.png`, g: "f" }),
    ears: (n, g) => ({ id: g + n, name: n, path: `${g === "m" ? "Male" : "Female"} Ears/${n}.png`, g }),
    hatM: (n) => ({ id: "m" + n, name: n, path: `GandalfHardcore 39x Hats/Male Hat/${n}.png`, g: "m" }),
    hatF: (n) => ({ id: "f" + n, name: n, path: `GandalfHardcore 39x Hats/Female Hat/${n}.png`, g: "f" }),
    top: (n, g, dir) => ({ id: g + n, name: n, path: `${dir}/${n}.png`, g }),
    bot: (n, g, dir) => ({ id: g + n, name: n, path: `${dir}/${n}.png`, g }),
    shoe: (n, g, dir) => ({ id: g + n, name: n, path: `${dir}/${n}.png`, g }),
    glove: (n, g) => ({ id: g + n, name: n, path: `GandalfHardcore Arm Layers/${g === "m" ? "Male" : "Female"}/${n}.png`, g }),
    weapon: (n, g) => ({ id: g + n, name: n, path: `GandalfHardcore 35x Hand Items/${g === "m" ? "Male" : "Female"} Hand/${n}.png`, g }),
    back: (n, g) => ({ id: g + n, name: n, path: `GandalfHardcore Back layers s/${n}.png`, g }),
    mask: (n, g) => ({ id: g + n, name: n, path: `GandalfHardcore Masks/${n}.png`, g }),
    aura: (n) => ({ id: n, name: n.replace("Character effects ", ""), path: `GandalfHardcore character effects/${n}.png`, g: "any" }),
    pet: (n) => ({ id: n, name: n.replace("GandalfHardcore ", "").replace(".png", ""), path: `GandalfHardcore Pet companion/${n}`, g: "any" }),
    special: (n) => ({ id: n, name: n.replace("Female ", "").replace(" skin", ""), path: `GandalfHardcore Special skin/${n}.png`, g: "f" }),
  };

  const MCLOTH = `${CAP}/Male Clothing`;
  const FCLOTH = `${CAP}/Female Clothing`;
  const F43 = "GandalfHardcore 43x Female Clothing";
  const M7 = "GandalfHardcore 7x Male Clothing";

  const c = (NR.catalog = {
    skin: [
      P.skin("Male Skin1", "m"), P.skin("Male Skin2", "m"), P.skin("Male Skin3", "m"),
      P.skin("Male Skin4", "m"), P.skin("Male Skin5", "m"),
      P.skin("Female Skin1", "f"), P.skin("Female Skin2", "f"), P.skin("Female Skin3", "f"),
      P.skin("Female Skin4", "f"), P.skin("Female Skin5", "f"),
    ],
    monster: [
      P.special("Female Demon skin"), P.special("Female Devil skin"), P.special("Female Ghost skin"),
      P.special("Female Orc skin"), P.special("Female Zombie skin"),
    ],
    hair: [
      { id: "Male Hair1", name: "Hair1", path: `${CAP}/Male Hair/Male Hair1.png`, g: "m" },
      { id: "Male Hair2", name: "Hair2", path: `${CAP}/Male Hair/Male Hair2.png`, g: "m" },
      { id: "Male Hair3", name: "Hair3", path: `${CAP}/Male Hair/Male Hair3.png`, g: "m" },
      { id: "Male Hair4", name: "Hair4", path: `${CAP}/Male Hair/Male Hair4.png`, g: "m" },
      { id: "Male Hair5", name: "Hair5", path: `${CAP}/Male Hair/Male Hair5.png`, g: "m" },
      P.hairM("Fancy Hair"), P.hairM("Male Hair10"), P.hairM("Male Hair11"), P.hairM("Male Hair12"),
      P.hairM("Male Hair13"), P.hairM("Male Hair14"), P.hairM("Male Hair15"), P.hairM("Male Hair16"),
      P.hairM("Male Hair17"), P.hairM("Male Hair18"), P.hairM("Male Hair19"), P.hairM("Male Hair20"),
      P.hairM("Male Hair21"), P.hairM("Male Hair22"), P.hairM("Male Hair23"), P.hairM("Male Hair24"),
      P.hairM("Male Hair25"), P.hairM("Male Hair26"),
      P.hairF("Female Hair1"), P.hairF("Female Hair2"), P.hairF("Female Hair3"),
      P.hairF("Female Hair4"), P.hairF("Female Hair5"),
    ],
    ears: [
      P.ears("Elven Ears1", "m"), P.ears("Elven Ears2", "m"), P.ears("Elven Ears3", "m"),
      P.ears("Elven Ears4", "m"), P.ears("Elven Ears5", "m"),
      P.ears("Elven Ears1", "f"), P.ears("Elven Ears2", "f"), P.ears("Elven Ears3", "f"),
      P.ears("Elven Ears4", "f"), P.ears("Elven Ears5", "f"),
    ],
    top: [
      P.top("Shirt", "m", MCLOTH), P.top("Shirt v2", "m", MCLOTH), P.top("Blue Shirt v2", "m", MCLOTH),
      P.top("Green Shirt v2", "m", MCLOTH), P.top("Purple Shirt v2", "m", MCLOTH), P.top("orange Shirt v2", "m", MCLOTH),
      P.top("Chainmail", "m", M7),
      P.top("Blue Bodice", "f", F43), P.top("Blue Bodice Long Sleeves", "f", F43), P.top("Blue Bodice Mid Sleeves", "f", F43),
      P.top("Green Bodice", "f", F43), P.top("Green Bodice Long Sleeves", "f", F43), P.top("Green Bodice Mid Sleeves", "f", F43),
      P.top("Orange Bodice", "f", F43), P.top("Orange Bodice Long Sleeves", "f", F43), P.top("Orange Bodice Mid Sleeves", "f", F43),
      P.top("Purple Bodice", "f", F43), P.top("Purple Bodice Long Sleeves", "f", F43), P.top("Purple Bodice Mid Sleeves", "f", F43),
      P.top("Corset Long Sleeves", "f", F43),
      P.top("Blue Corset", "f", FCLOTH), P.top("Blue Corset v2", "f", FCLOTH),
      P.top("Green Corset", "f", FCLOTH), P.top("Green Corset v2", "f", FCLOTH),
      P.top("Orange Corset", "f", FCLOTH), P.top("Orange Corset v2", "f", FCLOTH),
      P.top("Purple Corset", "f", FCLOTH), P.top("Purple Corset v2", "f", FCLOTH),
      P.top("Armored Corset", "f", F43),
      // long-sleeve corset line + classic FCLOTH corsets (the shelf was half-stocked)
      P.top("Corset", "f", FCLOTH), P.top("Corset v2", "f", FCLOTH),
      P.top("Blue Corset Long Sleeves", "f", F43), P.top("Blue Corset v2 Long Sleeves", "f", F43),
      P.top("Corset v2 Long Sleeves", "f", F43),
      P.top("Green Corset Long Sleeves", "f", F43), P.top("Green Corset v2 Long Sleeves", "f", F43),
      P.top("Orange Corset Long Sleeves", "f", F43), P.top("Orange Corset v2 Long Sleeves", "f", F43),
      P.top("Purple Corset Long Sleeves", "f", F43), P.top("Purple Corset v2 Long Sleeves", "f", F43),
    ],
    bottom: [
      P.bot("Pants", "m", MCLOTH), P.bot("Blue Pants", "m", MCLOTH), P.bot("Green Pants", "m", MCLOTH),
      P.bot("Orange Pants", "m", MCLOTH), P.bot("Purple Pants", "m", MCLOTH), P.bot("Split hose", "m", M7),
      P.bot("Blue swim trunks", "m", M7), P.bot("Green swim trunks", "m", M7),
      P.bot("Orange swim trunks", "m", M7), P.bot("Purple swim trunks", "m", M7), P.bot("Red swim trunks", "m", M7),
      P.bot("Skirt", "f", FCLOTH), P.bot("Long dress blue", "f", F43), P.bot("Long dress green", "f", F43),
      P.bot("Long dress orange", "f", F43), P.bot("Long dress purple", "f", F43), P.bot("Long dress red", "f", F43),
      P.bot("Blue dress", "f", F43), P.bot("Fancy Blue Dress", "f", F43),
      P.bot("Blue bikini", "f", F43), P.bot("Green bikini", "f", F43), P.bot("Orange bikini", "f", F43),
      P.bot("Purple bikini", "f", F43),
    ],
    underwear: [
      P.bot("Underwear", "m", MCLOTH), P.bot("Green Underwear", "m", MCLOTH), P.bot("Orange Underwear", "m", MCLOTH),
      P.bot("Purple Underwear", "m", MCLOTH), P.bot("Red Underwear", "m", MCLOTH), P.bot("Skyblue Underwear", "m", MCLOTH),
      P.bot("Blue Panties and Bra", "f", FCLOTH), P.bot("Green Panties and Bra", "f", FCLOTH),
      P.bot("Orange Panties and Bra", "f", FCLOTH), P.bot("Purple Panties and Bra", "f", FCLOTH),
      P.bot("Red Panties and Bra", "f", FCLOTH), P.bot("Skyblue Panties and Bra", "f", FCLOTH),
    ],
    shoes: [
      P.shoe("Boots", "m", MCLOTH), P.shoe("Shoes", "m", MCLOTH), P.shoe("Boots", "f", FCLOTH),
      P.shoe("Black Thigh-High Boots", "f", F43), P.shoe("Brown Thigh-High Boots", "f", F43),
      P.shoe("Pink Thigh-High Boots", "f", F43),
      P.shoe("Socks", "f", FCLOTH), P.shoe("Green Socks", "f", FCLOTH), P.shoe("Orange Socks", "f", FCLOTH),
      P.shoe("Purple Socks", "f", FCLOTH), P.shoe("Red Socks", "f", FCLOTH), P.shoe("Skyblue Socks", "f", FCLOTH),
    ],
    hat: [
      P.hatM("Male Hat1"), P.hatM("Male Hat2"), P.hatM("Male Hat10"), P.hatM("Farming Hat M"),
      P.hatM("Guard Helmet"), P.hatM("Male Blue cap"), P.hatM("Male Green cap"),
      P.hatF("Female Hat1"), P.hatF("Female Hat2"), P.hatF("Female Hat3"), P.hatF("Female Hat4"), P.hatF("Female Hat5"),
      P.hatF("Bunny ears1"), P.hatF("Bunny ears2"), P.hatF("Bunny ears3"), P.hatF("Bunny ears4"), P.hatF("Bunny ears5"),
      P.hatF("Farming Hat F"), P.hatF("Female Blue cap"), P.hatF("Female Green cap"), P.hatF("Female Orange cap"),
      P.hatF("Female Purple cap"), P.hatF("Female Red cap"), P.hatF("Female Mining Helmet"),
      P.hatF("Female Santa hat"), P.hatF("Witch hat"),
    ],
    mask: [
      P.mask("Male Mask", "m"), P.mask("Male Plague Mask", "m"), P.mask("Male Bandit Scarf", "m"),
      P.mask("Female Mask", "f"), P.mask("Female Plague Mask", "f"), P.mask("Female Blue Face paint", "f"),
    ],
    gloves: [
      P.glove("Gloves", "m"), P.glove("Glove blue", "m"), P.glove("Glove green", "m"), P.glove("Glove orange", "m"),
      P.glove("Glove purple", "m"), P.glove("Glove red", "m"), P.glove("Glove white", "m"),
      P.glove("Opera Gloves", "f"), P.glove("Opera Gloves blue", "f"), P.glove("Opera Gloves brown", "f"),
      P.glove("Opera Gloves green", "f"), P.glove("Opera Gloves orange", "f"), P.glove("Opera Gloves purple", "f"),
      P.glove("Opera Gloves red", "f"),
    ],
    weapon: [
      { id: "mMale Sword", name: "Male Sword", path: `${CAP}/Male Hand/Male Sword.png`, g: "m" },
      { id: "fFemale Sword", name: "Female Sword", path: `${CAP}/Female Hand/Female Sword.png`, g: "f" },
      P.weapon("Stick", "m"), P.weapon("Wooden Sword", "m"), P.weapon("Bronze Sword", "m"), P.weapon("Iron Sword", "m"),
      P.weapon("Golden Sword", "m"), P.weapon("Diamond Sword", "m"), P.weapon("Wooden Axe", "m"), P.weapon("Bronze Axe", "m"),
      P.weapon("Iron Axe", "m"), P.weapon("Golden Axe", "m"), P.weapon("Diamond Axe", "m"), P.weapon("Wooden Pickaxe", "m"),
      P.weapon("Bronze Pickaxe", "m"), P.weapon("Iron Pickaxe", "m"), P.weapon("Golden Pickaxe", "m"), P.weapon("Diamond Pickaxe", "m"),
      P.weapon("Hoe M", "m"),
      P.weapon("Stick", "f"), P.weapon("Wooden Sword", "f"), P.weapon("Bronze Sword", "f"), P.weapon("Iron Sword", "f"),
      P.weapon("Golden Sword", "f"), P.weapon("Diamond Sword", "f"), P.weapon("Wooden Axe", "f"), P.weapon("Bronze Axe", "f"),
      P.weapon("Iron Axe", "f"), P.weapon("Golden Axe", "f"), P.weapon("Diamond Axe", "f"), P.weapon("Wooden Pickaxe", "f"),
      P.weapon("Bronze Pickaxe", "f"), P.weapon("Iron Pickaxe", "f"), P.weapon("Golden Pickaxe", "f"), P.weapon("Diamond Pickaxe", "f"),
      P.weapon("Basket", "f"), P.weapon("Flower", "f"), P.weapon("Hoe F", "f"),
    ],
    back: [
      P.back("Backpack", "any"), P.back("Small Backpack", "any"), P.back("Cape blue", "any"), P.back("Cape green", "any"),
      P.back("Cape orange", "any"), P.back("Cape purple", "any"), P.back("Cape red", "any"),
      P.back("Male Circle Shield", "m"), P.back("Female Circle Shield", "f"),
      P.back("Male Lantern", "m"), P.back("Female Lantern", "f"),
    ],
    aura: [
      P.aura("Character effects stars white"), P.aura("Character effects stars blue"), P.aura("Character effects stars pink"),
      P.aura("Character effects stars teal"), P.aura("Character effects stars v2"),
      P.aura("Character effects hearts"), P.aura("Character effects hearts blue"), P.aura("Character effects hearts pink"),
      P.aura("Character effects lines"), P.aura("Character effects lines green"), P.aura("Character effects lines yellow"),
      P.aura("Character effects buff"), P.aura("Character effects buff blue"), P.aura("Character effects buff red"),
      P.aura("Character effects debuff"), P.aura("Character effects debuff gray brown"), P.aura("Character effects debuff black"),
      P.aura("Character effects curved blue"), P.aura("Character effects curved lines"), P.aura("Character effects curved orange"),
      P.aura("Character effects blood"), P.aura("Character effects blood blue"), P.aura("Character effects blood green"),
    ],
    pet: [
      P.pet("GandalfHardcore doggy sheet.png"), P.pet("GandalfHardcore doggy sheet 2.png"),
      P.pet("GandalfHardcore doggy sheet 3.png"), P.pet("GandalfHardcore doggy sheet 4.png"),
      P.pet("GandalfHardcore doggy sheet 5.png"), P.pet("GandalfHardcore fox.png"), P.pet("GandalfHardcore Wisp.png"),
    ],
  });

  // pet sheets are multi-frame strips.
  // Doggy & fox sheets are 2-row grids (row 0 = idle/sit-and-blink, row 1 = run)
  // of 32x32 cells; the wisp is a single 5-frame row.
  const PET_FRAMES = {
    "GandalfHardcore doggy sheet.png": 6, "GandalfHardcore doggy sheet 2.png": 6,
    "GandalfHardcore doggy sheet 3.png": 6, "GandalfHardcore doggy sheet 4.png": 6,
    "GandalfHardcore doggy sheet 5.png": 6, "GandalfHardcore fox.png": 6, "GandalfHardcore Wisp.png": 5,
  };
  NR.petFrames = PET_FRAMES;
  NR.petRows = {
    "GandalfHardcore doggy sheet.png": 2, "GandalfHardcore doggy sheet 2.png": 2,
    "GandalfHardcore doggy sheet 3.png": 2, "GandalfHardcore doggy sheet 4.png": 2,
    "GandalfHardcore doggy sheet 5.png": 2, "GandalfHardcore fox.png": 2, "GandalfHardcore Wisp.png": 1,
  };
  /* Measured per-row frame counts. The 6th cell of the idle row is EMPTY in
     every doggy/fox sheet (and in the hat/backpack overlays) — playing it made
     the companion blink out of existence once per loop. Row 1 really has 6. */
  NR.petRowFrames = {
    "GandalfHardcore doggy sheet.png": [5, 6], "GandalfHardcore doggy sheet 2.png": [5, 6],
    "GandalfHardcore doggy sheet 3.png": [5, 6], "GandalfHardcore doggy sheet 4.png": [5, 6],
    "GandalfHardcore doggy sheet 5.png": [5, 6], "GandalfHardcore fox.png": [5, 6],
    "GandalfHardcore Wisp.png": [5],
  };
  /* matching wardrobe overlays (same grid, same blank cell) */
  NR.petWardrobe = {
    hat: "GandalfHardcore Pet companion/GandalfHardcore doggy hat.png",
    backpack: "GandalfHardcore Pet companion/GandalfHardcore doggy backpack.png",
  };
  NR.petWear = {}; // petId -> "hat" | "backpack" | "" (doggy wardrobe overlays)
  NR.petRowFramesFor = function (petId, row) {
    const per = NR.petRowFrames[petId];
    if (per && per[row | 0]) return per[row | 0];
    return PET_FRAMES[petId] || 6;
  };

  /* ---------------- enemy sprite sheets ----------------
     The tiny-RPG art sits small inside large cells (e.g. a 22x16 orc inside a
     100x100 cell, feet ~43px above the cell bottom). `crop` is the measured
     art window and `floor` the cell-y where the feet touch — spriterender pins
     that line to the ground, so nothing floats and everything reads BIG. */
  const ORC = "Tiny RPG Character Asset Pack v1.03 -Free Soldier&Orc/Characters(100x100)/Orc/Orc";
  const SOL = "Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Characters(100x100 split)/Soldier/Soldier";
  const SAM = "FREE_Samurai 2D Pixel Art v1.2/Sprites";
  const WIZ = "EVil Wizard 2/Sprites";
  const SLIME = "GandalfHardcore Slime Enemy";
  // Slime pack: 256x96 = 8 frames per row of 32x48; row 0 = bounce loop, row 1 = hop arc.
  const slimeDef = (variant) => ({
    fw: 32, fh: 48, perRow: 8,
    crop: { x: 0, y: 0, w: 32, h: 48 }, floor: 48,
    anims: {
      // row 0 cells 5-7 are the melt-away (cell 7 is empty) — looping them made the slime blink out
      idle: { path: `${SLIME}/Slime ${variant}.png`, frames: 5 },
      hop: { path: `${SLIME}/Slime ${variant}.png`, frames: 8, start: 8 },
      death: { path: `${SLIME}/Slime ${variant}.png`, frames: 3, start: 5 }, // squash-flat fade
    },
  });
  NR.sheets = {
    orc: {
      fw: 100, fh: 100,
      crop: { x: 33, y: 29, w: 44, h: 33 }, floor: 57,
      anims: {
        idle: { path: `${ORC}/Orc-Idle.png`, frames: 6 },
        walk: { path: `${ORC}/Orc-Walk.png`, frames: 8 },
        attack: { path: `${ORC}/Orc-Attack01.png`, frames: 6, floor: 62 },
        attack2: { path: `${ORC}/Orc-Attack02.png`, frames: 6, floor: 62 },
        hurt: { path: `${ORC}/Orc-Hurt.png`, frames: 4 },
        death: { path: `${ORC}/Orc-Death.png`, frames: 4 },
      },
    },
    soldier: {
      fw: 100, fh: 100, faceLeft: true, // soldier art looks left natively
      crop: { x: 32, y: 29, w: 47, h: 31 }, floor: 60,
      anims: {
        idle: { path: `${SOL}/Soldier_Idle.png`, frames: 6 },
        walk: { path: `${SOL}/Soldier_Walk.png`, frames: 8 },
        attack: { path: `${SOL}/Soldier_Attack01.png`, frames: 6 },
        attack2: { path: `${SOL}/Soldier_Attack02.png`, frames: 6 },
        attack3: { path: `${SOL}/Soldier_Attack03.png`, frames: 9 },
        hurt: { path: `${SOL}/Soldier_Hurt.png`, frames: 4 },
        death: { path: `${SOL}/Soldier_Death.png`, frames: 4 },
      },
    },
    samurai: {
      fw: 96, fh: 96, faceLeft: true, // the old ronin faces left natively
      crop: { x: 24, y: 44, w: 72, h: 38 }, floor: 81,
      anims: {
        idle: { path: `${SAM}/IDLE.png`, frames: 10 },
        walk: { path: `${SAM}/RUN.png`, frames: 16 },
        attack: { path: `${SAM}/ATTACK 1.png`, frames: 7, floor: 82 },
        hurt: { path: `${SAM}/HURT.png`, frames: 4 },
      },
    },
    wizard: {
      fw: 250, fh: 250,
      crop: { x: 66, y: 22, w: 174, h: 145 }, floor: 167,
      anims: {
        idle: { path: `${WIZ}/Idle.png`, frames: 8 },
        walk: { path: `${WIZ}/Run.png`, frames: 8 },
        attack: { path: `${WIZ}/Attack1.png`, frames: 8 },
        attack2: { path: `${WIZ}/Attack2.png`, frames: 8 },
        hurt: { path: `${WIZ}/Take hit.png`, frames: 3 },
        death: { path: `${WIZ}/Death.png`, frames: 7 },
        jump: { path: `${WIZ}/Jump.png`, frames: 2 },
        fall: { path: `${WIZ}/Fall.png`, frames: 2 },
      },
    },
    slime: slimeDef("blue"),
    slimeGreen: slimeDef("green"),
    slimeRed: slimeDef("red"),
    arrow: { fw: 32, fh: 32, anims: { idle: { path: "Tiny RPG Character Asset Pack 01 v2.0 -Free Soldier&Orc/Arrow(Projectile)/Arrow01(32x32).png", frames: 1 } } },
    /* The orc pack ships a separate 6-frame cleave-effect layer. It was never
       wired; the BRUTE draws it over its swing so heavy hits read as heavy. */
    orcFx: {
      fw: 100, fh: 100,
      crop: { x: 0, y: 0, w: 100, h: 100 }, floor: 100,
      anims: {
        cleave: { path: `${ORC}/../Orc(Split Effects)/Orc-attack01_Effect.png`.replace("/Orc/../", "/"), frames: 6 },
      },
    },
    /* Sprite Pack 7 mercenaries — real combat kits, face RIGHT natively.
       Attack sheets are wider cells, so anims carry their own fw/fh/crop. */
    diego: {
      fw: 32, fh: 48, crop: { x: 0, y: 8, w: 32, h: 40 }, floor: 48,
      anims: {
        idle: { path: "Sprite Pack 7/1 - Diego/Idle (32 x 48).png", frames: 4 },
        blink: { path: "Sprite Pack 7/1 - Diego/Blink (32 x 48).png", frames: 3 },
        walk: { path: "Sprite Pack 7/1 - Diego/Running (32 x 48).png", frames: 6 },
        shoot: { path: "Sprite Pack 7/1 - Diego/Shooting_while_standing (48 x 48).png", frames: 3, fw: 48, fh: 48, crop: { x: 0, y: 8, w: 34, h: 40 } },
        reload: { path: "Sprite Pack 7/1 - Diego/Reloading_while_standing (32 x 48).png", frames: 7 },
        // point-blank mode: drops to a knee (32px-low cells)
        crouch: { path: "Sprite Pack 7/1 - Diego/Crouching (32 x 32).png", frames: 1, fh: 32, crop: { x: 0, y: 2, w: 32, h: 30 }, floor: 32 },
        stand: { path: "Sprite Pack 7/1 - Diego/Standing (32 x 48).png", frames: 1 },
        jump: { path: "Sprite Pack 7/1 - Diego/Jump (32 x 48).png", frames: 1 },
        jshoot: { path: "Sprite Pack 7/1 - Diego/Shooting_while_jumping (48 x 48).png", frames: 3, fw: 48, fh: 48, crop: { x: 0, y: 8, w: 34, h: 40 } },
        rshoot: { path: "Sprite Pack 7/1 - Diego/Shooting_while_running (48 x 48).png", frames: 6, fw: 48, fh: 48, crop: { x: 0, y: 8, w: 34, h: 40 } },
        cshoot: { path: "Sprite Pack 7/1 - Diego/Shooting_while_crouching (48 x 32).png", frames: 3, fw: 48, fh: 32, crop: { x: 0, y: 2, w: 40, h: 30 }, floor: 32 },
        creload: { path: "Sprite Pack 7/1 - Diego/Reloading_while_crouching (32 x 32).png", frames: 7, fh: 32, crop: { x: 0, y: 2, w: 32, h: 30 }, floor: 32 },
        hurt: { path: "Sprite Pack 7/1 - Diego/Hurt (32 x 48).png", frames: 1 },
        death: { path: "Sprite Pack 7/1 - Diego/Hurt (32 x 48).png", frames: 1 },
      },
    },
    holly: {
      fw: 32, fh: 32, crop: { x: 0, y: 2, w: 32, h: 30 }, floor: 32,
      anims: {
        idle: { path: "Sprite Pack 7/2 - Holly/Idle (32 x 32).png", frames: 9 },
        blink: { path: "Sprite Pack 7/2 - Holly/Blink (32 x 32).png", frames: 3 },
        walk: { path: "Sprite Pack 7/2 - Holly/Running (32 x 32).png", frames: 6 },
        jump: { path: "Sprite Pack 7/2 - Holly/Jump (32 x 32).png", frames: 1 },
        fall: { path: "Sprite Pack 7/2 - Holly/Falling (32 x 32).png", frames: 2 },
        aerial: { path: "Sprite Pack 7/2 - Holly/Aerial_swing (64 x 64).png", frames: 12, fw: 64, fh: 64, crop: { x: 7, y: 6, w: 50, h: 51 }, floor: 57 },
        smash: { path: "Sprite Pack 7/2 - Holly/Ground_smash (64 x 48).png", frames: 8, fw: 64, fh: 48, crop: { x: 9, y: 8, w: 48, h: 40 }, floor: 48 },
        duck: { path: "Sprite Pack 7/2 - Holly/Ducking (32 x 32).png", frames: 1 },
        stand: { path: "Sprite Pack 7/2 - Holly/Standing (32 x 32).png", frames: 1 },
        hurt: { path: "Sprite Pack 7/2 - Holly/Hurt (32 x 32).png", frames: 1 },
        death: { path: "Sprite Pack 7/2 - Holly/Hurt (32 x 32).png", frames: 1 },
      },
    },
    gordon: {
      fw: 48, fh: 48, crop: { x: 4, y: 3, w: 44, h: 45 }, floor: 48,
      anims: {
        idle: { path: "Sprite Pack 7/3 - Gordon/Idle (48 x 48).png", frames: 4 },
        blink: { path: "Sprite Pack 7/3 - Gordon/Blink (48 x 48).png", frames: 3 },
        walk: { path: "Sprite Pack 7/3 - Gordon/Running (48 x 48).png", frames: 6 },
        combo: { path: "Sprite Pack 7/3 - Gordon/Combo_swings (80 x 64).png", frames: 18, fw: 80, fh: 64, crop: { x: 5, y: 9, w: 75, h: 55 }, floor: 64 },
        upswing: { path: "Sprite Pack 7/3 - Gordon/Up_swing (80 x 64).png", frames: 7, fw: 80, fh: 64, crop: { x: 5, y: 9, w: 75, h: 55 }, floor: 64 },
        downswing: { path: "Sprite Pack 7/3 - Gordon/Down_swing (80 x 64).png", frames: 7, fw: 80, fh: 64, crop: { x: 5, y: 9, w: 75, h: 55 }, floor: 64 },
        aer: { path: "Sprite Pack 7/3 - Gordon/Aerial_swing (80 x 64).png", frames: 7, fw: 80, fh: 64, crop: { x: 5, y: 9, w: 75, h: 55 }, floor: 64 },
        stab: { path: "Sprite Pack 7/3 - Gordon/Run_stab (80 x 48).png", frames: 8, fw: 80, fh: 48, crop: { x: 6, y: 7, w: 68, h: 41 }, floor: 48 },
        hurt: { path: "Sprite Pack 7/3 - Gordon/Hurt (48 x 48).png", frames: 1 },
        death: { path: "Sprite Pack 7/3 - Gordon/Hurt (48 x 48).png", frames: 1 },
        stand: { path: "Sprite Pack 7/3 - Gordon/Standing (48 x 48).png", frames: 1 },
        crouch: { path: "Sprite Pack 7/3 - Gordon/Crouching (48 x 48).png", frames: 1 },
        jump: { path: "Sprite Pack 7/3 - Gordon/Jump (48 x 64).png", frames: 1, fh: 64, crop: { x: 4, y: 3, w: 44, h: 61 }, floor: 64 },
        fall: { path: "Sprite Pack 7/3 - Gordon/Falling (48 x 64).png", frames: 1, fh: 64, crop: { x: 4, y: 3, w: 44, h: 61 }, floor: 64 },
        landed: { path: "Sprite Pack 7/3 - Gordon/Landed (48 x 64).png", frames: 2, fh: 64, crop: { x: 4, y: 3, w: 44, h: 61 }, floor: 64 },
      },
    },
  };

  /* ---------------- terrain texture library ----------------
     Four curated variants per surface per biome — the arena rotates them
     along the level so districts feel distinct instead of one repeating tile. */
  NR.textures = {
    cityGround: ["Brick/Brick_04-512x512.png", "Brick/Brick_05-512x512.png", "Brick/Brick_06-512x512.png", "Brick/Brick_07-512x512.png"],
    cityPlat: ["Metal/Metal_01-512x512.png", "Metal/Metal_02-512x512.png", "Metal/Metal_17-512x512.png", "Metal/Metal_19-512x512.png"],
    cityEdge: ["Metal/Metal_08-512x512.png", "Metal/Metal_07-512x512.png", "Metal/Metal_18-512x512.png", "Metal/Metal_13-512x512.png"],
    cityVeins: ["Elements/Elements_15-512x512.png", "Elements/Elements_16-512x512.png", "Elements/Elements_18-512x512.png", "Elements/Elements_20-512x512.png"],
    gardenGround: ["Stone/Stone_05-128x128.png", "Stone/Stone_06-128x128.png", "Stone/Stone_02-128x128.png", "Stone/Stone_03-128x128.png"],
    gardenPlat: ["Wood/Wood_02-128x128.png", "Wood/Wood_07-128x128.png", "Wood/Wood_08-128x128.png", "Wood/Wood_11-128x128.png"],
    gardenEdge: ["Stone/Stone_09-128x128.png", "Stone/Stone_11-128x128.png", "Stone/Stone_12-128x128.png", "Stone/Stone_07-128x128.png"],
    gardenVeins: ["Elements/Elements_12-512x512.png", "Elements/Elements_13-512x512.png", "Elements/Elements_14-512x512.png", "Elements/Elements_11-512x512.png"],
    reactorGround: ["Metal/Metal_03-512x512.png", "Metal/Metal_11-512x512.png", "Metal/Metal_12-512x512.png", "Metal/Metal_13-512x512.png"],
    reactorPlat: ["Tile/Tile_04-128x128.png", "Tile/Tile_05-128x128.png", "Tile/Tile_06-128x128.png", "Tile/Tile_10-128x128.png"],
    reactorEdge: ["Plaster/Plaster_01-512x512.png", "Plaster/Plaster_19-512x512.png", "Plaster/Plaster_20-512x512.png", "Plaster/Plaster_02-512x512.png"],
    reactorVeins: ["Elements/Elements_01-512x512.png", "Elements/Elements_02-512x512.png", "Elements/Elements_03-512x512.png", "Elements/Elements_04-512x512.png"],
  };
  NR.textureBiomes = { 0: "city", 1: "garden", 2: "reactor" }; // chapter -> family prefix

  /* ---------------- loader ---------------- */
  A.get = function (path) { return A.images[path] || null; };
  A.ready = function (path) { return A.state[path] === "ready"; };

  // in-flight load promises, so repeat calls await the same request instead of
  // resolving instantly and letting callers spin in a re-render loop
  A.inflight = A.inflight || {};
  A.load = function (paths, onProgress) {
    const want = (paths || []).filter((p) => p);
    if (!want.length) return Promise.resolve();
    const started = [];
    let n = 0, total = 0;
    return new Promise((resolve) => {
      const finish = () => { if (onProgress) onProgress(1); resolve(); };
      const track = (path, promise) => {
        total++;
        promise.then(() => {
          n++;
          if (onProgress) onProgress(n / total);
          if (n >= total) finish();
        });
      };
      for (const path of want) {
        if (A.inflight[path]) { track(path, A.inflight[path]); continue; }
        if (A.state[path] === "ready" || A.state[path] === "error") { track(path, Promise.resolve()); continue; }
        const p = new Promise((done) => {
          A.state[path] = "loading";
          const img = new Image();
          img.onload = () => { A.images[path] = img; A.state[path] = "ready"; A.version++; done(); };
          img.onerror = () => { A.state[path] = "error"; A.version++; done(); };
          img.src = enc("assets/" + path);
        }).then(() => { delete A.inflight[path]; });
        A.inflight[path] = p;
        track(path, p);
        started.push(path);
      }
      if (!total) finish();
    });
  };

  // fire-and-forget background preloading (keeps UI responsive)
  A.preload = function (paths) {
    for (const p of paths || []) if (!A.state[p]) A.load([p]);
  };

  // every character layer + enemy sheet, for background preloading
  A.allLayerPaths = function () {
    const out = [];
    for (const key of Object.keys(c)) for (const o of c[key]) out.push(o.path);
    for (const key of Object.keys(NR.sheets))
      for (const a of Object.keys(NR.sheets[key].anims)) out.push(NR.sheets[key].anims[a].path);
    return out;
  };

  A.layerPaths = function (appearance) {
    const out = [];
    const push = (cat, id) => {
      const o = (c[cat] || []).find((x) => x.id === id);
      if (o) out.push(o.path);
    };
    push("monster", appearance.monster);
    push("skin", appearance.skin);
    push("ears", appearance.ears);
    push("bottom", appearance.bottom);
    push("underwear", appearance.underwear);
    push("top", appearance.top);
    push("shoes", appearance.shoes);
    push("gloves", appearance.gloves);
    push("hair", appearance.hair);
    push("hat", appearance.hat);
    push("mask", appearance.mask);
    push("back", appearance.back);
    push("weapon", appearance.weapon);
    push("aura", appearance.aura);
    return out;
  };
})();

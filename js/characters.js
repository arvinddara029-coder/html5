/* Six mechanically distinct operators, not just palette swaps.
   Each one also carries a signature look built from the Clockwork Raven layer
   packs (special skins, hats, masks, capes, weapons, auras), so picking an
   operator visibly changes the hero instead of only the stat sheet. */
(function () {
  NR.characters = [
    {
      id: "ronin",
      name: "KAITO",
      role: "THE BALANCED BLADE",
      color: "#8af5e1",
      cloak: "#cb3d92",
      hp: 100,
      speed: 1,
      damage: 1,
      jumps: 2,
      dashes: 1,
      armor: 1,
      perk: "Balanced speed, damage and armor.",
      tag: "BALANCED",
    },
    {
      id: "kestrel",
      name: "KESTREL",
      role: "THE ROOFTOP GHOST",
      color: "#c2adff",
      cloak: "#7049b0",
      hp: 75,
      speed: 1.22,
      damage: 0.9,
      jumps: 3,
      dashes: 2,
      armor: 1,
      perk: "Triple jump + two dash charges. Lower health.",
      tag: "AGILE",
    },
    {
      id: "titan",
      name: "ONYX",
      role: "THE IRON WARDEN",
      color: "#ffca7f",
      cloak: "#ba702e",
      hp: 150,
      speed: 0.82,
      damage: 1.25,
      jumps: 2,
      dashes: 1,
      armor: 0.8,
      perk: "Heavy strikes and 20% damage resistance. Slower.",
      tag: "HEAVY",
    },
    {
      id: "vex",
      name: "VEX",
      role: "THE FOUNDRY WITCH",
      color: "#ff8fd0",
      cloak: "#7d2f8f",
      hp: 70,
      speed: 1.12,
      damage: 1.45,
      jumps: 3,
      dashes: 1,
      armor: 1.1,
      perk: "Devastating strikes and a triple jump — but she breaks easily.",
      tag: "GLASS CANNON",
      look: {
        monster: "Female Demon skin",
        hair: "Female Hair5",
        ears: "fElven Ears3",
        hat: "fWitch hat",
        top: "fPurple Corset Long Sleeves",
        bottom: "fLong dress purple",
        shoes: "fPink Thigh-High Boots",
        gloves: "fOpera Gloves purple",
        weapon: "fGolden Sword",
        back: "fFemale Lantern",
        aura: "Character effects stars pink",
      },
    },
    {
      id: "sable",
      name: "SABLE",
      role: "THE PLAGUE GHOST",
      color: "#9fe8ff",
      cloak: "#3b4f8f",
      hp: 85,
      speed: 1.3,
      damage: 0.95,
      jumps: 3,
      dashes: 2,
      armor: 0.9,
      perk: "Fastest runner alive: 3 jumps, 2 dashes, 10% less damage taken.",
      tag: "SPEED",
      look: {
        monster: "Female Ghost skin",
        hair: "Fancy Hair",
        ears: "mElven Ears2",
        mask: "mMale Plague Mask",
        top: "mChainmail",
        bottom: "mPurple Pants",
        shoes: "mBoots",
        gloves: "mGlove purple",
        weapon: "mDiamond Sword",
        back: "anyCape purple",
        aura: "Character effects debuff black",
      },
    },
    {
      id: "grim",
      name: "GRIM",
      role: "THE BONE BREAKER",
      color: "#ff9a6b",
      cloak: "#8a3b1e",
      hp: 190,
      speed: 0.74,
      damage: 1.5,
      jumps: 2,
      dashes: 1,
      armor: 0.65,
      perk: "An orc warlord: 190 HP, 35% damage resistance, crushing axe hits.",
      tag: "TANK",
      look: {
        monster: "Female Orc skin",
        hair: "Male Hair3",
        hat: "mGuard Helmet",
        top: "mChainmail",
        bottom: "mGreen Pants",
        shoes: "mBoots",
        gloves: "mGlove green",
        weapon: "mGolden Axe",
        back: "mMale Circle Shield",
        aura: "Character effects buff red",
      },
    },
  ];
  NR.applyCharacter = function (p, id) {
    const c = NR.characters.find((c) => c.id === id) || NR.characters[0];
    p.character = c.id;
    p.trim = c.color;
    p.cloak = c.cloak;
    p.maxHp = c.hp;
    p.hp = c.hp;
    p.ghostHp = c.hp;
    p.speedMul = c.speed;
    p.dmgMul = c.damage;
    p.jumpMax = c.jumps;
    p.dashMax = c.dashes;
    p.dashCharges = c.dashes;
    p.damageTakenMul = c.armor;
    // signature look: the operator's gear over the player's saved appearance
    p.look = c.look ? { ...NR.profile.appearance, ...c.look } : null;
    p.computePose();
  };
})();

/* ============ PRODUCTION PASS — real Hero Definition system ============
   Data-driven heroes. A hero is NOT a skin: each definition carries
     - unique statistics (hp / speed / damage / jumps / dashes / armor)
     - a movement personality (acceleration, air control, dash style)
     - a unique signature LOOK built from the real GandalfHardcore layer
       catalog (no invented art)
     - a 3-ability signature kit (basic + defensive + signature) —
       abilities are implemented in js/abilities.js, one engine, real
       behavior per hero, no shared default kit
     - a visual identity (VFX palette) and sound profile (audio map keys)
   NR.characters remains as the compatible roster view (stats + look);
   existing save files keep working. */
(function () {
  const H = (NR.heroes = {});

  /* ---------------- hero definitions ---------------- */
  const DEFS = [
    {
      key: "kaito", name: "KAITO", role: "THE BALANCED BLADE", tag: "STARTER",
      color: "#8af5e1", cloak: "#cb3d92", hp: 100, speed: 1, damage: 1, jumps: 2, dashes: 1, armor: 1,
      movement: { accel: 18, air: 10, dashStyle: "ghost" },
      kit: ["risingFang", "aegisGuard", "sukunaSlice"],
      vfx: { primary: "cyan", accent: "magenta" },
      sound: { attack: "heroAttack", ability: "heroAbilityKaito" },
      perk: "Balanced blade. Signature: SUKUNASLICE — one devastating cinematic rush per run.",
      look: null, // player's own forged appearance
      unlockLevel: 1,
    },
    {
      key: "sen", name: "SEN", role: "THE RIVAL BLADE", tag: "SAMURAI",
      color: "#ffdad1", cloak: "#8c2f39", hp: 110, speed: 1.08, damage: 1.12, jumps: 2, dashes: 2, armor: 1, scale: 1.04,
      movement: { accel: 20, air: 11, dashStyle: "ied" },
      kit: ["quickstepSlash", "windGuard", "thousandCuts"],
      vfx: { primary: "white", accent: "red" },
      sound: { attack: "heroAttackSamurai", ability: "heroAbilitySamurai" },
      perk: "Duelist. Dash-strikes, parry-empowered guard and a multi-dash signature.",
      look: {
        hair: "Male Hair11", hat: "mGuard Helmet", mask: "mMale Bandit Scarf",
        top: "mChainmail", bottom: "mPurple Pants", shoes: "mBoots",
        gloves: "mGlove red", weapon: "mGolden Sword", back: "anyCape red",
      },
      unlockLevel: 1,
    },
    {
      key: "onyx", name: "ONYX", role: "THE IRON WARDEN", tag: "TANK",
      color: "#ffca7f", cloak: "#ba702e", hp: 170, speed: 0.82, damage: 1.25, jumps: 2, dashes: 1, armor: 0.7, scale: 1.09,
      movement: { accel: 14, air: 8, dashStyle: "bulwark" },
      kit: ["bulwarkBastion", "groundSlam", "unbreakable"],
      vfx: { primary: "orange", accent: "yellow" },
      sound: { attack: "heroAttackHeavy", ability: "heroAbilityTank" },
      perk: "Protector. 30% damage resistance, taunting bastion and an unbreakable last stand.",
      look: {
        hat: "mGuard Helmet", top: "mChainmail", bottom: "mPants", shoes: "mBoots",
        gloves: "mGlove orange", weapon: "mGolden Axe", back: "mMale Circle Shield",
        aura: "Character effects buff red",
      },
      unlockLevel: 3,
    },
    {
      key: "vex", name: "VEX", role: "THE FOUNDRY WITCH", tag: "FIRE",
      color: "#ff8fd0", cloak: "#7d2f8f", hp: 70, speed: 1.12, damage: 1.45, jumps: 3, dashes: 1, armor: 1.1, scale: 0.98,
      movement: { accel: 16, air: 13, dashStyle: "ember" },
      kit: ["emberLance", "flameWard", "infernoCascade"],
      vfx: { primary: "orange", accent: "magenta" },
      sound: { attack: "heroAttackFire", ability: "heroAbilityFire" },
      perk: "Fire caster (stylized flames). Devastating strikes — but she breaks easily.",
      look: {
        monster: "Female Demon skin", hair: "Female Hair5", ears: "fElven Ears3",
        hat: "fWitch hat", top: "fPurple Corset Long Sleeves", bottom: "fLong dress purple",
        shoes: "fPink Thigh-High Boots", gloves: "fOpera Gloves purple", weapon: "fGolden Sword",
        back: "fFemale Lantern", aura: "Character effects stars pink",
      },
      unlockLevel: 5,
    },
    {
      key: "sable", name: "SABLE", role: "THE PLAGUE GHOST", tag: "SPEED",
      color: "#9fe8ff", cloak: "#3b4f8f", hp: 85, speed: 1.3, damage: 0.95, jumps: 3, dashes: 2, armor: 0.9, scale: 0.98,
      movement: { accel: 22, air: 12, dashStyle: "phase" },
      kit: ["phantomStep", "mistVeil", "tempestRush"],
      vfx: { primary: "blue", accent: "purple" },
      sound: { attack: "heroAttackGhost", ability: "heroAbilityGhost" },
      perk: "Fastest runner alive: 3 jumps, 2 dashes, teleport steps and a speed frenzy.",
      look: {
        monster: "Female Ghost skin", hair: "Fancy Hair", ears: "mElven Ears2",
        mask: "mMale Plague Mask", top: "mChainmail", bottom: "mPurple Pants", shoes: "mBoots",
        gloves: "mGlove purple", weapon: "mDiamond Sword", back: "anyCape purple",
        aura: "Character effects debuff black",
      },
      unlockLevel: 7,
    },
    {
      key: "kestrel", name: "KESTREL", role: "THE ROOFTOP GHOST", tag: "RANGED",
      color: "#c2adff", cloak: "#7049b0", hp: 75, speed: 1.18, damage: 0.9, jumps: 3, dashes: 2, armor: 1,
      movement: { accel: 19, air: 12, dashStyle: "ghost" },
      kit: ["tripleKunai", "smokeScreen", "arrowStorm"],
      vfx: { primary: "purple", accent: "cyan" },
      sound: { attack: "heroAttackRanged", ability: "heroAbilityRanged" },
      perk: "Ranged striker: kunai volleys, smoke escapes and a signature arrow storm.",
      look: {
        hair: "Male Hair12", hat: "mMale Blue cap", top: "mShirt", bottom: "mPants",
        shoes: "mBoots", gloves: "mGlove blue", weapon: "mIron Pickaxe", back: "anySmall Backpack",
      },
      unlockLevel: 9,
    },
    {
      key: "grim", name: "GRIM", role: "THE BONE BREAKER", tag: "BRUTE",
      color: "#ff9a6b", cloak: "#8a3b1e", hp: 190, speed: 0.74, damage: 1.5, jumps: 2, dashes: 1, armor: 0.65, scale: 1.12,
      movement: { accel: 13, air: 7, dashStyle: "bulwark" },
      kit: ["skullCracker", "boneWall", "rampage"],
      vfx: { primary: "red", accent: "yellow" },
      sound: { attack: "heroAttackHeavy", ability: "heroAbilityBrute" },
      perk: "Orc warlord: 190 HP, 35% resistance, crushing axes and a berserk rampage.",
      look: {
        monster: "Female Orc skin", hair: "Male Hair3", hat: "mGuard Helmet",
        top: "mChainmail", bottom: "mGreen Pants", shoes: "mBoots", gloves: "mGlove green",
        weapon: "mGolden Axe", back: "mMale Circle Shield", aura: "Character effects buff red",
      },
      unlockLevel: 12,
    },
    {
      key: "mira", name: "MIRA", role: "THE STORM WITCH", tag: "CASTER",
      color: "#9fd8ff", cloak: "#3b6f8f", hp: 95, speed: 1.0, damage: 1.05, jumps: 2, dashes: 1, armor: 1.05, scale: 1.0,
      movement: { accel: 17, air: 10, dashStyle: "blink" },
      kit: ["chainBolt", "thunderStep", "tempest"],
      vfx: { primary: "blue", accent: "white" },
      sound: { attack: "heroAttackRanged", ability: "heroAbilityStorm" },
      perk: "Storm caster: chain lightning, a blink step and a hunting tempest.",
      look: {
        hair: "Female Hair3", hat: "fWitch hat", top: "fPurple Corset Long Sleeves",
        bottom: "fLong dress purple", shoes: "fBlack Thigh-High Boots", gloves: "fOpera Gloves purple",
        weapon: "fFemale Sword", aura: "Character effects curved blue",
      },
      unlockLevel: 2,
    },
    {
      key: "marshal", name: "MARSHAL", role: "THE LINEBREAKER", tag: "GUARDIAN",
      color: "#ffd9a0", cloak: "#8f6b3b", hp: 140, speed: 0.92, damage: 1.15, jumps: 2, dashes: 1, armor: 0.85, scale: 1.05,
      movement: { accel: 15, air: 9, dashStyle: "bulwark" },
      kit: ["shieldBash", "rallyBanner", "pikeVolley"],
      vfx: { primary: "yellow", accent: "white" },
      sound: { attack: "heroAttackHeavy", ability: "heroAbilityTank" },
      perk: "Shield officer: stunning bashes, a rallying standard and a pike volley.",
      look: {
        hair: "Male Hair14", hat: "mGuard Helmet", mask: "mMale Bandit Scarf",
        top: "mShirt", bottom: "mBlue Pants", shoes: "mBoots", weapon: "mGolden Sword",
        back: "mMale Circle Shield", aura: "Character effects buff",
      },
      unlockLevel: 4,
    },
    {
      key: "miyu", name: "MIYU", role: "THE SHADOW BLOSSOM", tag: "ASSASSIN",
      color: "#ff8fd0", cloak: "#7d2f8f", hp: 90, speed: 1.15, damage: 1.2, jumps: 3, dashes: 2, armor: 1.15, scale: 0.97,
      movement: { accel: 21, air: 13, dashStyle: "ghost" },
      kit: ["iaiSlash", "petalVeil", "bladeWaltz"],
      vfx: { primary: "magenta", accent: "white" },
      sound: { attack: "heroAttackSamurai", ability: "heroAbilityAssassin" },
      perk: "Blade dancer: instant draw-cuts, a petal veil and the blade waltz.",
      look: {
        hair: "Female Hair1", ears: "fElven Ears2", top: "fCorset", bottom: "fSkirt",
        shoes: "fBoots", weapon: "fFemale Sword", aura: "Character effects hearts pink",
      },
      unlockLevel: 6,
    },
    {
      key: "grusha", name: "GRUSHA", role: "THE ORC WARBRUTE", tag: "BRAWLER",
      color: "#a8d86b", cloak: "#4b6b2b", hp: 180, speed: 0.88, damage: 1.4, jumps: 2, dashes: 1, armor: 0.8, scale: 1.1,
      movement: { accel: 13, air: 7, dashStyle: "bulwark" },
      kit: ["boarCharge", "warStomp", "frenzy"],
      vfx: { primary: "green", accent: "yellow" },
      sound: { attack: "heroAttackHeavy", ability: "heroAbilityBrute" },
      perk: "Orc brawler: goring charges, stunning stomps and a healing blood frenzy.",
      look: {
        monster: "Female Orc skin", hair: "Male Hair5", hat: "mGuard Helmet",
        top: "mChainmail", bottom: "mGreen Pants", shoes: "mBoots", gloves: "mGloves",
        weapon: "mIron Sword", back: "mMale Circle Shield",
      },
      unlockLevel: 8,
    },
    {
      key: "rune", name: "RUNE", role: "THE ARCANE SMITH", tag: "BATTLEMAGE",
      color: "#b48aff", cloak: "#4b3b8f", hp: 105, speed: 0.96, damage: 1.0, jumps: 2, dashes: 2, armor: 1.0, scale: 1.02,
      movement: { accel: 16, air: 10, dashStyle: "blink" },
      kit: ["arcaneBolt", "runeWard", "meteorForge"],
      vfx: { primary: "purple", accent: "orange" },
      sound: { attack: "heroAttackFire", ability: "heroAbilityStorm" },
      perk: "Forge mage: piercing bolts, rune wards and three runic meteors.",
      look: {
        hair: "Male Hair21", hat: "mMale Hat10", top: "mShirt v2", bottom: "mPurple Pants",
        shoes: "mBoots", weapon: "mBronze Sword", back: "mMale Lantern", aura: "Character effects stars teal",
      },
      unlockLevel: 11,
    },
  ];
  H.defs = DEFS;

  H.byKey = (key) => DEFS.find((h) => h.key === key) || DEFS[0];
  H.current = () => H.byKey(NR.profile.character);
  H.isUnlocked = (def) => (NR.profile.level || 1) >= (def.unlockLevel || 1);
  H.select = function (key) {
    const def = H.byKey(key);
    if (!H.isUnlocked(def)) { NR.hub?.notify(`${def.name} unlocks at level ${def.unlockLevel}.`); return false; }
    NR.profile.character = def.key;
    NR.saveProfile();
    return true;
  };

  /* ---------------- compatible roster view (NR.characters) ----------------
     Existing systems (profile validation, lobby, tests) read NR.characters.
     Rebuild it from the hero definitions so there is exactly ONE source of
     truth — no duplicated hero lists to drift apart. */
  NR.characters = DEFS.map((d) => ({
    id: d.key, name: d.name, role: d.role, color: d.color, cloak: d.cloak,
    hp: d.hp, speed: d.speed, damage: d.damage, jumps: d.jumps, dashes: d.dashes,
    armor: d.armor, perk: d.perk, tag: d.tag, look: d.look, kit: d.kit, vfx: d.vfx, sound: d.sound,
    unlockLevel: d.unlockLevel || 1,
  }));

  /* apply stats + look + kit to a player entity */
  const prevApply = NR.applyCharacter;
  NR.applyCharacter = function (p, id) {
    prevApply(p, id);
    const def = H.byKey(id);
    p.heroDef = def;
    p.movement = def.movement;
    if (def.look) {
      // hero signature look + the player's explicit Vault choices (equip/remove
      // now visibly works on EVERY hero, not just the skinless ones)
      p.look = NR.vault ? NR.vault.effectiveLook(def.key) : Object.assign({}, NR.profile.appearance, def.look);
    }
    if (NR.abilities) NR.abilities.bind(p, def);
  };
})();

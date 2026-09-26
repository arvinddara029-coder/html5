/* Three mechanically distinct operators, not just palette swaps. */
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
    p.computePose();
  };
})();

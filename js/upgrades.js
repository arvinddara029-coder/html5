/* ============ NEON RONIN — roguelite upgrade pool ============ */
(function () {
  const U = NR.util;
  const DEFS = [
    { id:"arcane",ico:"✦",name:"ARCANE AMPLIFIER",desc:"+20% Vault spell and equipment magic power this run.",rar:"epic",w:2,
      can:()=>!!NR.evolution && (NR.evolution.magic?.damage||1)<4,apply:()=>{NR.evolution.magic.damage*=1.2;} },
    { id:"spellcost",ico:"◈",name:"EFFICIENT CHANNEL",desc:"Vault spells cost 10% less energy this run.",rar:"rare",w:2,
      can:()=>!!NR.evolution && (NR.evolution.magic?.cost||1)>.6,apply:()=>{NR.evolution.magic.cost*=.9;} },
    { id:"spelltime",ico:"◷",name:"TIMEWEAVE",desc:"Vault spells recharge 10% faster this run.",rar:"rare",w:2,
      can:()=>!!NR.evolution && (NR.evolution.magic?.cooldown||1)>.55,apply:()=>{NR.evolution.magic.cooldown*=.9;} },
    { id: "blade", ico: "⚔️", name: "MASTER'S EDGE", desc: "+25% katana damage on every strike.", rar: "common", w: 3,
      can: () => true, apply: (p) => { p.dmgMul *= 1.25; } },
    { id: "vital", ico: "❤️", name: "SECOND WIND", desc: "+25 max HP and restore 40 HP now.", rar: "common", w: 3,
      can: () => true, apply: (p) => { p.maxHp += 25; p.heal(40); } },
    { id: "swift", ico: "💨", name: "PHASE DRIVE", desc: "Dash recharges 28% faster.", rar: "rare", w: 2,
      can: (p) => p.dashCdMul > 0.35, apply: (p) => { p.dashCdMul *= 0.72; } },
    { id: "dash", ico: "👥", name: "TWIN AFTERIMAGE", desc: "+1 dash charge. Chain dashes through the horde.", rar: "epic", w: 1,
      can: (p) => p.dashMax < 3, apply: (p) => { p.dashMax++; p.dashCharges++; } },
    { id: "flow", ico: "⚡", name: "CURRENT FLOW", desc: "+40% energy gain from hits and orbs.", rar: "rare", w: 2,
      can: () => true, apply: (p) => { p.energyMul *= 1.4; } },
    { id: "vamp", ico: "🩸", name: "CRIMSON CONTRACT", desc: "Heal 12% of all damage you deal.", rar: "epic", w: 1,
      can: (p) => p.lifesteal < 0.36, apply: (p) => { p.lifesteal += 0.12; } },
    { id: "speed", ico: "🦵", name: "STRIDER SERVOS", desc: "+14% move speed.", rar: "common", w: 3,
      can: (p) => p.speedMul < 1.6, apply: (p) => { p.speedMul *= 1.14; } },
    { id: "sky", ico: "🕊️", name: "SKYSTEP", desc: "+1 mid-air jump. The sky is a floor.", rar: "epic", w: 1,
      can: (p) => p.jumpMax < 4, apply: (p) => { p.jumpMax++; } },
    { id: "crit", ico: "🎯", name: "KILLER INSTINCT", desc: "+12% critical chance (crits deal ×2).", rar: "rare", w: 2,
      can: (p) => p.critCh < 0.6, apply: (p) => { p.critCh += 0.12; } },
    { id: "storm", ico: "🌀", name: "TEMPEST CORE", desc: "Blade Storm deals +50% damage.", rar: "rare", w: 2,
      can: () => true, apply: (p) => { p.stormMul *= 1.5; } },
    { id: "guard", ico: "🛡️", name: "NANO WEAVE", desc: "Invulnerability after hits lasts +60%.", rar: "common", w: 3,
      can: (p) => !p.guardMul || p.guardMul < 2.2, apply: (p) => { p.guardMul = (p.guardMul || 1) * 1.6; } },
    { id: "fury", ico: "🔥", name: "BATTLE TRANCE", desc: "Combo window lasts 2s longer.", rar: "rare", w: 2,
      can: () => true, apply: (p) => { p.furyBonus = (p.furyBonus || 0) + 2; } },
  ];

  NR.upgrades = {
    roll(p) {
      const pool = DEFS.filter((d) => d.can(p));
      const out = [];
      const bag = pool.slice();
      while (out.length < 3 && bag.length) {
        let total = 0;
        for (const d of bag) total += d.w;
        let r = Math.random() * total;
        let idx = 0;
        for (; idx < bag.length; idx++) { r -= bag[idx].w; if (r <= 0) break; }
        idx = Math.min(idx, bag.length - 1);
        out.push(bag.splice(idx, 1)[0]);
      }
      return out;
    },
    rarityLabel: { common: "STANDARD", rare: "PROTOTYPE", epic: "FORBIDDEN TECH" },
  };
})();

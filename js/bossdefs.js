/* ============ PRODUCTION PASS — BossDefinition rotation ============
   The single "generic robot boss" is replaced by a data-driven rotation
   built from ACTUAL repository assets:
     - four sheet bosses (SHOGUN-9 mech, ARCH-WARLOCK, GORO, KUROGANE)
     - super-actor bosses measured from the Legacy/Mario packs
       (Grotto Wyrm, Hell Beast, Nightmare, Ogre, Werewolf, Death…)
     - the eleven FBX-derived guardians as late-world statue bosses
   Each definition: unique name, arena behavior profile, attack profile,
   phase rule, reward, VFX color, sound. Selection is deterministic from
   (world, level, milestone) so every player meets the same rotation. */
(function () {
  const U = NR.util;
  const B = (NR.bossDefs = {});

  const SHEET_BOSSES = {
    mech:    { id: "mech",    name: "SHOGUN-9",            skin: "mech",    col: "#ff2d95", style: "barrage",  reward: 5 },
    warlock: { id: "warlock", name: "ARCH-WARLOCK VEXIS",  skin: "warlock", col: "#c08bff", style: "caster",   reward: 5 },
    brute:   { id: "brute",   name: "GORO THE BREAKER",    skin: "brute",   col: "#ff6a4d", style: "charger",  reward: 6 },
    ronin:   { id: "ronin",   name: "KUROGANE THE RIVAL",  skin: "ronin",   col: "#8af5e1", style: "duelist",  reward: 6 },
  };

  /* super-actor bosses: {actorId (super content), display name, behavior} */
  const SUPER_BOSSES = [
    { actor: "Grotto Escape 2 Boss Dragon", name: "THE GROTTO WYRM",   style: "flying", reward: 7 },
    { actor: "Hell Beast",                  name: "HELL BEAST",        style: "charger", reward: 7 },
    { actor: "Nightmare",                   name: "NIGHTMARE",         style: "flying",  reward: 8 },
    { actor: "Ogre",                        name: "OGRE WARLORD",      style: "charger", reward: 8 },
    { actor: "Werewolf",                    name: "ALPHA WEREWOLF",    style: "duelist", reward: 8 },
    { actor: "Death",                       name: "DEATH ITSELF",      style: "caster",  reward: 10 },
  ];

  /* guardians (FBX-derived) become milestone bosses in later worlds */
  function guardians() {
    const C = NR.superContent;
    if (!C) return [];
    return C.actors.filter((a) => a.role === "guardian").slice(0, 8).map((a) => ({
      actor: a.id, name: a.name.replace(" Guardian", "").toUpperCase() + " GUARDIAN", style: "flying", reward: 9,
    }));
  }

  /* full rotation, deterministic order */
  B.rotation = function () {
    const list = [SHEET_BOSSES.mech, SHEET_BOSSES.warlock, SHEET_BOSSES.brute, SHEET_BOSSES.ronin];
    const supers = SUPER_BOSSES.filter((b) => NR.superRuntime && NR.superRuntime.actor(b.actor));
    const guard = guardians().filter((b) => NR.superRuntime && NR.superRuntime.actor(b.actor));
    return list.concat(sups(supers, 0, 2), [SHEET_BOSSES.mech], guard.slice(0, 4), supers.length > 2 ? [supers[2]] : []);
    function sups(arr, a, b) { return arr.slice(a, b); }
  };

  B.forMilestone = function (world, level, milestone) {
    const rot = B.rotation();
    const idx = (world * 5 + level + milestone * 3) % rot.length;
    return rot[idx] || SHEET_BOSSES.mech;
  };

  /* spawn a boss from a definition. Sheet bosses use the enemies.js Boss;
     super-actor bosses need super-runtime (graceful fallback otherwise). */
  B.spawn = function (def, x, mul, bossNum) {
    if (def.skin && NR.Boss) {
      const b = new NR.Boss(x, NR.world.groundY, mul, bossNum, def.skin);
      b.bossName = def.name;
      b.defStyle = def.style;
      return b;
    }
    if (!NR.SuperEnemy) {
      // super pack unavailable — field the strongest sheet boss instead
      const fb = new NR.Boss(x, NR.world.groundY, mul * 1.15, bossNum, "mech");
      fb.bossName = def.name; fb.defStyle = def.style;
      return fb;
    }
    return new (superBossClass())(x, mul, bossNum, def);
  };

  /* Super-actor boss: a SuperEnemy promoted to a real boss fight —
     intro drop, health-bar integration, phase 2 at 50%, big reward. */
  let _SuperBoss = null;
  function superBossClass() {
    if (_SuperBoss) return _SuperBoss;
    _SuperBoss = class extends NR.SuperEnemy {
    constructor(x, mul, bossNum, def) {
      super(x, NR.world.groundY, mul, def.actor);
      this.type = "boss"; this.boss = true;
      this.bossName = def.name;
      this.def = def;
      this.maxHp = this.hp = Math.round(760 * mul * (1 + (bossNum - 1) * 0.45));
      this.dmg = 18; this.score = 3500 + bossNum * 500;
      this.phase = 1; this.state = "intro"; this.st = 0; this.introY = this.y;
      this.y = NR.world.groundY - 420; // dramatic entrance from above
      this.speed = 110; this.cd = 1.4;
      this.h = Math.max(this.h, 120); this.w = Math.max(this.w, 70);
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt; this.st += dt;
      this.facing = G.player.x > this.x ? 1 : -1;
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
        this.phase = 2;
        G.banner(`${this.bossName} — OVERDRIVE`, "phase two", this.def.col || "#ff2d95");
        NR.audio.play("roar"); G.shake(0.6);
        NR.vfx?.effect(this.x, this.y - this.h / 2, this.actorId + "phase", 140, "boss");
      }
      if (this.state === "intro") {
        this.y = U.damp(this.y, NR.world.groundY - (this.flying ? 140 : 0), 3.2, dt);
        if (this.st > 1.6) { this.state = "fight"; this.st = 0; G.shake(0.8); NR.audio.play("slam"); }
        this.drawIntro = true;
        return;
      }
      // fight: reuse SuperEnemy AI with boss speed/damage scaling
      const speedMul = this.phase === 2 ? 1.35 : 1;
      this.windupSpeed = speedMul;
      super.update(dt, G);
      this.dmg = 18 * (this.phase === 2 ? 1.2 : 1);
    }
    hurt(dmg, kx, ky, crit, G) {
      if (this.dead || this.state === "intro") return false;
      const before = this.hp;
      this.hp -= dmg;
      this.flash = 0.1;
      this.stunned = Math.min(this.stunned || 0, 0.12); // bosses resist stun
      F && NR.fx.sparks(this.x, this.y - this.h / 2, crit ? 12 : 6, crit ? "yellow" : "white");
      if (this.hp <= 0 && before > 0) { this.dieAsBoss(G); return true; }
      return false;
    }
    dieAsBoss(G) {
      if (this.dead) return;
      this.dead = true;
      NR.vfx?.effect(this.x, this.y - this.h / 2, this.actorId + "death", 150, "boss");
      G.onBossKilled(this);
    }
    draw(ctx) {
      super.draw(ctx);
      if (this.state === "intro") {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = this.def.col || "#ff2d95"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(this.x, this.y - this.h / 2, this.h * (1 + Math.sin(this.t * 8) * 0.06), 0, U.TAU); ctx.stroke();
        ctx.restore();
      }
    }
    };
    B.SuperBoss = _SuperBoss;
    return _SuperBoss;
  }
})();

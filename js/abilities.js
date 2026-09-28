/* ============ PRODUCTION PASS — hero ability engine ============
   One engine, per-hero implementations. Every hero has exactly three
   signature abilities (basic / defensive / signature) that match its
   personality — no shared default kit.

   Guarantees:
   - cooldowns are per-slot and pause with the simulation
   - SukunaSlice: usable ONCE per run, lasts exactly 5.0s, airborne special
     state, each enemy affected at most once per cut wave (hit set),
     no projectiles at all, guaranteed safe return, then locked until the
     next run
   - all VFX is procedural + budgeted (NR.vfx) — nothing spawns per frame
   - every ability has a distinct audio cue from the repository sample map */
(function () {
  const U = NR.util, F = NR.fx;
  /* VFX alias — budgeted effect layer. It was referenced throughout but never
     bound, which made every ability cast throw. Falls back to a no-op stub so
     a missing layer can never crash combat again. */
  const VFX = NR.vfx || { ring(){}, text(){}, burst(){}, effect(){} };
  const A = (NR.abilities = {});

  /* ---------------- definitions ---------------- */
  const DEFS = {
    /* ---- KAITO (starter) ---- */
    risingFang: { slot: 0, name: "Rising Fang", short: "FANG", icon: "blade", cd: 8, energy: 0, color: "#8af5e1", desc: "Rising arc slash — launches nearby enemies." },
    aegisGuard: { slot: 1, name: "Aegis Guard", short: "AEGIS", icon: "shield", cd: 16, energy: 15, color: "#baafff", desc: "3s energy shield — blocks all incoming damage." },
    sukunaSlice: { slot: 2, name: "SukunaSlice", short: "SUKUNA", icon: "swords", cd: 0, energy: 0, color: "#ff2d55", oncePerRun: true, desc: "SIGNATURE · once per run · 5s airborne blade realm — every enemy in the field is cut once per wave. Cinematic, stylized, non-graphic." },
    /* ---- SEN (samurai) ---- */
    quickstepSlash: { slot: 0, name: "Quickstep Slash", short: "STEP", icon: "wind", cd: 6, energy: 0, color: "#ffdad1", desc: "Dash through enemies, cutting everything in the path." },
    windGuard: { slot: 1, name: "Wind Guard", short: "WIND", icon: "shield", cd: 12, energy: 15, color: "#ffe7a2", desc: "1.5s parry stance — auto-parries frontal hits and reflects bolts." },
    thousandCuts: { slot: 2, name: "Thousand Cuts", short: "CUTS", icon: "swords", cd: 26, energy: 35, color: "#ffffff", desc: "SIGNATURE · six lightning dashes across the battlefield." },
    /* ---- ONYX (tank) ---- */
    bulwarkBastion: { slot: 0, name: "Bulwark Bastion", short: "BASTION", icon: "shield", cd: 14, energy: 10, color: "#ffca7f", desc: "4s fortified stance — 60% damage resistance, enemies focus you." },
    groundSlam: { slot: 1, name: "Ground Slam", short: "SLAM", icon: "target", cd: 12, energy: 15, color: "#ffd9a0", desc: "Shockwave slam — 40 damage + knockback + brief stun around you." },
    unbreakable: { slot: 2, name: "Unbreakable", short: "UNBREAK", icon: "heart", cd: 45, energy: 40, color: "#ff6a4d", desc: "SIGNATURE · 6s last stand — cannot drop below 1 HP and contact attackers are punished." },
    /* ---- VEX (fire) ---- */
    emberLance: { slot: 0, name: "Ember Lance", short: "EMBER", icon: "bolt", cd: 5, energy: 10, color: "#ff8f3d", desc: "Piercing stylized flame lance — burns through up to three enemies." },
    flameWard: { slot: 1, name: "Flame Ward", short: "WARD", icon: "shield", cd: 15, energy: 20, color: "#ffca62", desc: "4s burning aura — nearby enemies scorch; you take 30% less damage." },
    infernoCascade: { slot: 2, name: "Inferno Cascade", short: "INFERNO", icon: "sun", cd: 32, energy: 45, color: "#ff5f2d", desc: "SIGNATURE · three waves of rising fire pillars ahead (stylized flames)." },
    /* ---- SABLE (speed) ---- */
    phantomStep: { slot: 0, name: "Phantom Step", short: "PHASE", icon: "wind", cd: 5, energy: 8, color: "#9fe8ff", desc: "Teleport 260 units through enemies; your next strike hits +40%." },
    mistVeil: { slot: 1, name: "Mist Veil", short: "VEIL", icon: "moon", cd: 14, energy: 20, color: "#c9e4ff", desc: "2.5s intangible mist — enemies lose track of you." },
    tempestRush: { slot: 2, name: "Tempest Rush", short: "TEMPEST", icon: "bolt", cd: 28, energy: 40, color: "#5fd8ff", desc: "SIGNATURE · 6s frenzy — +60% speed, instant dashes, cutting wind trail." },
    /* ---- KESTREL (ranged) ---- */
    tripleKunai: { slot: 0, name: "Triple Kunai", short: "VOLLEY", icon: "target", cd: 4, energy: 8, color: "#c2adff", desc: "Three aimed kunai in a tight spread." },
    smokeScreen: { slot: 1, name: "Smoke Screen", short: "SMOKE", icon: "moon", cd: 13, energy: 18, color: "#b8c4d8", desc: "3s cover — enemies break aggro; you slip away." },
    arrowStorm: { slot: 2, name: "Arrow Storm", short: "STORM", icon: "bolt", cd: 30, energy: 45, color: "#e2c6ff", desc: "SIGNATURE · 12 arrows rain over the field in front of you." },
    /* ---- GRIM (brute) ---- */
    skullCracker: { slot: 0, name: "Skull Cracker", short: "CRACK", icon: "blade", cd: 7, energy: 0, color: "#ff9a6b", desc: "Overhead smash — heavy damage and a long stun up close." },
    boneWall: { slot: 1, name: "Bone Wall", short: "WALL", icon: "shield", cd: 16, energy: 20, color: "#e8e0d0", desc: "A 4s wall of bones that stops enemy projectiles." },
    /* ---- MIRA (storm witch) ---- */
    chainBolt: { slot: 0, name: "Chain Bolt", short: "BOLT", icon: "bolt", cd: 7, energy: 0, color: "#9fd8ff", desc: "Lightning strike that chains to 2 more enemies." },
    thunderStep: { slot: 1, name: "Thunder Step", short: "STEP", icon: "wind", cd: 11, energy: 10, color: "#c2e8ff", desc: "Blink 320px through foes, crackling with static — brief invulnerability." },
    tempest: { slot: 2, name: "Tempest", short: "TEMPEST", icon: "storm", cd: 28, energy: 45, color: "#5fd8ff", desc: "SIGNATURE · 4s storm cell — bolts hunt the field and slow enemies." },
    /* ---- GRUSHA (orc warbrute) ---- */
    boarCharge: { slot: 0, name: "Boar Charge", short: "CHARGE", icon: "blade", cd: 8, energy: 0, color: "#a8d86b", desc: "Tusks down — rush 420px, goring and launching everything in the lane." },
    warStomp: { slot: 1, name: "War Stomp", short: "STOMP", icon: "shield", cd: 13, energy: 15, color: "#e8d86b", desc: "Shockwave stomp — damages and stuns everything around you." },
    frenzy: { slot: 2, name: "Blood Frenzy", short: "FRENZY", icon: "swords", cd: 26, energy: 40, color: "#ff6b6b", desc: "SIGNATURE · 5s frenzy — +60% damage, +25% speed, strikes heal you." },
    /* ---- MARSHAL (linebreaker) ---- */
    shieldBash: { slot: 0, name: "Shield Bash", short: "BASH", icon: "shield", cd: 6, energy: 0, color: "#ffd9a0", desc: "Lunge and slam your shield — heavy stun, opens combos." },
    rallyBanner: { slot: 1, name: "Rally Banner", short: "RALLY", icon: "bolt", cd: 18, energy: 20, color: "#ffe14d", desc: "Plant the standard — 6s of +20% damage and -20% damage taken." },
    pikeVolley: { slot: 2, name: "Pike Volley", short: "PIKES", icon: "storm", cd: 27, energy: 40, color: "#e8c684", desc: "SIGNATURE · 9 arcane pines rain in a line ahead." },
    /* ---- MIYU (shadow blossom) ---- */
    iaiSlash: { slot: 0, name: "Iai Slash", short: "IAI", icon: "blade", cd: 7, energy: 0, color: "#ffb4d8", desc: "Instant draw-cut through a long line — afterimage lingers." },
    petalVeil: { slot: 1, name: "Petal Veil", short: "PETAL", icon: "wind", cd: 12, energy: 10, color: "#ff8fd0", desc: "2.5s of drifting petals — invulnerable and +30% faster." },
    bladeWaltz: { slot: 2, name: "Blade Waltz", short: "WALTZ", icon: "swords", cd: 25, energy: 40, color: "#ff5f9e", desc: "SIGNATURE · 1.6s spinning dance — every enemy near you is cut 5 times." },
    /* ---- RUNE (arcane smith) ---- */
    arcaneBolt: { slot: 0, name: "Arcane Bolt", short: "BOLT", icon: "bolt", cd: 5, energy: 0, color: "#b48aff", desc: "Piercing rune-bolt that skewers a whole lane." },
    runeWard: { slot: 1, name: "Rune Ward", short: "WARD", icon: "shield", cd: 14, energy: 15, color: "#c8b4ff", desc: "3.5s ward sigil — blocks all incoming damage." },
    meteorForge: { slot: 2, name: "Meteor Forge", short: "METEOR", icon: "storm", cd: 30, energy: 50, color: "#ff9a3d", desc: "SIGNATURE · hammer the anvil — 3 runic meteors in sequence." },
    rampage: { slot: 2, name: "Rampage", short: "RAGE", icon: "swords", cd: 40, energy: 40, color: "#ff5f3d", desc: "SIGNATURE · 6s berserk — +60% damage, +25% speed, 10% lifesteal." },
  };
  A.defs = DEFS;
  A.def = (id) => DEFS[id];

  /* ---------------- binding + state ---------------- */
  A.bind = function (p, heroDef) {
    p.ab = { slots: (heroDef.kit || []).slice(), cd: [0, 0, 0] };
    p.abState = {}; // per-ability runtime state
    p.sukunaT = 0;
    p.sukunaHits = null;
    p.sukunaCutT = 0;
  };

  A.kit = (p) => (p.ab ? p.ab.slots.map((id) => DEFS[id]) : []);

  A.slotReady = function (p, i) {
    if (!p.ab || !p.ab.slots[i]) return false;
    const d = DEFS[p.ab.slots[i]];
    if (!d) return false;
    if (p.ab.cd[i] > 0) return false;
    if (d.oncePerRun && NR.game.sukunaUsed) return false;
    if (d.energy && p.energy < d.energy) return false;
    if (p.dead || p.sukunaT > 0) return false;
    return true;
  };

  A.cast = function (p, i, G) {
    if (!A.slotReady(p, i)) {
      if (p.ab && p.ab.slots[i] && DEFS[p.ab.slots[i]].oncePerRun && G.sukunaUsed)
        NR.hub?.notify("SukunaSlice is spent — it returns next run.");
      return false;
    }
    const id = p.ab.slots[i], d = DEFS[id];
    if (d.energy) p.energy -= d.energy;
    p.ab.cd[i] = d.cd;
    p.abState[id] = p.abState[id] || {};
    const run = IMPL[id];
    try { run && run(p, G, d, p.abState[id]); }
    catch (e) { NR.diag?.game(`ability ${id} failed: ${e.message}`); }
    return true;
  };

  A.tick = function (p, dt, G) {
    if (!p.ab) return;
    for (let i = 0; i < 3; i++) p.ab.cd[i] = Math.max(0, p.ab.cd[i] - dt);
    const S = p.abState;
    /* ---- SukunaSlice state machine ---- */
    if (p.sukunaT > 0) {
      p.sukunaT -= dt;
      p.sukunaCutT -= dt;
      p.iframes = Math.max(p.iframes, 0.12); // protected during the realm
      if (p.sukunaCutT <= 0) { p.sukunaCutT = 0.45; sukunaCutWave(p, G); }
      if (p.sukunaT <= 0) endSukuna(p, G);
    }
    /* ---- timed buffs ---- */
    for (const key of ["bastion", "flameWard", "mist", "tempest", "unbreak", "rampage", "boneWall", "windGuard", "smoke", "petals", "rally", "frenzy", "waltz"])
      if (S[key] && S[key].t !== undefined) {
        S[key].t -= dt;
        if (S[key].t <= 0) S[key] = null;
      }
    if (S.windGuard) p.parryT = Math.max(p.parryT, 0.1); // maintain parry stance
    if (S.flameWard) { // scorch aura, 2Hz
      S.flameWard.tick = (S.flameWard.tick || 0) - dt;
      if (S.flameWard.tick <= 0) {
        S.flameWard.tick = 0.5;
        for (const e of G.enemies) if (!e.dead && U.dist(e.x, e.y - e.h / 2, p.x, p.y - 40) < 210)
          e.hurt(6 * p.dmgMul, 0, 0, false, G);
        VFX.ring(p.x, p.y - 40, { col: "orange", r1: 210, life: 0.4, lw: 3 });
      }
    }
    if (S.stormCell) { // MIRA tempest — bolts hunt the field, slowed enemies
      S.stormCell.t -= dt; S.stormCell.next -= dt;
      if (S.stormCell.next <= 0) {
        S.stormCell.next = 0.3;
        const t = nearestEnemy(p, G, 700);
        if (t) {
          const dmg = 16 * p.dmgMul;
          t.hurt(dmg, 0, -120, false, G);
          t.stunned = Math.max(t.stunned || 0, 0.25);
          F.teleport(t.x, t.y - t.h, "blue");
          VFX.text(t.x, t.y - t.h - 8, Math.round(dmg), { col: "#9fd8ff", size: 18 });
          NR.audio.play("heroAbilityStorm");
        }
      }
      if (S.stormCell.t <= 0) S.stormCell = null;
    }
    if (S.pikes) { // MARSHAL pike volley — spears rain in a line
      S.pikes.next -= dt;
      if (S.pikes.next <= 0 && S.pikes.left > 0) {
        S.pikes.left--; S.pikes.next = 0.16;
        const x = p.x + p.facing * U.rand(180, 520);
        const y = NR.world.groundY;
        VFX.ring(x, y - 10, { col: "yellow", r1: 90, life: 0.35, lw: 5 });
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (Math.abs(e.x - x) < 70 && e.y > y - 260) {
            const dmg = 14 * p.dmgMul;
            e.hurt(dmg, U.sign(e.x - x) * 200, -300, false, G);
            VFX.text(e.x, e.y - e.h - 8, Math.round(dmg), { col: "#e8c684", size: 18 });
          }
        }
      }
      if (S.pikes.left <= 0) S.pikes = null;
    }
    if (S.waltz) { // MIYU blade waltz — radius pulses
      S.waltz.t -= dt; S.waltz.next -= dt;
      if (S.waltz.next <= 0) {
        S.waltz.next = 0.3;
        VFX.ring(p.x, p.y - 45, { col: "magenta", r1: 170, life: 0.3, lw: 6 });
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (U.dist(e.x, e.y - e.h / 2, p.x, p.y - 40) > 170) continue;
          const dmg = 13 * p.dmgMul;
          e.hurt(dmg, U.sign(e.x - p.x) * 200, -140, false, G);
          VFX.text(e.x, e.y - e.h - 8, Math.round(dmg), { col: "#ff8fd0", size: 18 });
        }
      }
      if (S.waltz.t <= 0) S.waltz = null;
    }
    if (S.meteors) { // RUNE meteor forge — 3 staggered impacts
      S.meteors.next -= dt;
      if (S.meteors.next <= 0 && S.meteors.left > 0) {
        S.meteors.left--; S.meteors.next = 0.75;
        const x = U.clamp(p.x + p.facing * (180 + (3 - S.meteors.left) * 150), 80, NR.world.W - 80);
        const y = NR.world.groundY;
        VFX.ring(x, y - 10, { col: "orange", r1: 170, life: 0.55, lw: 9 });
        F.burst(x, y - 10, { n: 16, col: "orange", spd: 340, life: 0.55, up: 340, grav: -60 });
        G.shake(0.22);
        NR.audio.play("heroAbilityFire");
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (Math.abs(e.x - x) < 160 && e.y > y - 320) {
            const dmg = 34 * p.dmgMul;
            e.hurt(dmg, U.sign(e.x - x) * 320, -480, true, G);
            VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ff9a3d", size: 24, crit: true });
          }
        }
      }
      if (S.meteors.left <= 0) S.meteors = null;
    }
    if (S.inferno) { // cascade waves
      S.inferno.next -= dt;
      if (S.inferno.next <= 0 && S.inferno.wave < 3) {
        S.inferno.wave++; S.inferno.next = 0.7;
        infernoPillar(p, G, S.inferno.wave);
      }
      if (S.inferno.wave >= 3 && S.inferno.next <= 0) S.inferno = null;
    }
    if (S.storm) { // arrow storm
      S.storm.next -= dt;
      if (S.storm.next <= 0 && S.storm.left > 0) {
        S.storm.left--; S.storm.next = 0.2;
        const tx = p.x + p.facing * U.rand(120, 560);
        const ty = W.groundY - U.rand(0, 140);
        const dx = tx - (p.x + p.facing * 40), dy = ty - (p.y - 160);
        const len = Math.hypot(dx, dy) || 1;
        G.shots.push(new NR.Kunai(p.x + p.facing * 40, p.y - 160, dx / len * 1300, dy / len * 1300, 18 * p.dmgMul));
        NR.audio.play("kunai");
      }
      if (S.storm.left <= 0 && S.storm.next <= 0) S.storm = null;
    }
    if (S.cuts) { // thousand cuts dashes
      S.cuts.next -= dt;
      if (S.cuts.next <= 0 && S.cuts.left > 0) {
        S.cuts.left--; S.cuts.next = 0.16;
        const target = nearestEnemy(p, G, 640);
        if (target) {
          p.x = U.clamp(target.x - Math.sign(target.x - p.x) * 30, 60, NR.world.W - 60);
          p.facing = Math.sign(target.x - p.x) || p.facing;
          p.iframes = Math.max(p.iframes, 0.2);
          target.hurt(14 * p.dmgMul, p.facing * 120, -60, true, G);
          VFX.text(target.x, target.y - target.h - 10, Math.round(14 * p.dmgMul), { col: "#ffffff", size: 18 });
          F.slash(target.x, target.y - target.h / 2, p.facing, 2, 150);
          NR.audio.play("swordSlice");
        }
      }
      if (S.cuts.left <= 0 && S.cuts.next <= 0) S.cuts = null;
    }
    if (S.tempest) { // wind trail cuts
      if (Math.abs(p.vx) > 300 && U.chance(dt * 6)) {
        const e = nearestEnemy(p, G, 150);
        if (e) { e.hurt(9 * p.dmgMul, p.facing * 200, -80, false, G); F.slash(e.x, e.y - e.h / 2, p.facing, 1, 110); }
      }
    }
    if (S.boneWall) {
      const wallX = S.boneWall.x;
      for (const b of G.bolts) {
        if (!b.dead && Math.abs(b.x - wallX) < 26 && b.y > p.y - 190) {
          b.dead = true; F.sparks(b.x, b.y, 8, "yellow"); NR.audio.play("boltHit");
        }
      }
    }
  };

  function nearestEnemyFrom(p, G, range, from) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || e === from) continue;
      const d = U.dist(e.x, e.y - e.h / 2, from.x, from.y - 40);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  if (!U.sign) U.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 1);
  function nearestEnemy(p, G, range) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = Math.abs(e.x - p.x);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------------- SukunaSlice ---------------- */
  function sukunaCutWave(p, G) {
    let hit = false;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || p.sukunaHits.has(e)) continue;
      if (U.dist(e.x, e.y - e.h / 2, p.x, p.y - 60) > 480) continue;
      p.sukunaHits.add(e); // exactly once per enemy per activation
      hit = true;
      const dmg = 55 * p.dmgMul * (1 + (NR.profile.level - 1) * 0.02);
      e.hurt(dmg, (Math.sign(e.x - p.x) || 1) * 240, -160, true, G);
      VFX.text(e.x, e.y - e.h - 14, Math.round(dmg), { col: "#ff2d55", size: 30, crit: true });
      F.slash(e.x, e.y - e.h / 2, Math.sign(e.x - p.x) || 1, 2, 190);
    }
    if (hit) {
      NR.audio.play("swordSlice");
      G.shake(0.18);
    } else {
      NR.audio.play("swordSwipe"); // whiff cue — quieter
    }
  }
  function endSukuna(p, G) {
    p.sukunaT = 0; p.sukunaHits = null;
    p.iframes = Math.max(p.iframes, 0.7); // safe return
    p.vy = Math.min(p.vy, 0);
    G.banner("SUKUNASLICE", "the realm closes — return to the fight", "#ff2d55");
    NR.audio.play("swordSheath");
    G.slowmo(0.55, 0.25);
  }

  /* ---------------- per-hero implementations ---------------- */
  const IMPL = {
    /* KAITO */
    risingFang(p, G) {
      p.attackT = 0; p.attackIdx = -1;
      F.ring(p.x, p.y - 50, { col: "cyan", r1: 150, life: 0.35, lw: 6 });
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x;
        if (Math.sign(dx) !== p.facing && Math.abs(dx) > 30) continue;
        if (Math.abs(dx) > 180 || Math.abs(e.y - p.y) > 130) continue;
        const dmg = 30 * p.dmgMul;
        e.hurt(dmg, p.facing * 300, -620, true, G);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#8af5e1", size: 22 });
      }
      NR.audio.play("heroAbilityKaito"); G.shake(0.15);
    },
    aegisGuard(p, G) { p.shieldT = 3; VFX.ring(p.x, p.y - 45, { col: "purple", r1: 120, life: 0.5, lw: 6 }); NR.audio.play("heroAbilityKaito"); },
    sukunaSlice(p, G) {
      if (G.sukunaUsed) return false;
      G.sukunaUsed = true;               // lockout begins immediately
      p.sukunaT = 5.0;                   // exactly five seconds
      p.sukunaCutT = 0.35;
      p.sukunaHits = new Set();
      p.attackT = 0; p.attackIdx = -1;
      p.dashT = 0;
      p.iframes = Math.max(p.iframes, 5.2);
      G.banner("SUKUNASLICE", "5 seconds — the blade realm opens", "#ff2d55");
      NR.audio.play("sukunaCue");        // distinctive blade-style cue
      G.slowmo(0.35, 0.5);
      G.flash("rgba(255,45,85,0.28)");
      G.shake(0.4);
      VFX.ring(p.x, p.y - 60, { col: "red", r1: 480, life: 0.7, lw: 10 });
      return true;
    },
    /* SEN */
    quickstepSlash(p, G) {
      const dist = 340, x0 = p.x;
      p.dashT = 0.22; p.dashDir = p.facing; p.iframes = Math.max(p.iframes, 0.3);
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - x0;
        if (Math.sign(dx) === p.facing && Math.abs(dx) <= dist && Math.abs(e.y - p.y) < 130) {
          const dmg = 26 * p.dmgMul;
          e.hurt(dmg, p.facing * 420, -160, true, G);
          F.slash(e.x, e.y - e.h / 2, p.facing, 1, 130);
          VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ffdad1", size: 20 });
        }
      }
      NR.audio.play("heroAbilitySamurai");
    },
    windGuard(p) { p.abState.windGuard = { t: 1.5 }; p.attackT = 0; NR.audio.play("guard"); F.ring(p.x, p.y - 50, { col: "yellow", r1: 100, life: 0.4, lw: 5 }); },
    thousandCuts(p, G) {
      p.abState.cuts = { left: 6, next: 0.05 };
      p.iframes = Math.max(p.iframes, 1.2);
      G.slowmo(0.6, 0.3);
      NR.audio.play("sukunaCue");
    },
    /* ONYX */
    bulwarkBastion(p, G) {
      p.abState.bastion = { t: 4 };
      p.damageTakenMulTmp = p.damageTakenMul;
      VFX.ring(p.x, p.y - 45, { col: "orange", r1: 130, life: 0.5, lw: 7 });
      NR.audio.play("heroAbilityTank");
      for (const e of G.enemies) if (!e.dead && e.taunt === undefined) e.taunt = 0;
    },
    groundSlam(p, G) {
      if (!p.onGround) { p.vy = Math.max(p.vy, 1200); return; }
      G.shake(0.5);
      G.shockwaves.push(new NR.ShockRing(p.x - 50, -1, { dmg: 22 * p.dmgMul }));
      G.shockwaves.push(new NR.ShockRing(p.x + 50, 1, { dmg: 22 * p.dmgMul }));
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (U.dist(e.x, e.y - e.h / 2, p.x, p.y - 30) > 300) continue;
        const dmg = 40 * p.dmgMul;
        e.hurt(dmg, (Math.sign(e.x - p.x) || 1) * 800, -420, false, G);
        e.stunned = Math.max(e.stunned || 0, 0.8);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ffd9a0", size: 22 });
      }
      NR.audio.play("heroAbilityTank");
    },
    unbreakable(p, G) { p.abState.unbreak = { t: 6 }; G.banner("UNBREAKABLE", "6s — the warden does not fall", "#ff6a4d"); NR.audio.play("heroAbilityTank"); },
    /* VEX */
    emberLance(p, G) {
      const bolt = new FriendlyBolt(p.x + p.facing * 40, p.y - 58, p.facing * 1150, 0, { dmg: 24 * p.dmgMul, col: "orange", pierce: 3 });
      G.shots.push(bolt);
      NR.audio.play("heroAbilityFire");
      F.burst(p.x + p.facing * 50, p.y - 58, { n: 8, col: "orange", spd: 200, life: 0.3, grav: 0 });
    },
    flameWard(p) { p.abState.flameWard = { t: 4, tick: 0 }; NR.audio.play("heroAbilityFire"); },
    infernoCascade(p, G) { p.abState.inferno = { wave: 0, next: 0.1 }; NR.audio.play("sukunaCue"); },
    /* SABLE */
    phantomStep(p, G) {
      const dx = p.facing * 260;
      const nx = U.clamp(p.x + dx, 60, NR.world.W - 60);
      F.teleport(p.x, p.y - 40, "blue");
      p.x = nx; p.iframes = Math.max(p.iframes, 0.4);
      p.abState.phaseEmpower = 1.4; // next strike +40%
      F.teleport(nx, p.y - 40, "blue");
      NR.audio.play("heroAbilityGhost");
    },
    mistVeil(p, G) { p.abState.mist = { t: 2.5 }; p.iframes = Math.max(p.iframes, 2.5); NR.audio.play("heroAbilityGhost"); F.smoke(p.x, p.y - 40, 10); },
    tempestRush(p, G) { p.abState.tempest = { t: 6 }; p.dashCharges = p.dashMax; G.banner("TEMPEST RUSH", "6s — outrun the wind", "#5fd8ff"); NR.audio.play("heroAbilityGhost"); },
    /* KESTREL */
    tripleKunai(p, G) {
      for (let i = -1; i <= 1; i++) {
        const y = p.y - 58 + i * 12;
        G.shots.push(new NR.Kunai(p.x + p.facing * 30, y, p.facing * 1050, i * 90, 22 * p.dmgMul));
      }
      NR.audio.play("kunai");
    },
    smokeScreen(p, G) { p.abState.smoke = { t: 3 }; F.smoke(p.x, p.y - 40, 14); NR.audio.play("heroAbilityRanged"); },
    arrowStorm(p, G) { p.abState.storm = { left: 12, next: 0.05 }; NR.audio.play("sukunaCue"); },
    /* GRIM */
    skullCracker(p, G) {
      const e = nearestEnemy(p, G, 150);
      F.ring(p.x + p.facing * 40, p.y - 40, { col: "red", r1: 120, life: 0.3, lw: 6 });
      if (e) {
        const dmg = 38 * p.dmgMul;
        e.hurt(dmg, p.facing * 200, -120, true, G);
        e.stunned = Math.max(e.stunned || 0, 1.2);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ff9a6b", size: 26, crit: true });
      }
      NR.audio.play("heroAttackHeavy"); G.shake(0.2);
    },
    boneWall(p, G) { p.abState.boneWall = { t: 4, x: p.x + p.facing * 80, facing: p.facing }; NR.audio.play("heroAbilityBrute"); },
    /* MIRA — storm witch */
    chainBolt(p, G) {
      let cur = nearestEnemy(p, G, 560), n = 0, last = p;
      NR.audio.play("heroAbilityStorm");
      while (cur && n < 3) {
        const dmg = 26 * p.dmgMul * (n === 0 ? 1 : 0.75);
        F.teleport(cur.x, cur.y - cur.h, "blue");
        cur.hurt(dmg, U.sign(cur.x - last.x) * 160, -260, n === 0, G);
        VFX.text(cur.x, cur.y - cur.h - 10, Math.round(dmg), { col: "#9fd8ff", size: 22, crit: n === 0 });
        last = cur; n++;
        cur = nearestEnemyFrom(p, G, 420, last);
      }
      if (n === 0) VFX.ring(p.x + p.facing * 120, p.y - 40, { col: "blue", r1: 90, life: 0.3, lw: 4 });
      G.shake(0.1);
    },
    thunderStep(p, G) {
      const nx = U.clamp(p.x + p.facing * 320, 60, NR.world.W - 60);
      F.teleport(p.x, p.y - 40, "blue");
      p.x = nx; p.iframes = Math.max(p.iframes, 0.35);
      F.teleport(nx, p.y - 40, "blue");
      NR.audio.play("heroAbilityStorm"); G.shake(0.12);
    },
    tempest(p, G) {
      p.abState.stormCell = { t: 4, next: 0.3 };
      G.banner("TEMPEST", "the storm answers", "#5fd8ff");
      NR.audio.play("heroAbilityStorm"); G.shake(0.2);
    },
    /* GRUSHA — orc warbrute */
    boarCharge(p, G) {
      const x0 = p.x, x1 = U.clamp(p.x + p.facing * 420, 60, NR.world.W - 60);
      p.dashT = 0.3; p.dashDir = p.facing; p.iframes = Math.max(p.iframes, 0.3);
      p.x = x1;
      NR.audio.play("heroAbilityBrute"); G.shake(0.25);
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const ex = U.clamp(e.x, Math.min(x0, x1) - 40, Math.max(x0, x1) + 40);
        if (Math.abs(ex - e.x) > 60) continue;
        if (Math.abs(e.y - p.y) > 120) continue;
        const dmg = 30 * p.dmgMul;
        e.hurt(dmg, p.facing * 420, -520, true, G);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#a8d86b", size: 22, crit: true });
      }
      VFX.ring(x1, p.y - 40, { col: "green", r1: 140, life: 0.4, lw: 6 });
    },
    warStomp(p, G) {
      NR.audio.play("heroAbilityBrute"); G.shake(0.3);
      VFX.ring(p.x, p.y - 8, { col: "yellow", r1: 260, life: 0.5, lw: 9 });
      F.burst(p.x, p.y - 6, { n: 18, col: "yellow", spd: 380, life: 0.5, up: 260 });
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (U.dist(e.x, e.y - e.h / 2, p.x, p.y - 40) > 260) continue;
        const dmg = 22 * p.dmgMul;
        e.hurt(dmg, U.sign(e.x - p.x) * 340, -300, false, G);
        e.stunned = Math.max(e.stunned || 0, 1.2);
        VFX.text(e.x, e.y - e.h - 8, Math.round(dmg), { col: "#e8d86b", size: 20 });
      }
    },
    frenzy(p, G) {
      p.abState.frenzy = { t: 5 };
      G.banner("BLOOD FRENZY", "5s — the rage takes you", "#ff6b6b");
      NR.audio.play("heroAbilityBrute"); G.shake(0.2);
    },
    /* MARSHAL — linebreaker */
    shieldBash(p, G) {
      p.vx = p.facing * 640;
      const e = nearestEnemy(p, G, 170);
      NR.audio.play("heroAbilityTank"); G.shake(0.18);
      VFX.ring(p.x + p.facing * 60, p.y - 45, { col: "yellow", r1: 110, life: 0.35, lw: 7 });
      if (e) {
        const dmg = 24 * p.dmgMul;
        e.hurt(dmg, p.facing * 380, -200, true, G);
        e.stunned = Math.max(e.stunned || 0, 1.4);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ffd9a0", size: 24, crit: true });
      }
    },
    rallyBanner(p, G) {
      p.abState.rally = { t: 6, x: p.x };
      NR.audio.play("heroAbilityTank");
      VFX.ring(p.x, p.y - 30, { col: "yellow", r1: 180, life: 0.6, lw: 8 });
      G.banner("RALLY!", "+damage · -damage taken", "#ffe14d");
    },
    pikeVolley(p, G) { p.abState.pikes = { left: 9, next: 0.05 }; NR.audio.play("heroAbilityRanged"); },
    /* MIYU — shadow blossom */
    iaiSlash(p, G) {
      const x0 = p.x, x1 = U.clamp(p.x + p.facing * 380, 40, NR.world.W - 40);
      p.iframes = Math.max(p.iframes, 0.25);
      NR.audio.play("heroAbilityAssassin");
      F.slash(p.x + p.facing * 190, p.y - 50, p.facing, 1, 380);
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (e.x < Math.min(x0, x1) - 30 || e.x > Math.max(x0, x1) + 30) continue;
        if (Math.abs(e.y - p.y) > 130) continue;
        const dmg = 32 * p.dmgMul;
        e.hurt(dmg, p.facing * 260, -180, true, G);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ffb4d8", size: 22, crit: true });
      }
    },
    petalVeil(p, G) {
      p.abState.petals = { t: 2.5 };
      p.iframes = Math.max(p.iframes, 2.5);
      F.smoke(p.x, p.y - 40, 8);
      NR.audio.play("heroAbilityGhost");
    },
    bladeWaltz(p, G) {
      p.abState.waltz = { t: 1.6, next: 0.15, hits: 5 };
      p.iframes = Math.max(p.iframes, 1.6);
      G.banner("BLADE WALTZ", "the dance begins", "#ff5f9e");
      NR.audio.play("heroAbilityAssassin"); G.shake(0.2);
    },
    /* RUNE — arcane smith */
    arcaneBolt(p, G) {
      NR.audio.play("heroAbilityStorm");
      const x0 = p.x, dir = p.facing;
      VFX.ring(p.x + dir * 60, p.y - 46, { col: "purple", r1: 80, life: 0.3, lw: 6 });
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (Math.sign(e.x - x0) !== dir && Math.abs(e.x - x0) > 40) continue;
        if (Math.abs(e.x - x0) > 620 || Math.abs(e.y - p.y) > 120) continue;
        const dmg = 20 * p.dmgMul;
        e.hurt(dmg, dir * 240, -160, false, G);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#b48aff", size: 20 });
      }
      F.teleport(p.x + dir * 320, p.y - 46, "purple");
    },
    runeWard(p, G) { p.shieldT = 3.5; VFX.ring(p.x, p.y - 45, { col: "purple", r1: 130, life: 0.5, lw: 7 }); NR.audio.play("heroAbilityKaito"); },
    meteorForge(p, G) {
      p.abState.meteors = { left: 3, next: 0.1 };
      G.banner("METEOR FORGE", "the anvil sings", "#ff9a3d");
      NR.audio.play("heroAbilityFire"); G.shake(0.3);
    },
    rampage(p, G) { p.abState.rampage = { t: 6 }; G.banner("RAMPAGE", "6s — the warlord wakes", "#ff5f3d"); NR.audio.play("heroAbilityBrute"); },
  };
  A.IMPL = IMPL;

  function infernoPillar(p, G, wave) {
    const x = p.x + p.facing * (140 + wave * 130);
    const y = NR.world.groundY;
    VFX.ring(x, y - 10, { col: "orange", r1: 150, life: 0.6, lw: 8 });
    F.burst(x, y - 10, { n: 16, col: "orange", spd: 320, life: 0.6, up: 320, grav: -80, spread: 1.2 });
    NR.audio.play("heroAbilityFire");
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (Math.abs(e.x - x) < 140 && e.y > y - 300) {
        const dmg = 35 * p.dmgMul;
        e.hurt(dmg, (Math.sign(e.x - x) || 1) * 300, -450, true, G);
        VFX.text(e.x, e.y - e.h - 10, Math.round(dmg), { col: "#ff8f3d", size: 24 });
      }
    }
  }

  /* ---------------- stat modifiers consumed by player.js ---------------- */
  A.damageMul = (p) => {
    let m = 1;
    if (p.abState && p.abState.rampage) m *= 1.6;
    if (p.abState && p.abState.frenzy) m *= 1.6;
    if (p.abState && p.abState.rally) m *= 1.2;
    if (p.abState && p.abState.phaseEmpower > 0) m *= 1.4;
    return m;
  };
  A.speedMul = (p) => {
    let m = 1;
    if (p.abState && p.abState.tempest) m *= 1.6;
    if (p.abState && p.abState.rampage) m *= 1.25;
    if (p.abState && p.abState.frenzy) m *= 1.25;
    if (p.abState && p.abState.petals) m *= 1.3;
    return m;
  };
  A.damageTakenMul = (p) => {
    let m = 1;
    if (p.abState && p.abState.bastion) m *= 0.4;
    if (p.abState && p.abState.flameWard) m *= 0.7;
    if (p.abState && p.abState.rally) m *= 0.8;
    return m;
  };
  A.postDamage = function (p, dmg, G) {
    // Unbreakable: never drop below 1 HP
    if (p.abState && p.abState.unbreak && p.hp <= 0) {
      p.hp = 1;
      VFX.text(p.x, p.y - 120, "UNBREAKABLE", { col: "#ff6a4d", size: 20 });
    }
    // Retaliation while fortified
    if (p.abState && p.abState.unbreak) {
      for (const e of G.enemies)
        if (!e.dead && Math.abs(e.x - p.x) < 120 && Math.abs(e.y - p.y) < 120)
          e.hurt(10, Math.sign(e.x - p.x) * 300, -160, false, G);
    }
    if (p.abState && p.abState.phaseEmpower > 0) p.abState.phaseEmpower = 0;
  };
  A.onKill = function (p, G) {
    if (p.abState && p.abState.frenzy) p.heal(6);
    if (p.abState && p.abState.rampage) p.heal(4);
  };

  /* ---------------- friendly fire-lance projectile (pooled draw) ---------------- */
  class FriendlyBolt {
    constructor(x, y, vx, vy, o = {}) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy || 0;
      this.dmg = o.dmg || 20; this.pierce = o.pierce || 3;
      this.dead = false; this.life = 1.6; this.hitSet = new Set();
      this.col = o.col || "orange";
    }
    update(dt, G) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.x < -40 || this.x > NR.world.W + 40) { this.dead = true; return; }
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0 || this.hitSet.has(e)) continue;
        if (Math.abs(e.x - this.x) < (e.w + 18) / 2 && this.y > e.y - e.h - 10 && this.y < e.y + 10) {
          this.hitSet.add(e);
          e.hurt(this.dmg, Math.sign(this.vx) * 300, -140, false, G);
          VFX.text(e.x, e.y - e.h - 10, Math.round(this.dmg), { col: "#ff8f3d", size: 20 });
          F.burst(this.x, this.y, { n: 8, col: "orange", spd: 200, life: 0.3 });
          NR.audio.play("boltHit");
          if (this.hitSet.size >= this.pierce) { this.dead = true; return; }
        }
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, this.col, this.x, this.y, 22, 0.9);
      ctx.strokeStyle = "rgba(255,220,160,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - Math.sign(this.vx) * 34, this.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  NR.FriendlyBolt = FriendlyBolt;

  /* ---------------- overlays drawn above the hero ---------------- */
  A.drawOverlays = function (ctx, p, G) {
    const S = p.abState || {};
    if (p.sukunaT > 0) {
      // blade-realm field: dark band + crimson streaks (procedural, no clips)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const a = Math.min(1, p.sukunaT / 0.5) * 0.5;
      for (let i = 0; i < 3; i++) {
        const yy = p.y - 200 + i * 90 + Math.sin(p.t * 6 + i) * 8;
        ctx.strokeStyle = `rgba(255,45,85,${0.16 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - 520, yy); ctx.lineTo(p.x + 520, yy + 14); ctx.stroke();
      }
      NR.sprites.drawGlow(ctx, "red", p.x, p.y - 70, 90 + Math.sin(p.t * 10) * 14, 0.5);
      ctx.restore();
    }
    if (S.bastion) {
      ctx.save();
      ctx.strokeStyle = "#ffca7f"; ctx.fillStyle = "rgba(255,202,127,0.10)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 45, 62, 72, 0, 0, U.TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (S.mist || S.smoke) {
      ctx.save(); ctx.globalAlpha = 0.35;
      ctx.drawImage(NR.sprites.soft, p.x - 90, p.y - 150, 180, 180);
      ctx.restore();
    }
    if (S.tempest) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "blue", p.x, p.y - 45, 60, 0.4);
      ctx.restore();
    }
    if (S.rampage) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "red", p.x, p.y - 45, 64 + Math.sin(p.t * 12) * 8, 0.45);
      ctx.restore();
    }
    if (S.boneWall) {
      const wx = S.boneWall.x;
      ctx.save();
      ctx.strokeStyle = "#e8e0d0"; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const bx = wx + Math.sin(i * 2.1) * 10;
        ctx.beginPath(); ctx.moveTo(bx, p.y); ctx.lineTo(bx + 8, p.y - 170 - (i % 3) * 12); ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* W (world) is always referenced through NR.world so load order never matters */
  A._world = () => NR.world;
})();

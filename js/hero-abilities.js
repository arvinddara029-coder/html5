/* ============ HERO ABILITIES — 3 personality skills per hero + summons ============
   Keys U · I · O (touch: the three round buttons above the controls).
   Every hero has three different abilities that match who they are:
   the forged starter protects & burns, the samurai dashes and cuts, the
   soldier holds the line, the gunner shoots… Plus T = summon the monster
   ally you equipped in the VAULT.
   Ability entities (shots, strikes, allies, beams) are plain objects so the
   online module can send them to partners as-is. */
(function () {
  const U = NR.util, F = NR.fx, I = NR.input, G = NR.game, W = NR.world;
  const HA = (NR.abilities = { shots: [], strikes: [], allies: [], beams: [] });

  /* kind + params. dmg values are base damage (×hero/level damage) */
  const D = (id, name, ico, cd, kind, desc, o) => ({ id, name, ico, cd, kind, desc, ...o });
  HA.DEFS = {
    kaito: [
      D("aegis", "AEGIS GUARD", "🛡", 9, "shield", "A forged barrier blocks every hit for 4s.", { dur: 4, col: "cyan" }),
      D("flamewave", "FLAME WAVE", "🔥", 11, "nova", "A ring of fire burns everything around you.", { r: 280, dmg: 42, col: "orange", burn: 3 }),
      D("forgeblades", "FORGE BLADES", "⚔", 16, "rain", "Six glowing blades rain on the enemies ahead.", { n: 6, dmg: 34, r: 90, col: "cyan" }),
    ],
    ryu: [
      D("shadowdash", "SHADOW DASH", "💨", 6, "dash", "Blink forward through enemies, cutting all of them.", { dist: 380, dmg: 55, col: "red" }),
      D("iai", "IAI FLURRY", "🗡", 12, "buff", "Samurai focus: +60% damage and +25% speed for 5s.", { dur: 5, dmgK: 1.6, spdK: 1.25, col: "red" }),
      D("windcutter", "WIND CUTTER", "🌙", 9, "bolt", "A crescent slash that flies through every enemy.", { n: 1, speed: 1100, dmg: 60, pierce: 99, col: "white", size: 38 }),
    ],
    brann: [
      D("shieldwall", "SHIELD WALL", "🛡", 11, "shield", "Raise the iron shield: immune to hits for 5s.", { dur: 5, col: "blue" }),
      D("warcry", "WAR CRY", "📯", 14, "buff", "Rally: +40% damage, +20% speed and heal 15%.", { dur: 6, dmgK: 1.4, spdK: 1.2, heal: 0.15, col: "yellow" }),
      D("volley", "SPEAR VOLLEY", "🏹", 15, "rain", "Call eight spears down on the battlefield.", { n: 8, dmg: 30, r: 80, col: "yellow" }),
    ],
    holly: [
      D("quake", "EARTHQUAKE", "🌋", 10, "slam", "Leap and smash the ground: a huge shockwave.", { r: 330, dmg: 70, col: "green" }),
      D("hammertoss", "HAMMER TOSS", "🔨", 8, "bolt", "Throw a heavy hammer that crushes a whole line.", { n: 1, speed: 800, dmg: 65, pierce: 6, col: "green", size: 34 }),
      D("ironskin", "IRON SKIN", "🪨", 16, "shield", "Stone skin for 3s and heal 20% health.", { dur: 3, heal: 0.2, col: "green" }),
    ],
    gordon: [
      D("thunderchain", "THUNDER CHAIN", "⚡", 8, "chain", "Lightning jumps between up to 5 enemies.", { n: 5, dmg: 48, range: 520, col: "yellow" }),
      D("stormdash", "STORM DASH", "🌩", 7, "dash", "Ride the lightning forward, shocking everything.", { dist: 340, dmg: 44, col: "yellow" }),
      D("tempest", "TEMPEST", "🌀", 17, "nova", "A storm explodes around you and stuns enemies.", { r: 380, dmg: 58, col: "yellow", stun: 1.2 }),
    ],
    diego: [
      D("rapidfire", "RAPID FIRE", "🔫", 6, "bolt", "Six quick shots in a fan.", { n: 6, spread: 0.28, speed: 1300, dmg: 18, pierce: 1, col: "orange", size: 12 }),
      D("grenade", "GRENADE", "💣", 10, "bolt", "A grenade that explodes into fire.", { n: 1, speed: 700, dmg: 30, pierce: 1, col: "orange", size: 18, explode: 210, arc: true }),
      D("smokeroll", "SMOKE ROLL", "🌫", 13, "dash", "Roll away in smoke: slows time around enemies for 2s.", { dist: 260, dmg: 0, col: "white", chrono: 2 }),
    ],
    elara: [
      D("skyleap", "SKY LEAP", "🪽", 8, "slam", "Jump to the sky and dive onto the enemies.", { r: 260, dmg: 60, col: "magenta", leap: 1100 }),
      D("bladedance", "BLADE DANCE", "💃", 13, "buff", "Graceful fury: +50% speed and +30% damage for 6s.", { dur: 6, dmgK: 1.3, spdK: 1.5, col: "magenta" }),
      D("heavenlight", "HEAVEN'S LIGHT", "✨", 18, "nova", "Holy light heals you 30% and burns nearby foes.", { r: 240, dmg: 36, col: "white", heal: 0.3 }),
    ],
    mordred: [
      D("darkaegis", "DARK AEGIS", "🖤", 12, "shield", "Dark armour: immune for 6s.", { dur: 6, col: "purple" }),
      D("soulreap", "SOUL REAP", "💀", 10, "pull", "Drag enemies in and drain their life.", { r: 420, dmg: 40, col: "purple", drain: 0.5 }),
      D("doomslam", "DOOM SLAM", "⚰", 17, "slam", "A terrible slam that shakes the whole screen.", { r: 400, dmg: 95, col: "purple" }),
    ],
    ash: [
      D("vinesnare", "VINE SNARE", "🌿", 9, "chrono", "Vines slow every enemy for 3s and sting them.", { dur: 3, r: 420, dmg: 24, col: "green" }),
      D("blessing", "NATURE'S BLESSING", "🍃", 15, "heal", "Heal 35% health over 5 seconds.", { pct: 0.35, over: 5, col: "green" }),
      D("spiritwolf", "SPIRIT WOLF", "🐺", 20, "summon", "A spirit wolf fights at your side for 10s.", { dur: 10, dmg: 22, col: "green" }),
    ],
    vega: [
      D("plasma", "PLASMA CANNON", "🔵", 9, "bolt", "A big plasma ball that explodes on impact.", { n: 1, speed: 900, dmg: 55, pierce: 1, col: "cyan", size: 30, explode: 190 }),
      D("energyshield", "ENERGY SHIELD", "🔰", 12, "shield", "Energy shield for 5s and refill 40 energy.", { dur: 5, energy: 40, col: "cyan" }),
      D("orbital", "ORBITAL STRIKE", "🛰", 18, "rain", "Satellite lasers hit five spots ahead.", { n: 5, dmg: 60, r: 120, col: "cyan" }),
    ],
    nix: [
      D("quickjab", "QUICK JAB", "👊", 5, "dash", "A lightning-fast jab that stuns.", { dist: 190, dmg: 38, col: "magenta", stun: 0.9 }),
      D("deduction", "DEDUCTION", "🔍", 13, "buff", "See every weak spot: +40% crit chance for 6s.", { dur: 6, crit: 0.4, col: "magenta" }),
      D("decoy", "SMOKE DECOY", "🎭", 16, "summon", "A holographic double distracts and hits enemies for 8s.", { dur: 8, dmg: 16, col: "magenta", ghost: true }),
    ],
  };
  HA.forHero = (id) => HA.DEFS[id] || HA.DEFS.kaito;
  HA.forPlayer = (p) => HA.forHero((p && p.heroId) || (NR.heroes && NR.heroes.current().id) || "kaito");

  /* ---------------- per-player state ---------------- */
  function st(p) {
    if (!p.hab) p.hab = { cd: [0, 0, 0], buff: null, regen: null, slam: null, summonCd: 0 };
    return p.hab;
  }
  HA.reset = function (p) { if (p) p.hab = null; st(p); };
  HA.cooldown = (p, i) => st(p).cd[i] || 0;

  /* ---------------- targets (enemies + PvP opponents) ---------------- */
  HA.targets = function (p) {
    const out = G.enemies.filter((e) => !e.dead && !(e.spawnT > 0));
    if (G.pvp && HA.pvpTargets) out.push(...HA.pvpTargets(p));
    return out;
  };
  const power = (p) => (p.dmgMul || 1) * (p.overdriveT > 0 ? 1.5 : 1);
  HA.damage = function (p, e, base, kx, ky, col) {
    if (!e || e.dead) return 0;
    const crit = Math.random() < (p.critCh || 0.05);
    const dmg = base * power(p) * (crit ? 2 : 1);
    const before = e.hp;
    const keep = G.player;
    G.player = p;
    try { e.hurt(dmg, kx || 0, ky || 0, crit, G); } finally { G.player = keep; }
    if (e.hp < before) {
      F.text(e.x, e.y - (e.h || 60) - 12, Math.round(dmg), { col: crit ? "#ffe14d" : "#ffd0ff", size: crit ? 28 : 20, crit });
      F.sparks(e.x, e.y - (e.h || 60) / 2, 6, col || "white");
      if (p.lifesteal > 0) p.heal(dmg * p.lifesteal);
    }
    return dmg;
  };
  const center = (e) => ({ x: e.x, y: e.y - (e.h || 60) / 2 });

  /* ---------------- casting ---------------- */
  HA.tryCast = function (p, i) {
    if (!p || p.dead || G.state !== "playing") return false;
    const def = HA.forPlayer(p)[i];
    if (!def) return false;
    const s = st(p);
    if (s.cd[i] > 0) { if (p === (G.me || G.player)) NR.hub?.notify?.(`${def.name} · ${Math.ceil(s.cd[i])}s`); return false; }
    s.cd[i] = def.cd;
    HA.cast(p, def);
    return true;
  };
  HA.cast = function (p, def) {
    const k = HA.KINDS[def.kind];
    if (!k) return;
    const keep = G.player;
    G.player = p;
    try { k(p, def); } finally { G.player = keep; }
    F.text(p.x, p.y - 150, def.name, { col: "#fff4b0", size: 20 });
    NR.audio.play(def.kind === "shield" ? "powerUp" : def.kind === "bolt" ? "shot" : def.kind === "heal" ? "upgrade" : "swing3");
  };

  HA.KINDS = {
    shield(p, d) {
      p.shieldT = Math.max(p.shieldT || 0, d.dur);
      if (d.heal) p.heal(p.maxHp * d.heal);
      if (d.energy) p.addEnergy(d.energy);
      F.ring(p.x, p.y - 45, { col: d.col, r1: 130, life: 0.5, lw: 8 });
      F.burst(p.x, p.y - 45, { n: 24, col: d.col, spd: 300, life: 0.5 });
    },
    nova(p, d) {
      const cx = p.x, cy = p.y - 45;
      F.ring(cx, cy, { col: d.col, r1: d.r, life: 0.5, lw: 12 });
      F.burst(cx, cy, { n: 50, col: d.col, spd: d.r * 1.6, life: 0.6 });
      if (d.heal) { p.heal(p.maxHp * d.heal); F.text(p.x, p.y - 120, "+" + Math.round(p.maxHp * d.heal), { col: "#9dffb4", size: 22 }); }
      for (const e of HA.targets(p)) {
        const c = center(e);
        if (Math.hypot(c.x - cx, c.y - cy) > d.r) continue;
        const dir = Math.sign(e.x - p.x) || 1;
        HA.damage(p, e, d.dmg, dir * 520, -260, d.col);
        if (d.burn && !e.boss) e._burn = { t: d.burn, dps: d.dmg * 0.25 * power(p), owner: p };
        if (d.stun && !e.boss) e.stunned = Math.max(e.stunned || 0, d.stun);
      }
      G.shake(0.3);
    },
    dash(p, d) {
      const from = p.x;
      const to = U.clamp(p.x + p.facing * d.dist, 40, W.W - 40);
      p.x = to; p.vx = p.facing * 200; p.iframes = Math.max(p.iframes || 0, 0.45);
      const lo = Math.min(from, to), hi = Math.max(from, to);
      for (let i = 0; i <= 8; i++) F.burst(from + (to - from) * i / 8, p.y - 45, { n: 3, col: d.col, spd: 120, life: 0.35 });
      HA.beams.push({ x1: from, y1: p.y - 45, x2: to, y2: p.y - 45, t: 0, life: 0.25, col: d.col, w: 10 });
      if (d.chrono) G.chronoT = Math.max(G.chronoT || 0, d.chrono);
      if (!d.dmg) return;
      for (const e of HA.targets(p)) {
        if (e.x < lo - 30 || e.x > hi + 30 || Math.abs(center(e).y - (p.y - 45)) > 120) continue;
        HA.damage(p, e, d.dmg, p.facing * 300, -200, d.col);
        if (d.stun && !e.boss) e.stunned = Math.max(e.stunned || 0, d.stun);
      }
      G.hitStop(0.05);
    },
    bolt(p, d) {
      const n = d.n || 1;
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? -d.spread / 2 + (d.spread * i) / (n - 1) : 0;
        HA.shots.push({ x: p.x + p.facing * 30, y: p.y - 50, vx: Math.cos(a) * d.speed * p.facing, vy: Math.sin(a) * d.speed + (d.arc ? -520 : 0),
          dmg: d.dmg * power(p), pierce: d.pierce || 1, col: d.col, size: d.size || 16, explode: d.explode || 0, arc: !!d.arc, t: 0, owner: HA.idOf(p), hit: [] });
      }
    },
    rain(p, d) {
      for (let i = 0; i < d.n; i++) {
        const x = U.clamp(p.x + p.facing * (120 + i * (620 / d.n)) + U.rand(-30, 30), 40, W.W - 40);
        HA.strikes.push({ x, y: W.groundY, delay: 0.15 + i * 0.09, t: 0, dmg: d.dmg * power(p), r: d.r, col: d.col, owner: HA.idOf(p), done: false });
      }
    },
    heal(p, d) {
      st(p).regen = { t: d.over, rate: (p.maxHp * d.pct) / d.over };
      F.ring(p.x, p.y - 45, { col: d.col, r1: 110, life: 0.6, lw: 6 });
    },
    buff(p, d) {
      const s = st(p);
      if (s.buff) endBuff(p);
      s.buff = { t: d.dur, dmgK: d.dmgK || 1, spdK: d.spdK || 1, crit: d.crit || 0, col: d.col };
      p.dmgMul *= s.buff.dmgK; p.speedMul *= s.buff.spdK; p.critCh += s.buff.crit;
      if (d.heal) p.heal(p.maxHp * d.heal);
      F.ring(p.x, p.y - 45, { col: d.col, r1: 150, life: 0.5, lw: 8 });
    },
    slam(p, d) {
      p.vy = -(d.leap || 850); p.onGround = false;
      st(p).slam = { t: 0, r: d.r, dmg: d.dmg, col: d.col };
      p.iframes = Math.max(p.iframes || 0, 0.8);
    },
    chrono(p, d) {
      G.chronoT = Math.max(G.chronoT || 0, d.dur);
      F.ring(p.x, p.y - 45, { col: d.col, r1: d.r, life: 0.7, lw: 6 });
      for (const e of HA.targets(p)) if (Math.hypot(e.x - p.x, e.y - p.y) < d.r) HA.damage(p, e, d.dmg, 0, 0, d.col);
    },
    pull(p, d) {
      F.ring(p.x, p.y - 45, { col: d.col, r0: d.r, r1: 20, life: 0.5, lw: 8 });
      let drained = 0;
      for (const e of HA.targets(p)) {
        if (Math.hypot(e.x - p.x, e.y - p.y) > d.r) continue;
        if (!e.boss && !e.isPlayer) e.x += (p.x + p.facing * 60 - e.x) * 0.7;
        drained += HA.damage(p, e, d.dmg, 0, -120, d.col);
      }
      if (drained && d.drain) { p.heal(drained * d.drain); F.text(p.x, p.y - 120, "+" + Math.round(drained * d.drain), { col: "#9dffb4", size: 20 }); }
    },
    chain(p, d) {
      let from = { x: p.x, y: p.y - 50 };
      const pool = HA.targets(p).slice(), hit = [];
      for (let i = 0; i < d.n; i++) {
        let best = null, bd = d.range;
        for (const e of pool) { if (hit.includes(e)) continue; const c = center(e), dd = Math.hypot(c.x - from.x, c.y - from.y); if (dd < bd) { bd = dd; best = e; } }
        if (!best) break;
        hit.push(best);
        const c = center(best);
        HA.beams.push({ x1: from.x, y1: from.y, x2: c.x, y2: c.y, t: 0, life: 0.3, col: d.col, w: 5, zig: 1 });
        HA.damage(p, best, d.dmg * (1 - i * 0.1), 0, -80, d.col);
        from = c;
      }
      if (!hit.length) F.text(p.x, p.y - 120, "NO TARGET", { col: "#aab", size: 16 });
    },
    summon(p, d) {
      HA.allies.push({ x: p.x - p.facing * 60, y: p.y, vx: 0, facing: p.facing, t: 0, life: d.dur, dmg: d.dmg * power(p), atk: 0, col: d.col,
        owner: HA.idOf(p), hero: d.ghost ? p.heroId || "kaito" : "", actor: d.actor || "", wolf: !d.ghost && !d.actor, h: d.h || 70, swing: 0 });
      F.teleport(p.x - p.facing * 60, p.y - 40, d.col === "green" ? "cyan" : "purple");
    },
  };
  function endBuff(p) {
    const b = st(p).buff;
    if (!b) return;
    p.dmgMul /= b.dmgK; p.speedMul /= b.spdK; p.critCh -= b.crit;
    st(p).buff = null;
  }

  /* players are referenced by index so ability objects stay plain JSON */
  HA.idOf = (p) => Math.max(0, G.allPlayers().indexOf(p));
  HA.ownerOf = (id) => G.allPlayers()[id] || G.me || G.player;

  /* ---------------- summon (monster from the VAULT) ---------------- */
  HA.summonCd = 38;
  HA.trySummon = function (p) {
    if (!p || p.dead || G.state !== "playing") return false;
    const id = (p === (G.me || G.player) ? NR.vault && NR.vault.summon() : p.summonId) || "";
    const actor = id && NR.superRuntime && NR.superRuntime.actor(id);
    if (!actor) { if (p === (G.me || G.player)) NR.hub?.notify?.("No summon equipped — pick a monster in VAULT → SUMMONS"); return false; }
    const s = st(p);
    if (s.summonCd > 0) { if (p === (G.me || G.player)) NR.hub?.notify?.(`SUMMON · ${Math.ceil(s.summonCd)}s`); return false; }
    s.summonCd = HA.summonCd;
    const h = NR.evolution.hash(actor.id), guardian = actor.role === "guardian";
    HA.allies.push({ x: p.x - p.facing * 70, y: p.y, vx: 0, facing: p.facing, t: 0, life: guardian ? 16 : 13,
      dmg: (guardian ? 30 : 16 + (h % 12)) * power(p), atk: 0, col: "purple", owner: HA.idOf(p), hero: "", actor: actor.id,
      wolf: false, h: guardian ? 120 : 70 + (h % 20), flying: /fly|crow|ghost|bird|skull|bee|bat/.test(actor.name.toLowerCase()), swing: 0 });
    NR.superRuntime.preloadActor(actor);
    F.teleport(p.x - p.facing * 70, p.y - 50, "purple");
    F.text(p.x, p.y - 150, "SUMMON · " + actor.name.toUpperCase(), { col: "#e0b3ff", size: 20 });
    NR.audio.play("powerUp");
    return true;
  };

  /* ---------------- per-frame ---------------- */
  HA.update = function (dt) {
    for (const p of G.allPlayers()) {
      const s = st(p);
      for (let i = 0; i < 3; i++) s.cd[i] = Math.max(0, (s.cd[i] || 0) - dt);
      s.summonCd = Math.max(0, (s.summonCd || 0) - dt);
      if (s.buff) { s.buff.t -= dt; if (s.buff.t <= 0 || p.dead) endBuff(p); else if (Math.random() < dt * 14) F.burst(p.x + U.rand(-18, 18), p.y - U.rand(10, 80), { n: 1, col: s.buff.col, spd: 60, life: 0.4, size: 4, grav: -60 }); }
      if (s.regen) { s.regen.t -= dt; if (!p.dead) p.heal(s.regen.rate * dt); if (s.regen.t <= 0) s.regen = null; }
      if (s.slam) {
        s.slam.t += dt;
        if ((s.slam.t > 0.18 && p.onGround) || s.slam.t > 1.1) {
          const d = s.slam; s.slam = null;
          F.ring(p.x, p.y - 10, { col: d.col, r1: d.r, life: 0.5, lw: 14 });
          F.burst(p.x, p.y - 10, { n: 60, col: d.col, spd: 700, life: 0.7 });
          G.shake(0.6);
          for (const e of HA.targets(p)) if (Math.abs(e.x - p.x) < d.r && Math.abs(e.y - p.y) < d.r * 0.6) HA.damage(p, e, d.dmg, (Math.sign(e.x - p.x) || 1) * 600, -520, d.col);
        }
      }
    }
    // burning enemies
    for (const e of G.enemies) {
      if (!e._burn || e.dead) continue;
      e._burn.t -= dt;
      const keep = G.player; G.player = e._burn.owner || keep;
      try { e.hurt(e._burn.dps * dt, 0, 0, false, G); } catch (_) {} finally { G.player = keep; }
      if (Math.random() < dt * 12) F.burst(e.x + U.rand(-10, 10), e.y - (e.h || 60) * 0.6, { n: 1, col: "orange", spd: 80, life: 0.4, size: 5, grav: -80 });
      if (e._burn.t <= 0) e._burn = null;
    }
    // shots
    for (let i = HA.shots.length - 1; i >= 0; i--) {
      const b = HA.shots[i];
      b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.arc) b.vy += 1500 * dt;
      let gone = b.x < -50 || b.x > W.W + 50 || b.t > 2.2 || (b.arc && b.y >= W.groundY - 4);
      const owner = HA.ownerOf(b.owner);
      if (!gone) for (const e of HA.targets(owner)) {
        if (b.hit.includes(e._nid || (e._nid = Math.random()))) continue;
        const c = center(e);
        if (Math.abs(c.x - b.x) > (e.w || 40) / 2 + b.size * 0.6 || Math.abs(c.y - b.y) > (e.h || 60) / 2 + b.size * 0.6) continue;
        b.hit.push(e._nid);
        if (b.explode) { gone = true; break; }
        HA.damage(owner, e, b.dmg / power(owner), Math.sign(b.vx) * 320, -140, b.col);
        if (--b.pierce <= 0) { gone = true; break; }
      }
      if (gone) {
        if (b.explode) {
          F.ring(b.x, b.y, { col: b.col, r1: b.explode, life: 0.45, lw: 10 });
          F.burst(b.x, b.y, { n: 40, col: b.col, spd: 500, life: 0.6 });
          G.shake(0.25); NR.audio.play("explode");
          for (const e of HA.targets(owner)) { const c = center(e); if (Math.hypot(c.x - b.x, c.y - b.y) < b.explode) HA.damage(owner, e, b.dmg / power(owner), (Math.sign(e.x - b.x) || 1) * 420, -300, b.col); }
        }
        HA.shots.splice(i, 1);
      }
    }
    // delayed strikes (rain)
    for (let i = HA.strikes.length - 1; i >= 0; i--) {
      const s = HA.strikes[i];
      s.t += dt;
      if (!s.done && s.t >= s.delay) {
        s.done = true;
        const owner = HA.ownerOf(s.owner);
        F.ring(s.x, s.y - 20, { col: s.col, r1: s.r, life: 0.35, lw: 7 });
        F.burst(s.x, s.y - 20, { n: 16, col: s.col, spd: 380, life: 0.45 });
        for (const e of HA.targets(owner)) if (Math.abs(e.x - s.x) < s.r && e.y > s.y - 320) HA.damage(owner, e, s.dmg / power(owner), (Math.sign(e.x - s.x) || 1) * 200, -300, s.col);
        NR.audio.play("hit");
      }
      if (s.t > s.delay + 0.35) HA.strikes.splice(i, 1);
    }
    // allies
    for (let i = HA.allies.length - 1; i >= 0; i--) {
      const a = HA.allies[i];
      a.t += dt; a.atk -= dt; a.swing = Math.max(0, a.swing - dt);
      const owner = HA.ownerOf(a.owner);
      let best = null, bd = 900;
      for (const e of HA.targets(owner)) { const dd = Math.abs(e.x - a.x); if (dd < bd) { bd = dd; best = e; } }
      if (best) {
        a.facing = Math.sign(best.x - a.x) || a.facing;
        if (bd > 70) a.vx = U.damp(a.vx, a.facing * 330, 6, dt); else a.vx = U.damp(a.vx, 0, 10, dt);
        if (bd < 95 && a.atk <= 0) { a.atk = 0.7; a.swing = 0.25; HA.damage(owner, best, a.dmg / power(owner), a.facing * 260, -160, a.col); }
      } else {
        const tx = owner.x - owner.facing * 70;
        a.facing = Math.sign(tx - a.x) || a.facing;
        a.vx = Math.abs(tx - a.x) > 30 ? U.damp(a.vx, a.facing * 300, 5, dt) : U.damp(a.vx, 0, 8, dt);
      }
      a.x = U.clamp(a.x + a.vx * dt, 30, W.W - 30);
      a.y = a.flying ? W.groundY - 110 + Math.sin(a.t * 2) * 16 : W.groundY;
      if (a.t >= a.life) { F.teleport(a.x, a.y - 40, "purple"); HA.allies.splice(i, 1); }
    }
    for (let i = HA.beams.length - 1; i >= 0; i--) { HA.beams[i].t += dt; if (HA.beams[i].t >= HA.beams[i].life) HA.beams.splice(i, 1); }
  };
  HA.clear = function () { HA.shots.length = 0; HA.strikes.length = 0; HA.allies.length = 0; HA.beams.length = 0; };

  /* ---------------- drawing ---------------- */
  const COL = { cyan: "#7dfff3", orange: "#ffae42", red: "#ff4d5e", white: "#ffffff", blue: "#8fb8ff", yellow: "#ffe14d", green: "#8dff8a", magenta: "#ff7ad9", purple: "#c49bff" };
  HA.color = (c) => COL[c] || c || "#fff";
  HA.draw = function (ctx) {
    const S = NR.superRuntime;
    for (const a of HA.allies) {
      const fade = Math.min(1, a.t * 4, (a.life - a.t) * 2);
      ctx.save();
      ctx.globalAlpha = Math.max(0.15, fade);
      let drawn = false;
      if (a.actor && S) { const actor = S.actor(a.actor); if (actor) drawn = S.drawActor(ctx, actor, a.swing > 0 ? "attack" : Math.abs(a.vx) > 30 ? "walk" : "idle", a.t, a.x, a.y, a.h, a.facing, 1); }
      else if (a.hero && NR.heroes) {
        ctx.globalAlpha *= 0.6;
        const h = NR.heroes.byId(a.hero);
        drawn = NR.heroes.draw(ctx, h, { x: a.x, y: a.y, facing: a.facing, t: a.t, anim: a.swing > 0 ? "attack" : Math.abs(a.vx) > 30 ? "run" : "idle", attacking: a.swing > 0, atkP: 1 - a.swing / 0.25, attackIdx: 0, runAmt: 1 }, { scale: 0.9 });
      }
      if (!drawn) {
        // spirit wolf / fallback: a glowing beast silhouette
        const c = HA.color(a.col);
        ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 16;
        ctx.globalAlpha *= 0.75;
        const bob = Math.sin(a.t * 12) * (Math.abs(a.vx) > 30 ? 4 : 1);
        ctx.beginPath(); ctx.ellipse(a.x, a.y - 26 + bob, 34, 16, 0, 0, U.TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(a.x + a.facing * 32, a.y - 40 + bob, 15, 12, 0, 0, U.TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(a.x + a.facing * 28, a.y - 50 + bob); ctx.lineTo(a.x + a.facing * 34, a.y - 66 + bob); ctx.lineTo(a.x + a.facing * 40, a.y - 50 + bob); ctx.fill();
        for (const lx of [-20, -8, 12, 24]) ctx.fillRect(a.x + lx, a.y - 16 + bob, 5, 16 - bob);
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of HA.shots) {
      const c = HA.color(b.col);
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 18;
      if (b.pierce > 50) { // crescent
        ctx.save(); ctx.translate(b.x, b.y); ctx.scale(Math.sign(b.vx) || 1, 1);
        ctx.beginPath(); ctx.arc(0, 0, b.size, -1.2, 1.2); ctx.arc(-b.size * 0.45, 0, b.size * 0.8, 1.1, -1.1, true); ctx.fill(); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(b.x, b.y, b.size / 2, 0, U.TAU); ctx.fill(); }
    }
    for (const s of HA.strikes) {
      const c = HA.color(s.col);
      if (!s.done) { ctx.globalAlpha = 0.35; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(s.x, s.y - 4, s.r * 0.8, 10, 0, 0, U.TAU); ctx.stroke(); }
      else { const k = 1 - (s.t - s.delay) / 0.35; ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = c; ctx.fillRect(s.x - 7, s.y - 700, 14, 700); }
    }
    for (const b of HA.beams) {
      const k = 1 - b.t / b.life, c = HA.color(b.col);
      ctx.globalAlpha = Math.max(0, k); ctx.strokeStyle = c; ctx.lineWidth = b.w; ctx.shadowColor = c; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      if (b.zig) for (let i = 1; i < 6; i++) ctx.lineTo(b.x1 + (b.x2 - b.x1) * i / 6 + U.rand(-14, 14), b.y1 + (b.y2 - b.y1) * i / 6 + U.rand(-14, 14));
      ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    ctx.restore();
    // active shield bubbles / buffs for every fighter
    for (const p of G.allPlayers()) {
      if (p.dead) continue;
      const s = p.hab;
      if (p.shieldT > 0 && s && s.cd.some((c, i) => c > 0 && HA.forPlayer(p)[i].kind === "shield")) {
        ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(p.t * 10) * 0.1; ctx.strokeStyle = "#9df8ff"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y - 45, 62, 0, U.TAU); ctx.stroke(); ctx.restore();
      }
    }
  };
  NR.drawHooks = NR.drawHooks || [];
  NR.drawHooks.push((ctx) => HA.draw(ctx));

  /* ---------------- HUD buttons ---------------- */
  const $ = (id) => document.getElementById(id);
  HA.syncButtons = function () {
    const p = G.me || G.player;
    const defs = HA.forPlayer(p);
    for (let i = 0; i < 3; i++) {
      const d = defs[i], ico = $("hab-ico-" + (i + 1)), name = $("hab-name-" + (i + 1));
      if (ico) ico.textContent = d.ico;
      if (name) name.textContent = d.name.split(" ")[0];
      const btn = ico && ico.parentElement;
      if (btn && btn.setAttribute) { btn.setAttribute("aria-label", d.name + " — " + d.desc); btn.title = d.name + " · " + d.desc; }
    }
    const sn = $("summon-name"), sid = NR.vault && NR.vault.summon(), actor = sid && NR.superRuntime && NR.superRuntime.actor(sid);
    if (sn) sn.textContent = actor ? actor.name.split(" ")[0].toUpperCase().slice(0, 8) : "SUMMON";
  };
  function hudTick() {
    const p = G.me || G.player;
    if (!p || !p.hab) return;
    for (let i = 0; i < 3; i++) {
      const el = $("hab-cd-" + (i + 1));
      if (!el) continue;
      const cd = p.hab.cd[i], txt = cd > 0 ? String(Math.ceil(cd)) : "";
      if (el.textContent !== txt) el.textContent = txt;
    }
    const sc = $("summon-cd");
    if (sc) { const txt = p.hab.summonCd > 0 ? String(Math.ceil(p.hab.summonCd)) : ""; if (sc.textContent !== txt) sc.textContent = txt; }
  }

  HA.hudTick = hudTick;

  /* ---------------- run lifecycle ---------------- */
  const start = G.start;
  G.start = function (...args) {
    HA.clear();
    const r = start.apply(G, args);
    if (G.player) HA.reset(G.player);
    HA.syncButtons();
    return r;
  };
  const update = G.update;
  G.update = function (dt, rd) {
    update.call(G, dt, rd);
    if (G.state !== "playing" || !G.player) return;
    if (G.netGuest) { hudTick(); return; }
    const me = G.me || G.player;
    for (let i = 0; i < 3; i++) if (I.justPressed("ab" + (i + 1))) HA.tryCast(me, i);
    if (I.justPressed("summon")) HA.trySummon(me);
    try { HA.update(dt); } catch (err) { NR.reportError?.("Ability update", err); }
    hudTick();
  };
  const fxReset = NR.fx.reset;
  NR.fx.reset = function () { fxReset(); HA.clear(); };

  /* ---------------- heroes screen: list the three abilities ---------------- */
  if (NR.heroes && NR.heroes.render) {
    const render = NR.heroes.render;
    NR.heroes.render = function (...args) {
      render.apply(this, args);
      const detail = $("heroes-detail");
      if (!detail || !detail.querySelector) return;
      const nameEl = detail.querySelector("h3");
      const h = nameEl && NR.heroes.ROSTER.find((x) => x.name === nameEl.textContent);
      const defs = HA.forHero(h ? h.id : NR.heroes.current().id);
      const box = document.createElement("div");
      box.className = "hd-abilities";
      const head = document.createElement("div"); head.className = "lm-label"; head.textContent = "ABILITIES · U / I / O";
      box.append(head);
      ["U", "I", "O"].forEach((k, i) => {
        const d = defs[i], row = document.createElement("div");
        row.className = "hd-ab";
        row.innerHTML = `<span class="hd-ab-ico"></span><div><b></b><small></small></div><kbd></kbd>`;
        row.querySelector(".hd-ab-ico").textContent = d.ico;
        row.querySelector("b").textContent = d.name;
        row.querySelector("small").textContent = `${d.desc} · ${d.cd}s`;
        row.querySelector("kbd").textContent = k;
        box.append(row);
      });
      const trait = detail.querySelector(".hd-trait");
      if (trait && trait.after) trait.after(box); else detail.append(box);
    };
  }
})();

/* Precision defence and ranged combat shared by both game modes. */
(function () {
  const U = NR.util,
    F = NR.fx;
  const C = (NR.combat = {});

  // Segment vs expanded AABB: first time of contact, or null. Prevents tunnelling.
  C.segmentBox = function (x0, y0, x1, y1, left, top, width, height, pad = 0) {
    let near = 0,
      far = 1;
    for (const [origin, delta, min, max] of [
      [x0, x1 - x0, left - pad, left + width + pad],
      [y0, y1 - y0, top - pad, top + height + pad],
    ]) {
      if (Math.abs(delta) < 1e-8) {
        if (origin < min || origin > max) return null;
      } else {
        let a = (min - origin) / delta,
          b = (max - origin) / delta;
        if (a > b) [a, b] = [b, a];
        near = Math.max(near, a);
        far = Math.min(far, b);
        if (near > far) return null;
      }
    }
    return near;
  };
  C.segmentEntity = (x0, y0, x1, y1, e, r = 0) =>
    C.segmentBox(x0, y0, x1, y1, e.x - e.w / 2, e.y - e.h, e.w, e.h, r);
  C.reset = function (p) {
    p.parryT = 0;
    p.parryCd = 0;
    p.counterT = 0;
    p.kunaiCharges = 3;
    p.kunaiChargeT = 0;
    p.throwCd = 0;
  };
  C.tick = function (p, dt) {
    p.parryT = Math.max(0, p.parryT - dt);
    p.parryCd = Math.max(0, p.parryCd - dt);
    p.counterT = Math.max(0, p.counterT - dt);
    p.throwCd = Math.max(0, p.throwCd - dt);
    if (p.kunaiCharges < 3) {
      p.kunaiChargeT += dt;
      if (p.kunaiChargeT >= 3) {
        p.kunaiChargeT -= 3;
        p.kunaiCharges++;
      }
    } else p.kunaiChargeT = 0;
  };
  C.guard = function (p) {
    if (p.dead || p.parryCd > 0 || p.dashT > 0 || p.stormT > 0) return false;
    p.parryT = 0.22;
    p.parryCd = 1.2;
    p.attackT = 0;
    p.attackIdx = -1;
    p.queued = false;
    NR.audio.play("guard");
    return true;
  };
  C.tryParry = function (G, dir, source) {
    const p = G.player;
    if (
      p.dead ||
      p.parryT <= 0 ||
      p.facing !== -Math.sign(dir) ||
      !["touch", "slash", "bolt"].includes(source)
    )
      return false;
    p.parryT = 0;
    p.counterT = 2;
    p.iframes = Math.max(p.iframes, 0.35);
    p.addEnergy(8);
    G.stats.parries = (G.stats.parries || 0) + 1;
    F.ring(p.x, p.y - 45, { col: "yellow", r1: 100, life: 0.3, lw: 5 });
    F.text(p.x, p.y - 125, "PERFECT PARRY", { col: "#ffe5a1", size: 18 });
    G.hitStop(0.06);
    G.shake(0.12);
    NR.audio.play("parry");
    NR.progress.award("parry");
    return true;
  };
  C.throwKunai = function (p, G) {
    if (
      p.dead ||
      p.kunaiCharges <= 0 ||
      p.throwCd > 0 ||
      p.stormT > 0 ||
      p.parryT > 0
    )
      return false;
    const target = G.enemies
      .filter(
        (e) =>
          !e.dead &&
          e.spawnT <= 0 &&
          (e.x - p.x) * p.facing > 0 &&
          Math.abs(e.x - p.x) < 720 &&
          Math.abs(e.y - e.h / 2 - (p.y - 45)) < 260,
      )
      .sort(
        (a, b) => U.dist(p.x, p.y, a.x, a.y) - U.dist(p.x, p.y, b.x, b.y),
      )[0];
    const x = p.x + p.facing * 24,
      y = p.y - 45,
      a = target
        ? Math.atan2(target.y - target.h / 2 - y, target.x - x)
        : p.facing > 0
          ? 0
          : Math.PI;
    G.shots.push(
      new NR.Kunai(x, y, Math.cos(a) * 950, Math.sin(a) * 950, 22 * p.dmgMul),
    );
    p.kunaiCharges--;
    p.throwCd = 0.28;
    NR.audio.play("kunai");
    return true;
  };
  /* POOLED: player projectiles recycle through a free-list — throwing
     fans of kunai in heavy combat allocates nothing once warm. */
  const kunaiFree = [];
  function Kunai(x, y, vx, vy, damage = 22, reflected = false) {
    const self = kunaiFree.pop() || Object.create(Kunai.prototype);
    self.x = x; self.y = y; self.vx = vx; self.vy = vy;
    self.damage = damage; self.reflected = reflected;
    self.dead = false; self.life = 1.4;
    return self;
  }
  Kunai.release = function (k) { if (kunaiFree.length < 96) kunaiFree.push(k); };
  Kunai.prototype.update = function (dt, G) {
      if (this.dead) return;
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      const x1 = this.x + this.vx * dt,
        y1 = this.y + this.vy * dt;
      let closest = Infinity,
        hit = null;
      const consider = (t, kind, object) => {
        if (t !== null && t < closest) {
          closest = t;
          hit = { kind, object };
        }
      };
      for (const e of G.enemies)
        if (!e.dead && e.spawnT <= 0)
          consider(C.segmentEntity(this.x, this.y, x1, y1, e, 5), "enemy", e);
      if (NR.adventure?.active)
        for (const o of NR.adventure.props)
          if (!o.broken)
            consider(
              C.segmentBox(
                this.x,
                this.y,
                x1,
                y1,
                o.x - 25,
                o.y - 52,
                50,
                52,
                4,
              ),
              "prop",
              o,
            );
      const W = NR.world;
      for (const p of W.platforms)
        consider(
          C.segmentBox(this.x, this.y, x1, y1, p.x, p.y, p.w, p.h),
          "world",
          null,
        );
      consider(
        C.segmentBox(this.x, this.y, x1, y1, 0, W.groundY, W.W, 1000),
        "world",
        null,
      );
      if (hit) {
        this.x += (x1 - this.x) * closest;
        this.y += (y1 - this.y) * closest;
        this.dead = true;
        if (hit.kind === "enemy") {
          const beforeHp = hit.object.hp;
          hit.object.hurt(this.damage, Math.sign(this.vx) * 140, -35, false, G);
          F.text(this.x, this.y - 20, Math.round(this.damage), {
            col: this.reflected ? "#ffe6ab" : "#a3eaff",
            size: 16,
          });
          if (hit.object.hp < beforeHp) {
            G.stats.kunaiHits = (G.stats.kunaiHits || 0) + 1;
            if (G.stats.kunaiHits >= 10) NR.progress.award("kunai");
          }
        } else if (hit.kind === "prop")
          NR.adventure.hurtProp(hit.object, this.damage, G);
        F.sparks(this.x, this.y, 7, this.reflected ? "yellow" : "cyan");
      } else {
        this.x = x1;
        this.y = y1;
      }
      if (this.x < 0 || this.x > W.W) this.dead = true;
  };

  Kunai.prototype.draw = function (ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.strokeStyle = this.reflected ? "#ffd083" : "#82daf2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-32, 0);
      ctx.lineTo(9, 0);
      ctx.stroke();
      ctx.fillStyle = "#e9fcff";
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-3, -5);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-3, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
  };
  NR.Kunai = Kunai;
})();

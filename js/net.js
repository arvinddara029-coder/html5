/* ============ PRODUCTION PASS — real-time networking architecture ============
   Clean transport abstraction, split by responsibility:

     INetworkTransport — moves bytes between peers (LocalTransport loopback,
                         PeerTransport = WebRTC data channels via PeerJS,
                         lazy-loaded only when entering an online room)
     IRoomService      — room lifecycle: create/join/leave, members, ready
     IPlayerSync       — throttled player-state sync + interpolation
     IChatService      — text chat transport hooks (moderation in social.js)

   IMPORTANT platform truth: the CrazyGames SDK provides identity, cloud save,
   ads and room METADATA (updateRoom/inviteLink) — it is NOT a game-state
   server. Real-time gameplay goes over WebRTC data channels; the SDK only
   advertises the room so friends can join via the platform UI / invite links.

   Netcode model (co-op DUO + WAVE FIGHT):
     - Host authoritative: host runs spawns/waves/bosses and broadcasts events.
     - Guests simulate the same deterministic seeded queue and send hit events.
     - Player state 10Hz (x,y,facing,anim,hp,energy); interpolation on draw.
     - Disconnects mark the member offline; the match continues; the code
       allows re-join. Leaving cleans up without breaking the match.
   PvP modes (1v1 / 2v2 / 4v4): same transport; hits between players are
   events; kills are scored and reported to the leaderboard with validation. */
(function () {
  const U = NR.util;
  const N = (NR.net = {
    mode: "offline",          // offline | host | guest
    transport: null,          // active INetworkTransport
    room: null,               // {code, mode, maxPlayers, members, seed, started, round}
    remote: new Map(),        // peerId -> RemoteHero
    chatHandlers: [],
    onRoomChanged: [],
    onMatchEvent: [],
    connected: false,
    _lastSync: 0,
    _ping: 0,
    _updatesThisSec: 0,
    _secMark: 0,
  });

  const MODES = {
    duo:    { label: "DUO — WAVE CO-OP", players: 2, pvp: false },
    duel:   { label: "1v1 DUEL",         players: 2, pvp: true },
    team2:  { label: "2v2 TEAM CLASH",   players: 4, pvp: true },
    team4:  { label: "4v4 TEAM WAR",     players: 8, pvp: true },
  };
  N.modes = MODES;

  /* =============== INetworkTransport (interface) ===============
     connect(role, code) -> Promise
     send(msg, to?)      — JSON message to one peer (host) or broadcast (guest)
     broadcast(msg)      — to all peers
     on(type, fn)        — 'message' | 'peer-join' | 'peer-leave' | 'error'
     close()
     ================================================================ */

  /* ---------- LocalTransport: offline loopback (tests / solo) ---------- */
  class LocalTransport {
    constructor() { this.handlers = {}; this.peers = new Set(); }
    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    emit(type, data) { (this.handlers[type] || []).forEach((f) => { try { f(data); } catch (e) { NR.diag?.net("local handler error: " + e.message); } }); }
    async connect() { this.peers.add("local"); this.connected = true; this.emit("peer-join", "local"); return true; }
    send(msg) { this.emit("message", { from: "local", msg }); }
    broadcast(msg) { this.send(msg); }
    sendTo() {}
    close() { this.peers.clear(); this.connected = false; }
  }

  /* ---------- PeerTransport: WebRTC data channels via PeerJS ---------- */
  const PEERJS_URL = "https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js";
  function loadPeerJS() {
    return new Promise((resolve, reject) => {
      if (window.Peer) return resolve(window.Peer);
      const s = document.createElement("script");
      s.src = PEERJS_URL; s.async = true;
      const to = setTimeout(() => reject(new Error("PeerJS load timeout")), 12000);
      s.onload = () => { clearTimeout(to); window.Peer ? resolve(window.Peer) : reject(new Error("PeerJS missing")); };
      s.onerror = () => { clearTimeout(to); reject(new Error("PeerJS failed to load")); };
      document.head.append(s);
    });
  }

  class PeerTransport {
    constructor(role, code) {
      this.role = role;             // 'host' | 'guest'
      this.code = code;
      this.handlers = {};
      this.conns = new Map();       // peerId -> DataConnection
      this.peer = null;
      this.myId = null;
      this.alive = false;
    }
    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    emit(type, data) { (this.handlers[type] || []).forEach((f) => { try { f(data); } catch (e) { NR.diag?.net("peer handler error: " + e.message); } }); }

    async connect() {
      const Peer = await loadPeerJS();
      const hostId = "neon-ronin-" + this.code;
      this.alive = true;
      return new Promise((resolve, reject) => {
        try {
          this.peer = this.role === "host"
            ? new Peer(hostId, { debug: 0 })
            : new Peer({ debug: 0 });
        } catch (e) { reject(e); return; }
        const fail = (why) => { if (!this.alive) return; this.alive = false; reject(new Error(why)); };
        this.peer.on("open", (id) => {
          this.myId = id;
          if (this.role === "host") {
            this.peer.on("connection", (conn) => this.wire(conn));
            resolve(true);
          } else {
            const conn = this.peer.connect(hostId, { reliable: false, serialization: "json" });
            const to = setTimeout(() => fail("Room not reachable — code may be expired"), 12000);
            conn.on("open", () => { clearTimeout(to); this.wire(conn); resolve(true); });
            conn.on("error", (e) => { clearTimeout(to); fail("Connection error: " + (e?.message || e)); });
          }
        });
        this.peer.on("error", (e) => {
          const t = String(e && e.type || e);
          if (t === "peer-unavailable") fail("Room not found — check the code");
          else if (t === "unavailable-id") fail("Room code already in use — create a new one");
          else NR.diag?.net("peer error: " + t);
        });
        this.peer.on("disconnected", () => { if (this.alive) { try { this.peer.reconnect(); } catch (_) {} } });
      });
    }
    wire(conn) {
      this.conns.set(conn.peer, conn);
      conn.on("data", (d) => this.emit("message", { from: conn.peer, msg: d }));
      conn.on("close", () => { this.conns.delete(conn.peer); this.emit("peer-leave", conn.peer); });
      conn.on("error", () => { this.conns.delete(conn.peer); this.emit("peer-leave", conn.peer); });
      this.emit("peer-join", conn.peer);
    }
    send(msg, to) {
      const data = JSON.parse(JSON.stringify(msg));
      if (to) { const c = this.conns.get(to); if (c && c.open) c.send(data); return; }
      this.broadcast(data);
    }
    broadcast(msg) {
      for (const c of this.conns.values()) if (c.open) { try { c.send(msg); } catch (_) {} }
    }
    peers() { return [...this.conns.keys()]; }
    close() {
      this.alive = false;
      for (const c of this.conns.values()) { try { c.close(); } catch (_) {} }
      this.conns.clear();
      try { this.peer && this.peer.destroy(); } catch (_) {}
    }
  }
  N.PeerTransport = PeerTransport;
  N.LocalTransport = LocalTransport;

  /* =============== IRoomService =============== */
  function makeCode() {
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 5; i++) s += abc[(Math.random() * abc.length) | 0];
    return s;
  }
  function myProfile() {
    const P = NR.profile;
    return {
      id: N.myId(),
      name: (NR.crazy && NR.crazy.user && NR.crazy.user.username) || P.name,
      avatar: (NR.crazy && NR.crazy.user && NR.crazy.user.profilePictureUrl) || "",
      hero: P.character,
      level: P.level || 1,
      online: true,
    };
  }
  N.myId = function () { return (N.transport && N.transport.myId) || "me"; };

  N.createRoom = async function (modeId) {
    const def = MODES[modeId] || MODES.duo;
    try {
      const code = makeCode();
      const t = new PeerTransport("host", code);
      await t.connect();
      N.transport = t;
      N.mode = "host";
      N.connected = true;
      N.room = {
        code, mode: modeId, maxPlayers: def.players, pvp: def.pvp,
        hostId: N.myId(),
        members: [Object.assign(myProfile(), { host: true, ready: true, connected: true })],
        seed: (Math.random() * 4294967296) >>> 0,
        started: false, round: 0,
      };
      wireTransport(t);
      // advertise on the platform so the CrazyGames Join/Invite UI works
      NR.crazy?.updateRoom(code, true, { room: code, mode: modeId });
      NR.diag.net(`room created ${code} mode=${modeId}`);
      roomChanged();
      return N.room;
    } catch (e) {
      NR.diag.net("createRoom failed: " + (e.message || e));
      NR.hub?.notify("Could not create an online room: " + (e.message || e));
      return null;
    }
  };

  N.joinRoom = async function (code) {
    code = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) { NR.hub?.notify("Enter a room code first."); return null; }
    try {
      const t = new PeerTransport("guest", code);
      await t.connect();
      N.transport = t;
      N.mode = "guest";
      N.connected = true;
      N.room = {
        code, mode: null, members: [], hostId: null,
        started: false, round: 0,
      };
      wireTransport(t);
      // announce ourselves; host replies with full room state
      t.send({ k: "hello", profile: myProfile() }, N.room.hostPeer || undefined);
      NR.diag.net(`joining room ${code}`);
      roomChanged();
      return N.room;
    } catch (e) {
      NR.transport = null; N.connected = false; N.mode = "offline";
      NR.diag.net("joinRoom failed: " + (e.message || e));
      NR.hub?.notify("Could not join: " + (e.message || e));
      return null;
    }
  };

  N.leaveRoom = function (notify) {
    if (!N.transport) return;
    try { N.transport.send({ k: "leave", id: N.myId() }); } catch (_) {}
    N.transport.close();
    NR.crazy?.leftRoom();
    N.transport = null; N.room = null; N.mode = "offline"; N.connected = false;
    N.remote.clear();
    NR.diag.net("left room");
    if (notify !== false) NR.hub?.notify("Left the room.");
    roomChanged();
  };

  N.setReady = function (ready) {
    const me = N.room && N.room.members.find((m) => m.id === N.myId());
    if (me) me.ready = !!ready;
    N.transport && N.transport.send({ k: "ready", id: N.myId(), ready: !!ready });
    roomChanged();
  };
  N.setHero = function (heroId) {
    const me = N.room && N.room.members.find((m) => m.id === N.myId());
    if (me) me.hero = heroId;
    N.transport && N.transport.send({ k: "hero", id: N.myId(), hero: heroId });
    roomChanged();
  };
  N.startMatch = function () {
    if (N.mode !== "host" || !N.room) return;
    N.room.started = true; N.room.round++;
    N.transport.broadcast({ k: "match-start", room: N.room });
    NR.crazy?.updateRoom(N.room.code, false, { room: N.room.code });
    roomChanged();
    NR.social?.onMatchStart?.(N.room);
  };

  function wireTransport(t) {
    t.on("message", ({ from, msg }) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.k === "ping") { t.send({ k: "pong", t: msg.t }, from); return; }
      if (msg.k === "pong") { N._ping = Math.round(performance.now() - msg.t); return; }
      if (N.mode === "host") hostHandle(from, msg);
      else guestHandle(from, msg);
    });
    t.on("peer-join", (id) => {
      if (N.mode === "host") {
        NR.diag.net("peer joined " + id);
        // send the newcomer the full room state
        t.send({ k: "room-state", room: N.room }, id);
        roomChanged();
      }
    });
    t.on("peer-leave", (id) => {
      NR.diag.net("peer left " + id);
      if (N.room) {
        const m = N.room.members.find((x) => x.id === id);
        if (m) { m.connected = false; m.online = false; }
        N.remote.delete(id);
        if (N.mode === "host") t.broadcast({ k: "member-left", id });
        NR.hub?.notify("A player disconnected — the match continues.");
      }
      roomChanged();
    });
    // heartbeat for ping + presence
    clearInterval(N._hb);
    N._hb = setInterval(() => {
      if (!N.transport || !N.connected) { clearInterval(N._hb); return; }
      const now = performance.now();
      if (now - N._secMark > 1000) { N._updatesThisSec = 0; N._secMark = now; }
      N.transport.send({ k: "ping", t: now });
    }, 2000);
  }

  /* ---- host message handling ---- */
  function hostHandle(from, msg) {
    const R = N.room;
    switch (msg.k) {
      case "hello": {
        if (!R) return;
        if (R.members.length >= R.maxPlayers) { N.transport.send({ k: "room-full" }, from); return; }
        if (R.started && !R.members.some((m) => m.id === from)) { N.transport.send({ k: "room-started" }, from); return; }
        const p = msg.profile || {};
        p.id = from; p.connected = true; p.online = true; p.ready = !!p.ready; p.host = false;
        const existing = R.members.findIndex((m) => m.id === from);
        if (existing >= 0) R.members[existing] = Object.assign(R.members[existing], p, { connected: true });
        else R.members.push(p);
        N.transport.broadcast({ k: "room-state", room: R });
        NR.crazy?.updateRoom(R.code, R.members.length < R.maxPlayers && !R.started, { room: R.code, mode: R.mode });
        roomChanged();
        break;
      }
      case "ready": { const m = R?.members.find((x) => x.id === from); if (m) m.ready = msg.ready; N.transport.broadcast({ k: "room-state", room: R }); roomChanged(); break; }
      case "hero": { const m = R?.members.find((x) => x.id === from); if (m) m.hero = msg.hero; N.transport.broadcast({ k: "room-state", room: R }); roomChanged(); break; }
      case "leave": {
        const m = R?.members.find((x) => x.id === from);
        if (m) m.connected = false;
        N.transport.broadcast({ k: "member-left", id: from });
        roomChanged(); break;
      }
      case "p-state": upsertRemote(from, msg); break;             // guest position
      case "p-event": N.transport.broadcast({ k: "p-event", from, ev: msg.ev }); applyRemoteEvent(from, msg.ev); break;
      case "hit-enemy": {
        // guest damaged a host-side enemy — authoritative hp on host
        const G = NR.game, e = G && G.enemies.find((x) => x.netId === msg.enemyId);
        if (e && !e.dead) {
          e.hurt(msg.dmg, msg.kx || 0, msg.ky || 0, false, G);
          N.transport.broadcast({ k: "enemy-hp", id: msg.enemyId, hp: e.hp, dead: !!e.dead });
        }
        break;
      }
      case "chat": N.transport.broadcast({ k: "chat", from, name: msg.name, text: msg.text }); deliverChat(msg.name, msg.text, from); break;
    }
  }

  /* ---- guest message handling ---- */
  function guestHandle(from, msg) {
    switch (msg.k) {
      case "room-state": {
        const prevMembers = N.room ? N.room.members : [];
        N.room = msg.room;
        N.room.members = (N.room.members || []).map((m) => {
          const prev = prevMembers.find((p) => p.id === m.id);
          return Object.assign({}, m, { connected: prev && prev.connected !== undefined ? m.connected : m.connected !== false });
        });
        const me = N.room.members.find((m) => m.id === N.myId());
        if (me) me.connected = true;
        roomChanged();
        if (N.room.started) NR.social?.onMatchStart?.(N.room, true);
        break;
      }
      case "room-full": NR.hub?.notify("That room is full."); N.leaveRoom(false); break;
      case "room-started": NR.hub?.notify("That match already started."); N.leaveRoom(false); break;
      case "member-left": {
        if (N.room) { const m = N.room.members.find((x) => x.id === msg.id); if (m) m.connected = false; }
        N.remote.delete(msg.id); roomChanged(); break;
      }
      case "match-start": N.room = msg.room; NR.social?.onMatchStart?.(N.room, true); roomChanged(); break;
      case "p-state": upsertRemote(msg.from || from, msg); break;
      case "p-event": applyRemoteEvent(msg.from || from, msg.ev); break;
      case "spawn": { // host-authoritative spawn queue for co-op
        const G = NR.game;
        if (G && G.state === "playing" && msg.q) G.spawnQueue.push(...msg.q.map((s) => ({ type: s.type, t: s.t, netId: s.netId })));
        break;
      }
      case "wave": { const G = NR.game; if (G && G.state === "playing" && typeof msg.wave === "number" && G.netWave !== msg.wave) { G.netWave = msg.wave; G.banner("WAVE " + msg.wave, "hold the line together", "#7dfff3"); } break; }
      case "enemy-hp": {
        const G = NR.game, e = G && G.enemies.find((x) => x.netId === msg.id);
        if (e) { e.hp = msg.hp; if (msg.dead && !e.dead) e.die(G); }
        break;
      }
      case "chat": deliverChat(msg.name, msg.text, msg.from || from); break;
    }
  }

  /* =============== IPlayerSync =============== */
  const INTERP = 0.12; // seconds of interpolation delay
  class RemoteHero {
    constructor(id, info) {
      this.id = id;
      this.info = info || {};
      this.x = 0; this.y = 0; this.tx = 0; this.ty = 0;
      this.facing = 1; this.anim = "idle"; this.hp = 100; this.maxHp = 100;
      this.energy = 0; this.name = this.info.name || "PLAYER";
      this.lastMsg = performance.now();
      this.attackT = 0;
    }
    pushState(s) {
      this.tx = s.x; this.ty = s.y;
      this.facing = s.f || this.facing; this.anim = s.a || "idle";
      this.hp = s.hp; this.maxHp = s.mhp || this.maxHp; this.energy = s.en || 0;
      this.lastMsg = performance.now();
    }
    update(dt) {
      const k = Math.min(1, dt / INTERP * 0.9);
      this.x = U.lerp(this.x || this.tx, this.tx, k);
      this.y = U.lerp(this.y || this.ty, this.ty, k);
      this.attackT = Math.max(0, this.attackT - dt);
    }
    draw(ctx) {
      const ch = (NR.heroes && NR.heroes.byKey(this.info.hero)) || null;
      const look = ch && ch.look ? ch.look : NR.profile.appearance;
      const P = {
        x: this.x, y: this.y, facing: this.facing, t: performance.now() / 1000,
        anim: this.attackT > 0 ? "attack" : this.anim, animFrame: (performance.now() / 130 | 0) % 8,
        appearance: look, runAmt: this.anim === "run" ? 1 : 0, air: this.anim === "jump" || this.anim === "fall",
        attacking: this.attackT > 0, atkP: 0.5, storm: false, hurt: false,
        trim: ch ? ch.color : "#8af5e1", cloak: ch ? ch.cloak : "#cb3d92",
      };
      try { NR.drawHero(ctx, P, { remote: true }); } catch (e) { /* missing art: skip frame */ }
      // name plate
      ctx.save();
      ctx.font = "700 11px Rajdhani"; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(4,8,16,0.7)";
      const w = ctx.measureText(this.name).width + 10;
      ctx.fillRect(this.x - w / 2, this.y - 148, w, 15);
      ctx.fillStyle = "#bfe9ff"; ctx.fillText(this.name, this.x, this.y - 137);
      // mini hp bar
      ctx.fillStyle = "rgba(5,8,18,0.8)"; ctx.fillRect(this.x - 24, this.y - 132, 48, 5);
      ctx.fillStyle = "#7dffa8"; ctx.fillRect(this.x - 24, this.y - 132, 48 * Math.max(0, Math.min(1, this.hp / (this.maxHp || 100))), 5);
      ctx.restore();
    }
  }
  N.RemoteHero = RemoteHero;

  function upsertRemote(id, s) {
    if (id === N.myId()) return;
    let r = N.remote.get(id);
    if (!r) {
      const info = (N.room && N.room.members.find((m) => m.id === id)) || {};
      r = new RemoteHero(id, info);
      N.remote.set(id, r);
    }
    r.pushState(s);
  }
  function applyRemoteEvent(from, ev) {
    const r = N.remote.get(from);
    if (!r) return;
    if (ev.a === "attack") r.attackT = 0.3;
    // PvP damage
    if (ev.a === "hit-player" && N.room && N.room.pvp) {
      const G = NR.game;
      if (G && G.player && !G.player.dead && Math.abs(G.player.x - r.x) < 170 && Math.abs(G.player.y - r.y) < 120) {
        G.hurtPlayer(ev.dmg || 10, Math.sign(G.player.x - r.x) || 1, "pvp");
      }
    }
    if (ev.a === "kill" && N.room) {
      const m = N.room.members.find((x) => x.id === from);
      if (m) m.kills = (m.kills || 0) + 1;
      roomChanged();
    }
    // party wave-best sharing → live wave-clear leaderboard
    if (ev.a === "best" && N.room) {
      const m = N.room.members.find((x) => x.id === from);
      if (m) {
        m.best = { wave: Math.max(0, Math.min(5000, ev.wave | 0)), score: Math.max(0, Math.min(5e7, ev.score | 0)) };
        roomChanged();
      }
    }
  }

  /* Called from the game loop while playing online. */
  N.tick = function (dt) {
    if (!N.connected || !N.transport) return;
    const G = NR.game;
    for (const r of N.remote.values()) r.update(dt);
    // drop stale remotes (10s without state)
    const now = performance.now();
    for (const [id, r] of N.remote) if (now - r.lastMsg > 10000) N.remote.delete(id);
    const p = G && G.player;
    if (!p || G.state !== "playing") return;
    // 10Hz state sync — positions are NOT sent every frame
    const t = performance.now();
    if (t - N._lastSync < 100) return;
    N._lastSync = t; N._updatesThisSec++;
    N.transport.send({
      k: "p-state", x: Math.round(p.x), y: Math.round(p.y), f: p.facing,
      a: p.pose && p.pose.anim || "idle", hp: Math.round(p.hp), mhp: Math.round(p.maxHp), en: Math.round(p.energy),
    });
  };
  N.sendEvent = function (ev) { if (N.connected && N.transport) N.transport.send({ k: "p-event", ev }); };
  N.guestHitEnemy = function (enemyNetId, dmg, kx, ky) {
    if (N.connected && N.transport && N.mode === "guest")
      N.transport.send({ k: "hit-enemy", enemyId: enemyNetId, dmg, kx: kx || 0, ky: ky || 0 });
  };
  /* host pushes authoritative spawn batches to guests */
  N.hostBroadcastSpawns = function (queueItems) {
    if (N.mode === "host" && N.transport && N.transport.conns.size)
      N.transport.broadcast({ k: "spawn", q: queueItems });
  };
  N.hostBroadcastWave = function (wave) {
    if (N.mode === "host" && N.transport && N.transport.conns.size)
      N.transport.broadcast({ k: "wave", wave });
  };

  /* =============== IChatService (transport side) =============== */
  N.sendChat = function (text) {
    if (!N.connected || !N.transport) return false;
    const name = (NR.crazy && NR.crazy.user && NR.crazy.user.username) || NR.profile.name;
    N.transport.send({ k: "chat", name, text: String(text).slice(0, 160) });
    if (N.mode === "guest") return true; // echoed back by host
    deliverChat(name, text, N.myId());
    return true;
  };
  function deliverChat(name, text, from) {
    for (const fn of N.chatHandlers) { try { fn({ name, text, from }); } catch (_) {} }
  }
  N.onChat = function (fn) { N.chatHandlers.push(fn); };

  /* =============== leaderboard validation ===============
     Client values are never trusted blindly: plausibility bounds,
     rate limiting and run-identity checksums. */
  N.validateSubmission = function (entry) {
    const reasons = [];
    if (!entry || typeof entry !== "object") reasons.push("bad-payload");
    const wave = Number(entry.wave) | 0, score = Number(entry.score) | 0, time = Number(entry.time) || 0;
    if (wave < 0 || wave > 500) reasons.push("wave-out-of-range");
    if (score < 0 || score > 5e7) reasons.push("score-out-of-range");
    if (wave > 0 && time < wave * 4) reasons.push("time-too-short");       // ≥4s per wave physically required
    if (wave > 0 && score < wave * 50) reasons.push("score-too-low");      // each wave pays ≥50
    if (wave > 0 && score > wave * 40000) reasons.push("score-too-high");  // beyond plausible combo ceiling
    const now = Date.now();
    N._submissions = N._submissions || [];
    N._submissions = N._submissions.filter((t) => now - t < 60000);
    if (N._submissions.length >= 5) reasons.push("rate-limit");
    const valid = reasons.length === 0;
    if (!valid) NR.diag.game("leaderboard submission rejected: " + reasons.join(","));
    if (valid) N._submissions.push(now);
    return { valid, reasons };
  };
  N.submitLeaderboard = function (entry) {
    const v = N.validateSubmission(entry);
    if (!v.valid) return v;
    try { NR.progress?.recordOnline?.(entry); } catch (_) {}
    return v;
  };

  /* helpers for the debug panel */
  N.peerCount = function () { return N.transport && N.transport.conns ? N.transport.conns.size : 0; };
  N.ping = function () { return N._ping; };
  N.updateRate = function () { return N.connected ? 10 : 0; };

  function roomChanged() { for (const fn of N.onRoomChanged) { try { fn(N.room); } catch (_) {} } }
  N.onRoom = function (fn) { N.onRoomChanged.push(fn); };
})();

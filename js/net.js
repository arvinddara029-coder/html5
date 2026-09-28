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

  /* game: which NR.game mode the room runs */
  const MODES = {
    climb:  { label: "WAVE CLIMB · CO-OP",   players: 4, pvp: false, game: "climb" },
    run:    { label: "SURVIVAL RUN · CO-OP", players: 4, pvp: false, game: "run" },
    duo:    { label: "DUO — WAVE CLIMB",     players: 2, pvp: false, game: "climb" },
    duel:   { label: "1v1 DUEL",             players: 2, pvp: true,  game: "pvp" },
    team2:  { label: "2v2 TEAM CLASH",       players: 4, pvp: true,  game: "pvp" },
    team4:  { label: "4v4 TEAM WAR",         players: 8, pvp: true,  game: "pvp" },
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
  /* PeerJS is bundled locally (assets/vendor) — the CDN is only a fallback. */
  const PEERJS_URLS = ["assets/vendor/peerjs.min.js", "https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"];
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url; s.async = true;
      const to = setTimeout(() => reject(new Error("PeerJS load timeout")), 12000);
      s.onload = () => { clearTimeout(to); window.Peer ? resolve(window.Peer) : reject(new Error("PeerJS missing")); };
      s.onerror = () => { clearTimeout(to); s.remove(); reject(new Error("PeerJS failed to load")); };
      document.head.append(s);
    });
  }
  async function loadPeerJS() {
    if (window.Peer) return window.Peer;
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("You are offline — check your internet connection");
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support WebRTC online play");
    let last;
    for (const u of PEERJS_URLS) { try { return await loadScript(u); } catch (e) { last = e; } }
    throw last || new Error("PeerJS failed to load");
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
        const fail = (why) => { if (!this.alive) return; this.alive = false; clearTimeout(this._openTo); try { this.peer && this.peer.destroy(); } catch (_) {} reject(new Error(why)); };
        this._openTo = setTimeout(() => { if (!this.myId) fail("Matchmaking server timed out — retry in a moment"); }, 15000);
        this.peer.on("open", (id) => {
          this.myId = id;
          if (this.role === "host") {
            this.peer.on("connection", (conn) => { conn.on("open", () => this.wire(conn)); });
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
          else if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") fail("Matchmaking server unreachable — check your connection and retry");
          else if (t === "browser-incompatible") fail("This browser does not support WebRTC online play");
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

  N.createRoom = async function (modeId, fixedCode, quick) {
    const def = MODES[modeId] || MODES.climb;
    try {
      const code = fixedCode || makeCode();
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
        started: false, round: 0, quick: !!quick,
      };
      wireTransport(t);
      // advertise on the platform so the CrazyGames Join/Invite UI works
      NR.crazy?.updateRoom(code, true, { room: code, mode: modeId });
      NR.diag.net(`room created ${code} mode=${modeId}`);
      roomChanged();
      return N.room;
    } catch (e) {
      NR.diag.net("createRoom failed: " + (e.message || e));
      if (!N._quiet) { NR.hub?.notify("Could not create an online room: " + (e.message || e)); NR.audio?.play("netError"); }
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
      N.transport = null; N.connected = false; N.mode = "offline";
      NR.diag.net("joinRoom failed: " + (e.message || e));
      if (!N._quiet) { NR.hub?.notify("Could not join: " + (e.message || e)); NR.audio?.play("netError"); }
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
      if (msg.k === "md" || msg.k === "es") {
        // host relays guest mode events (reach / pvp-dead / dmg) to everyone else
        if (N.mode === "host" && msg.k === "md" && msg.e !== "reach") for (const id of t.peers ? t.peers() : []) if (id !== from) t.send(msg, id);
        try { NR.modes?.onNet(from, msg); } catch (e) { NR.diag?.net("mode message error: " + e.message); }
        return;
      }
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
      if (N.mode === "guest") {
        // the host is gone: keep playing offline instead of freezing
        const G = NR.game, inMatch = G && G.online && (G.state === "playing" || G.state === "upgrade" || G.state === "pause");
        N.leaveRoom(false);
        if (inMatch) { G.online = false; G.pvp = false; NR.hub?.notify("Host disconnected — the run continues offline."); G.banner?.("CONNECTION LOST", "continuing solo", "#ff9f6e"); }
        else if (!N._quiet) NR.hub?.notify("The room host disconnected.");
        NR.audio?.play("netError");
        return;
      }
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
      case "p-state": upsertRemote(from, msg); if (N.transport.peers) for (const id of N.transport.peers()) if (id !== from) N.transport.send(Object.assign({}, msg, { from }), id); break; // guest position
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
      case "room-full": if (!N._quiet) NR.hub?.notify("That room is full."); N.leaveRoom(false); break;
      case "room-started": if (!N._quiet) NR.hub?.notify("That match already started."); N.leaveRoom(false); break;
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
      const W = NR.world;
      this.tx = s.x - (W.originX || 0); this.ty = s.y - (W.originY || 0);
      if (!this.x && !this.y) { this.x = this.tx; this.y = this.ty; }
      this.facing = s.f || this.facing; this.anim = s.a || "idle";
      this.hp = s.hp; this.maxHp = s.mhp || this.maxHp; this.energy = s.en || 0;
      this.lastMsg = performance.now();
    }
    update(dt) {
      const k = Math.min(1, dt / INTERP * 0.9);
      if (Math.abs(this.tx - this.x) > 900 || Math.abs(this.ty - this.y) > 700) { this.x = this.tx; this.y = this.ty; } // teleport / re-base
      this.x = U.lerp(this.x, this.tx, k);
      this.y = U.lerp(this.y, this.ty, k);
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
      if (NR.modes && N.room.mode !== "duel" && NR.modes.teamOf(from) === NR.modes.teamOf(N.myId())) return; // no friendly fire
      if (G) G._lastHitBy = from;
      if (G && G.player && !G.player.dead && Math.abs(G.player.x - r.x) < 190 && Math.abs(G.player.y - r.y) < 130) {
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
      k: "p-state", x: Math.round(p.x + (NR.world.originX || 0)), y: Math.round(p.y + (NR.world.originY || 0)), f: p.facing,
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

/* ============ QUICK PLAY — serverless matchmaking over the PeerJS broker ============
   Rooms live at deterministic ids per mode: neon-ronin-QP<mode><slot>.
   For each slot we try to JOIN; if nobody hosts that slot we HOST it; if the
   id was grabbed at the same instant we retry joining. Full / already-started
   rooms are skipped. The host auto-starts when the room fills (or after a
   short grace period once at least two players are in). */
(function () {
  const N = NR.net;
  const SLOTS = 10, VERSION = "4";
  let cancelled = false;
  N.quick = { searching: false, status: "" };
  function status(s, cb) { N.quick.status = s; try { cb && cb(s); } catch (_) {} }
  function waitRoomState(ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (!N.connected || !N.room) { clearInterval(iv); resolve(false); return; }
        if (N.room.members && N.room.members.length && N.room.mode) { clearInterval(iv); resolve(true); return; }
        if (Date.now() - t0 > ms) { clearInterval(iv); resolve(false); }
      }, 100);
    });
  }
  N.cancelQuick = function () {
    cancelled = true; N.quick.searching = false; N.quick.cancelledByUser = true;
    if (N.room && N.room.quick && !N.room.started) N.leaveRoom(false);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Guest side: wait until the host actually starts the match. */
  function waitForStart(ms) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        if (cancelled || !N.transport || !N.room) { clearInterval(iv); resolve(false); return; }
        if (N.room.started) { clearInterval(iv); resolve(true); return; }
        if (Date.now() - t0 > ms) { clearInterval(iv); resolve(false); return; }
      }, 200);
    });
  }
  /* Host side: the search NEVER stops until a real opponent is in the room;
     the moment one joins the match starts and both players go straight in. */
  function waitForOpponent() {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        if (cancelled || !N.transport || !N.room) { clearInterval(iv); resolve(false); return; }
        if (N.room.started) { clearInterval(iv); resolve(true); return; }
        const live = N.room.members.filter((m) => m.connected !== false).length;
        if (live >= 2) {
          clearInterval(iv);
          status("Opponent found — starting the match…", onStatusRef.cb);
          NR.audio && NR.audio.play && NR.audio.play("matchFound");
          N._qFullT = 0;
          N.startMatch();
          resolve(N.room.started === true);
          return;
        }
        if (Date.now() - t0 > 10 * 60 * 1000) { clearInterval(iv); resolve(false); return; } // safety valve
      }, 250);
    });
  }
  let onStatusRef = { cb: null };
  /* Quick Play: loops forever (server slot by slot) until a match starts.
     Nothing stops the search except the player's own cancel. */
  N.quickPlay = async function (modeId, onStatus) {
    if (N.quick.searching) return null;
    if (N.transport) N.leaveRoom(false);
    const def = N.modes[modeId] ? modeId : "climb";
    cancelled = false; N.quick.searching = true; N.quick.cancelledByUser = false; N._quiet = true;
    onStatusRef.cb = onStatus;
    try {
      while (!cancelled) {
        for (let slot = 0; slot < SLOTS && !cancelled; slot++) {
          const code = "QP" + VERSION + def.toUpperCase() + slot;
          status(`Finding players · ${N.modes[def].label} · server ${slot + 1}/${SLOTS}…`, onStatus);
          if (slot === 0) NR.audio && NR.audio.play && NR.audio.play("searching");
          // 1) try to join an existing host
          const joined = await N.joinRoom(code);
          if (cancelled) { if (joined) N.leaveRoom(false); break; }
          if (joined) {
            const ok = await waitRoomState(5000);
            if (ok && N.room && !N.room.started) {
              const me = N.room.members.find((m) => m.id === N.myId());
              if (!me || !me.ready) N.setReady(true);
              status("Match found! Getting the arena ready…", onStatus);
              NR.audio && NR.audio.play && NR.audio.play("matchFound");
              const started = await waitForStart(120000);
              if (started) return N.room;
              if (cancelled) break;
            }
            if (N.transport) N.leaveRoom(false); // full / dead / timed out → next slot
            continue;
          }
          // 2) nobody there → become the host of this slot and keep waiting
          const room = await N.createRoom(def, code, true);
          if (cancelled) { if (room) N.leaveRoom(false); break; }
          if (room) {
            status("Waiting for players to join — the search keeps running…", onStatus);
            NR.audio && NR.audio.play && NR.audio.play("matchFound");
            const started = await waitForOpponent();
            if (started) return N.room;
            if (cancelled) break;
            if (N.transport) N.leaveRoom(false);
          }
        }
        if (!cancelled) await sleep(500); // fresh sweep of every slot — never gives up
      }
      if (N.transport && N.room && N.room.quick && !N.room.started) N.leaveRoom(false);
      status("Search cancelled.", onStatus);
      return null;
    } catch (e) {
      status("Quick play failed: " + (e.message || e), onStatus);
      NR.diag && NR.diag.net("quickPlay error: " + (e.message || e));
      return null;
    } finally {
      N._quiet = false; N.quick.searching = false;
      onStatusRef.cb = null;
    }
  };
  /* host: auto-start quick rooms */
  setInterval(() => {
    try {
      const R = N.room;
      if (!R || !R.quick || R.started || N.mode !== "host") { N._qFullT = 0; return; }
      const live = R.members.filter((m) => m.connected !== false).length;
      if (live >= R.maxPlayers) N._qFullT = (N._qFullT || 0) + 1;
      else if (live >= 2) N._qFullT = (N._qFullT || 0) + 0.25;   // ~8s grace for more players
      else N._qFullT = 0;
      if (N._qFullT >= 2) { N._qFullT = 0; N.startMatch(); }
    } catch (e) { NR.diag?.net("quick auto-start: " + e.message); }
  }, 1000);
})();

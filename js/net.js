/* ============ ONLINE — PeerJS / WebRTC co-op & PvP (no own server) ============
   Players connect browser-to-browser with WebRTC. PeerJS's free public
   broker is only used to find each other; the game data then flows directly
   between the players.
   · The HOST runs the real game. Partners send their buttons (30×/s) and
     their own hero position; the host sends back a compact world snapshot
     (15×/s) plus the effects/sounds that happened, and the guest draws it.
   · CO-OP WAVES (duo): both fight the same waves; a fallen partner is
     revived when the wave is cleared, the run ends when both are down.
   · PVP 1v1 / 2v2 / 4v4: teams, no monsters, last team standing wins.
   · Rooms: private code / invite link, or QUICK MATCH into a public slot.
   · Text chat through the host, voice chat directly between players.
   · Leaderboard: best waves / floors, kept on this device and swapped with
     every player you meet (there is no central server, so it is not global).
   Everything is guarded: if PeerJS cannot load, the network is blocked or a
   player drops, the game shows a clear message and keeps working offline. */
(function () {
  const G = NR.game, U = NR.util, F = NR.fx, I = NR.input, W = NR.world, P = NR.profile;
  const N = (NR.net = { role: null, status: "offline", members: [], mode: "coop", room: "", pid: 0, inGame: false, publicRoom: false, rtt: 0 });
  const PROTO = 2;
  const PREFIX = "nronin-v2-";
  N.MODES = {
    coop: { label: "CO-OP WAVES", max: 2, teams: 0, desc: "Duo · fight the waves together" },
    pvp1: { label: "PVP 1v1", max: 2, teams: 2, desc: "Duel · last one standing" },
    pvp2: { label: "PVP 2v2", max: 4, teams: 2, desc: "Two teams of two" },
    pvp4: { label: "PVP 4v4", max: 8, teams: 2, desc: "Two teams of four" },
  };
  const LIBS = ["https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js", "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"];
  const PEER_OPTS = {
    debug: 0,
    config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] },
  };

  /* ---------------- tiny event bus for the UI ---------------- */
  const handlers = {};
  N.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  N.emit = (ev, data) => { for (const fn of handlers[ev] || []) { try { fn(data); } catch (err) { NR.reportError?.("Online UI", err); } } };
  function status(s, msg) { N.status = s; N.emit("status", { status: s, msg: msg || "" }); }
  function fail(msg) { N.emit("error", msg); status(N.role ? N.status : "offline", msg); }

  const ERR = {
    "browser-incompatible": "This browser does not support WebRTC online play.",
    "disconnected": "Lost the connection to the matchmaking server.",
    "network": "Network problem — check your internet connection.",
    "peer-unavailable": "Room not found. Check the code or ask your friend for a new link.",
    "server-error": "The matchmaking server is busy. Try again in a moment.",
    "socket-error": "Could not reach the matchmaking server.",
    "socket-closed": "The matchmaking connection closed.",
    "unavailable-id": "That room code is already in use.",
    "webrtc": "A direct connection could not be made (strict firewall / NAT).",
    "ssl-unavailable": "Online play needs a secure (https) page.",
    "invalid-id": "Invalid room code.",
    "timeout": "Connection timed out. Your network may block direct connections.",
    "lib": "Online module could not load (offline or blocked by an ad-blocker).",
  };
  N.explain = (err) => ERR[(err && err.type) || err] || (err && err.message) || String(err || "Unknown error");

  /* ---------------- helpers ---------------- */
  const clampN = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);
  const cleanName = (s) => String(s || "RONIN").replace(/[^A-Za-z0-9_ ]/g, "").trim().slice(0, 16) || "RONIN";
  const cleanStr = (s, n) => String(s == null ? "" : s).slice(0, n || 80);
  N.code = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; };
  N.normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  const peerIdFor = (code) => PREFIX + N.normCode(code).toLowerCase();
  const withTimeout = (p, ms, type) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ type: type || "timeout" }), ms))]);

  N.loadLib = function () {
    if (typeof window === "undefined") return Promise.reject({ type: "lib" });
    if (window.Peer) return Promise.resolve();
    if (N._lib) return N._lib;
    N._lib = new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if (window.Peer) { resolve(); return; }
        if (i >= LIBS.length) { N._lib = null; reject({ type: "lib" }); return; }
        const s = document.createElement("script");
        s.src = LIBS[i++]; s.async = true; s.crossOrigin = "anonymous";
        s.onload = () => (window.Peer ? resolve() : next());
        s.onerror = next;
        (document.head || document.body).appendChild(s);
      };
      next();
    });
    return withTimeout(N._lib, 15000, "lib");
  };
  function makePeer(id) {
    return new Promise((resolve, reject) => {
      let opened = false, peer;
      try { peer = id ? new window.Peer(id, PEER_OPTS) : new window.Peer(PEER_OPTS); } catch (err) { reject(err); return; }
      const t = setTimeout(() => { if (!opened) { try { peer.destroy(); } catch (_) {} reject({ type: "timeout" }); } }, 12000);
      peer.on("open", () => { opened = true; clearTimeout(t); resolve(peer); });
      peer.on("error", (err) => {
        if (!opened) { clearTimeout(t); try { peer.destroy(); } catch (_) {} reject(err); return; }
        onPeerError(err);
      });
    });
  }
  function onPeerError(err) {
    const type = err && err.type;
    if (type === "peer-unavailable") return; // a voice call / probe to someone who left
    if (type === "disconnected" || type === "network" || type === "socket-error" || type === "socket-closed" || type === "server-error") {
      // the broker is only needed to find players — existing links keep working
      try { if (N.peer && N.peer.disconnected && !N.peer.destroyed) setTimeout(() => { try { N.peer.reconnect(); } catch (_) {} }, 1500); } catch (_) {}
      if (!N.connCount()) fail(N.explain(err));
      return;
    }
    fail(N.explain(err));
  }
  N.connCount = () => (N.role === "host" ? N.conns.size : N.hostConn && N.hostConn.open ? 1 : 0);
  N.conns = new Map(); // host: pid → { conn, member, last }
  N.hostConn = null;

  /* ---------------- my member info ---------------- */
  function heroIds() { return NR.heroes ? NR.heroes.ROSTER.map((h) => h.id) : ["kaito"]; }
  N.myStats = function () {
    const t = new NR.Player();
    try { NR.applyCharacter(t, G.character || P.character); NR.evolution?.apply(t); } catch (_) {}
    return { maxHp: t.maxHp, dmgMul: t.dmgMul, speedMul: t.speedMul, damageTakenMul: t.damageTakenMul, jumpMax: t.jumpMax, dashMax: t.dashMax,
      energyMul: t.energyMul || 1, critCh: t.critCh, lifesteal: t.lifesteal || 0, stormMul: t.stormMul || 1, guardMul: t.guardMul || 1 };
  };
  N.myInfo = function () {
    return { name: cleanName(NR.crazy ? NR.crazy.playerName() : P.name), heroId: NR.heroes ? NR.heroes.current().id : "kaito",
      look: P.appearance, pet: P.pet || "", summon: NR.vault ? NR.vault.summon() : "", stats: N.myStats(), level: P.level || 1, voice: !!(N.voice && N.voice.on) };
  };
  function sanitizeInfo(x) {
    x = x && typeof x === "object" ? x : {};
    const look = {};
    if (x.look && typeof x.look === "object") for (const k of Object.keys(x.look).slice(0, 20)) if (typeof x.look[k] === "string") look[cleanStr(k, 20)] = cleanStr(x.look[k], 90);
    const s = x.stats && typeof x.stats === "object" ? x.stats : {};
    return {
      name: cleanName(x.name), heroId: heroIds().includes(x.heroId) ? x.heroId : "kaito", look: Object.keys(look).length ? look : { ...P.appearance },
      pet: cleanStr(x.pet, 90), summon: cleanStr(x.summon, 90), level: clampN(x.level, 1, 999, 1), voice: !!x.voice,
      stats: { maxHp: clampN(s.maxHp, 50, 800, 100), dmgMul: clampN(s.dmgMul, 0.5, 5, 1), speedMul: clampN(s.speedMul, 0.6, 2, 1), damageTakenMul: clampN(s.damageTakenMul, 0.3, 2, 1),
        jumpMax: clampN(s.jumpMax, 1, 4, 2) | 0, dashMax: clampN(s.dashMax, 1, 4, 1) | 0, energyMul: clampN(s.energyMul, 0.5, 3, 1), critCh: clampN(s.critCh, 0, 0.8, 0.05),
        lifesteal: clampN(s.lifesteal, 0, 0.2, 0), stormMul: clampN(s.stormMul, 0.5, 5, 1), guardMul: clampN(s.guardMul, 0.5, 3, 1) },
    };
  }

  /* ---------------- sending ---------------- */
  function sendTo(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (err) { /* channel closing */ } }
  N.send = function (msg) {
    if (N.role === "host") for (const c of N.conns.values()) sendTo(c.conn, msg);
    else if (N.hostConn) sendTo(N.hostConn, msg);
  };
  function lobbyMsg() { return { t: "lobby", members: N.members, mode: N.mode, room: N.room, started: N.inGame, pub: N.publicRoom }; }
  function broadcastLobby() { N.send(lobbyMsg()); N.emit("lobby", N.members); }

  /* ---------------- HOST ---------------- */
  let nextPid = 1;
  N.host = async function (mode, opts = {}) {
    await N.leave(true);
    status("connecting", "Creating room…");
    try { await N.loadLib(); } catch (err) { status("offline"); fail(N.explain(err)); return false; }
    let peer = null, code = opts.code || N.code();
    for (let tries = 0; tries < 4 && !peer; tries++) {
      try { peer = await makePeer(peerIdFor(code)); }
      catch (err) {
        if (err && err.type === "unavailable-id" && !opts.code) { code = N.code(); continue; }
        status("offline"); fail(N.explain(err)); return false;
      }
    }
    if (!peer) { status("offline"); fail(ERR["unavailable-id"]); return false; }
    N.peer = peer; N.role = "host"; N.pid = 0; nextPid = 1; N.room = code; N.mode = N.MODES[mode] ? mode : "coop";
    N.publicRoom = !!opts.public;
    N.members = [{ pid: 0, peer: peer.id, team: 0, ready: true, host: true, ...N.myInfo() }];
    peer.on("connection", onGuestConnection);
    peer.on("call", onCall);
    peer.on("disconnected", () => { try { if (!peer.destroyed) peer.reconnect(); } catch (_) {} });
    NR.crazy?.updateRoom(code, true);
    status("lobby", N.publicRoom ? "Waiting for a random player…" : "Room ready — invite a friend!");
    broadcastLobby();
    return true;
  };
  function onGuestConnection(conn) {
    let pid = -1;
    const helloT = setTimeout(() => { if (pid < 0) try { conn.close(); } catch (_) {} }, 10000);
    conn.on("data", (msg) => {
      try {
        if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;
        if (pid < 0) {
          if (msg.t !== "hello") return;
          clearTimeout(helloT);
          if (msg.v !== PROTO) { sendTo(conn, { t: "deny", reason: "version" }); setTimeout(() => conn.close(), 400); return; }
          if (N.inGame) { sendTo(conn, { t: "deny", reason: "started" }); setTimeout(() => conn.close(), 400); return; }
          if (N.members.length >= N.MODES[N.mode].max) { sendTo(conn, { t: "deny", reason: "full" }); setTimeout(() => conn.close(), 400); return; }
          pid = nextPid++;
          const info = sanitizeInfo(msg.info);
          const team = autoTeam();
          const member = { pid, peer: conn.peer, team, ready: false, host: false, ...info };
          N.members.push(member);
          N.conns.set(pid, { conn, member, last: Date.now(), chatT: 0 });
          sendTo(conn, { t: "welcome", pid, room: N.room, mode: N.mode });
          sendTo(conn, { t: "lb", list: N.board.top(40) });
          broadcastLobby();
          chat(null, `${member.name} joined`);
          NR.audio?.play?.("powerUp");
          if (N.members.length >= N.MODES[N.mode].max) NR.crazy?.updateRoom(N.room, false);
          maybeAutoStart();
          return;
        }
        onGuestMessage(pid, msg);
      } catch (err) { NR.reportError?.("Online message", err); }
    });
    conn.on("close", () => { clearTimeout(helloT); if (pid >= 0) dropGuest(pid, "left"); });
    conn.on("error", () => { if (pid >= 0) dropGuest(pid, "lost connection"); });
  }
  function autoTeam() {
    if (!N.MODES[N.mode].teams) return 0;
    const a = N.members.filter((m) => m.team === 0).length, b = N.members.filter((m) => m.team === 1).length;
    return a <= b ? 0 : 1;
  }
  function dropGuest(pid, why) {
    const c = N.conns.get(pid);
    if (!c) return;
    N.conns.delete(pid);
    try { c.conn.close(); } catch (_) {}
    N.members = N.members.filter((m) => m.pid !== pid);
    N.voice.hang(c.member.peer);
    chat(null, `${c.member.name} ${why}`);
    if (N.inGame) {
      const rp = G.others.find((q) => q.netPid === pid);
      if (rp) { F.teleport(rp.x, rp.y - 40, "purple"); G.others = G.others.filter((q) => q !== rp); NR.hub?.notify?.(`${c.member.name} ${why}`); }
      if (!G.others.length && G.pvp) endPvp(G.me.team, "opponent left");
    }
    if (!N.inGame && N.room) NR.crazy?.updateRoom(N.room, true);
    broadcastLobby();
  }
  function onGuestMessage(pid, msg) {
    const c = N.conns.get(pid);
    if (!c) return;
    c.last = Date.now();
    switch (msg.t) {
      case "in": {
        const rp = G.others.find((q) => q.netPid === pid);
        if (!rp || !N.inGame) return;
        const held = {};
        if (msg.h && typeof msg.h === "object") for (const a of HELD) held[a] = !!msg.h[a];
        rp.netIn.held = held;
        if (Array.isArray(msg.pr)) for (const a of msg.pr.slice(0, 20)) if (PRESS.has(a)) rp.netIn.pressed[a] = true;
        const s = msg.s;
        if (s && typeof s === "object" && !rp.dead) rp.netPos = { x: clampN(s.x, 0, W.W, rp.x), y: clampN(s.y, -400, W.groundY + 10, rp.y), vx: clampN(s.vx, -3000, 3000, 0), vy: clampN(s.vy, -3000, 3000, 0), f: s.f < 0 ? -1 : 1, og: !!s.og };
        break;
      }
      case "info": {
        const m = N.members.find((x) => x.pid === pid);
        if (!m) return;
        Object.assign(m, sanitizeInfo(msg.info));
        if (typeof msg.ready === "boolean") m.ready = msg.ready;
        broadcastLobby();
        maybeAutoStart();
        break;
      }
      case "team": {
        const m = N.members.find((x) => x.pid === pid);
        if (!m || N.inGame || !N.MODES[N.mode].teams) return;
        const want = msg.team === 1 ? 1 : 0;
        const size = N.MODES[N.mode].max / 2;
        if (N.members.filter((x) => x.team === want).length < size) { m.team = want; broadcastLobby(); }
        break;
      }
      case "chat": {
        if (Date.now() - c.chatT < 700) return;
        c.chatT = Date.now();
        chat(c.member.name, cleanStr(msg.text, 120), pid);
        break;
      }
      case "pick": {
        const rp = G.others.find((q) => q.netPid === pid);
        const d = rp && rp.upOffer && rp.upOffer.find((x) => x.id === msg.id);
        if (d) { try { d.apply(rp); } catch (_) {} rp.upOffer = null; F.text(rp.x, rp.y - 140, d.name, { col: "#fff4b0", size: 18 }); }
        break;
      }
      case "lb": N.board.merge(msg.list); break;
      case "ping": sendTo(c.conn, { t: "pong", ts: msg.ts }); break;
      case "voice": { const m = N.members.find((x) => x.pid === pid); if (m) { m.voice = !!msg.on; broadcastLobby(); } break; }
    }
  }
  function chat(from, text, pid) {
    if (!text) return;
    const msg = { t: "chat", from: from || "", text, pid: pid === undefined ? -1 : pid };
    N.send(msg);
    N.emit("chat", msg);
  }
  N.chat = function (text) {
    text = cleanStr(text, 120).trim();
    if (!text || (NR.crazy && NR.crazy.settings.disableChat)) return;
    if (N.role === "host") chat(N.members[0].name, text, 0);
    else if (N.role === "guest") N.send({ t: "chat", text });
  };
  N.setTeam = function (team) {
    if (N.role === "guest") { N.send({ t: "team", team }); return; }
    const me = N.members[0];
    const size = N.MODES[N.mode].max / 2;
    if (me && N.members.filter((x) => x.team === team).length < size) { me.team = team; broadcastLobby(); }
  };
  N.setMode = function (mode) {
    if (N.role !== "host" || N.inGame || !N.MODES[mode]) return false;
    if (N.members.length > N.MODES[mode].max) { N.emit("error", "Too many players for that mode."); return false; }
    N.mode = mode;
    N.members.forEach((m, i) => { m.team = N.MODES[mode].teams ? i % 2 : 0; });
    broadcastLobby();
    return true;
  };
  N.setReady = function (ready) {
    if (N.role === "guest") N.send({ t: "info", info: N.myInfo(), ready: !!ready });
    N.myReady = !!ready;
  };
  N.refreshInfo = function () {
    if (N.role === "guest") N.send({ t: "info", info: N.myInfo(), ready: !!N.myReady });
    else if (N.role === "host" && N.members[0]) { Object.assign(N.members[0], N.myInfo()); broadcastLobby(); }
  };
  let autoT = 0;
  function maybeAutoStart() {
    if (!N.publicRoom || N.role !== "host" || N.inGame) return;
    clearTimeout(autoT);
    if (N.members.length >= N.MODES[N.mode].max) {
      N.emit("countdown", 3);
      autoT = setTimeout(() => { if (N.members.length >= N.MODES[N.mode].max && !N.inGame) N.start(); }, 3000);
    }
  }
  N.canStart = function () {
    if (N.role !== "host" || N.inGame) return "";
    const m = N.MODES[N.mode];
    if (N.members.length < 2) return "Waiting for another player…";
    if (m.teams) {
      const a = N.members.filter((x) => x.team === 0).length, b = N.members.filter((x) => x.team === 1).length;
      if (!a || !b) return "Both teams need at least one player.";
    }
    return "ok";
  };
  N.start = function () {
    const why = N.canStart();
    if (why !== "ok") { N.emit("error", why || "Only the host can start."); return false; }
    const seed = Math.floor(Math.random() * 1e9);
    const chapter = Math.floor(Math.random() * Math.max(1, (NR.adventure && NR.adventure.chapters && NR.adventure.chapters.length) || 5));
    const msg = { t: "start", mode: N.mode, seed, chapter, difficulty: P.difficulty || "normal", members: N.members };
    N.send(msg);
    beginMatch(msg);
    return true;
  };

  /* ---------------- GUEST ---------------- */
  N.join = async function (code, opts = {}) {
    code = N.normCode(code);
    if (!code) { N.emit("error", "Enter a room code."); return false; }
    if (!opts.keep) await N.leave(true);
    status("connecting", opts.quiet ? "Searching…" : "Joining room " + code + "…");
    try { await N.loadLib(); } catch (err) { status("offline"); if (!opts.quiet) fail(N.explain(err)); return false; }
    let peer;
    try { peer = N.peer && !N.peer.destroyed && opts.keep ? N.peer : await makePeer(); }
    catch (err) { status("offline"); if (!opts.quiet) fail(N.explain(err)); return false; }
    N.peer = peer;
    const result = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (done) return; done = true; peer.off && peer.off("error", perr); resolve(r); };
      const perr = (err) => finish({ ok: false, reason: err && err.type === "peer-unavailable" ? "notfound" : N.explain(err) });
      peer.on("error", perr);
      let conn;
      try { conn = peer.connect(peerIdFor(code), { reliable: true, metadata: { v: PROTO } }); }
      catch (err) { finish({ ok: false, reason: N.explain(err) }); return; }
      if (!conn) { finish({ ok: false, reason: "notfound" }); return; }
      const t = setTimeout(() => { try { conn.close(); } catch (_) {} finish({ ok: false, reason: opts.quiet ? "notfound" : ERR.timeout }); }, opts.timeout || 12000);
      conn.on("open", () => { sendTo(conn, { t: "hello", v: PROTO, info: N.myInfo() }); });
      conn.on("data", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "deny") { clearTimeout(t); try { conn.close(); } catch (_) {} finish({ ok: false, reason: msg.reason }); return; }
        if (msg.t === "welcome" && !done) {
          clearTimeout(t);
          N.hostConn = conn; N.role = "guest"; N.pid = msg.pid | 0; N.room = code; N.mode = N.MODES[msg.mode] ? msg.mode : "coop";
          conn.on("data", (m) => { try { onHostMessage(m); } catch (err) { NR.reportError?.("Online message", err); } });
          conn.on("close", () => hostGone());
          conn.on("error", () => hostGone());
          finish({ ok: true });
        }
      });
      conn.on("error", () => { clearTimeout(t); finish({ ok: false, reason: ERR.webrtc }); });
    });
    if (!result.ok) {
      const reasons = { full: "That room is full.", started: "That match already started.", version: "Your friend has a different game version — refresh both pages.", notfound: ERR["peer-unavailable"] };
      if (!opts.keep) { try { peer.destroy(); } catch (_) {} N.peer = null; }
      status("offline");
      if (!opts.quiet) fail(reasons[result.reason] || result.reason);
      return result.reason || false;
    }
    peer.on("call", onCall);
    peer.on("disconnected", () => { try { if (!peer.destroyed) peer.reconnect(); } catch (_) {} });
    status("lobby", "Joined room " + code);
    NR.crazy?.updateRoom(code, false);
    sendTo(N.hostConn, { t: "lb", list: N.board.top(40) });
    return true;
  };
  function hostGone() {
    if (N.role !== "guest") return;
    const wasGame = N.inGame && G.netGuest;
    N.cleanup();
    fail("The host left or the connection dropped.");
    if (wasGame && (G.state === "playing" || G.state === "upgrade")) { G.netGuest = false; G.others = []; G.finishRun(false); }
  }
  function onHostMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.t) {
      case "lobby":
        if (Array.isArray(msg.members)) N.members = msg.members.slice(0, 8).map((m) => ({ ...sanitizeInfo(m), pid: m.pid | 0, peer: cleanStr(m.peer, 80), team: m.team === 1 ? 1 : 0, ready: !!m.ready, host: !!m.host }));
        if (N.MODES[msg.mode]) N.mode = msg.mode;
        N.publicRoom = !!msg.pub;
        N.emit("lobby", N.members);
        N.voice.sync();
        break;
      case "start": beginMatch(msg); break;
      case "s": applySnap(msg); break;
      case "chat": N.emit("chat", { from: cleanStr(msg.from, 20), text: cleanStr(msg.text, 120), pid: msg.pid | 0 }); break;
      case "up": guestUpgrade(msg); break;
      case "over": guestOver(msg); break;
      case "lb": N.board.merge(msg.list); break;
      case "pong": N.rtt = Date.now() - (msg.ts || Date.now()); N.emit("rtt", N.rtt); break;
      case "countdown": N.emit("countdown", msg.n); break;
    }
  }

  /* ---------------- quick match (public slots) ---------------- */
  N.quickMatch = async function (mode) {
    mode = N.MODES[mode] ? mode : "coop";
    await N.leave(true);
    status("connecting", "Looking for players…");
    try { await N.loadLib(); } catch (err) { status("offline"); fail(N.explain(err)); return false; }
    N._searching = true;
    for (let round = 0; round < 2 && N._searching; round++) {
      for (let n = 0; n < 6 && N._searching; n++) {
        const code = `PUB-${mode.toUpperCase()}-${n}`;
        const r = await N.join(code, { quiet: true, timeout: 6000, keep: true });
        if (r === true) { N._searching = false; return true; }
        if (r === "notfound") {
          // empty slot → become its host and wait for someone
          if (N.peer) { try { N.peer.destroy(); } catch (_) {} N.peer = null; }
          const ok = await N.host(mode, { code, public: true }).catch(() => false);
          if (ok) { N._searching = false; return true; }
        }
      }
    }
    N._searching = false;
    status("offline");
    fail("No match found right now. Create a room and invite a friend instead.");
    return false;
  };
  N.cancelSearch = () => { N._searching = false; };

  /* ---------------- leave / cleanup ---------------- */
  N.cleanup = function () {
    N.voice.stop();
    for (const c of N.conns.values()) { try { c.conn.close(); } catch (_) {} }
    N.conns.clear();
    if (N.hostConn) { try { N.hostConn.close(); } catch (_) {} }
    N.hostConn = null;
    if (N.peer) { try { N.peer.destroy(); } catch (_) {} }
    N.peer = null; N.role = null; N.members = []; N.room = ""; N.inGame = false; N.publicRoom = false; N.myReady = false;
    clearTimeout(autoT);
    NR.crazy?.leftRoom();
    status("offline");
    N.emit("lobby", N.members);
  };
  N.leave = async function (silent) {
    N._searching = false;
    if (!N.role && !N.peer) return;
    if (N.role === "guest" && N.inGame && G.netGuest && G.state === "playing") { G.netGuest = false; G.others = []; G.finishRun(false); }
    if (N.role === "host" && N.inGame) N.send({ t: "over", reason: "host left" });
    N.cleanup();
    if (!silent) NR.hub?.notify?.("Left the online room");
  };
  if (typeof window !== "undefined") window.addEventListener("beforeunload", () => { try { N.cleanup(); } catch (_) {} });

  /* ================= MATCH ================= */
  const HELD = ["left", "right", "jump", "down", "attack", "dash", "special", "tactical", "parry", "kunai", "interact"];
  const PRESS = new Set([...HELD, "ab1", "ab2", "ab3", "summon"]);

  function applyStats(q, s) {
    q.maxHp = s.maxHp; q.hp = q.maxHp; q.ghostHp = q.maxHp;
    q.dmgMul = s.dmgMul; q.speedMul = s.speedMul; q.damageTakenMul = s.damageTakenMul;
    q.jumpMax = s.jumpMax; q.dashMax = s.dashMax; q.dashCharges = s.dashMax; q.energyMul = s.energyMul;
    q.critCh = s.critCh; q.lifesteal = s.lifesteal; q.stormMul = s.stormMul; q.guardMul = s.guardMul;
  }
  function makeRemote(m, i, n) {
    const q = new NR.Player();
    try { NR.applyCharacter(q, G.character); } catch (_) {}
    applyStats(q, m.stats);
    q.heroId = m.heroId; q.look = m.look; q.pet = m.pet || ""; q.summonId = m.summon || "";
    q.netName = m.name; q.netPid = m.pid; q.team = m.team || 0;
    q.netIn = { held: {}, pressed: {} };
    spawnAt(q, i, n);
    NR.abilities?.reset(q);
    return q;
  }
  function spawnAt(q, i, n) {
    if (G.pvp) {
      const side = q.team === 0 ? 0.2 : 0.8;
      q.x = W.W * side + ((i % 4) - 1.5) * 70; q.facing = q.team === 0 ? 1 : -1;
    } else q.x = W.W / 2 + (i - (n - 1) / 2) * 120;
    q.y = W.groundY; q.vx = q.vy = 0;
  }
  function beginMatch(msg) {
    const mode = N.MODES[msg.mode] ? msg.mode : "coop";
    N.mode = mode; N.inGame = true;
    const members = (Array.isArray(msg.members) ? msg.members : N.members).slice(0, 8);
    N.matchMembers = members.map((m) => ({ ...sanitizeInfo(m), pid: m.pid | 0, team: m.team === 1 ? 1 : 0 }));
    NR.lobby?.closeModals?.();
    document.querySelectorAll(".lobby-modal.open").forEach((m) => m.classList.remove("open"));
    const keepMode = P.mode, keepUnlocked = P.unlocked, keepDiff = P.difficulty;
    P.mode = "survival";
    P.unlocked = Math.max(P.unlocked || 0, 99);
    if (msg.difficulty) P.difficulty = ["casual", "normal", "hard"].includes(msg.difficulty) ? msg.difficulty : "normal";
    try { G.start({ chapter: msg.chapter | 0, online: true }); }
    finally { P.mode = keepMode; P.unlocked = keepUnlocked; P.difficulty = keepDiff; }
    const pvp = !!N.MODES[mode].teams;
    G.pvp = pvp;
    const all = N.matchMembers, n = all.length;
    const meM = all.find((m) => m.pid === N.pid) || all[0];
    G.me = G.player;
    G.me.netName = meM.name; G.me.netPid = N.pid; G.me.team = meM.team;
    spawnAt(G.me, all.indexOf(meM), n);
    G.others = all.filter((m) => m.pid !== N.pid).map((m) => makeRemote(m, all.indexOf(m), n));
    G.netGuest = N.role === "guest";
    if (pvp) {
      G.startT = 1e9; G.wave = 0;
      G.banner(N.MODES[mode].label, G.me.team === 0 ? "TEAM BLUE · defeat the red team" : "TEAM RED · defeat the blue team", G.me.team === 0 ? "#6ad1ff" : "#ff6b6b");
    } else G.banner("CO-OP", "Fight together · a fallen partner returns when the wave is cleared", "#8af5e1");
    N.matchT = 0; snapAcc = 0; last = new Map(); keyT = 0; pendPress.clear();
    ids = new WeakMap(); nextId = 1; guestObjs.clear();
    N.emit("start", { mode, members: all });
    NR.crazy?.updateRoom(N.room, false);
  }

  /* host: drive remote fighters with their buttons */
  G.updateOthers = function (dt) {
    if (G.netGuest) return;
    const keep = { keys: I.keys, touch: I.touch, pressed: I.pressed, mouse: I.mouse };
    const me = G.player;
    try {
      for (const q of G.others) {
        if (!q.netIn) q.netIn = { held: {}, pressed: {} };
        I.keys = {}; I.touch = q.netIn.held; I.pressed = q.netIn.pressed; I.mouse = { x: 0, y: 0, l: false, r: false };
        G.player = q;
        try {
          q.update(dt, G);
          if (!q.dead && NR.abilities) {
            for (let i = 0; i < 3; i++) if (q.netIn.pressed["ab" + (i + 1)]) NR.abilities.tryCast(q, i);
            if (q.netIn.pressed.summon) NR.abilities.trySummon(q);
          }
        } catch (err) { NR.reportError?.("Partner update", err); }
        q.netIn.pressed = {};
        // the partner's own screen is the truth for where they stand
        const s = q.netPos;
        if (s && !q.dead && q.hitstun <= 0) {
          const dx = s.x - q.x;
          q.x = Math.abs(dx) > 160 ? s.x : q.x + dx * 0.5;
          q.y = Math.abs(s.y - q.y) > 160 ? s.y : q.y + (s.y - q.y) * 0.5;
          q.facing = s.f;
        }
      }
    } finally {
      I.keys = keep.keys; I.touch = keep.touch; I.pressed = keep.pressed; I.mouse = keep.mouse;
      G.player = me;
    }
  };
  G.onPlayerDown = function (q) {
    const name = q.netName || "PLAYER";
    if (G.pvp) G.banner(name + " DOWN", "", "#ff6b6b");
    else G.banner(name + " IS DOWN", "Clear the wave to bring them back!", "#ff9f5a");
  };

  /* PvP: other fighters become targets of your blade, storm and abilities */
  function pvpAdapters(attacker) {
    if (!G.pvp || !attacker) return [];
    return G.allPlayers().filter((q) => q !== attacker && !q.dead && q.team !== attacker.team).map((q) => ({
      x: q.x, y: q.y, w: q.w, h: q.h, maxHp: q.maxHp, dead: false, spawnT: 0, boss: false, isPlayer: true, facing: q.facing, touchCd: 1,
      get hp() { return q.hp; },
      hurt(dmg, kx) {
        if (G.netGuest) return;
        const keep = G.player; G.player = q;
        try { G.hurtPlayer(dmg * 0.6, Math.sign(kx) || 1, "pvp"); } finally { G.player = keep; }
      },
      update() {}, draw() {},
    }));
  }
  N.pvpAdapters = pvpAdapters;
  if (NR.abilities) NR.abilities.pvpTargets = pvpAdapters;
  for (const fn of ["playerStrike", "stormDamage"]) {
    const orig = G[fn];
    G[fn] = function (arg) {
      if (G.netGuest) return; // the host resolves every hit
      if (!G.pvp) return orig.call(this, arg);
      const attacker = fn === "stormDamage" ? arg : G.player;
      const keep = G.enemies;
      G.enemies = keep.concat(pvpAdapters(attacker));
      try { return orig.call(this, arg); } finally { G.enemies = keep; }
    };
  }
  // guests never award kills/score themselves — the host's numbers arrive in the snapshot
  for (const fn of ["onEnemyKilled", "onBossKilled", "addScore"]) {
    const orig = G[fn];
    if (typeof orig !== "function") continue;
    G[fn] = function (...a) { if (G.netGuest) return; return orig.apply(this, a); };
  }
  // no pausing an online match
  for (const fn of ["togglePause", "autoPause"]) {
    const orig = G[fn];
    G[fn] = function (...a) {
      if (N.inGame && (G.state === "playing" || G.state === "pause")) {
        if (G.state === "pause") { G.state = "playing"; NR.ui.hideAll(); }
        if (fn === "togglePause") N.emit("menu");
        return;
      }
      return orig.apply(this, a);
    };
  }
  // guests pick their upgrades on their own screen
  const openUp = NR.ui.openUpgrades;
  NR.ui.openUpgrades = function (defs, g) {
    if (N.role === "host" && N.inGame && !G.pvp) {
      for (const q of G.others) {
        const c = N.conns.get(q.netPid);
        if (!c) continue;
        q.upOffer = NR.upgrades.roll(q);
        sendTo(c.conn, { t: "up", wave: G.wave, list: q.upOffer.map((d) => ({ id: d.id, ico: d.ico, name: d.name, desc: d.desc, rar: d.rar })) });
      }
    }
    return openUp.call(this, defs, g);
  };
  const closeUp = G.closeUpgrade;
  G.closeUpgrade = function () {
    if (G.netGuest) { G.state = "playing"; return; }
    return closeUp.call(this);
  };
  function guestUpgrade(msg) {
    if (!G.netGuest || !Array.isArray(msg.list)) return;
    const rar = NR.upgrades.rarityLabel;
    const defs = msg.list.slice(0, 3).map((d) => ({
      id: cleanStr(d.id, 30), ico: cleanStr(d.ico, 8), name: cleanStr(d.name, 40), desc: cleanStr(d.desc, 120), rar: rar[d.rar] ? d.rar : "common",
      apply: () => N.send({ t: "pick", id: cleanStr(d.id, 30) }),
    }));
    if (!defs.length) return;
    // escape any HTML the host might send, the card template uses innerHTML
    const esc = (s) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
    for (const d of defs) { d.ico = esc(d.ico); d.name = esc(d.name); d.desc = esc(d.desc); }
    G.state = "upgrade";
    G.wave = msg.wave | 0 || G.wave;
    openUp.call(NR.ui, defs, G);
    clearTimeout(N._upT);
    N._upT = setTimeout(() => { if (G.netGuest && G.state === "upgrade") { defs[0].apply(); G.state = "playing"; NR.ui.hideAll(); } }, 15000);
  }

  /* run end */
  const finish = G.finishRun;
  G.finishRun = function (victory) {
    const online = N.inGame;
    if (online && N.role === "host" && !G.pvp) N.send({ t: "over", reason: "team down", wave: G.wave, score: G.score });
    const r = finish.call(this, victory);
    if (G.mode === "survival" && !G.pvp) N.board.record(G.wave, online ? "coop" : "solo", online ? G.others.map((q) => q.netName).join(", ") : "");
    if (online) { N.inGame = false; G.netGuest = false; N.emit("end", { pvp: false }); if (N.role === "host") broadcastLobby(); }
    return r;
  };
  function guestOver(msg) {
    if (msg.pvp) { showPvpEnd(msg.win, msg.reason); return; }
    if (N.inGame && G.netGuest) {
      if (Number.isFinite(msg.wave)) G.wave = msg.wave;
      if (Number.isFinite(msg.score)) G.score = msg.score;
      G.netGuest = false; // award this device's coins for the shared run
      G.finishRun(false);
    }
    if (msg.reason === "host left") fail("The host left the match.");
  }
  function endPvp(winTeam, reason) {
    if (N.role !== "host" || !N.inGame) return;
    N.send({ t: "over", pvp: true, win: winTeam, reason: reason || "" });
    showPvpEnd(winTeam, reason);
  }
  function showPvpEnd(winTeam, reason) {
    if (!N.inGame) return;
    N.inGame = false;
    const me = G.me || G.player;
    const won = me && me.team === winTeam;
    NR.economy.addCoins(won ? 120 : 40);
    N.board.record(1, "pvp-win", won ? "won" : "lost");
    G.state = "over"; G.netGuest = false;
    NR.ui.hideAll();
    N.emit("end", { pvp: true, won, win: winTeam, reason, coins: won ? 120 : 40 });
    if (N.role === "host") setTimeout(broadcastLobby, 500);
  }

  /* ================= SNAPSHOTS ================= */
  const SNAP_HZ = 15, INPUT_HZ = 30;
  let snapAcc = 0, keyT = 0, last = new Map(), ids = new WeakMap(), nextId = 1;
  const guestObjs = new Map();
  const SKIP = new Set(["actor", "spr", "pose", "target", "owner", "parent", "netIn", "netPos", "upOffer", "_burn", "_nid", "src", "G", "clip", "img", "canvas", "ctx"]);
  const REG = new Map(), BYNAME = {};
  function registry() {
    if (REG.size) return;
    for (const k of Object.keys(NR)) {
      const v = NR[k];
      if (typeof v === "function" && /^[A-Z]/.test(k) && v.prototype) { REG.set(v, k); BYNAME[k] = v; }
    }
  }
  function className(o) {
    registry();
    let p = Object.getPrototypeOf(o);
    while (p && p !== Object.prototype) { const n = REG.get(p.constructor); if (n) return n; p = Object.getPrototypeOf(p); }
    return "";
  }
  const idOf = (o) => { let i = ids.get(o); if (!i) { i = nextId++; ids.set(o, i); } return i; };
  function plain(v, d) {
    if (d > 2) return false;
    if (Array.isArray(v)) return v.length <= 40 && v.every((x) => x === null || typeof x !== "object" ? typeof x !== "function" : plain(x, d + 1));
    const pr = Object.getPrototypeOf(v);
    if (pr !== Object.prototype && pr !== null) return false;
    const ks = Object.keys(v);
    return ks.length <= 30 && ks.every((k) => { const x = v[k]; return x === null || (typeof x !== "object" ? typeof x !== "function" : plain(x, d + 1)); });
  }
  const rnd = (v) => (Math.abs(v) >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);
  function ser(o, full) {
    const id = idOf(o);
    const prev = (!full && last.get(id)) || {};
    const now = {};
    const out = { i: id };
    if (full || !last.has(id)) out.c = className(o);
    for (const k in o) {
      if (SKIP.has(k)) continue;
      const v = o[k], t = typeof v;
      let val;
      if (t === "number") val = Number.isFinite(v) ? rnd(v) : 0;
      else if (t === "string" || t === "boolean" || v === null) val = v;
      else if (t === "object" && plain(v, 0)) val = JSON.stringify(v);
      else continue;
      now[k] = val;
      if (full || prev[k] !== val) out[k] = t === "object" && v !== null ? JSON.parse(val) : val;
    }
    if (o.spr && o.spr.sheet) {
      const sv = o.spr.sheet + "|" + o.spr.anim + "|" + o.spr.frame;
      now.__spr = sv;
      if (full || prev.__spr !== sv) out.spr = [o.spr.sheet, o.spr.anim, o.spr.frame];
    }
    last.set(id, now);
    return out;
  }
  const G_KEYS = ["wave", "score", "combo", "comboT", "chapter", "startT", "bossActive", "chronoT", "timeScale"];
  function hostTick(rd) {
    N.matchT += rd;
    snapAcc += rd; keyT += rd;
    if (snapAcc < 1 / SNAP_HZ) return;
    snapAcc = 0;
    const full = keyT > 2;
    if (full) keyT = 0;
    const lists = {};
    for (const k of ["enemies", "bolts", "shots", "shockwaves", "pickups"]) lists[k] = G[k].slice(0, 80).map((o) => ser(o, full));
    const pl = G.allPlayers().map((q) => ({ ...ser(q, full), np: q.netPid | 0 }));
    const g = {};
    for (const k of G_KEYS) g[k] = G[k];
    g.kills = G.stats.kills; g.spawnLeft = G.spawnQueue.length; g.boss = G.bossRef ? idOf(G.bossRef) : 0;
    const HA = NR.abilities;
    const ha = HA ? { s: HA.shots.map((b) => ({ x: b.x | 0, y: b.y | 0, vx: b.vx | 0, vy: b.vy | 0, col: b.col, size: b.size, pierce: b.pierce, arc: b.arc })),
      k: HA.strikes, a: HA.allies, b: HA.beams } : null;
    const msg = { t: "s", f: full ? 1 : 0, g, L: lists, pl, ha, ev: evq.splice(0, 160) };
    evq.length = 0;
    N.send(msg);
    // PvP: last team standing
    if (G.pvp && N.matchT > 1) {
      const alive = new Set(G.allPlayers().filter((q) => !q.dead).map((q) => q.team));
      if (alive.size <= 1) endPvp(alive.size ? [...alive][0] : -1, "");
    }
    // heartbeat: drop silent guests
    const now = Date.now();
    for (const [pid, c] of N.conns) if (now - c.last > 20000) dropGuest(pid, "timed out");
  }
  function build(c, d) {
    registry();
    let o;
    if (c === "Player") o = new NR.Player();
    else { const Ctor = BYNAME[c]; o = Ctor ? Object.create(Ctor.prototype) : { draw() {}, update() {} }; }
    return o;
  }
  function applyEntity(o, d) {
    for (const k in d) { if (k === "i" || k === "c" || k === "spr" || k === "np") continue; o[k] = d[k]; }
    if (d.spr && NR.spriteRender) {
      const [sheet, anim, frame] = d.spr;
      if (!o.spr || o.spr.sheet !== sheet) o.spr = NR.spriteRender.anim(sheet, { anim });
      if (o.spr.anim !== anim) o.spr.set(anim, true);
      o.spr.frame = frame;
    }
    if (d.actorId && (!o.actor || o.actor.id !== d.actorId) && NR.superRuntime) { o.actor = NR.superRuntime.actor(d.actorId); if (o.actor) NR.superRuntime.preloadActor(o.actor); }
    if (d.skin && o.boss && NR.bosses && NR.bosses.preload) { try { NR.bosses.preload(d.skin); } catch (_) {} }
  }
  function syncList(arr, name) {
    const out = [];
    for (const d of arr || []) {
      if (!d || typeof d.i !== "number") continue;
      const key = name + d.i;
      let o = guestObjs.get(key);
      if (!o) { if (!d.c && d.c !== "") continue; o = build(d.c, d); guestObjs.set(key, o); o._gk = key; }
      try { applyEntity(o, d); } catch (_) {}
      out.push(o);
    }
    const keep = new Set(out.map((o) => o._gk));
    for (const k of [...guestObjs.keys()]) if (k.startsWith(name) && !keep.has(k) && !/^pl/.test(name)) guestObjs.delete(k);
    return out;
  }
  function applySnap(msg) {
    if (!G.netGuest || !msg || typeof msg !== "object") return;
    const g = msg.g || {};
    for (const k of G_KEYS) if (k in g) G[k] = g[k];
    const prevChapter = N._chapter;
    N._chapter = G.chapter;
    if (prevChapter !== undefined && prevChapter !== G.chapter) { try { NR.superRuntime?.prepare(); } catch (_) {} }
    G.stats.kills = g.kills | 0;
    G.spawnQueue.length = Math.min(200, g.spawnLeft | 0);
    for (let i = 0; i < G.spawnQueue.length; i++) if (!G.spawnQueue[i]) G.spawnQueue[i] = { t: 9e9, type: "none" };
    const L = msg.L || {};
    for (const k of ["enemies", "bolts", "shots", "shockwaves", "pickups"]) G[k] = syncList(L[k], k);
    G.bossRef = g.boss ? guestObjs.get("enemies" + g.boss) || null : null;
    // players
    for (const d of msg.pl || []) {
      const pid = d.np | 0;
      const q = pid === N.pid ? G.me : G.others.find((x) => x.netPid === pid);
      if (!q) continue;
      if (q === G.me) {
        for (const k of AUTH) if (k in d) q[k] = d[k];
        if (d.dead === false && q.dead) q.dead = false;
      } else {
        for (const k in d) { if (k === "i" || k === "c" || k === "np" || k === "look" || k === "pet" || k === "heroId") continue; q[k] = d[k]; }
      }
    }
    // abilities
    const HA = NR.abilities, ha = msg.ha;
    if (HA && ha) {
      HA.shots = Array.isArray(ha.s) ? ha.s.map((b) => ({ ...b, t: 0, hit: [] })) : [];
      HA.strikes = Array.isArray(ha.k) ? ha.k : [];
      HA.allies = Array.isArray(ha.a) ? ha.a : [];
      HA.beams = Array.isArray(ha.b) ? ha.b : [];
    }
    // effects & sounds
    if (Array.isArray(msg.ev)) for (const e of msg.ev) replay(e);
  }
  const AUTH = ["hp", "maxHp", "dead", "downed", "energy", "maxEnergy", "shieldT", "overdriveT", "droneT", "hab", "sukunaUsed", "iframes", "stormT"];

  /* effects & audio recorded on the host, replayed on guests */
  const evq = [];
  let depth = 0;
  const REC = { burst: F, sparks: F, smoke: F, ring: F, text: F, slash: F, teleport: F, shards: F, embers: F };
  const orig = {};
  for (const k of Object.keys(REC)) {
    orig[k] = F[k];
    F[k] = function (...a) {
      if (depth === 0 && N.role === "host" && N.inGame && G.others.length && evq.length < 400) evq.push(["f", k, a.map(argClean)]);
      depth++;
      try { return orig[k].apply(F, a); } finally { depth--; }
    };
  }
  const argClean = (x) => (typeof x === "number" ? rnd(x) : x && typeof x === "object" ? (plain(x, 0) ? x : null) : x);
  if (NR.audio && NR.audio.play) {
    const play = NR.audio.play;
    NR.audio.play = function (name, o) {
      if (N.role === "host" && N.inGame && G.others.length && evq.length < 400 && typeof name === "string") evq.push(["a", name]);
      return play.call(this, name, o);
    };
    orig.play = play;
  }
  const banner = G.banner;
  G.banner = function (t, s, c) {
    if (N.role === "host" && N.inGame && G.others.length) evq.push(["b", cleanStr(t, 60), cleanStr(s, 120), cleanStr(c, 20)]);
    return banner.call(this, t, s, c);
  };
  function replay(e) {
    if (!Array.isArray(e)) return;
    try {
      if (e[0] === "f" && orig[e[1]] && Array.isArray(e[2])) orig[e[1]].apply(F, e[2]);
      else if (e[0] === "a" && orig.play) orig.play.call(NR.audio, e[1]);
      else if (e[0] === "b") banner.call(G, e[1], e[2], e[3]);
    } catch (_) {}
  }

  /* guest frame: predict my hero, glide everything else, send my buttons */
  const pendPress = new Set();
  let inAcc = 0;
  function guestUpdate(dt, rd) {
    NR.hud.update(rd);
    G.time += rd;
    for (const k in I.pressed) pendPress.add(k);
    const me = G.me;
    if (me) {
      try { me.update(dt, G); } catch (err) { NR.reportError?.("Online hero", err); }
    }
    for (const q of G.others) { q.t = (q.t || 0) + dt; if (!q.dead) { q.x += (q.vx || 0) * dt * 0.8; } try { q.updatePet && q.updatePet(dt); } catch (_) {} }
    for (const e of G.enemies) {
      e.t = (e.t || 0) + dt;
      if (e.spr && e.spr.update) e.spr.update(dt);
      if (e.vx) e.x += e.vx * dt * 0.8;
    }
    for (const k of ["bolts", "shots"]) for (const b of G[k]) { if (b.vx) b.x += b.vx * dt; if (b.vy) b.y += b.vy * dt; if (b.t !== undefined) b.t += dt; }
    const HA = NR.abilities;
    if (HA) {
      for (const b of HA.shots) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.arc) b.vy += 1500 * dt; }
      for (const s of HA.strikes) s.t += dt;
      for (const a of HA.allies) { a.t += dt; a.x += (a.vx || 0) * dt; }
      for (const b of HA.beams) b.t += dt;
      HA.hudTick && HA.hudTick();
    }
    F.update(dt);
    W.update(rd, NR.view);
    if (G.comboT > 0) G.comboT -= dt;
    // camera (same feel as the host)
    const cam = G.cam, view = NR.view;
    const cp = me && me.dead ? G.others.find((q) => !q.dead) || me : me;
    if (cp) {
      const tx = U.clamp(cp.x + cp.facing * 90 - view.w / 2, 0, Math.max(0, W.W - view.w));
      const arenaBottom = W.H + (window.innerWidth < 600 ? view.h * 0.19 : view.h * 0.08);
      const ty = U.clamp(cp.y - view.h * 0.58, Math.min(0, arenaBottom - view.h), arenaBottom - view.h);
      cam.x = U.damp(cam.x, W.W > view.w ? tx : (W.W - view.w) / 2, 5, rd);
      cam.y = U.damp(cam.y, arenaBottom > view.h ? ty : (arenaBottom - view.h) / 2, 4, rd);
    }
    cam.trauma = Math.max(0, cam.trauma - rd * 1.7);
    const sh = cam.trauma * cam.trauma * 24;
    cam.sx = U.rand(-sh, sh); cam.sy = U.rand(-sh, sh);
    // buttons → host
    inAcc += rd;
    if (inAcc >= 1 / INPUT_HZ) {
      inAcc = 0;
      const h = {};
      for (const a of HELD) if (I.down(a)) h[a] = 1;
      const pr = [...pendPress].filter((a) => PRESS.has(a));
      pendPress.clear();
      N.send({ t: "in", h, pr, s: me ? { x: rnd(me.x), y: rnd(me.y), vx: rnd(me.vx), vy: rnd(me.vy), f: me.facing, og: me.onGround } : null });
    }
  }

  const update = G.update;
  G.update = function (dt, rd) {
    if (G.netGuest && G.state === "playing") { guestUpdate(dt, rd); return; }
    update.call(G, dt, rd);
    if (N.role === "host" && N.inGame && G.state === "playing") { try { hostTick(rd); } catch (err) { NR.reportError?.("Online sync", err); } }
  };
  // ping for the lobby / HUD
  if (typeof setInterval === "function") setInterval(() => { if (N.role === "guest" && N.hostConn) N.send({ t: "ping", ts: Date.now() }); }, 2500);

  /* partners: draw them + name tags */
  NR.drawHooks = NR.drawHooks || [];
  NR.drawHooks.push((ctx) => {
    for (const q of G.others) {
      if (q.dead && !q.downed) continue;
      ctx.save();
      if (q.dead) ctx.globalAlpha = 0.35;
      try { q.draw(ctx); } catch (_) {}
      ctx.restore();
    }
    if (!G.others.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 15px system-ui, sans-serif";
    for (const q of G.allPlayers()) {
      const col = G.pvp ? (q.team === 0 ? "#6ad1ff" : "#ff6b6b") : q === G.me ? "#8af5e1" : "#ffd166";
      const y = q.y - (q.h || 78) - 64;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(q.x - 40, y + 6, 80, 7);
      ctx.fillStyle = col;
      ctx.fillRect(q.x - 40, y + 6, 80 * Math.max(0, q.hp / (q.maxHp || 100)), 7);
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.7)";
      const label = (q.netName || "YOU") + (q.dead ? " · DOWN" : "");
      ctx.strokeText(label, q.x, y); ctx.fillText(label, q.x, y);
    }
    ctx.restore();
  });

  /* ================= LEADERBOARD ================= */
  const LB_KEY = "nr_lb_v1";
  const B = (N.board = {});
  const MODES_LB = new Set(["solo", "coop", "floor", "pvp-win"]);
  function load() { try { const a = JSON.parse(NR.store.getItem(LB_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function clean(e) {
    if (!e || typeof e !== "object" || !MODES_LB.has(e.m)) return null;
    return { n: cleanName(e.n), w: clampN(e.w, 0, 99999, 0) | 0, m: e.m, d: clampN(e.d, 0, 4e12, 0), p: cleanStr(e.p, 60), me: !!e.me };
  }
  B.all = () => load().map(clean).filter(Boolean);
  B.save = (list) => NR.store.setItem(LB_KEY, JSON.stringify(list.slice(0, 120)));
  B.record = function (w, m, partners) {
    if (!w || w < 1) return;
    const list = B.all();
    const name = cleanName(NR.crazy ? NR.crazy.playerName() : P.name);
    if (m === "pvp-win") {
      if (partners !== "won") return;
      const row = list.find((e) => e.me && e.m === "pvp-win");
      if (row) { row.w++; row.n = name; row.d = Date.now(); } else list.push({ n: name, w: 1, m, d: Date.now(), p: "", me: true });
    } else list.push({ n: name, w: w | 0, m, d: Date.now(), p: cleanStr(partners, 60), me: true });
    B.save(sort(list));
    N.emit("board");
  };
  const sort = (list) => list.sort((a, b) => b.w - a.w || a.d - b.d);
  B.top = (n, m) => sort(B.all().filter((e) => !m || e.m === m || (m === "wave" && (e.m === "solo" || e.m === "coop")))).slice(0, n || 20).map((e) => ({ ...e, me: false }));
  B.mine = (n, m) => sort(B.all().filter((e) => e.me && (!m || e.m === m || (m === "wave" && (e.m === "solo" || e.m === "coop"))))).slice(0, n || 20);
  B.merge = function (incoming) {
    if (!Array.isArray(incoming)) return;
    const list = B.all();
    const key = (e) => e.n + "|" + e.m + "|" + e.w + "|" + Math.round(e.d / 1000);
    const seen = new Set(list.map(key));
    for (const raw of incoming.slice(0, 60)) {
      const e = clean(raw);
      if (!e) continue;
      e.me = false;
      if (!seen.has(key(e))) { seen.add(key(e)); list.push(e); }
    }
    B.save(sort(list));
    N.emit("board");
  };
  // adventure floors count too
  if (NR.levels && NR.levels.onClear) {
    const onClear = NR.levels.onClear;
    NR.levels.onClear = function (...a) {
      const r = onClear.apply(this, a);
      try { B.record(P.advLevel || 1, "floor", ""); } catch (_) {}
      return r;
    };
  }

  /* ================= VOICE ================= */
  const V = (N.voice = { on: false, stream: null, calls: new Map(), muted: false });
  V.start = async function () {
    if (NR.crazy && NR.crazy.settings.disableChat) { N.emit("error", "Chat is disabled on this site."); return false; }
    if (!N.role) { N.emit("error", "Join a room first."); return false; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { N.emit("error", "Voice chat is not supported in this browser."); return false; }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (err) {
      N.emit("error", err && err.name === "NotAllowedError" ? "Microphone permission was blocked." : "No microphone found.");
      return false;
    }
    V.on = true;
    if (N.role === "host") { N.members[0].voice = true; broadcastLobby(); }
    else N.send({ t: "voice", on: true });
    V.sync();
    N.emit("voice", true);
    return true;
  };
  V.stop = function () {
    for (const peerId of [...V.calls.keys()]) V.hang(peerId);
    if (V.stream) for (const t of V.stream.getTracks()) { try { t.stop(); } catch (_) {} }
    const was = V.on;
    V.stream = null; V.on = false;
    if (was && N.role === "host" && N.members[0]) { N.members[0].voice = false; broadcastLobby(); }
    else if (was && N.role === "guest") N.send({ t: "voice", on: false });
    N.emit("voice", false);
  };
  V.toggleMute = function () {
    V.muted = !V.muted;
    if (V.stream) for (const t of V.stream.getAudioTracks()) t.enabled = !V.muted;
    N.emit("voice", V.on);
    return V.muted;
  };
  V.hang = function (peerId) {
    const c = V.calls.get(peerId);
    if (!c) return;
    V.calls.delete(peerId);
    try { c.call.close(); } catch (_) {}
    if (c.audio) { try { c.audio.srcObject = null; c.audio.remove(); } catch (_) {} }
  };
  function attach(call) {
    const entry = { call, audio: null };
    V.calls.set(call.peer, entry);
    call.on("stream", (remote) => {
      if (entry.audio) return;
      const a = document.createElement("audio");
      a.autoplay = true; a.playsInline = true; a.srcObject = remote; a.dataset.voice = call.peer;
      a.style.display = "none";
      document.body.appendChild(a);
      const p = a.play && a.play();
      if (p && p.catch) p.catch(() => N.emit("error", "Tap anywhere to hear voice chat."));
      entry.audio = a;
    });
    call.on("close", () => V.hang(call.peer));
    call.on("error", () => V.hang(call.peer));
  }
  V.sync = function () {
    if (!V.on || !N.peer || !V.stream) return;
    const myId = N.peer.id;
    const voices = N.members.filter((m) => m.voice && m.peer && m.peer !== myId);
    for (const m of voices) {
      if (V.calls.has(m.peer) || myId > m.peer) continue; // the lower id calls, the other answers
      try { const call = N.peer.call(m.peer, V.stream); if (call) attach(call); } catch (_) {}
    }
    for (const id of [...V.calls.keys()]) if (!voices.some((m) => m.peer === id)) V.hang(id);
  };
  function onCall(call) {
    if (!V.on || !V.stream || !N.members.some((m) => m.peer === call.peer)) { try { call.close(); } catch (_) {} return; }
    try { call.answer(V.stream); attach(call); } catch (_) {}
  }
  N.on("lobby", () => V.sync());

  /* ================= invites ================= */
  N.inviteLink = () => (N.room ? (NR.crazy ? NR.crazy.inviteLink(N.room) : location.origin + location.pathname + "?room=" + N.room) : "");
  N.pendingInvite = () => (NR.crazy ? NR.crazy.inviteRoom() : "");
  if (NR.crazy) NR.crazy.onJoinRoom = (params) => { const room = params && (params.room || params.roomId); if (room) N.emit("invite", N.normCode(room)); };
})();

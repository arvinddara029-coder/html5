/* ============ PRODUCTION PASS — social hub: party, friends, chat, voice ============
   The lobby IS the social hub — no separate "player preview" screen:
     · identity card: guest or CrazyGames user (username/avatar when available)
     · party/room area: create/join, mode select (DUO · 1v1 · 2v2 · 4v4),
       member list with character previews + ready states, invite link
     · friends: CrazyGames handles friend requests on the platform side —
       the game provides invite links + room codes (no invented SDK APIs)
     · text chat: profanity filter, per-player mute/block/report,
       automatically disabled when the platform chat preference is off
     · voice chat: WebRTC audio over the same peer connections — explicit
       opt-in, push-to-talk, mute self/others, permission error handling,
       no microphone access without a user gesture */
(function () {
  /* defensive DOM helpers — every panel must survive a stripped-down document */
  const qs = (sel) => (typeof document.querySelector === "function" ? document.querySelector(sel) : null);
  const qsa = (sel) => (typeof document.querySelectorAll === "function"
    ? Array.prototype.slice.call(document.querySelectorAll(sel)) : []);
  const $ = (id) => document.getElementById(id);
  const P = NR.profile;
  const S = (NR.social = {});

  /* ---------------- identity ---------------- */
  S.identity = function () {
    const cu = NR.crazy && NR.crazy.user;
    return {
      name: (cu && cu.username) || P.name,
      avatar: (cu && cu.profilePictureUrl) || "",
      account: !!cu,
      environment: NR.crazy ? NR.crazy.environment : "local",
    };
  };
  S.renderIdentity = function () {
    const box = $("social-identity");
    if (!box) return;
    const id = S.identity();
    const av = box.querySelector(".si-avatar");
    if (av) {
      if (id.avatar) { av.innerHTML = ""; const img = new Image(); img.src = id.avatar; img.alt = ""; av.append(img); }
      else { av.innerHTML = ""; try { av.append(NR.char.portrait(NR.vault.effectiveLook(), 46)); } catch (_) {} }
    }
    box.querySelector(".si-name").textContent = id.name;
    box.querySelector(".si-state").textContent = id.account
      ? "CRAZYGAMES ACCOUNT · CLOUD SAVE ACTIVE"
      : "GUEST · PROGRESS SAVED ON THIS DEVICE";
    box.querySelector(".si-online").className = "si-online " + (id.account ? "on" : "");
    box.querySelector(".si-online").textContent = id.account ? "ONLINE" : "OFFLINE READY";
  };

  S.onCrazyUser = function () {
    S.renderIdentity();
    NR.hub?.notify("Signed in as " + (NR.crazy.user ? NR.crazy.user.username : "") + " — cloud progress enabled.");
    NR.audio.play("socialNotify");
    // pull cloud save if we are a fresh guest profile
    NR.cloudSync?.pull?.();
  };

  /* ---------------- room UI ---------------- */
  /* broadcast my wave best to the party so the leaderboard is live */
  S.shareBest = function () {
    const N = NR.net, P = NR.profile;
    if (!N.room || !N.sendEvent) return;
    let wave = 0, score = 0;
    for (const r of (NR.records || [])) {
      if (r.mode !== "survival" && r.mode !== "survive" && r.mode !== "online") continue;
      if ((r.wave | 0) > wave) { wave = r.wave | 0; score = Math.round(r.score || 0); }
    }
    if (P.onlineBest) for (const b of Object.values(P.onlineBest)) {
      if ((b.wave | 0) > wave) { wave = b.wave | 0; score = Math.round(b.score || 0); }
    }
    N.sendEvent({ a: "best", wave, score });
  };

  S.renderRoom = function () {
    S.shareBest && S.shareBest();
    S.renderLeaderboard && S.renderLeaderboard();
    const box = $("social-room");
    if (!box) return;
    const N = NR.net;
    const room = N.room;
    const createRow = box.querySelector(".sr-create");
    const lobbyRow = box.querySelector(".sr-lobby");
    if (!room) {
      createRow.style.display = "";
      lobbyRow.style.display = "none";
      return;
    }
    createRow.style.display = "none";
    lobbyRow.style.display = "";
    const def = N.modes[room.mode] || { label: "ROOM", players: 2 };
    box.querySelector(".sr-code").textContent = room.code;
    box.querySelector(".sr-mode").textContent = def.label;
    const list = box.querySelector(".sr-members");
    list.replaceChildren(...room.members.map((m) => {
      const el = document.createElement("div");
      el.className = "sr-member" + (m.connected === false ? " offline" : "");
      const port = document.createElement("canvas");
      port.width = port.height = 44;
      try {
        const g = port.getContext("2d");
        const look = NR.vault.effectiveLook(m.hero);
        g.drawImage(NR.char.portrait(look, 44), 0, 0);
      } catch (_) {}
      const mid = document.createElement("div");
      mid.className = "srm-mid";
      const nm = document.createElement("b");
      nm.textContent = m.name + (m.id === N.myId() ? " (you)" : "");
      const st = document.createElement("span");
      st.textContent = (m.host ? "HOST · " : "") + (m.connected === false ? "DISCONNECTED" : m.ready ? "READY" : "NOT READY");
      st.className = "srm-state " + (m.connected === false ? "off" : m.ready ? "on" : "");
      mid.append(nm, st);
      el.append(port, mid);
      if (m.id !== N.myId()) {
        const muteBtn = document.createElement("button");
        muteBtn.className = "srm-mute";
        muteBtn.textContent = (S.muted.has(m.id) ? "🔇" : "🔊");
        muteBtn.title = "Mute/unmute this player's chat";
        muteBtn.addEventListener("click", () => {
          if (S.muted.has(m.id)) S.muted.delete(m.id); else S.muted.add(m.id);
          S.renderRoom();
        });
        el.append(muteBtn);
      }
      return el;
    }));
    const readyBtn = $("sr-ready");
    const me = room.members.find((m) => m.id === N.myId());
    if (readyBtn && me) {
      readyBtn.textContent = me.ready ? "✓ READY — WAITING" : "SET READY";
      readyBtn.classList.toggle("on", !!me.ready);
    }
    const startBtn = $("sr-start");
    if (startBtn) startBtn.style.display = N.mode === "host" ? "" : "none";
    const inviteBtn = $("sr-invite");
    if (inviteBtn) inviteBtn.style.display = N.mode === "host" ? "" : "none";
    S.renderVoice();
  };

  S.openOnline = function () {
    const m = $("modal-online");
    if (!m) return;
    m.classList.add("open");
    NR.audio.play("uiClick");
    S.renderRoom();
    S.renderLeaderboard();
  };

  /* Wave-clear leaderboard: waves reached per player. Personal results are the
     validated local archive (NR.records + profile.onlineBest); while you are in
     a room the party panel shares every member's best over the net channel. */
  S.renderLeaderboard = function () {
    const box = $("ol-leaderboard");
    if (!box) return;
    const N = NR.net;
    const rows = [];
    // party members (live room) — everyone announces their wave best
    if (N.room && N.room.members) {
      for (const m of N.room.members.values ? [...N.room.members.values()] : []) {
        const best = m.best || { wave: 0, score: 0 };
        rows.push({ name: m.name || "RONIN", tag: N.room.modeLabel || "ROOM", wave: best.wave | 0, score: best.score | 0, live: true });
      }
    }
    // personal archive
    const P = NR.profile;
    for (const r of (NR.records || [])) {
      if (r.mode !== "survival" && r.mode !== "survive" && r.mode !== "online") continue;
      rows.push({ name: r.name || P.name, tag: r.mode === "survive" ? "SURVIVE" : r.mode === "online" ? "ONLINE" : "WAVE FIGHT", wave: r.wave | 0, score: Math.round(r.score), date: r.date });
    }
    if (P.onlineBest) for (const [mode, b] of Object.entries(P.onlineBest)) {
      rows.push({ name: b.name || P.name, tag: ("ONLINE " + mode).toUpperCase(), wave: b.wave | 0, score: Math.round(b.score || 0), live: true });
    }
    rows.sort((a, b) => (b.wave - a.wave) || (b.score - a.score));
    const seen = new Set();
    const top = [];
    for (const r of rows) {
      const k = r.name + "|" + r.tag + "|" + r.wave;
      if (seen.has(k)) continue;
      seen.add(k); top.push(r);
      if (top.length >= 10) break;
    }
    box.replaceChildren(...(top.length ? top.map((r, i) => {
      const el = document.createElement("div");
      el.className = "ol-row" + (r.live ? " live" : "");
      el.innerHTML = `<span class="ol-rank">#${i + 1}</span><b></b><small>${r.tag}</small>` +
        `<span class="ol-wave">WAVE ${r.wave || 0}</span><span class="ol-score">${(r.score || 0).toLocaleString("en-US")}</span>`;
      el.querySelector("b").textContent = r.name;
      return el;
    }) : (() => {
      const el = document.createElement("div");
      el.className = "ol-row empty";
      el.innerHTML = "<i>No runs yet — clear waves to claim the top spot.</i>";
      return [el];
    })()));
  };

  /* ---------------- mode select + create/join ---------------- */
  S.init = function () {
    S.muted = new Set();
    S.blocked = new Set();
    const N = NR.net;
    N.onRoom(() => { S.renderRoom(); S.renderLeaderboard(); });
    N.onChat((msg) => S.onChatMessage(msg));

    const modal = $("modal-online");
    if (modal) {
      modal.querySelector(".lm-close")?.addEventListener("click", () => modal.classList.remove("open"));
      modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
    }
    qsa("#online-modes .om-card").forEach((b) =>
      b.addEventListener("click", () => {
        qsa("#online-modes .om-card").forEach((x) => x.classList.toggle("sel", x === b));
        S.selectedMode = b.dataset.omode;
        NR.audio.play("uiConfirm");
        updateJoinLabel();
      }));
    const first = qs("#online-modes .om-card");
    if (first) { first.classList.add("sel"); S.selectedMode = first.dataset.omode; }
    function resolveMode(id) {
      if (id !== "random") return id;
      const all = ["duo", "duel", "team2", "team4"];
      return all[Math.floor(Math.random() * all.length)];
    }
    function updateJoinLabel() {
      const label = $("ol-join-label");
      if (!label) return;
      const names = { duo: "DUO CO-OP", duel: "1v1", team2: "2v2", team4: "4v4", random: "QUICK MATCH" };
      label.textContent = `02 · CREATE ${names[S.selectedMode] || ""} ROOM — INVITE FRIENDS`;
    }
    updateJoinLabel();

    $("ol-create")?.addEventListener("click", async () => {
      NR.audio.play("uiConfirm");
      const mode = resolveMode(S.selectedMode || "duo");
      const room = await N.createRoom(mode);
      if (room) {
        NR.audio.play("socialNotify");
        S.renderRoom();
        NR.hub.notify(`Room ${room.code} ready — invite friends with the link.`);
      }
    });
    $("ol-join")?.addEventListener("click", async () => {
      NR.audio.play("uiConfirm");
      const code = ($("ol-code")?.value || "").trim();
      const room = await N.joinRoom(code);
      if (room) S.renderRoom();
    });
    $("sr-leave")?.addEventListener("click", () => { NR.audio.play("uiClick"); N.leaveRoom(); });
    $("sr-open-online")?.addEventListener("click", () => S.openOnline());
    $("sr-ready")?.addEventListener("click", () => { NR.audio.play("uiToggleOn"); N.setReady(!(N.room?.members.find((m) => m.id === N.myId())?.ready)); });
    $("sr-start")?.addEventListener("click", () => { S.startRoomMatch(); });
    $("sr-invite")?.addEventListener("click", () => S.copyInvite());

    // chat
    $("chat-send")?.addEventListener("click", () => S.sendChat());
    $("chat-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); S.sendChat(); }
      e.stopPropagation();
    });
    S.initVoice();
    S.renderIdentity();
    S.renderRoom();
  };

  S.copyInvite = async function () {
    const N = NR.net;
    if (!N.room) return;
    const link = await NR.crazy.inviteLink({ room: N.room.code, mode: N.room.mode });
    const text = link || `${location.origin}${location.pathname}#join=${N.room.code}`;
    NR.crazy.copyToClipboard(text);
    NR.hub.notify("Invite link copied — send it to a friend.");
    NR.audio.play("socialNotify");
  };

  S.startRoomMatch = function () {
    const N = NR.net;
    if (N.mode !== "host" || !N.room) return;
    const allReady = N.room.members.filter((m) => m.connected !== false).every((m) => m.ready);
    if (!allReady) { NR.hub.notify("Everyone must be ready first."); NR.audio.play("uiError"); return; }
    N.startMatch();
  };

  /* called by net when the host starts (both sides) */
  S.onMatchStart = function (room, asGuest) {
    $("modal-online")?.classList.remove("open");
    const def = NR.net.modes[room.mode];
    NR.hub.notify("Match starting — " + def.label);
    // co-op duo runs the WAVE FIGHT content; pvp modes run the arena
    const mode = def.pvp ? "wavefight" : "survival";
    NR.profile.mode = mode;
    NR.game.pvp = !!def.pvp;
    NR.game.online = true;
    $("modal-deploy")?.classList.remove("open");
    NR.loader.wrap("ENTERING ARENA", Promise.resolve()).then(() => NR.game.start());
  };

  /* ---------------- chat with moderation ---------------- */
  const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "cunt", "dickhead", "nigger", "faggot", "retard", "whore", "slut", "kys", "rape"];
  S.filter = function (text) {
    let out = String(text);
    for (const w of BAD_WORDS) {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, "•".repeat(w.length));
    }
    return out;
  };
  S.chatAllowed = function () {
    if (NR.crazy && NR.crazy.chatDisabled && NR.crazy.chatDisabled()) return false;
    return true;
  };
  S.sendChat = function () {
    if (!S.chatAllowed()) { NR.hub.notify("Chat is disabled by your platform settings."); return; }
    const input = $("chat-input");
    const text = (input?.value || "").trim();
    if (!text) return;
    input.value = "";
    if (!NR.net.connected) { S.pushChatLine({ name: "SYSTEM", text: "You are offline — chat is available inside rooms." }); return; }
    NR.net.sendChat(text);
  };
  S.onChatMessage = function (msg) {
    if (S.blocked.has(msg.from)) return;
    if (S.muted.has(msg.from)) return;
    S.pushChatLine(msg);
  };
  S.pushChatLine = function (msg) {
    const box = $("chat-log");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "chat-line";
    const b = document.createElement("b");
    b.textContent = msg.name;
    const span = document.createElement("span");
    span.textContent = S.filter(msg.text);
    el.append(b, document.createTextNode(" "), span);
    if (msg.from && msg.from !== NR.net.myId()) {
      const act = document.createElement("span");
      act.className = "chat-mod";
      const mute = document.createElement("button");
      mute.textContent = S.muted.has(msg.from) ? "unmute" : "mute";
      mute.addEventListener("click", () => { S.muted.has(msg.from) ? S.muted.delete(msg.from) : S.muted.add(msg.from); S.renderRoom(); });
      const block = document.createElement("button");
      block.textContent = "block";
      block.addEventListener("click", () => { S.blocked.add(msg.from); NR.hub.notify("Player blocked."); NR.diag.game("player blocked: " + msg.name); });
      const rep = document.createElement("button");
      rep.textContent = "report";
      rep.addEventListener("click", () => { NR.diag.game("player reported: " + msg.name + " — " + JSON.stringify({ text: S.filter(msg.text).slice(0, 80) })); NR.hub.notify("Report recorded in diagnostics."); });
      act.append(mute, block, rep);
      el.append(act);
    }
    box.append(el);
    while (box.children.length > 60) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
    NR.audio.play("socialNotify");
  };

  /* ---------------- voice chat (WebRTC via the peer mesh) ---------------- */
  const VO = (NR.net.voice = { enabled: false, ptt: false, mutedSelf: false, remote: new Map() });
  S.initVoice = function () {
    const btn = $("voice-btn");
    if (!btn) return;
    btn.addEventListener("click", () => VO.enabled ? S.disableVoice() : S.enableVoice());
    const ptt = $("voice-ptt");
    if (ptt) {
      const down = (e) => { e.preventDefault(); S.setPTT(true); };
      const up = () => S.setPTT(false);
      ptt.addEventListener("pointerdown", down);
      ptt.addEventListener("pointerup", up);
      ptt.addEventListener("pointercancel", up);
      window.addEventListener("keydown", (e) => { if (e.code === "KeyV" && !e.repeat && VO.enabled) S.setPTT(true); });
      window.addEventListener("keyup", (e) => { if (e.code === "KeyV") S.setPTT(false); });
    }
  };
  S.enableVoice = async function () {
    if (!NR.net.connected) { NR.hub.notify("Voice chat needs an online room."); return; }
    if (!S.chatAllowed()) { NR.hub.notify("Voice chat is disabled by your platform settings."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // requires the click gesture
      VO.stream = stream;
      VO.enabled = true;
      const t = NR.net.transport;
      if (t && t.peer) {
        t.peer.on("call", (call) => {
          call.answer(VO.stream);
          call.on("stream", (remote) => attachRemote(call.peer, remote));
        });
        for (const id of t.conns.keys()) {
          const call = t.peer.call(id, stream);
          if (call) call.on("stream", (remote) => attachRemote(id, remote));
        }
      }
      NR.hub.notify("Voice chat on — hold V or the PTT button to talk.");
      NR.audio.play("uiConfirm");
      S.renderVoice();
    } catch (e) {
      VO.enabled = false;
      NR.diag.warn("microphone permission failed: " + (e && e.name));
      NR.hub.notify("Microphone unavailable — check browser permissions.");
      NR.audio.play("uiError");
    }
  };
  S.disableVoice = function () {
    if (VO.stream) for (const t of VO.stream.getTracks()) t.stop();
    VO.stream = null; VO.enabled = false; VO.ptt = false;
    for (const el of VO.remote.values()) el.srcObject = null;
    VO.remote.clear();
    S.renderVoice();
    NR.hub.notify("Voice chat off.");
  };
  S.setPTT = function (on) {
    VO.ptt = !!on;
    if (VO.stream) for (const t of VO.stream.getAudioTracks()) t.enabled = !VO.mutedSelf && (VO.ptt || VO.alwaysOn);
    S.renderVoice();
  };
  function attachRemote(id, stream) {
    let el = VO.remote.get(id);
    if (!el) { el = new Audio(); el.autoplay = true; VO.remote.set(id, el); }
    el.srcObject = stream;
  }
  S.renderVoice = function () {
    const btn = $("voice-btn");
    if (btn) {
      btn.textContent = VO.enabled ? "🎤 VOICE ON" : "🎤 VOICE OFF";
      btn.classList.toggle("on", VO.enabled);
      btn.style.display = NR.net.connected ? "" : "none";
    }
    const ptt = $("voice-ptt");
    if (ptt) {
      ptt.style.display = VO.enabled ? "" : "none";
      ptt.classList.toggle("talking", VO.ptt && !VO.mutedSelf);
      ptt.textContent = VO.ptt && !VO.mutedSelf ? "🎙 TALKING" : "HOLD TO TALK [V]";
    }
  };
})();

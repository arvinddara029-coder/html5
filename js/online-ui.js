/* ============ ONLINE UI — lobby room, friend preview, chat, voice, leaderboard ============ */
(function () {
  const N = NR.net, G = NR.game, P = NR.profile;
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const OU = (NR.onlineUI = { tab: "play", boardMode: "wave", chat: [] });

  function build() {
    if ($("modal-online")) return $("modal-online");
    const m = mk("div", "lobby-modal wide online-modal"); m.id = "modal-online";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Online");
    m.innerHTML = `<div class="wood-panel">
      <div class="lm-head"><h2>ONLINE</h2><span class="ol-status" id="ol-status">OFFLINE</span><button class="lm-close" id="ol-close" aria-label="Close">✕</button></div>
      <div class="vault-tabs"><button data-otab="play" class="sel">PLAY ONLINE</button><button data-otab="board">LEADERBOARD</button></div>
      <div class="ol-pane" id="ol-play">
        <div class="ol-modes" id="ol-modes"></div>
        <div class="ol-players" id="ol-players"></div>
        <div class="ol-actions" id="ol-offline-actions">
          <button class="nav-btn online ol-big" id="ol-create">➕ CREATE ROOM<small>invite a friend with a link</small></button>
          <button class="nav-btn online ol-big" id="ol-quick">🎲 QUICK MATCH<small>play with a random player</small></button>
          <div class="ol-join"><input id="ol-code" maxlength="24" placeholder="ROOM CODE" autocomplete="off" aria-label="Room code"><button class="ghost-btn" id="ol-join">JOIN</button></div>
        </div>
        <div class="ol-actions" id="ol-room-actions" hidden>
          <div class="ol-invite"><span>ROOM <b id="ol-room">-----</b></span><input id="ol-link" readonly aria-label="Invite link"><button class="ghost-btn" id="ol-copy">COPY LINK</button><button class="ghost-btn" id="ol-share">SHARE</button></div>
          <div class="ol-teams" id="ol-teams" hidden><button class="ghost-btn blue" id="ol-team0">JOIN BLUE</button><button class="ghost-btn red" id="ol-team1">JOIN RED</button></div>
          <div class="ol-row"><button class="nav-btn primary" id="ol-start">START MATCH</button><button class="ghost-btn" id="ol-ready">READY</button><button class="ghost-btn" id="ol-leave">LEAVE</button></div>
          <p class="deploy-note" id="ol-hint"></p>
        </div>
        <div class="ol-chat" id="ol-chat-box">
          <div class="ol-log" id="ol-log" aria-live="polite"></div>
          <div class="ol-chat-row"><input id="ol-msg" maxlength="120" placeholder="Say something…" aria-label="Chat message"><button class="ghost-btn" id="ol-send">SEND</button><button class="ghost-btn" id="ol-mic" title="Voice chat">🎤 VOICE</button><button class="ghost-btn" id="ol-mute" hidden>🔇</button></div>
        </div>
        <p class="deploy-note ol-err" id="ol-err" role="alert"></p>
      </div>
      <div class="ol-pane" id="ol-board" hidden>
        <div class="vault-sub" id="ol-board-tabs"><button data-bm="wave" class="sel">HIGHEST WAVE</button><button data-bm="floor">HIGHEST FLOOR</button><button data-bm="pvp-win">PVP WINS</button></div>
        <ol class="ol-rank" id="ol-rank"></ol>
        <p class="deploy-note">Your best runs plus every score shared by players you met online. There is no central server, so this is not a worldwide list.</p>
      </div>
    </div>`;
    ($("lobby") || document.body).append(m);
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    m.addEventListener("click", (e) => { if (e.target === m) OU.close(); });
    on("ol-close", "click", () => OU.close());
    (m.querySelectorAll ? m.querySelectorAll("[data-otab]") : []).forEach((b) => b.addEventListener("click", () => { OU.tab = b.dataset.otab; render(); }));
    (m.querySelectorAll ? m.querySelectorAll("[data-bm]") : []).forEach((b) => b.addEventListener("click", () => { OU.boardMode = b.dataset.bm; render(); }));
    on("ol-create", "click", () => { NR.audio?.play?.("ui"); N.host(OU.mode || "coop"); });
    on("ol-quick", "click", () => { NR.audio?.play?.("ui"); N.quickMatch(OU.mode || "coop"); });
    on("ol-join", "click", () => N.join($("ol-code").value));
    on("ol-code", "keydown", (e) => { if (e.key === "Enter") N.join($("ol-code").value); });
    on("ol-copy", "click", copyLink);
    on("ol-share", "click", shareLink);
    on("ol-start", "click", () => N.start());
    on("ol-ready", "click", () => { N.setReady(!N.myReady); render(); });
    on("ol-leave", "click", () => { N.leave(); render(); });
    on("ol-team0", "click", () => N.setTeam(0));
    on("ol-team1", "click", () => N.setTeam(1));
    on("ol-send", "click", sendChat);
    on("ol-msg", "keydown", (e) => { if (e.key === "Enter") sendChat(); });
    on("ol-mic", "click", () => (N.voice.on ? N.voice.stop() : N.voice.start()));
    on("ol-mute", "click", () => N.voice.toggleMute());
    return m;
  }
  function sendChat() { const i = $("ol-msg"); if (!i) return; N.chat(i.value); i.value = ""; }
  function copyLink() {
    const link = N.inviteLink();
    if (!link) return;
    const done = () => NR.hub?.notify?.("Invite link copied — send it to your friend!");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => { $("ol-link").select(); document.execCommand && document.execCommand("copy"); done(); });
    else { $("ol-link").select(); document.execCommand && document.execCommand("copy"); done(); }
  }
  function shareLink() {
    const link = N.inviteLink();
    if (navigator.share) navigator.share({ title: "NEON RONIN", text: "Fight with me in NEON RONIN! Room " + N.room, url: link }).catch(() => {});
    else copyLink();
  }
  OU.open = function (tab) {
    build();
    if (tab) OU.tab = tab;
    if (NR.lobby && NR.lobby.openModal) NR.lobby.openModal("modal-online"); else $("modal-online").classList.add("open");
    render();
    loop();
  };
  OU.close = function () { const m = $("modal-online"); if (m) m.classList.remove("open"); };

  /* ---------------- rendering ---------------- */
  const STATUS = { offline: "OFFLINE", connecting: "CONNECTING…", lobby: "IN ROOM" };
  function render() {
    const m = $("modal-online");
    if (!m || !$("ol-play")) return;
    m.querySelectorAll("[data-otab]").forEach((b) => b.classList.toggle("sel", b.dataset.otab === OU.tab));
    $("ol-play").hidden = OU.tab !== "play";
    $("ol-board").hidden = OU.tab !== "board";
    const st = $("ol-status");
    st.textContent = (N.role === "host" ? "HOST · " : N.role === "guest" ? "GUEST · " : "") + (STATUS[N.status] || N.status.toUpperCase()) + (N.role === "guest" && N.rtt ? ` · ${N.rtt}ms` : "");
    st.className = "ol-status " + N.status;
    if (OU.tab === "board") { renderBoard(); return; }
    // modes
    const cur = N.role ? N.mode : OU.mode || "coop";
    const modes = $("ol-modes");
    modes.replaceChildren(...Object.entries(N.MODES).map(([id, md]) => {
      const b = mk("button", "ol-mode" + (id === cur ? " sel" : ""));
      b.dataset.mode = id;
      b.append(mk("b", "", md.label), mk("small", "", md.desc));
      b.disabled = N.role === "guest" || N.inGame || N.status === "connecting";
      b.addEventListener("click", () => { OU.mode = id; if (N.role === "host") N.setMode(id); render(); });
      return b;
    }));
    // players (me first, then the friend slot(s))
    renderPlayers(cur);
    const inRoom = !!N.role;
    $("ol-offline-actions").hidden = inRoom || N.status === "connecting";
    $("ol-room-actions").hidden = !inRoom;
    if (N.status === "connecting") $("ol-offline-actions").hidden = true;
    if (inRoom) {
      $("ol-room").textContent = N.publicRoom ? "PUBLIC" : N.room;
      $("ol-link").value = N.inviteLink();
      $("ol-teams").hidden = !N.MODES[N.mode].teams;
      const start = $("ol-start"), why = N.canStart();
      start.hidden = N.role !== "host";
      start.disabled = why !== "ok";
      $("ol-ready").hidden = N.role !== "guest";
      $("ol-ready").textContent = N.myReady ? "READY ✓" : "READY";
      $("ol-hint").textContent = N.role === "host" ? (why === "ok" ? "Everyone is here — press START MATCH." : why) : "Waiting for the host to start…";
    }
    const off = NR.crazy && NR.crazy.settings.disableChat;
    $("ol-chat-box").hidden = !inRoom || off;
    $("ol-mic").textContent = N.voice.on ? "🎤 VOICE ON" : "🎤 VOICE";
    $("ol-mic").classList.toggle("sel", N.voice.on);
    $("ol-mute").hidden = !N.voice.on;
    $("ol-mute").textContent = N.voice.muted ? "🔇 MUTED" : "🔈 MIC";
    renderLog();
  }
  const cards = new Map();
  function memberList() {
    if (N.role) return N.members;
    return [{ pid: -1, team: 0, ...N.myInfo(), you: true }];
  }
  function renderPlayers(mode) {
    const wrap = $("ol-players");
    const max = N.MODES[mode].max;
    const list = memberList();
    const kids = [];
    for (let i = 0; i < Math.max(2, Math.min(max, list.length + 1)); i++) {
      const m = list[i];
      const card = mk("div", "ol-card" + (m ? "" : " empty") + (m && N.MODES[mode].teams ? (m.team ? " red" : " blue") : ""));
      if (m) {
        const cv = mk("canvas", "ol-hero"); cv.width = 150; cv.height = 150;
        cv.dataset.pid = String(m.pid);
        cards.set(cv, m);
        const isMe = N.role ? m.pid === N.pid : true;
        const hero = NR.heroes ? NR.heroes.byId(m.heroId) : null;
        card.append(cv, mk("b", "", m.name + (isMe ? " (YOU)" : "")), mk("small", "", `${hero ? hero.name : "HERO"} · LV ${m.level || 1}${m.host ? " · HOST" : ""}${m.voice ? " · 🎤" : ""}${!m.host && N.role ? (m.ready ? " · READY" : "") : ""}`));
      } else {
        card.append(mk("div", "ol-wait", N.role ? "WAITING FOR PLAYER…" : "FRIEND"), mk("small", "", N.role ? "Share the invite link" : "Create a room or quick match"));
      }
      kids.push(card);
    }
    wrap.replaceChildren(...kids);
    wrap.classList.toggle("many", kids.length > 2);
  }
  // animated hero previews
  let raf = 0, clock = 0, lastT = 0;
  const actors = new Map();
  function loop() {
    if (raf || typeof requestAnimationFrame !== "function") return;
    const step = (now) => {
      const m = $("modal-online");
      if (!m || !m.classList.contains("open")) { raf = 0; return; }
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now; clock += dt;
      document.querySelectorAll("#ol-players canvas.ol-hero").forEach((cv) => {
        const mem = cards.get(cv);
        if (!mem || !cv.getContext) return;
        const g = cv.getContext("2d");
        g.clearRect(0, 0, cv.width, cv.height);
        const hero = NR.heroes && NR.heroes.byId(mem.heroId);
        const x = cv.width / 2, y = cv.height - 8;
        if (hero && hero.body.kind !== "forge" && NR.heroes.draw(g, hero, { x, y, facing: 1, t: clock + mem.pid, anim: "idle" }, { scale: 0.95 })) return;
        const key = JSON.stringify(mem.look || P.appearance);
        let a = actors.get(key);
        if (!a) { a = NR.char.actor(mem.look || P.appearance, { rate: 1 }); a.play("idle"); actors.set(key, a); }
        a.update(dt / Math.max(1, actors.size));
        a.draw(g, x, y, { scale: 1.35 });
      });
    };
    raf = requestAnimationFrame(step);
  }
  function renderLog() {
    const log = $("ol-log");
    if (!log) return;
    log.replaceChildren(...OU.chat.slice(-40).map((c) => {
      const row = mk("div", "ol-line" + (c.from ? "" : " sys"));
      if (c.from) row.append(mk("b", "", c.from + ": "));
      row.append(document.createTextNode(c.text));
      return row;
    }));
    log.scrollTop = log.scrollHeight;
  }
  function renderBoard() {
    const m = $("modal-online");
    m.querySelectorAll("[data-bm]").forEach((b) => b.classList.toggle("sel", b.dataset.bm === OU.boardMode));
    const rows = N.board.top(30, OU.boardMode);
    const mine = new Set(N.board.mine(50, OU.boardMode).map((e) => e.n + e.w + e.d));
    const ol = $("ol-rank");
    if (!rows.length) { ol.replaceChildren(mk("li", "ol-empty", "No scores yet — play a run!")); return; }
    ol.replaceChildren(...rows.map((e, i) => {
      const li = mk("li", mine.has(e.n + e.w + e.d) ? "me" : "");
      li.append(mk("span", "rk", "#" + (i + 1)), mk("b", "", e.n), mk("span", "md", e.m === "coop" ? "CO-OP" + (e.p ? " · " + e.p : "") : e.m === "solo" ? "SOLO" : e.m === "floor" ? "LEVELS" : "PVP"),
        mk("em", "", (OU.boardMode === "floor" ? "FLOOR " : OU.boardMode === "pvp-win" ? "WINS " : "WAVE ") + e.w));
      return li;
    }));
  }

  /* ---------------- events ---------------- */
  N.on("status", (s) => { if (s.msg && s.status !== "offline") setErr(""); render(); renderHud(); });
  N.on("lobby", () => { render(); renderHud(); });
  N.on("rtt", () => { render(); renderHud(); });
  N.on("board", () => { if (OU.tab === "board") render(); });
  N.on("voice", () => { render(); renderHud(); });
  N.on("error", (msg) => { setErr(msg); NR.hub?.notify?.(msg); render(); });
  N.on("countdown", (n) => { setErr(""); NR.hub?.notify?.(`Match found! Starting in ${n}…`); });
  N.on("chat", (c) => {
    OU.chat.push({ from: c.from, text: c.text, t: Date.now() });
    if (OU.chat.length > 80) OU.chat.shift();
    renderLog(); renderFeed();
    if (c.from && G.state === "playing") NR.audio?.play?.("ui");
  });
  N.on("start", () => { OU.close(); renderHud(); });
  N.on("end", (r) => {
    renderHud();
    if (r.pvp) showResult(r);
    else addLobbyButton();
  });
  N.on("menu", () => toggleChatInput(true));
  N.on("invite", (code) => { OU.open("play"); N.join(code); });
  function setErr(msg) { const e = $("ol-err"); if (e) e.textContent = msg || ""; }

  /* ---------------- in-game overlay: status, chat feed ---------------- */
  function hudEl() {
    let h = $("online-hud");
    if (h) return h;
    h = mk("div", "online-hud"); h.id = "online-hud"; h.hidden = true;
    h.innerHTML = `<span id="oh-info"></span><button id="oh-chat" aria-label="Chat">💬</button><button id="oh-mic" aria-label="Voice">🎤</button><button id="oh-leave" aria-label="Leave match">⏏ LEAVE</button>
      <div class="oh-feed" id="oh-feed"></div><div class="oh-input" id="oh-input" hidden><input id="oh-msg" maxlength="120" placeholder="Chat… (Enter to send)" aria-label="Chat message"></div>`;
    document.body.append(h);
    $("oh-chat") && $("oh-chat").addEventListener("click", () => toggleChatInput());
    $("oh-mic") && $("oh-mic").addEventListener("click", () => (N.voice.on ? N.voice.toggleMute() : N.voice.start()));
    $("oh-leave") && $("oh-leave").addEventListener("click", () => { if (confirm("Leave the online match?")) N.leave(); });
    $("oh-msg") && $("oh-msg").addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { N.chat(e.target.value); e.target.value = ""; toggleChatInput(false); }
      if (e.key === "Escape") toggleChatInput(false);
    });
    return h;
  }
  function toggleChatInput(force) {
    if (NR.crazy && NR.crazy.settings.disableChat) return;
    const box = $("oh-input");
    if (!box) return;
    const show = force === undefined ? box.hidden : force;
    box.hidden = !show;
    if (show) { NR.input.reset(); setTimeout(() => $("oh-msg").focus(), 0); } else $("oh-msg").blur();
  }
  function renderHud() {
    const h = hudEl();
    const ob = $("btn-online-lobby"); if (ob) ob.hidden = !N.role;
    const on = N.inGame && !!N.role;
    h.hidden = !on;
    if (!on || !$("oh-info")) return;
    $("oh-info").textContent = `${N.MODES[N.mode].label} · ${N.role === "host" ? "HOST" : "PING " + (N.rtt || "?") + "ms"}`;
    $("oh-mic").textContent = N.voice.on ? (N.voice.muted ? "🔇" : "🎤") : "🎙";
    $("oh-chat").hidden = !!(NR.crazy && NR.crazy.settings.disableChat);
  }
  function renderFeed() {
    const f = $("oh-feed");
    if (!f) return;
    const now = Date.now();
    f.replaceChildren(...OU.chat.filter((c) => now - c.t < 9000).slice(-4).map((c) => {
      const row = mk("div", "oh-line");
      if (c.from) row.append(mk("b", "", c.from + ": "));
      row.append(document.createTextNode(c.text));
      return row;
    }));
  }
  if (typeof setInterval === "function") setInterval(renderFeed, 1500);
  if (typeof window !== "undefined") window.addEventListener("keydown", (e) => {
    if (!N.inGame || G.state !== "playing" || e.target.matches("input, textarea")) return;
    if (e.key === "Enter") { e.preventDefault(); toggleChatInput(true); }
  });

  function showResult(r) {
    let o = $("online-result");
    if (!o) {
      o = mk("div", "item-info-modal online-result"); o.id = "online-result";
      document.body.append(o);
    }
    const panel = mk("div", "wood-panel item-info-panel");
    panel.append(mk("h2", r.won ? "win" : "lose", r.won ? "VICTORY!" : "DEFEAT"), mk("p", "ii-line", r.won ? "Your team is the last one standing." : "The other team won this round."),
      mk("p", "ii-price", `+${r.coins} 🪙`));
    if (r.reason) panel.append(mk("p", "ii-line", r.reason));
    const back = mk("button", "nav-btn primary", "BACK TO ONLINE LOBBY");
    back.addEventListener("click", () => { o.classList.remove("open"); G.toMenu(); OU.open("play"); });
    panel.append(back);
    o.replaceChildren(panel);
    o.classList.add("open");
  }
  function addLobbyButton() {
    const over = $("scr-over");
    if (!over || $("btn-online-lobby")) return;
    const b = mk("button", "btn ghost", "ONLINE LOBBY");
    b.id = "btn-online-lobby";
    b.addEventListener("click", () => { G.toMenu(); OU.open("play"); });
    const row = over.querySelector(".btn-row") || over.querySelector(".panel") || over;
    row.append(b);
  }

  /* lobby button + invite links */
  const btn = $("lb-online");
  if (btn) btn.addEventListener("click", () => { NR.audio?.play?.("ui"); OU.open(); });
  OU.autoJoin = function () {
    const room = N.pendingInvite();
    if (!room || N.role || N.status === "connecting" || OU.joinedInvite === room) return false;
    OU.joinedInvite = room;
    OU.open("play");
    N.join(room);
    try { const u = new URL(location.href); u.searchParams.delete("room"); history.replaceState(null, "", u.toString()); } catch (_) {}
    return true;
  };
})();

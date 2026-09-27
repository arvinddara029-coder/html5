/* ============ CRAZYGAMES SDK v3 — cloud saves, account, ads, invites ============
   The game has no server of its own; on CrazyGames the SDK is the backend:
   · SDK.data   — every "nr_*" save key (coins, items, levels, vault, HUD…) is
                  mirrored to the player's CrazyGames account and restored on
                  another device (newest copy wins).
   · SDK.user   — player name + avatar, sign-in prompt.
   · SDK.ad     — a midgame ad after a boss is defeated and after a level is
                  cleared; a rewarded ad gives coins.
   · SDK.game   — gameplayStart/Stop, loadingStart/Stop, happytime, rooms /
                  invite links for online play, muteAudio / disableChat.
   Outside CrazyGames (or if the script is blocked) every call is a safe no-op
   and the game keeps working with local storage only. */
(function () {
  const G = NR.game, P = NR.profile;
  const CZ = (NR.crazy = { ready: false, env: "none", user: null, adActive: false, settings: { muteAudio: false, disableChat: false } });
  const sdk = () => (typeof window !== "undefined" && window.CrazyGames && window.CrazyGames.SDK) || null;
  const on = () => CZ.ready && CZ.env !== "disabled" && !!sdk();
  const safe = (fn, fallback) => { try { return fn(); } catch (err) { return fallback; } };

  /* ---------------- init ---------------- */
  CZ.init = function () {
    const S = sdk();
    if (!S || typeof S.init !== "function") { CZ.env = "none"; return Promise.resolve(false); }
    const timeout = new Promise((r) => setTimeout(() => r("timeout"), 6000));
    return Promise.race([Promise.resolve(safe(() => S.init(), null)), timeout]).then((res) => {
      if (res === "timeout") { CZ.env = "none"; return false; }
      CZ.env = safe(() => S.environment, "none") || "none";
      CZ.ready = CZ.env !== "disabled";
      if (!CZ.ready) return false;
      safe(() => { CZ.settings = Object.assign(CZ.settings, S.game.settings || {}); applySettings(); });
      safe(() => S.game.addSettingsChangeListener((s) => { CZ.settings = Object.assign(CZ.settings, s || {}); applySettings(); }));
      cloudSync();
      loadUser();
      safe(() => S.user.addAuthListener(() => loadUser()));
      safe(() => S.game.addJoinRoomListener((params) => CZ.onJoinRoom && CZ.onJoinRoom(params)));
      return true;
    }).catch(() => false);
  };
  /* full mute while an ad plays or when CrazyGames asks for muteAudio */
  const muteWhy = new Set();
  let saved = null;
  CZ.mute = function (why, onOff) {
    const A = NR.audio;
    if (!A) return;
    const before = muteWhy.size > 0;
    if (onOff) muteWhy.add(why); else muteWhy.delete(why);
    const now = muteWhy.size > 0;
    if (now === before) return;
    if (now) { saved = { m: A.musicOn, s: A.sfxOn }; safe(() => { A.toggleMusic(false); A.toggleSfx(false); }); A.sdkMuted = true; }
    else { A.sdkMuted = false; if (saved) safe(() => { A.toggleMusic(saved.m); A.toggleSfx(saved.s); }); saved = null; }
  };
  function applySettings() {
    CZ.mute("sdk", !!CZ.settings.muteAudio);
    document.body && document.body.classList && document.body.classList.toggle("chat-disabled", !!CZ.settings.disableChat);
  }
  // SDK muteAudio has priority over the in-game audio toggles
  if (NR.audio && NR.audio.play) {
    const play = NR.audio.play;
    NR.audio.play = function (...a) { if (NR.audio.sdkMuted) return; return play.apply(this, a); };
    const tm = NR.audio.toggleMusic, ts = NR.audio.toggleSfx;
    NR.audio.toggleMusic = function (v) { if (NR.audio.sdkMuted && v) { if (saved) saved.m = v; return; } return tm.call(this, v); };
    NR.audio.toggleSfx = function (v) { if (NR.audio.sdkMuted && v) { if (saved) saved.s = v; return; } return ts.call(this, v); };
  }

  /* ---------------- cloud saves via SDK.data ---------------- */
  const LOCAL_KEYS = () => {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^nr_/.test(k) && k !== "nr_debug" && k !== "nr_zoom") out.push(k); } } catch (_) {}
    return out;
  };
  const TS = "nr_cloud_ts";
  function cloudSync() {
    const S = sdk();
    if (!S || !S.data) return;
    safe(() => {
      const cloudTs = Number(S.data.getItem(TS)) || 0;
      const localTs = Number(localStorage.getItem(TS)) || 0;
      let keys = [];
      try { keys = JSON.parse(S.data.getItem("nr_cloud_keys") || "[]"); } catch (_) { keys = []; }
      if (cloudTs > localTs && keys.length) {
        // another device saved more recently: take its copy, reload once
        for (const k of keys) { const v = S.data.getItem(k); if (v !== null && v !== undefined) localStorage.setItem(k, v); }
        localStorage.setItem(TS, String(cloudTs));
        let reloaded = false;
        try { reloaded = sessionStorage.getItem("nr_cloud_reload") === String(cloudTs); } catch (_) {}
        if (!reloaded) { try { sessionStorage.setItem("nr_cloud_reload", String(cloudTs)); } catch (_) {} location.reload(); return; }
      } else pushAll();
      CZ.cloud = true;
      const note = document.getElementById("storage-note");
      if (note) note.textContent = "☁ Progress is synced to your CrazyGames account (and kept in this browser).";
    });
  }
  function pushAll() {
    const S = sdk();
    if (!S || !S.data) return;
    const keys = LOCAL_KEYS();
    for (const k of keys) { const v = localStorage.getItem(k); if (v !== null) S.data.setItem(k, v); }
    const ts = Date.now();
    S.data.setItem("nr_cloud_keys", JSON.stringify(keys));
    S.data.setItem(TS, String(ts));
    localStorage.setItem(TS, String(ts));
  }
  let pushT = 0;
  const setItem = NR.store.setItem.bind(NR.store);
  NR.store.setItem = function (key, value) {
    const ok = setItem(key, value);
    if (/^nr_/.test(key) && key !== TS) {
      try { localStorage.setItem(TS, String(Date.now())); } catch (_) {}
      if (CZ.cloud) { clearTimeout(pushT); pushT = setTimeout(() => safe(pushAll), 800); }
    }
    return ok;
  };

  /* ---------------- user ---------------- */
  function loadUser() {
    const S = sdk();
    if (!S || !S.user) return;
    Promise.resolve(safe(() => S.user.getUser(), null)).then((u) => {
      CZ.user = u || null;
      if (u && u.username) {
        const clean = String(u.username).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 16);
        if (clean.length >= 3 && (P.nameFromSdk || !P.name || P.name === "RONIN_01")) { P.name = clean; P.nameFromSdk = true; NR.saveProfile(); }
        const el = document.getElementById("pc-name");
        if (el) el.textContent = P.name;
        const cs = document.getElementById("callsign");
        if (cs) cs.value = P.name;
      }
      CZ.renderAccount && CZ.renderAccount();
    }).catch(() => {});
  }
  CZ.signIn = function () {
    const S = sdk();
    if (!on() || !S.user || !S.user.isUserAccountAvailable) { NR.hub?.notify?.("Sign-in works on CrazyGames.com"); return; }
    Promise.resolve(safe(() => S.user.showAuthPrompt(), null)).then(loadUser).catch(() => {});
  };
  CZ.playerName = () => (CZ.user && CZ.user.username) || P.name || "RONIN";

  /* ---------------- gameplay events ---------------- */
  let playing = false;
  CZ.gameplay = function (start) {
    if (!on() || playing === start) return;
    playing = start;
    safe(() => (start ? sdk().game.gameplayStart() : sdk().game.gameplayStop()));
  };
  CZ.happy = () => { if (on()) safe(() => sdk().game.happytime()); };
  CZ.loading = (start) => { if (on()) safe(() => (start ? sdk().game.loadingStart() : sdk().game.loadingStop())); };

  /* ---------------- ads ---------------- */
  let lastMidgame = 0;
  CZ.ad = function (type) {
    return new Promise((resolve) => {
      const S = sdk();
      if (!on() || !S.ad) { resolve(type === "rewarded" ? "unavailable" : "skipped"); return; }
      const wasPlaying = G.state === "playing";
      let done = false;
      const finish = (res) => {
        if (done) return; done = true;
        CZ.adActive = false;
        CZ.mute("ad", false);
        if (wasPlaying && G.state === "pause" && CZ._pausedByAd) { G.state = "playing"; NR.ui.hideAll(); }
        CZ._pausedByAd = false;
        resolve(res);
      };
      try { S.ad.requestAd(type, {
        adStarted: () => {
          CZ.adActive = true;
          CZ.mute("ad", true);
          if (G.state === "playing") { G.state = "pause"; CZ._pausedByAd = true; NR.input.reset(); }
        },
        adFinished: () => finish("finished"),
        adError: () => finish("error"),
      }); } catch (_) { finish("error"); }
      setTimeout(() => finish("timeout"), 70000);
    });
  };
  CZ.midgame = function (reason) {
    if (!on() || G.others.length || G.pvp || G.netGuest) return Promise.resolve("skipped"); // never interrupt an online match
    if (Date.now() - lastMidgame < 60000) return Promise.resolve("skipped");
    lastMidgame = Date.now();
    return CZ.ad("midgame");
  };
  CZ.REWARD = 150;
  CZ.rewardCoins = function () {
    if (!on()) { NR.hub?.notify?.("Rewarded ads work on CrazyGames.com"); return Promise.resolve(false); }
    return CZ.ad("rewarded").then((res) => {
      if (res === "finished") {
        NR.economy.addCoins(CZ.REWARD);
        NR.hub?.notify?.(`+${CZ.REWARD} coins — thanks for watching!`);
        NR.audio?.play?.("coin");
        NR.lobby?.refreshWallet?.(); NR.lobby?.refreshCard?.();
        if (document.getElementById("modal-shop")?.classList.contains("open")) NR.lobby.renderShop();
        if (document.getElementById("modal-vault")?.classList.contains("open")) NR.vault?.render();
        return true;
      }
      NR.hub?.notify?.(res === "error" ? "No ad available right now — try again later." : "Ad closed early — no reward.");
      return false;
    });
  };
  CZ.adButton = function () {
    const b = document.createElement("button");
    b.className = "ad-reward-btn";
    b.type = "button";
    b.innerHTML = `▶ WATCH AD <b>+${CZ.REWARD} 🪙</b>`;
    b.addEventListener("click", () => { NR.audio?.play?.("ui"); CZ.rewardCoins(); });
    return b;
  };
  CZ.decorateShop = function () {
    const f = document.getElementById("shop-filter");
    if (f && !f.querySelector(".ad-reward-btn")) f.prepend(CZ.adButton());
  };

  /* ---------------- rooms & invites (used by online play) ---------------- */
  CZ.inviteLink = function (roomId) {
    const S = sdk();
    let link = "";
    if (on()) link = safe(() => S.game.inviteLink({ room: roomId }), "") || "";
    if (!link) {
      try {
        const u = new URL(location.href);
        u.searchParams.set("room", roomId);
        u.hash = "";
        link = u.toString();
      } catch (_) { link = String(location.href || "").split(/[?#]/)[0] + "?room=" + encodeURIComponent(roomId); }
    }
    return link;
  };
  CZ.updateRoom = function (roomId, joinable) {
    if (!on()) return;
    safe(() => sdk().game.updateRoom({ roomId, isJoinable: !!joinable, inviteParams: { room: roomId } }));
    if (joinable) safe(() => sdk().game.showInviteButton({ room: roomId }));
    else safe(() => sdk().game.hideInviteButton());
  };
  CZ.leftRoom = function () { if (on()) { safe(() => sdk().game.leftRoom()); safe(() => sdk().game.hideInviteButton()); } };
  CZ.inviteRoom = function () {
    const S = sdk();
    let room = "";
    if (on()) {
      room = safe(() => (S.game.inviteParams && S.game.inviteParams.room) || S.game.getInviteParam("room"), "") || "";
    }
    if (!room) { try { room = new URL(location.href).searchParams.get("room") || ""; } catch (_) {} }
    return room;
  };
  CZ.instantMultiplayer = () => on() && !!safe(() => sdk().game.isInstantMultiplayer, false);

  /* ---------------- hooks into the game ---------------- */
  const setState = (() => {
    let last = "";
    return () => {
      const s = G.state;
      if (s === last) return;
      last = s;
      CZ.gameplay(s === "playing");
    };
  })();
  if (typeof setInterval === "function") setInterval(setState, 500);

  const bossKilled = G.onBossKilled;
  G.onBossKilled = function (b) {
    const r = bossKilled.call(this, b);
    CZ.happy();
    // short delay so the kill explosion is seen, then the break ad
    setTimeout(() => { if (G.state === "playing" || G.state === "upgrade") CZ.midgame("boss"); }, 1600);
    return r;
  };
  if (NR.expeditionUI && NR.expeditionUI.showVictory) {
    const show = NR.expeditionUI.showVictory;
    NR.expeditionUI.showVictory = function (g) {
      const r = show.call(this, g);
      CZ.happy();
      CZ.midgame("level");
      return r;
    };
  }
})();

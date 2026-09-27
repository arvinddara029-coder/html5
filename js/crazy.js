/* ============ PRODUCTION PASS — CrazyGamesService (SDK v3) ============
   Centralized CrazyGames integration. One place, one responsibility:
     - SDK script load + init (with timeout, never blocks the game)
     - environment detection (local / crazygames / disabled)
     - user detection (guest vs CrazyGames account, username + avatar)
     - cloud save mirror via the SDK data module (logged-in users)
     - loading events (loadingStart / loadingStop)
     - gameplay events (gameplayStart / gameplayStop) — brackets active play
     - ads (midgame at breaks, rewarded opt-in) with anti-duplication,
       audio muting and gameplay pause during the ad
     - room metadata + invite links (updateRoom / leftRoom / inviteLink /
       getInviteParam) for the multiplayer flow
   Every call is wrapped: SDK failures log to Diagnostics and fall back to
   local behavior. The game must run perfectly with the SDK absent.
   Only documented v3 APIs are used. */
(function () {
  const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
  const C = (NR.crazy = {
    sdk: null,            // window.CrazyGames.SDK once initialized
    available: false,     // SDK initialized successfully
    environment: "local", // local | crazygames | disabled
    user: null,           // {username, profilePictureUrl} or null (guest)
    userAvailable: false, // platform account system reachable
    adBusy: false,        // an ad request is in flight
    lastMidgame: 0,       // timestamp of the last midgame ad
    MIDGAME_GAP: 180,     // seconds — platform enforces spacing too
  });

  const diag = (...args) => NR.diag && NR.diag.sdk(...args);

  function loadScript(src, timeoutMs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      const to = setTimeout(() => reject(new Error("SDK load timeout")), timeoutMs || 8000);
      s.onload = () => { clearTimeout(to); resolve(); };
      s.onerror = () => { clearTimeout(to); reject(new Error("SDK script failed to load")); };
      document.head.append(s);
    });
  }

  /* ---------- initialization ---------- */
  C.init = async function () {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        // already provided by the platform
      } else {
        await loadScript(SDK_URL);
      }
      const SDK = window.CrazyGames && window.CrazyGames.SDK;
      if (!SDK) throw new Error("CrazyGames SDK v3 not found after load");
      await SDK.init();
      C.sdk = SDK;
      C.available = true;
      C.environment = String(SDK.environment || "local");
      NR.diag.sdkStatus = "ok:" + C.environment;
      diag(`SDK initialized (environment=${C.environment})`);
      C.detectUser().catch(() => {});
      return true;
    } catch (e) {
      C.available = false;
      C.environment = "local";
      NR.diag.sdkStatus = "unavailable";
      diag(`SDK init failed — running local: ${e && e.message}`);
      return false;
    }
  };

  /* ---------- user / account ---------- */
  C.detectUser = async function () {
    if (!C.available || !C.sdk.user) return null;
    try {
      C.userAvailable = !!C.sdk.user.isUserAccountAvailable;
      if (!C.userAvailable) { C.user = null; diag("No CrazyGames account available (guest)"); return null; }
      const u = await C.sdk.user.getUser();
      if (u && u.username) {
        C.user = { username: u.username, profilePictureUrl: u.profilePictureUrl || "" };
        diag(`CrazyGames user: ${u.username}`);
        NR.social?.onCrazyUser?.(C.user);
      } else {
        C.user = null;
        diag("CrazyGames account available but user not logged in");
      }
    } catch (e) {
      C.user = null;
      diag(`getUser failed: ${errText(e)}`);
    }
    return C.user;
  };

  function errText(e) {
    if (!e) return "unknown";
    if (e.code && e.message) return `code=${e.code} ${e.message}`;
    return e.message || String(e);
  }

  /* ---------- cloud save (data module, localStorage-shaped) ---------- */
  C.cloudGet = function (key) {
    try {
      if (C.available && C.sdk.data && C.user) return C.sdk.data.getItem(key);
    } catch (e) { diag(`cloudGet(${key}) failed: ${errText(e)}`); }
    return null;
  };
  C.cloudSet = function (key, value) {
    try {
      if (C.available && C.sdk.data && C.user) { C.sdk.data.setItem(key, value); return true; }
    } catch (e) { diag(`cloudSet(${key}) failed: ${errText(e)}`); }
    return false;
  };
  C.cloudAvailable = () => !!(C.available && C.user);

  /* ---------- loading / gameplay lifecycle ---------- */
  C.loadingStart = function () { try { C.available && C.sdk.game.loadingStart(); } catch (e) { diag("loadingStart failed: " + errText(e)); } };
  C.loadingStop = function () { try { C.available && C.sdk.game.loadingStop(); } catch (e) { diag("loadingStop failed: " + errText(e)); } };
  C.gameplayStart = function () { try { C.available && C.sdk.game.gameplayStart(); } catch (e) { diag("gameplayStart failed: " + errText(e)); } };
  C.gameplayStop = function () { try { C.available && C.sdk.game.gameplayStop(); } catch (e) { diag("gameplayStop failed: " + errText(e)); } };
  C.happytime = function () { try { C.available && C.sdk.game.happytime(); } catch (e) { diag("happytime failed: " + errText(e)); } };

  /* ---------- ads ----------
     midgame: only at natural breaks (never during combat), spaced ≥3min.
     rewarded: explicit opt-in; reward granted exactly once, only on
     adFinished; adError / unfilled grants nothing and never breaks play. */
  C.canMidgame = function () {
    const now = Date.now() / 1000;
    if (C.adBusy) return false;
    if (now - C.lastMidgame < C.MIDGAME_GAP) return false;
    if (!C.available) return false;
    return true;
  };

  function runAd(type, callbacks) {
    if (!C.available || !C.sdk.ad) { callbacks && callbacks.unavailable && callbacks.unavailable(); return false; }
    if (C.adBusy) { diag(`requestAd(${type}) ignored — ad already in flight`); return false; }
    C.adBusy = true;
    const wasMuted = NR.audio ? (NR.audio.sfxOn || NR.audio.musicOn) : true;
    const G = NR.game;
    const wasPlaying = G && G.state === "playing";
    let rewardGranted = false; // anti-duplication guard
    try {
      C.sdk.ad.requestAd(type, {
        adStarted: () => {
          diag(`ad ${type} started`);
          // platform requirement: silence the game while the ad plays
          if (NR.audio) NR.audio.muteAll(true);
          if (wasPlaying) G.autoPause();
        },
        adFinished: () => {
          C.adBusy = false;
          if (type === "midgame") C.lastMidgame = Date.now() / 1000;
          if (NR.audio) NR.audio.muteAll(false, wasMuted);
          diag(`ad ${type} finished`);
          if (!rewardGranted) { rewardGranted = true; callbacks && callbacks.onFinished && callbacks.onFinished(); }
        },
        adError: (error) => {
          C.adBusy = false;
          if (NR.audio) NR.audio.muteAll(false, wasMuted);
          diag(`ad ${type} error: ${errText(error)}`);
          if (!rewardGranted) { rewardGranted = true; callbacks && callbacks.onError && callbacks.onError(error); }
        },
      });
      return true;
    } catch (e) {
      C.adBusy = false;
      if (NR.audio) NR.audio.muteAll(false, wasMuted);
      diag(`requestAd(${type}) threw: ${errText(e)}`);
      callbacks && callbacks.onError && callbacks.onError(e);
      return false;
    }
  }

  C.showMidgame = function (placement) {
    if (!C.canMidgame()) return false;
    diag(`midgame ad requested (${placement || "break"})`);
    return runAd("midgame", {
      onFinished: () => NR.hub?.notify(""),
      onError: () => NR.hub?.notify("Ad unavailable — continuing."),
    });
  };
  C.showRewarded = function (onReward, label) {
    if (C.adBusy) { NR.hub?.notify("An ad is already playing."); return false; }
    diag(`rewarded ad requested (${label || "bonus"})`);
    return runAd("rewarded", {
      onFinished: () => { diag("rewarded ad completed — granting reward"); onReward && onReward(); },
      onError: () => NR.hub?.notify("Ad not completed — no reward granted."),
      unavailable: () => NR.hub?.notify("Ads are not available here."),
    });
  };

  /* ---------- rooms / invites (metadata only — not a game-state server) ---------- */
  C.updateRoom = function (roomId, isJoinable, inviteParams) {
    try {
      if (!C.available || !C.sdk.game || !C.sdk.game.updateRoom) return false;
      C.sdk.game.updateRoom({ roomId, isJoinable: !!isJoinable, inviteParams: inviteParams || {} });
      diag(`updateRoom roomId=${roomId} joinable=${!!isJoinable}`);
      return true;
    } catch (e) { diag("updateRoom failed: " + errText(e)); return false; }
  };
  C.leftRoom = function () {
    try { C.available && C.sdk.game.leftRoom && C.sdk.game.leftRoom(); } catch (e) { diag("leftRoom failed: " + errText(e)); }
  };
  C.inviteLink = async function (params) {
    try {
      if (!C.available || !C.sdk.game || !C.sdk.game.inviteLink) return null;
      const link = await C.sdk.game.inviteLink(params);
      diag("invite link generated");
      return link;
    } catch (e) { diag("inviteLink failed: " + errText(e)); return null; }
  };
  C.getInviteParam = function (name) {
    try {
      if (C.available && C.sdk.game && C.sdk.game.getInviteParam) return C.sdk.game.getInviteParam(name);
    } catch (e) { diag("getInviteParam failed: " + errText(e)); }
    return null;
  };
  C.inviteParams = function () {
    try {
      if (C.available && C.sdk.game && C.sdk.game.inviteParams) return C.sdk.game.inviteParams;
    } catch (_) {}
    return null;
  };
  C.isInstantMultiplayer = function () {
    try { return !!(C.available && C.sdk.game && C.sdk.game.isInstantMultiplayer); }
    catch (_) { return false; }
  };
  /* platform chat preference — read defensively, never assumed */
  C.chatDisabled = function () {
    try {
      if (C.available && C.sdk.user && typeof C.sdk.user.isChatDisabled === "boolean")
        return C.sdk.user.isChatDisabled;
    } catch (_) {}
    return false;
  };
  C.copyToClipboard = function (text) {
    try {
      if (C.available && C.sdk.game && C.sdk.game.copyToClipboard) { C.sdk.game.copyToClipboard(text); return true; }
    } catch (e) { diag("copyToClipboard failed: " + errText(e)); }
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); return true; }
    return false;
  };
})();

/* ============ CrazyGames SDK — ADS + platform lifecycle ONLY ============
   One place, one responsibility:
     - SDK script load + init (with timeout, never blocks the game)
     - environment detection (local / crazygames / disabled)
     - loading events (loadingStart / loadingStop)
     - gameplay events (gameplayStart / gameplayStop) — brackets active play
     - happytime — a platform signal on genuinely positive moments
     - interstitial ("midgame") ads at SAFE breaks only: results screens,
       victory, major checkpoint moments — NEVER during combat, spaced by
       a hard minimum gap and the platform's own rules
     - rewarded ads: explicit opt-in; the reward is granted exactly once
       and ONLY from the adFinished callback; failures grant nothing and
       never break the game
   Every call is wrapped: SDK failures log to Diagnostics and fall back to
   local behavior. The game must run perfectly with the SDK absent.
   Only documented v3 APIs are used. Multiplayer room/invite helpers and
   cloud-save mirroring were REMOVED — this is a single-player game. */
(function () {
  const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
  const C = (NR.crazy = {
    sdk: null,            // window.CrazyGames.SDK once initialized
    available: false,     // SDK initialized successfully
    environment: "local", // local | crazygames | disabled
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

  function errText(e) {
    if (!e) return "unknown";
    if (e.code && e.message) return `code=${e.code} ${e.message}`;
    return e.message || String(e);
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
      return true;
    } catch (e) {
      C.available = false;
      C.environment = "local";
      NR.diag.sdkStatus = "unavailable";
      diag(`SDK init failed — running local: ${e && e.message}`);
      return false;
    }
  };

  /* ---------- loading / gameplay lifecycle ---------- */
  C.loadingStart = function () { try { C.available && C.sdk.game.loadingStart(); } catch (e) { diag("loadingStart failed: " + errText(e)); } };
  C.loadingStop = function () { try { C.available && C.sdk.game.loadingStop(); } catch (e) { diag("loadingStop failed: " + errText(e)); } };
  C.gameplayStart = function () { try { C.available && C.sdk.game.gameplayStart(); } catch (e) { diag("gameplayStart failed: " + errText(e)); } };
  C.gameplayStop = function () { try { C.available && C.sdk.game.gameplayStop(); } catch (e) { diag("gameplayStop failed: " + errText(e)); } };
  C.happytime = function () { try { C.available && C.sdk.game.happytime(); } catch (e) { diag("happytime failed: " + errText(e)); } };

  /* ---------- ads ----------
     midgame (interstitial): only at natural breaks, never during combat,
     spaced ≥3 minutes, and skipped entirely while another ad is running.
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
    let settled = false; // anti-duplication guard: exactly one callback fires
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
          if (!settled) { settled = true; callbacks && callbacks.onFinished && callbacks.onFinished(); }
        },
        adError: (error) => {
          C.adBusy = false;
          if (NR.audio) NR.audio.muteAll(false, wasMuted);
          diag(`ad ${type} error: ${errText(error)}`);
          if (!settled) { settled = true; callbacks && callbacks.onError && callbacks.onError(error); }
        },
      });
      return true;
    } catch (e) {
      C.adBusy = false;
      if (NR.audio) NR.audio.muteAll(false, wasMuted);
      diag(`requestAd(${type}) threw: ${errText(e)}`);
      if (!settled) { settled = true; callbacks && callbacks.onError && callbacks.onError(e); }
      return false;
    }
  }

  C.showMidgame = function (placement) {
    if (!C.canMidgame()) return false;
    diag(`midgame ad requested (${placement || "break"})`);
    return runAd("midgame", {
      onFinished: () => {},
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
})();

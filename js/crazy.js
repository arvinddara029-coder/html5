/* ============ CrazyGames SDK v3 — ADS ONLY ============
   The game is a self-contained single-player title. The SDK is used for:
     - interstitial ("midgame") ads at natural breaks (level results, menu
       returns) — never during active gameplay, spaced ≥ 3 minutes
     - opt-in rewarded ads (coins, temporary skills, extra Luck Draw spins,
       revives)
     - the loading / gameplay lifecycle signals the platform requires
   The SDK loads asynchronously and never blocks boot. When it is missing
   (offline, blocked, self-hosted) every call degrades to a safe no-op and
   rewarded placements say so politely — the game stays fully playable. */
(function () {
  const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
  const C = (NR.crazy = {
    sdk: null,
    available: false,     // SDK initialised AND ads can actually be requested
    environment: "none",  // local | crazygames | disabled | none
    adBusy: false,
    lastMidgame: 0,
    MIDGAME_GAP: 180,     // seconds between interstitials
    REWARD_COOLDOWN: 90,  // seconds between "watch ad for coins" grants
  });
  const diag = (...a) => NR.diag && NR.diag.sdk && NR.diag.sdk(...a);
  const errText = (e) => (!e ? "unknown" : e.code && e.message ? `code=${e.code} ${e.message}` : e.message || String(e));

  function loadScript(src, ms) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      const to = setTimeout(() => reject(new Error("SDK load timeout")), ms || 8000);
      s.onload = () => { clearTimeout(to); resolve(); };
      s.onerror = () => { clearTimeout(to); reject(new Error("SDK script failed to load")); };
      document.head.append(s);
    });
  }

  C.init = async function () {
    try {
      if (!(window.CrazyGames && window.CrazyGames.SDK)) await loadScript(SDK_URL);
      const SDK = window.CrazyGames && window.CrazyGames.SDK;
      if (!SDK) throw new Error("CrazyGames SDK v3 not found");
      await SDK.init();
      C.sdk = SDK;
      C.environment = String(SDK.environment || "local");
      C.available = C.environment !== "disabled" && !!SDK.ad;
      if (NR.diag) NR.diag.sdkStatus = "ok:" + C.environment;
      diag(`SDK ready (environment=${C.environment}, ads=${C.available})`);
    } catch (e) {
      C.available = false; C.environment = "none";
      if (NR.diag) NR.diag.sdkStatus = "unavailable";
      diag("SDK unavailable — ads disabled: " + (e && e.message));
    }
    document.dispatchEvent(new CustomEvent("nr-ads-ready", { detail: { available: C.available } }));
    return C.available;
  };

  const call = (name) => { try { C.sdk && C.sdk.game && C.sdk.game[name] && C.sdk.game[name](); } catch (e) { diag(name + " failed: " + errText(e)); } };
  C.loadingStart = () => call("loadingStart");
  C.loadingStop = () => call("loadingStop");
  C.gameplayStart = () => call("gameplayStart");
  C.gameplayStop = () => call("gameplayStop");
  C.happytime = () => call("happytime");

  function runAd(type, cb) {
    cb = cb || {};
    if (!C.available) { cb.unavailable && cb.unavailable(); return false; }
    if (C.adBusy) { diag(`requestAd(${type}) ignored — already in flight`); return false; }
    C.adBusy = true;
    const G = NR.game, wasPlaying = G && G.state === "playing";
    let done = false;
    const finish = (ok, err) => {
      if (done) return; done = true; C.adBusy = false;
      if (NR.audio && NR.audio.muteAll) NR.audio.muteAll(false, true);
      if (ok) { if (type === "midgame") C.lastMidgame = Date.now() / 1000; cb.onFinished && cb.onFinished(); }
      else { diag(`ad ${type} error: ${errText(err)}`); cb.onError && cb.onError(err); }
    };
    try {
      C.sdk.ad.requestAd(type, {
        adStarted: () => { if (NR.audio && NR.audio.muteAll) NR.audio.muteAll(true); if (wasPlaying && G.autoPause) G.autoPause(); },
        adFinished: () => finish(true),
        adError: (e) => finish(false, e),
      });
      return true;
    } catch (e) { finish(false, e); return false; }
  }

  C.canMidgame = () => C.available && !C.adBusy && Date.now() / 1000 - C.lastMidgame >= C.MIDGAME_GAP;
  /* interstitial — only call from menus / result screens */
  C.showMidgame = function (placement) {
    const G = NR.game;
    if (G && G.state === "playing") return false; // never interrupt play
    if (!C.canMidgame()) return false;
    diag(`midgame ad (${placement || "break"})`);
    return runAd("midgame");
  };
  /* rewarded — reward granted exactly once, only after the ad completed */
  C.showRewarded = function (onReward, label) {
    if (C.adBusy) { NR.hub?.notify("An ad is already playing."); return false; }
    diag(`rewarded ad (${label || "bonus"})`);
    return runAd("rewarded", {
      onFinished: () => onReward && onReward(),
      onError: () => NR.hub?.notify("Ad not completed — no reward this time."),
      unavailable: () => NR.hub?.notify("Ads aren't available right now — the game is fully playable without them."),
    });
  };

  /* "Watch ad → +coins" with a cooldown. Amount scales gently with progress. */
  const store = () => { try { return NR.store || localStorage; } catch (_) { return null; } };
  C.coinAdAmount = () => 100 + Math.min(400, (NR.campaign ? NR.campaign.clearedCount() : 0) * 10);
  C.coinAdLeft = function () {
    const last = Number(store()?.getItem("nr_coin_ad_t") || 0);
    return Math.max(0, Math.ceil(C.REWARD_COOLDOWN - (Date.now() - last) / 1000));
  };
  C.watchForCoins = function (after) {
    const left = C.coinAdLeft();
    if (left > 0) { NR.hub?.notify(`Next coin bonus in ${left}s`); return false; }
    const amount = C.coinAdAmount();
    return C.showRewarded(() => {
      store()?.setItem("nr_coin_ad_t", String(Date.now()));
      NR.economy.addCoins(amount);
      NR.hub?.notify(`+${amount} coins — thanks for watching!`);
      NR.audio?.play?.("coin");
      after && after(amount);
    }, "coins");
  };
})();

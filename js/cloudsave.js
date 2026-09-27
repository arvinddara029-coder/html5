/* ============ PRODUCTION PASS — versioned save + cloud sync ============
   Save architecture:
     - profile carries `saveVersion`; migrations upgrade old saves field by
       field, never wiping progress because one field is missing
     - local storage remains the source of truth for guests
     - CrazyGames logged-in players get a cloud mirror (SDK data module)
       written through on every save (throttled) and pulled/merged at boot
       using a savedAt timestamp — newest wins, missing fields default */
(function () {
  const CS = (NR.cloudSync = {});
  const KEY = "nr_profile";
  const CLOUD_KEY = "nr_profile_cloud";

  CS.now = () => Date.now();

  /* wrap the profile saver with cloud write-through + saveVersion stamping */
  CS.install = function () {
    const orig = NR.saveProfile;
    let lastPush = 0;
    NR.saveProfile = function () {
      NR.profile.saveVersion = NR.SAVE_VERSION || 2;
      NR.profile.savedAt = CS.now();
      const ok = orig();
      // throttle cloud pushes to once per 4 seconds
      const t = CS.now();
      if (t - lastPush > 4000) { lastPush = t; CS.push(); }
      return ok;
    };
  };

  CS.push = function () {
    if (!NR.crazy || !NR.crazy.cloudAvailable()) return false;
    try {
      const data = JSON.stringify({ savedAt: NR.profile.savedAt, profile: NR.profile });
      NR.crazy.cloudSet(CLOUD_KEY, data);
      return true;
    } catch (e) { NR.diag?.sdk("cloud push failed: " + (e && e.message)); return false; }
  };

  CS.pull = async function () {
    if (!NR.crazy || !NR.crazy.cloudAvailable()) return false;
    try {
      const raw = NR.crazy.cloudGet(CLOUD_KEY);
      if (!raw) return false;
      const cloud = JSON.parse(raw);
      if (!cloud || typeof cloud !== "object" || !cloud.profile) return false;
      const localAt = NR.profile.savedAt || 0, cloudAt = cloud.savedAt || 0;
      if (cloudAt > localAt) {
        NR.diag.info("cloud save is newer — merging");
        CS.merge(cloud.profile);
        NR.saveProfile();
        NR.hub?.notify("Cloud progress loaded.");
        return true;
      }
      return false;
    } catch (e) { NR.diag?.sdk("cloud pull failed: " + (e && e.message)); return false; }
  };

  /* merge: keep local fields that are missing in cloud; never lose currency */
  CS.merge = function (cloudProfile) {
    const P = NR.profile;
    if (typeof cloudProfile !== "object" || !cloudProfile) return;
    for (const key of Object.keys(P)) {
      if (!(key in cloudProfile)) continue;
      const c = cloudProfile[key];
      if (key === "coins" || key === "gems") P[key] = Math.max(P[key] || 0, Math.floor(Number(c) || 0));
      else if (typeof c === typeof P[key]) P[key] = c;
    }
  };
})();

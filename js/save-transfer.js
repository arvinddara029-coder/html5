/* Portable, versioned JSON backups. Never evaluates file content or uses a network. */
(function () {
  const S = (NR.saveTransfer = { maxBytes: 256 * 1024 });
  const numeric = (n, max = 1e8) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
  const integer = (n, max) => Number.isInteger(n) && numeric(n, max);
  const object = (o) =>
    o !== null && typeof o === "object" && !Array.isArray(o);
  const fail = () => {
    throw new Error(
      "Invalid or incompatible backup. Your current save has not changed.",
    );
  };
  S.validate = function (text) {
    if (typeof text !== "string" || text.length > S.maxBytes) fail();
    let b;
    try {
      b = JSON.parse(text, (key, value) => {
        if (["__proto__", "prototype", "constructor"].includes(key)) fail();
        return value;
      });
    } catch (_) {
      fail();
    }
    if (
      !object(b) ||
      b.format !== "neon-ronin-save" ||
      b.version !== 1 ||
      !object(b.profile)
    )
      fail();
    const audio = b.audio === undefined ? { music: true, sfx: true } : b.audio;
    if (
      !object(audio) ||
      typeof audio.music !== "boolean" ||
      typeof audio.sfx !== "boolean"
    )
      fail();
    const p = b.profile;
    if (typeof p.name !== "string" || !/^[a-zA-Z0-9_]{3,16}$/.test(p.name))
      fail();
    const enums = {
      tactical: NR.powers.map((x) => x.id),
      world: ["day", "night"],
      difficulty: ["casual", "normal", "hard"],
      mode: ["adventure", "survival"],
      character: NR.characters.map(c=>c.id),
    };
    for (const [k, values] of Object.entries(enums))
      if (!values.includes(p[k])) fail();
    for (const k of ["shake", "controls"])
      if (typeof p[k] !== "boolean") fail();
    for (const k of ["chapter", "unlocked"]) if (!integer(p[k], NR.adventure.chapters.length-1)) fail();
    if (p.chapter > p.unlocked) fail();
    for (const k of ["totalKills", "bestWave", "runs"])
      if (!integer(p[k], 1e7)) fail();
    for (const k of ["musicVolume", "sfxVolume"]) if (!numeric(p[k], 1)) fail();
    if (
      !numeric(b.high) ||
      !Array.isArray(b.records) ||
      b.records.length > 20 ||
      !Array.isArray(b.achievements) ||
      b.achievements.length > NR.achievements.length
    )
      fail();
    if (
      b.achievements.some((id) => !NR.achievements.some((a) => a.id === id)) ||
      new Set(b.achievements).size !== b.achievements.length
    )
      fail();
    const records = b.records.map((r) => {
      if (
        !object(r) ||
        typeof r.name !== "string" ||
        r.name.length > 16 ||
        !enums.mode.includes(r.mode) ||
        !enums.difficulty.includes(r.difficulty) ||
        !enums.character.includes(r.character) ||
        typeof r.victory !== "boolean"
      )
        fail();
      for (const [key, max] of Object.entries({
        score: 1e8,
        wave: 10000,
        chapter: NR.adventure.chapters.length,
        kills: 1e7,
        duration: 1e6,
        date: 1e14,
      }))
        if (!numeric(r[key], max)) fail();
      return Object.fromEntries(
        [
          "name",
          "mode",
          "difficulty",
          "character",
          "victory",
          "score",
          "wave",
          "chapter",
          "kills",
          "duration",
          "date",
        ].map((k) => [k, r[k]]),
      );
    });
    if (b.checkpoint !== null && !NR.checkpoint.validate(b.checkpoint, p))
      fail();
    const profile = Object.fromEntries(
      [
        "name",
        ...Object.keys(enums),
        "shake",
        "controls",
        "chapter",
        "unlocked",
        "totalKills",
        "bestWave",
        "runs",
        "musicVolume",
        "sfxVolume",
      ].map((k) => [k, p[k]]),
    );
    // Retain currency, appearance and progression; older v1 backups did not carry them.
    for(const [key,fallback,max] of [['xp',0,1e8],['level',1,99],['coins',500,1e8],['gems',10,1e8]]){
      const value=p[key]===undefined?fallback:p[key];if(!integer(value,max))fail();profile[key]=value;
    }
    if(profile.level<1 || NR.economy.levelFromXp(profile.xp).level!==profile.level)fail();
    profile.appearance={};
    if(p.appearance!==undefined && !object(p.appearance))fail();
    for(const [cat,def] of Object.entries(NR.profile.appearance)){
      const id=p.appearance?.[cat] ?? def;
      if(typeof id!=='string' || id && !NR.catalog[cat]?.some(o=>o.id===id))fail();
      profile.appearance[cat]=id;
    }
    profile.pet=p.pet||'';
    if(typeof profile.pet!=='string' || profile.pet && !NR.catalog.pet.some(o=>o.id===profile.pet))fail();
    profile.owned={};
    if(p.owned!==undefined && !object(p.owned))fail();
    for(const [key,value] of Object.entries(p.owned||{})){
      const split=key.indexOf(':'),cat=key.slice(0,split),id=key.slice(split+1);
      if((value!==true && value!==1) || !NR.catalog[cat]?.some(o=>o.id===id))fail();profile.owned[key]=1;
    }
    const waveCheckpoint=b.waveCheckpoint||null,waveReceipt=b.waveReceipt||null;
    if(waveCheckpoint && !NR.waveResume?.validate(waveCheckpoint))fail();
    if(waveReceipt && !NR.waveResume?.validateReceipt(waveReceipt))fail();
    let evolution;
    if(b.evolution!==undefined){try{evolution=NR.evolution.validate(b.evolution,profile);}catch(_){fail();}}
    return {
      ...(evolution?{evolution}:{}),
      waveCheckpoint,waveReceipt,
      format: b.format,
      version: 1,
      profile,
      audio: { music: audio.music, sfx: audio.sfx },
      high: b.high,
      records,
      achievements: b.achievements.slice(),
      checkpoint: b.checkpoint,
    };
  };
  S.exportText = function () {
    const data = {
      format: "neon-ronin-save",
      version: 1,
      profile: NR.profile,
      waveCheckpoint:NR.waveResume?.get()||null,waveReceipt:NR.waveResume?.paid()||null,
      ...(NR.evolution?.snapshot?{evolution:NR.evolution.snapshot()}:{}),
      audio: { music: NR.audio.musicOn, sfx: NR.audio.sfxOn },
      high: NR.game.high,
      records: NR.records.map((r) => ({
        ...r,
        character: NR.characters.some(c=>c.id===r.character)
          ? r.character
          : "ronin",
        kills: numeric(r.kills, 1e7) ? r.kills : 0,
        date: numeric(r.date, 1e14) ? r.date : 0,
        victory: !!r.victory,
      })),
      achievements: [...NR.unlockedAchievements],
      checkpoint: NR.checkpoint.get(),
    };
    // Run our own output through the same validator used by import.
    return JSON.stringify(S.validate(JSON.stringify(data)), null, 2);
  };
  S.apply = function (text) {
    const b = S.validate(text); // No mutation until the entire document is validated.
    if (!["menu", "over", "victory"].includes(NR.game.state))
      throw new Error("Return to the mission hub before importing a backup.");
    const writes = [
      ["nr_profile", b.profile],
      ["nr_records_v3", b.records],
      ["nr_achievements_v3", b.achievements],
      ["nr_checkpoint_v3", b.checkpoint],
      ["nr_high", b.high],
      ["nr_music", b.audio.music ? 1 : 0],
      ["nr_sfx", b.audio.sfx ? 1 : 0],
    ];
    let persistent = true;
    for (const [key, value] of writes)
      if (!NR.store.setItem(key, JSON.stringify(value))) persistent = false;
    Object.assign(NR.profile, b.profile);
    if(b.evolution)NR.evolution.restore(b.evolution);
    else if(NR.evolution){NR.evolution.slots=NR.evolution.slots.filter(id=>NR.evolution.spells.some(s=>s.id===id && s.level<=b.profile.level));NR.evolution.save();NR.evolution.renderBar?.();}
    NR.store.setItem("nr_wave_resume_v1",JSON.stringify(b.waveCheckpoint));
    NR.store.setItem("nr_wave_paid_v1",JSON.stringify(b.waveReceipt));
    NR.records = b.records;
    NR.unlockedAchievements = new Set(b.achievements);
    NR.game.high = b.high;
    NR.audio.toggleMusic(b.audio.music);
    NR.audio.toggleSfx(b.audio.sfx);
    // Retain in-memory progress when storage is blocked; never reload to apply.
    return { persistent };
  };
  S.init = function () {
    const $ = (id) => document.getElementById(id);
    let pending = null,
      selection = 0;
    const status = (text) => {
      $("save-status").textContent = text;
    };
    const clear = () => {
      pending = null;
      selection++;
      $("save-confirm").hidden = true;
      $("save-file").value = "";
    };
    $("btn-export-save").addEventListener("click", () => {
      try {
        const blob = new Blob([S.exportText()], { type: "application/json" }),
          url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = "neon-ronin-backup.json";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        status(
          "Backup download requested. Contains your last relay checkpoint, not unsaved run progress.",
        );
      } catch (e) {
        status(e.message);
      }
    });
    $("btn-import-save").addEventListener("click", () => {
      $("save-file").value = "";
      $("save-file").click();
    });
    $("save-file").addEventListener("change", async () => {
      clearPending();
      const token = ++selection,
        file = $("save-file").files[0];
      if (!file) return;
      try {
        if (file.size > S.maxBytes)
          throw new Error(
            "Backup is too large (maximum 256 KB). No changes made.",
          );
        const text = await file.text();
        if (token !== selection) return;
        const b = S.validate(text);
        pending = text;
        status(
          `Ready: ${b.profile.name} · ${b.records.length} records · ${b.achievements.length} achievements · ${b.checkpoint ? "relay checkpoint included" : "no checkpoint"}. Import REPLACES your current local save. Export it first if needed.`,
        );
        $("save-confirm").hidden = false;
      } catch (e) {
        if (token === selection) status(e.message);
      }
    });
    function clearPending() {
      pending = null;
      $("save-confirm").hidden = true;
    }
    $("btn-cancel-import").addEventListener("click", () => {
      clear();
      status("Import cancelled. Your save is unchanged.");
    });
    $("btn-confirm-import").addEventListener("click", () => {
      if (!pending) return;
      try {
        const result = S.apply(pending);
        clear();
        NR.game.toMenu();
        NR.hub.refreshPreferences();
        NR.audio.setVolumes();
        status(
          result.persistent
            ? "Backup imported successfully."
            : "Imported for this session only: browser storage is blocked. Keep your backup.",
        );
        NR.hub.notify($("save-status").textContent);
      } catch (e) {
        status(e.message);
      }
    });
  };
})();

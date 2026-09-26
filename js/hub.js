/* Mission hub, loadouts and responsive controls. All data is local. */
(function () {
  const $ = id => document.getElementById(id);
  const P = NR.profile;
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  const text = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  let toastTimer, lastHUD = 0;
  const H = NR.hub = {};
  H.notify = text => { $('notification').textContent = text; $('notification').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('notification').classList.remove('visible'), 2800); };
  H.setWorld = mode => {
    P.world = mode;
    NR.saveProfile();
    document.querySelectorAll('[data-world]').forEach(el => {
      el.classList.toggle('chosen', el.dataset.world === mode);
      el.classList.toggle('sel', el.dataset.world === mode);
      el.setAttribute('aria-pressed', el.dataset.world === mode);
    });
    const gw = $('game-world');
    if (gw) {
      gw.innerHTML = icon(mode === 'day' ? 'sun' : 'moon');
      gw.setAttribute('aria-label', `Switch to ${mode === 'day' ? 'night' : 'day'} mode`);
    }
  };
  H.setDifficulty = mode => {
    P.difficulty = mode;
    NR.saveProfile();
    document.querySelectorAll('[data-difficulty]').forEach(el => {
      el.classList.toggle('chosen', el.dataset.difficulty === mode);
      el.classList.toggle('sel', el.dataset.difficulty === mode);
      el.setAttribute('aria-pressed', el.dataset.difficulty === mode);
    });
  };
  function powerCard(power, detailed) {
    const el = document.createElement('button');
    const equipped = P.tactical === power.id;
    el.className = 'power-card' + (equipped ? ' equipped' : '');
    el.style.setProperty('--power-color', power.color);
    el.dataset.power = power.id;
    el.setAttribute('aria-pressed', String(equipped));
    el.innerHTML = `<div class="power-card-top"><span class="power-icon">${icon(power.icon)}</span><span class="power-rarity">${equipped ? '● EQUIPPED' : power.type}</span></div><h4>${power.name}</h4><p>${detailed ? power.description : power.summary}</p><div class="power-card-bottom"><span>${power.cooldown}s COOLDOWN</span><b>${equipped ? 'READY TO DEPLOY' : 'EQUIP POWER'} ${icon(equipped ? 'shield' : 'arrow')}</b></div>`;
    el.addEventListener('click', () => { P.tactical = power.id; NR.saveProfile(); renderPowers(); NR.audio.play('ui'); });
    return el;
  }
  function renderPowers() {
    for (const [id, detailed] of [['arsenal-grid', false], ['armory-options', true]]) {
      if (!$('armory-options')) continue;
      const focused = document.activeElement?.closest('#' + id + ' [data-power]')?.dataset.power;
      $(id).replaceChildren(...NR.powers.map(p => powerCard(p, detailed)));
      if (focused) $(id).querySelector(`[data-power="${focused}"]`)?.focus({ preventScroll: true });
    }
    const power = NR.powers.find(p => p.id === P.tactical);
    if ($('tactical-icon')) $('tactical-icon').innerHTML = icon(power.icon);
    text('tactical-name', power.short);
  }
  function showRecords() { NR.expeditionUI.showRecords(); }
  H.refreshPreferences = () => {
    H.setWorld(P.world);renderPowers();NR.ui.syncAudio?.();
    if ($('callsign')) $('callsign').value=P.name;
    text('operator-name',P.name);
    if ($('menu-wave')) $('menu-wave').textContent=P.bestWave||'—';
    document.querySelectorAll('[data-difficulty]').forEach(b=>{b.classList.toggle('chosen',b.dataset.difficulty===P.difficulty);b.setAttribute('aria-pressed',b.dataset.difficulty===P.difficulty);});
    for(const key of ['shake','controls']){const b=$('tgl-'+key);b.textContent=P[key]?'ON':'OFF';b.classList.toggle('on',P[key]);b.setAttribute('aria-pressed',P[key]);}
    document.body.classList.toggle('controls-hidden',!P.controls);
    if($('music-volume')) $('music-volume').value=P.musicVolume*100;
    if($('sfx-volume')) $('sfx-volume').value=P.sfxVolume*100;
    text('service-status',NR.store.persistent?'OFFLINE READY · SAVED ON DEVICE':'TEMPORARY SESSION · STORAGE BLOCKED');
    if (NR.lobby && NR.lobby.refreshCard) NR.lobby.refreshCard();
  };
  H.init = () => {
    ['btn-armory-back', 'btn-records-back'].forEach(id => on(id, () => NR.ui.show('menu')));
    on('nav-manual', () => NR.ui.show('how'));
    on('btn-profile', () => NR.ui.show('set'));
    on('btn-pause-how', () => NR.ui.show('how'));
    document.querySelectorAll('[data-difficulty]').forEach(el => {
      el.addEventListener('click', () => H.setDifficulty(el.dataset.difficulty));
    });
    document.querySelectorAll('[data-world]').forEach(el => onWorld(el));
    function onWorld(el) { el.addEventListener('click', () => H.setWorld(el.dataset.world)); }
    H.setWorld(P.world); renderPowers();
    if ($('callsign')) $('callsign').value = P.name;
    text('operator-name', P.name);
    if ($('menu-wave')) $('menu-wave').textContent = P.bestWave || '—';
    if ($('callsign')) $('callsign').addEventListener('change', () => {
      const value = $('callsign').value.trim();
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(value)) { $('callsign').value = P.name; H.notify('Use 3–16 letters, numbers or underscores.'); return; }
      P.name = value; NR.saveProfile(); text('operator-name', value);
      if (NR.lobby && NR.lobby.refreshCard) NR.lobby.refreshCard();
    });
    ['shake', 'controls'].forEach(key => {
      const button = $('tgl-' + key);
      const sync = () => { button.textContent = P[key] ? 'ON' : 'OFF'; button.classList.toggle('on', P[key]); button.setAttribute('aria-pressed', !!P[key]); document.body.classList.toggle('controls-hidden', !P.controls); };
      sync(); button.addEventListener('click', () => { P[key] = !P[key]; NR.saveProfile(); sync(); });
    });
    on('game-pause', () => NR.game.togglePause());
    on('game-world', () => H.setWorld(P.world === 'night' ? 'day' : 'night'));
    on('game-mute', () => NR.ui.toggleMute());
    on('game-fullscreen', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else H.notify('Fullscreen is not supported here. Rotate your device for a wider view.');
      } catch (_) { H.notify('Fullscreen unavailable in this browser. Landscape mode also works.'); }
    });
    text('service-status', NR.store.persistent ? 'OFFLINE READY · SAVED ON DEVICE' : 'TEMPORARY SESSION · STORAGE BLOCKED');
    NR.expeditionUI.init();
  };
  H.update = now => {
    if (now - lastHUD < 80) return; lastHUD = now;
    const G = NR.game, p = G.player, playing = G.state === 'playing';
    document.body.classList.toggle('playing', playing);
    NR.expeditionUI.update();
    if (!playing || !p || !$('parry-cd')) return;
    $('parry-cd').textContent=p.parryCd>0?p.parryCd.toFixed(1)+'s':'';
    $('kunai-count').textContent=p.kunaiCharges>0?p.kunaiCharges:Math.max(0,3-p.kunaiChargeT).toFixed(1)+'s';
    document.querySelector('[data-act="parry"]').classList.toggle('not-ready',p.parryCd>0);
    document.querySelector('[data-act="kunai"]').classList.toggle('not-ready',p.kunaiCharges===0);
    document.querySelector('[data-act="attack"]').classList.toggle('counter-ready',p.counterT>0);
    const seconds = Math.ceil(p.tacticalCd);
    $('tactical-cd').textContent = seconds > 0 ? seconds + 's' : '';
    $('storm-cd').textContent = p.energy >= p.maxEnergy ? '' : Math.floor(p.energy / p.maxEnergy * 100) + '%';
    $('dash-cd').textContent = p.dashCharges > 0 ? '' : '…';
    document.querySelector('[data-act="tactical"]').classList.toggle('not-ready', seconds > 0);
    document.querySelector('[data-act="special"]').classList.toggle('not-ready', p.energy < p.maxEnergy);
    text('game-wave', `${P.world === 'day' ? 'DAYBREAK' : 'NIGHTFALL'} / ${G.difficulty.toUpperCase()} / ${G.mode === 'adventure' ? 'CHAPTER '+(G.chapter+1) : 'WAVE '+String(G.wave || 1).padStart(2, '0')}`);
    text('game-objective',  p.counterT>0?'COUNTER READY — STRIKE WITHIN 2s':p.shieldT > 0 ? 'AEGIS ACTIVE — DAMAGE BLOCKED' : p.overdriveT > 0 ? 'OVERDRIVE — DOUBLE KATANA DAMAGE' : G.chronoT > 0 ? 'CHRONO FIELD — TIME DILATED' : p.droneT > 0 ? 'ARC COMPANION — SUPPORT ACTIVE' : G.bossActive ? 'ELIMINATE SHOGUN-9' : `${G.enemies.length + G.spawnQueue.length} HOSTILES REMAINING`);
  };
})();

import "./style.css";
import {
  createIcons,
  Gauge,
  CarFront,
  Flag,
  ChartNoAxesColumnIncreasing,
  Volume2,
  VolumeX,
  Settings2,
  Infinity,
  MoveDownRight,
  AudioLines,
  MapPin,
  Sun,
  Sunset,
  Moon,
  Orbit,
  Check,
  CircleHelp,
  Timer,
  Power,
  ArrowUpRight,
  Zap,
  ArrowRight,
  Trophy,
  Headphones,
  Pause,
  X,
  Play,
  RotateCcw,
  Shield,
  Navigation,
  Award,
  Route,
  CheckCheck,
} from "lucide";
import { World, MAPS } from "./world.js";
import { AudioEngine } from "./audio.js";

const iconSet = {
  Gauge,
  CarFront,
  Flag,
  ChartNoAxesColumnIncreasing,
  Volume2,
  VolumeX,
  Settings2,
  Infinity,
  MoveDownRight,
  AudioLines,
  MapPin,
  Sun,
  Sunset,
  Moon,
  Orbit,
  Check,
  CircleHelp,
  Timer,
  Power,
  ArrowUpRight,
  Zap,
  ArrowRight,
  Trophy,
  Headphones,
  Pause,
  X,
  Play,
  RotateCcw,
  Shield,
  Navigation,
  Award,
  Route,
  CheckCheck,
};
const icons = () => createIcons({ icons: iconSet });
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const CARS = {
  gt: {
    name: "GT · 458",
    description: "The grand tourer",
    max: 325,
    acceleration: 28,
    handling: 1,
    zero: "3.4",
  },
  race: {
    name: "R · SPORT",
    description: "Built for the apex",
    max: 285,
    acceleration: 34,
    handling: 1.24,
    zero: "2.9",
  },
  suv: {
    name: "X · TRAIL",
    description: "Go your own way",
    max: 240,
    acceleration: 23,
    handling: 0.85,
    zero: "5.1",
  },
};
const CHALLENGES = [
  {
    id: "near",
    name: "Close call",
    description: "Get 5 near misses in one run",
    goal: 5,
    icon: "zap",
    unit: "near misses",
  },
  {
    id: "distance",
    name: "The long way home",
    description: "Drive 5 kilometers in one run",
    goal: 5000,
    icon: "route",
    unit: "km",
  },
  {
    id: "speed",
    name: "Beyond the limit",
    description: "Reach a speed of 240 km/h",
    goal: 240,
    icon: "gauge",
    unit: "km/h",
  },
];
const defaultSave = {
  best: 0,
  score: 0,
  runs: [],
  completed: [],
  progress: { near: 0, distance: 0, speed: 0 },
  car: "gt",
  paint: "#b8c8ba",
  settings: {
    quality: "high",
    volume: 0.55,
    autoCruise: true,
    density: "medium",
    muted: false,
  },
};
let save;
try {
  const raw = JSON.parse(localStorage.getItem("apex-save") || "{}");
  save = {
    ...defaultSave,
    ...raw,
    progress: { ...defaultSave.progress, ...raw.progress },
    settings: { ...defaultSave.settings, ...raw.settings },
  };
  if (!Array.isArray(save.runs) || !Array.isArray(save.completed))
    throw Error("Invalid saved data");
  if (!CARS[save.car]) save.car = "gt";
  if (!/^#[a-f0-9]{6}$/i.test(save.paint)) save.paint = "#b8c8ba";
} catch {
  save = structuredClone(defaultSave);
}
let storageAvailable = true;
function persist() {
  try {
    localStorage.setItem("apex-save", JSON.stringify(save));
  } catch {
    storageAvailable = false;
  }
}
const audio = new AudioEngine();
audio.muted = save.settings.muted;
audio.volume = save.settings.volume;
let world,
  state = "loading",
  map = "alpine",
  mode = "endless",
  lastTime = 0,
  elapsed = 0,
  run,
  keys = new Set(),
  modalKind = null,
  returnFocus = null,
  toastTimer,
  messageTimer,
  countTick = -1,
  previousState = "racing";
let hudClock = 0;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function raceMessage(text) {
  $("#race-message").textContent = text;
  $("#race-message").classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(
    () => $("#race-message").classList.remove("visible"),
    1800,
  );
}
function syncLobby() {
  $("#best-distance").textContent = (Number(save.best || 0) / 1000).toFixed(2);
  $("#best-message").textContent = save.best
    ? "One more run?"
    : "Your story starts here.";
  const car = CARS[save.car];
  $("#hero-car-name").textContent = car.name;
  $("#hero-car-detail").innerHTML =
    `${car.zero}s <span>0–100</span> <i> / </i> ${car.max} <span>KM/H</span>`;
  const challenge = CHALLENGES.find((c) => !save.completed.includes(c.id));
  $("#next-challenge").innerHTML = challenge
    ? `${challenge.name} <span>—</span> ${challenge.description}`
    : "All challenges complete <span>—</span> Chase a new personal best";
  syncSound();
}
function syncSound() {
  for (const selector of ["#sound-toggle", "#race-sound"]) {
    $(selector).innerHTML =
      `<i data-lucide="${audio.muted ? "volume-x" : "volume-2"}"></i>`;
    $(selector).setAttribute(
      "aria-label",
      audio.muted ? "Unmute sound" : "Mute sound",
    );
  }
  icons();
}
function toggleSound() {
  audio.setMuted(!audio.muted);
  save.settings.muted = audio.muted;
  persist();
  syncSound();
  toast(audio.muted ? "Sound muted" : "Sound on · headphones recommended");
}
function openModal(kind, html) {
  returnFocus = document.activeElement;
  modalKind = kind;
  $("#modal-content").innerHTML = html;
  $("#modal-backdrop").classList.remove("hidden");
  icons();
  $("#modal-close").focus();
}
function closeModal() {
  if (modalKind === "pause") {
    resume();
    return;
  }
  if (modalKind === "results") {
    toLobby();
    return;
  }
  $("#modal-backdrop").classList.add("hidden");
  modalKind = null;
  $$(".nav-item").forEach((el) =>
    el.classList.toggle("active", el.dataset.page === "drive"),
  );
  returnFocus?.focus();
}
const modalHeading = (eyebrow, title, sub = "") =>
  `<span class="modal-eyebrow">${eyebrow}</span><h2 id="modal-title">${title}</h2>${sub ? `<p class="modal-sub">${sub}</p>` : ""}`;
function showHelp() {
  openModal(
    "help",
    modalHeading(
      "DRIVER’S HANDBOOK",
      "Find your flow.",
      "An endless highway. Four lanes. Traffic coming both ways. Stay sharp.",
    ) +
      `<div class="control-grid"><div class="control-card">Steer <span><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></span></div><div class="control-card">Accelerate <span><kbd>W</kbd> / <kbd>↑</kbd></span></div><div class="control-card">Brake <span><kbd>S</kbd> / <kbd>↓</kbd> / <kbd>SPACE</kbd></span></div><div class="control-card">Nitro boost <span><kbd>SHIFT</kbd></span></div><div class="control-card">Change camera <span><kbd>C</kbd></span></div><div class="control-card">Pause / sound <span><kbd>P</kbd> / <kbd>M</kbd></span></div></div><div class="tip"><b>Make every kilometer count.</b><br>Pass traffic closely for a +250 near-miss bonus. The left two lanes carry oncoming traffic. Nitro recharges when you're not boosting. Look out for roadwork barriers. Collisions damage your car; keep an eye on its integrity.<br><br>Auto-cruise is on by default: you accelerate to 125 km/h automatically. Hold W or ↑ to go faster. On touchscreens, use the on-screen driving controls.<br><br><b>Time attack:</b> you have 90 seconds. Earn +3 seconds for each near miss.</div><div class="modal-actions"><button class="primary-btn" id="help-done">Got it. Let's drive <i data-lucide="arrow-right"></i></button></div>`,
  );
  $("#help-done").onclick = closeModal;
}
function showGarage() {
  openModal(
    "garage",
    modalHeading(
      "YOUR PERSONAL COLLECTION",
      "Made for your kind of drive.",
      "Three distinct rides. All yours. Select a car and make it your own.",
    ) +
      `<div class="garage-grid">${Object.entries(CARS)
        .map(
          ([id, c]) =>
            `<button class="garage-car ${save.car === id ? "selected" : ""}" data-car="${id}"><i data-lucide="car-front"></i><h3>${c.name}</h3><p>${c.description}</p><p>${c.max} KM/H · ${c.zero}s 0–100</p><small>${save.car === id ? "✓ SELECTED" : "SELECT CAR ↗"}</small></button>`,
        )
        .join(
          "",
        )}</div><div class="paint-colors"><span>MAKE IT YOURS</span>${["#b8c8ba", "#c7f85b", "#c4372a", "#e9e8e1", "#315879", "#343b42"].map((color) => `<button class="paint ${save.paint === color ? "selected" : ""}" data-paint="${color}" style="background:${color}" aria-label="Choose ${color} paint"></button>`).join("")}</div><div class="tip">GT 458: top-speed specialist. R Sport: quicker acceleration and sharper steering. X Trail: lower top speed, with 30% less collision damage.</div><div class="modal-actions"><button class="primary-btn" id="garage-done">Take it to the road <i data-lucide="arrow-up-right"></i></button></div>`,
  );
  $$(".garage-car").forEach(
    (button) =>
      (button.onclick = () => {
        save.car = button.dataset.car;
        world?.setCar(save.car, save.paint);
        persist();
        syncLobby();
        showGarage();
        audio.tone(700, 0.07);
      }),
  );
  $$(".paint").forEach(
    (button) =>
      (button.onclick = () => {
        save.paint = button.dataset.paint;
        world?.setCar(save.car, save.paint);
        persist();
        showGarage();
      }),
  );
  $("#garage-done").onclick = closeModal;
}
function challengeProgress(c) {
  const value = save.progress[c.id] || 0;
  return c.id === "distance"
    ? `${(Math.min(value, c.goal) / 1000).toFixed(1)} / 5 km`
    : `${Math.min(Math.floor(value), c.goal)} / ${c.goal} ${c.unit}`;
}
function showChallenges() {
  openModal(
    "challenges",
    modalHeading(
      "A LITTLE EXTRA ADRENALINE",
      "Rise to the challenge.",
      "Complete these driving milestones. Each new achievement adds 1,000 points to your run.",
    ) +
      CHALLENGES.map(
        (c) =>
          `<div class="challenge-item"><div class="challenge-icon"><i data-lucide="${save.completed.includes(c.id) ? "check-check" : c.icon}"></i></div><div><h3>${c.name}</h3><p>${c.description}</p></div><span>${save.completed.includes(c.id) ? "✓ COMPLETE" : challengeProgress(c)}</span></div>`,
      ).join("") +
      `<div class="tip">Progress shows your best single run, not a cumulative total. Keep driving to beat your own limits. Achievements are saved on this browser.</div>`,
  );
}
function showRecords() {
  const total = save.runs.reduce(
    (sum, r) => sum + (Number(r.distance) || 0),
    0,
  );
  openModal(
    "records",
    modalHeading(
      "YOUR JOURNEY, SO FAR",
      "Every run leaves a mark.",
      "Personal records saved on this browser. No account. No global leaderboard.",
    ) +
      `<div class="record-grid"><div class="record-stat"><small>LONGEST DRIVE</small><b>${(save.best / 1000).toFixed(2)} <small>KM</small></b></div><div class="record-stat"><small>HIGHEST SCORE</small><b>${Math.round(save.score).toLocaleString()}</b></div><div class="record-stat"><small>RECENT DISTANCE</small><b>${(total / 1000).toFixed(1)} <small>KM</small></b></div></div>${
        save.runs.length
          ? `<table class="records-list"><thead><tr><th>ROUTE</th><th>DISTANCE</th><th>SCORE</th><th>MODE</th></tr></thead><tbody>${save.runs
              .slice(0, 7)
              .map(
                (r) =>
                  `<tr><td>${MAPS[r.map]?.name || "Highway"}</td><td>${(r.distance / 1000).toFixed(2)} km</td><td>${Math.round(r.score).toLocaleString()}</td><td>${r.mode === "timed" ? "Time attack" : "Endless"}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : '<div class="empty-records">A clean slate. Your first great drive is waiting.</div>'
      }<div class="modal-actions"><button class="primary-btn" id="record-drive">Back to the open road <i data-lucide="arrow-right"></i></button></div>`,
  );
  $("#record-drive").onclick = closeModal;
}
function showSettings() {
  openModal(
    "settings",
    modalHeading(
      "FINE-TUNE YOUR EXPERIENCE",
      "Your road. Your rules.",
      "Settings are saved automatically on this device.",
    ) +
      `<div class="settings-row"><label for="quality">Graphics quality<small>Lower settings improve performance on mobile.</small></label><select id="quality"><option value="high">High</option><option value="medium">Balanced</option><option value="low">Performance</option></select></div><div class="settings-row"><label for="volume">Master volume<small>Engine, traffic and driving feedback.</small></label><input id="volume" type="range" min="0" max="1" step=".05" value="${save.settings.volume}" aria-label="Master volume"/></div><div class="settings-row"><label for="auto-cruise">Auto-cruise<small>Automatically accelerate to 125 km/h.</small></label><button id="auto-cruise" class="switch ${save.settings.autoCruise ? "on" : ""}" role="switch" aria-checked="${save.settings.autoCruise}" aria-label="Auto-cruise"></button></div><div class="settings-row"><label for="density">Traffic density<small>Applied at the start of your next drive.</small></label><select id="density"><option value="low">Light</option><option value="medium">Balanced</option><option value="high">Rush hour</option></select></div><div class="modal-actions"><button class="primary-btn" id="settings-done">All set <i data-lucide="check"></i></button></div>`,
  );
  $("#quality").value = save.settings.quality;
  $("#density").value = save.settings.density;
  $("#quality").onchange = (e) => {
    save.settings.quality = e.target.value;
    world?.setQuality(e.target.value);
    persist();
  };
  $("#volume").oninput = (e) => {
    save.settings.volume = +e.target.value;
    audio.setVolume(+e.target.value);
    persist();
  };
  $("#auto-cruise").onclick = (e) => {
    save.settings.autoCruise = !save.settings.autoCruise;
    e.currentTarget.classList.toggle("on", save.settings.autoCruise);
    e.currentTarget.setAttribute("aria-checked", save.settings.autoCruise);
    persist();
  };
  $("#density").onchange = (e) => {
    save.settings.density = e.target.value;
    persist();
  };
  $("#settings-done").onclick = closeModal;
}
function showCredits() {
  openModal(
    "credits",
    modalHeading(
      "THE PEOPLE BEHIND THE PIXELS",
      "Good roads are built together.",
      "Online assets are downloaded and bundled locally—no runtime asset CDNs.",
    ) +
      `<ul class="credits-list"><li><b>GT car model:</b> Ferrari 458 Italia by vicent091036, distributed in the <a href="https://threejs.org/examples/webgl_materials_car.html" target="_blank" rel="noopener">Three.js car example</a>. Upstream attribution and distribution license are included. No affiliation with Ferrari.</li><li><b>Traffic & garage cars:</b> <a href="https://kenney.nl/assets/car-kit" target="_blank" rel="noopener">Kenney Car Kit</a> (CC0).</li><li><b>Road & environment models:</b> Kenney City Kit roads/buildings and Nature Kit pine trees (CC0). Routes and terrain are assembled procedurally for endless play.</li><li><b>Engine recording:</b> <a href="https://opengameart.org/content/racing-car-engine-sound-loops" target="_blank" rel="noopener">domasx2 on OpenGameArt</a> (CC0). Impact and boost effects: Kenney Impact Sounds and Sci-Fi Sounds (CC0). Additional wind and UI feedback use Web Audio synthesis.</li><li><b>Lighting:</b> Venice Sunset HDRI, <a href="https://polyhaven.com/a/venice_sunset" target="_blank" rel="noopener">Poly Haven</a> (CC0), via Three.js examples.</li><li><b>Technology:</b> Three.js (MIT), Lucide icons (ISC), Inter and Barlow Condensed (SIL Open Font License).</li></ul><p class="modal-sub">Map thumbnails are captured directly from the actual game world. Full sources and licenses: <a href="/ASSET_CREDITS.md" target="_blank" rel="noopener">ASSET_CREDITS.md ↗</a></p>`,
  );
}

function startRun() {
  if (!world?.ready) return;
  audio
    .init()
    .catch(() =>
      toast("Audio is unavailable in this browser. You can still drive."),
    );
  $("#modal-backdrop").classList.add("hidden");
  modalKind = null;
  keys.clear();
  run = {
    distance: 0,
    speed: 0,
    score: 0,
    health: 100,
    nitro: 100,
    near: 0,
    maxSpeed: 0,
    time: 90,
    cooldown: 0,
    steer: 0,
    boost: false,
    boostPrevious: false,
    checkpoints: 0,
  };
  world.resetHazards();
  world.playerX = 1.8;
  world.player.rotation.set(0, 0, 0);
  world.player.visible = true;
  world.cameraMode = 0;
  world.setMap(map);
  world.setTraffic(
    save.settings.density === "low"
      ? 9
      : save.settings.density === "high"
        ? 23
        : 15,
  );
  world.updateTraffic(0, 0, 0);
  document.body.classList.add("playing");
  $("#race-ui").classList.remove("hidden");
  $("#race-map").textContent = MAPS[map].name.toUpperCase();
  $("#objective-text").textContent =
    mode === "timed"
      ? "90 SECONDS. MAKE THEM COUNT."
      : "THE OPEN ROAD IS YOURS";
  $("#race-time").textContent = mode === "timed" ? "1:30" : "";
  $("#countdown").style.display = "grid";
  state = "countdown";
  elapsed = 0;
  countTick = -1;
  world.resize();
  updateHUD();
}
function pause() {
  if (!["racing", "countdown"].includes(state)) return;
  previousState = state;
  state = "paused";
  keys.clear();
  audio.update(0, false, false);
  openModal(
    "pause",
    `<div class="paused-heading">${modalHeading("TAKE A BREATHER", "The road can wait.", "Your drive is paused. Pick up exactly where you left off.")}</div><div class="record-grid"><div class="record-stat"><small>DISTANCE</small><b>${(run.distance / 1000).toFixed(2)} <small>KM</small></b></div><div class="record-stat"><small>SCORE</small><b>${Math.floor(run.score).toLocaleString()}</b></div><div class="record-stat"><small>INTEGRITY</small><b>${Math.ceil(run.health)}%</b></div></div><div class="modal-actions"><button class="primary-btn" id="resume"><i data-lucide="play"></i> Keep driving</button><button class="secondary-btn" id="end-run"><i data-lucide="flag"></i> Finish run</button></div>`,
  );
  $("#resume").onclick = resume;
  $("#end-run").onclick = () => finish("A good place to stop.");
}
function resume() {
  if (state !== "paused") return;
  state = previousState;
  keys.clear();
  $("#modal-backdrop").classList.add("hidden");
  modalKind = null;
  lastTime = performance.now();
  audio.context?.resume();
}
function finish(reason) {
  if (!run || state === "results") return;
  state = "results";
  keys.clear();
  audio.update(0, false, false);
  $("#countdown").style.display = "none";
  updateChallenges();
  const previousBest = Number(save.best) || 0;
  save.best = Math.max(previousBest, run.distance);
  save.score = Math.max(save.score, Math.floor(run.score));
  save.runs.unshift({
    distance: run.distance,
    score: Math.floor(run.score),
    near: run.near,
    maxSpeed: run.maxSpeed,
    map,
    mode,
    date: Date.now(),
  });
  save.runs = save.runs.slice(0, 20);
  persist();
  syncLobby();
  openModal(
    "results",
    `<div class="run-result">${modalHeading(run.distance > previousBest ? "A NEW PERSONAL BEST" : "EVERY DRIVE IS A NEW STORY", "Until the next horizon.", reason)}<div class="result-distance">${(run.distance / 1000).toFixed(2)} <small>KM</small></div><div class="record-grid"><div class="record-stat"><small>SCORE</small><b>${Math.floor(run.score).toLocaleString()}</b></div><div class="record-stat"><small>NEAR MISSES</small><b>${run.near}</b></div><div class="record-stat"><small>TOP SPEED</small><b>${Math.round(run.maxSpeed)} <small>KM/H</small></b></div></div><div class="modal-actions"><button class="primary-btn" id="again"><i data-lucide="rotate-ccw"></i> One more run</button><button class="secondary-btn" id="back-home">Back to the garage</button></div></div>`,
  );
  $("#again").onclick = startRun;
  $("#back-home").onclick = toLobby;
}
function toLobby() {
  state = "lobby";
  keys.clear();
  document.body.classList.remove("playing");
  $("#race-ui").classList.add("hidden");
  $("#modal-backdrop").classList.add("hidden");
  modalKind = null;
  world.player.visible = true;
  world.playerX = 1.8;
  world.setTraffic(14);
  world.updateTraffic(0, 0, 0, true);
  world.update(0, 0, 0, true);
  world.resize();
  audio.update(0, false, false);
  syncLobby();
  $("#start-button").focus();
}
function updateChallenges() {
  const values = {
    near: run.near,
    distance: run.distance,
    speed: run.maxSpeed,
  };
  for (const c of CHALLENGES) {
    save.progress[c.id] = Math.max(save.progress[c.id], values[c.id]);
    if (values[c.id] >= c.goal && !save.completed.includes(c.id)) {
      save.completed.push(c.id);
      run.score += 1000;
      raceMessage(`${c.name.toUpperCase()} · +1,000`);
      audio.nearMiss();
      persist();
    }
  }
}
function collision(car) {
  if (run.cooldown > 0) return;
  run.health = Math.max(0, run.health - (save.car === "suv" ? 24 : 34));
  run.speed *= 0.42;
  run.cooldown = 1.5;
  if (car) car.userData.hit = true;
  audio.crash();
  $("#collision-flash").style.opacity = ".65";
  setTimeout(() => ($("#collision-flash").style.opacity = "0"), 220);
  raceMessage(run.health > 0 ? "CONTACT · WATCH THE TRAFFIC" : "CAR DISABLED");
  if (run.health <= 0) finish("Your car took a little too much of the road.");
}
function updateRun(dt) {
  const c = CARS[save.car];
  const gas = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown") || keys.has(" ");
  let turn =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  run.steer += (turn - run.steer) * Math.min(1, dt * 9);
  run.boost = keys.has("shift") && run.nitro > 1 && !brake && run.speed > 30;
  if (brake) run.speed -= dt * 95;
  else if (run.boost) run.speed += dt * c.acceleration * 2;
  else if (gas)
    run.speed += dt * c.acceleration * (1 - run.speed / (c.max + 10));
  else if (save.settings.autoCruise) {
    run.speed += (125 - run.speed) * Math.min(1, dt * 0.45);
  } else run.speed -= dt * 7;
  run.speed = clamp(run.speed, 0, c.max + (run.boost ? 25 : 0));
  run.nitro = clamp(run.nitro + dt * (run.boost ? -23 : 9), 0, 100);
  if (run.boost && !run.boostPrevious) audio.effect("nitro", 0.3);
  run.boostPrevious = run.boost;
  const forward = run.speed / 3.6;
  run.distance += forward * dt;
  run.score += forward * dt * (world.playerX < 0 ? 1.4 : 1);
  run.maxSpeed = Math.max(run.maxSpeed, run.speed);
  run.cooldown = Math.max(0, run.cooldown - dt);
  world.playerX += run.steer * dt * (2.2 + run.speed * 0.021) * c.handling;
  if (Math.abs(world.playerX) > 7.3) {
    world.playerX = clamp(world.playerX, -7.3, 7.3);
    if (run.speed > 30) collision();
  }
  world.updateTraffic(dt, run.distance, run.speed);
  for (const car of world.traffic) {
    const ahead = car.userData.s - run.distance;
    const gap = Math.abs(car.position.x - world.playerX);
    const reach = car.userData.key === "truck" ? 4.3 : 3.6;
    if (Math.abs(ahead) < reach && gap < 1.65 && !car.userData.hit) {
      collision(car);
      if (state === "results") return;
    }
    if (ahead < -reach && !car.userData.passed) {
      car.userData.passed = true;
      if (gap >= 1.65 && gap < 3.0 && !car.userData.hit && run.speed > 65) {
        run.near++;
        run.score += 250;
        run.nitro = clamp(run.nitro + 10, 0, 100);
        if (mode === "timed") run.time += 3;
        raceMessage(`NEAR MISS +250${mode === "timed" ? " · +3 SEC" : ""}`);
        audio.nearMiss();
      }
    }
  }
  for (const h of world.hazards) {
    const ahead = h.userData.s - run.distance;
    if (ahead < 130 && ahead > 0 && !h.userData.warned) {
      h.userData.warned = true;
      raceMessage("ROADWORKS AHEAD · CHANGE LANES");
    }
    if (
      Math.abs(ahead) < 4 &&
      Math.abs(h.position.x - world.playerX) < 1.9 &&
      !h.userData.hit
    ) {
      h.userData.hit = true;
      collision();
      if (state === "results") return;
    }
  }
  const checkpoint = Math.floor(run.distance / 1000);
  if (checkpoint > run.checkpoints) {
    run.checkpoints = checkpoint;
    run.score += 500;
    raceMessage(`${checkpoint} KM · KEEP IT FLOWING +500`);
  }
  updateChallenges();
  if (mode === "timed") {
    run.time -= dt;
    if (run.time <= 0) {
      finish("Time is up. The horizon is still out there.");
      return;
    }
  }
  world.update(dt, run.distance, run.speed, false, run.steer, run.boost);
  audio.update(run.speed, run.boost, true);
  hudClock += dt;
  if (hudClock > 0.055) {
    updateHUD();
    hudClock = 0;
  }
}
function updateHUD() {
  if (!run) return;
  $("#speed").textContent = Math.round(run.speed);
  $("#gear").textContent = Math.min(7, 1 + Math.floor(run.speed / 48));
  $("#score").textContent = Math.floor(run.score).toString().padStart(6, "0");
  $("#distance").innerHTML =
    `${(run.distance / 1000).toFixed(2)} <span>KM</span>`;
  $("#health-bar").style.width = run.health + "%";
  $("#health-bar").style.background =
    run.health < 35 ? "#ff7860" : "var(--accent)";
  $("#nitro-bar").style.width = run.nitro + "%";
  $("#rpm-bar").style.width = 10 + ((run.speed % 48) / 48) * 90 + "%";
  if (mode === "timed") {
    const t = Math.max(0, Math.ceil(run.time));
    $("#race-time").textContent =
      `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
  }
}
function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.min((time - lastTime) / 1000, 0.05) || 0.016;
  lastTime = time;
  if (!world?.ready) return;
  if (state === "lobby") world.update(dt, 0, 0, true);
  else if (state === "countdown") {
    elapsed += dt;
    const count = 3 - Math.floor(elapsed);
    if (count !== countTick) {
      countTick = count;
      $("#countdown").textContent = count > 0 ? count : "GO";
      audio.tone(count > 0 ? 500 : 1050, 0.15);
    }
    world.update(dt, 0, 0, false);
    if (elapsed > 3.65) {
      state = "racing";
      $("#countdown").style.display = "none";
    }
  } else if (state === "racing") updateRun(dt);
  if (state !== "paused") world.render();
}

$$(".nav-item").forEach(
  (button) =>
    (button.onclick = () => {
      if (state === "loading" && button.dataset.page === "garage") {
        toast("Your cars are still being prepared.");
        return;
      }
      if (button.dataset.page === "drive") {
        closeModal();
        return;
      }
      $$(".nav-item").forEach((el) =>
        el.classList.toggle("active", el === button),
      );
      ({
        garage: showGarage,
        challenges: showChallenges,
        records: showRecords,
      })[button.dataset.page]?.();
    }),
);
$(".brand").onclick = (e) => {
  e.preventDefault();
  if (!document.body.classList.contains("playing")) closeModal();
};
$$("[data-map]").forEach(
  (button) =>
    (button.onclick = () => {
      if (!world?.ready) return;
      map = button.dataset.map;
      world.setMap(map);
      $$("[data-map]").forEach((b) => {
        b.classList.toggle("selected", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      $("#location-name").textContent = MAPS[map].name.toUpperCase();
      $("#location-detail").textContent = MAPS[map].coordinates;
      $(".weather-icon").innerHTML =
        `<i data-lucide="${map === "night" ? "moon" : map === "desert" ? "sunset" : "sun"}"></i> ${map === "night" ? "12" : map === "desert" ? "32" : "18"}°`;
      icons();
      audio.tone(700, 0.06);
    }),
);
$$("[data-mode]").forEach(
  (button) =>
    (button.onclick = () => {
      mode = button.dataset.mode;
      $$("[data-mode]").forEach((b) => {
        b.classList.toggle("selected", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      toast(
        mode === "timed"
          ? "Time attack · 90 seconds. Near misses earn extra time."
          : "Endless · No finish line. Drive as far as you can.",
      );
    }),
);
$("#start-button").onclick = startRun;
$("#pause-button").onclick = pause;
$("#sound-toggle").onclick = toggleSound;
$("#race-sound").onclick = toggleSound;
$("#settings-button").onclick = showSettings;
$("#help-button").onclick = showHelp;
$("#controls-footer").onclick = showHelp;
$("#credits-button").onclick = showCredits;
$("#view-challenges").onclick = showChallenges;
$("#open-records").onclick = showRecords;
$("#camera-preview").onclick = () => world?.cycleCamera(true);
$("#modal-close").onclick = closeModal;
$("#modal-backdrop").onclick = (e) => {
  if (
    e.target === $("#modal-backdrop") &&
    !["pause", "results"].includes(modalKind)
  )
    closeModal();
};
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    ["input", "select", "textarea"].includes(
      document.activeElement.tagName.toLowerCase(),
    ) &&
    key !== "escape"
  )
    return;
  if (key === "escape") {
    if (modalKind) closeModal();
    else pause();
    return;
  }
  if (modalKind) {
    if (key === "tab") {
      const focusable = $$(
        "#modal-backdrop button, #modal-backdrop input, #modal-backdrop select, #modal-backdrop a",
      );
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (key === "p" && modalKind === "pause") resume();
    return;
  }
  if (key === "m" && !e.repeat) toggleSound();
  if (key === "p" && !e.repeat) {
    state === "paused" ? resume() : pause();
    return;
  }
  if (["racing", "countdown"].includes(state)) {
    if (
      [
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        " ",
        "shift",
        "w",
        "a",
        "s",
        "d",
      ].includes(key)
    ) {
      e.preventDefault();
      keys.add(key);
    }
    if (key === "c" && !e.repeat) {
      world.cycleCamera();
      raceMessage(
        ["CHASE CAMERA", "HOOD CAMERA", "HIGH CAMERA"][world.cameraMode],
      );
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    pause();
  }
});
$$("[data-key]").forEach((button) => {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(button.dataset.key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, (e) => {
      e.preventDefault();
      keys.delete(button.dataset.key);
    });
});
icons();
syncLobby();
async function boot() {
  try {
    world = new World($("#scene-container"));
    await world.load();
    world.setCar(save.car, save.paint);
    world.updateTraffic(0, 0, 0, true);
    world.update(0, 0, 0, true);
    const thumbs = world.thumbnails();
    for (const [key, url] of Object.entries(thumbs))
      $("#thumb-" + key).src = url;
    world.setQuality(save.settings.quality);
    world.render();
    $("#loading-status").classList.add("hidden");
    $("#start-button").disabled = false;
    state = "lobby";
    document.body.dataset.ready = "true";
    if (!storageAvailable)
      toast(
        "Browser storage is unavailable. Records will last for this session only.",
      );
  } catch (error) {
    console.error(error);
    $("#loading-status").innerHTML =
      "Unable to load the 3D world. Enable WebGL and reload to try again.";
    $("#start-button").querySelector("span").innerHTML =
      "RELOAD GAME<small>CHECK WEBGL / HARDWARE ACCELERATION</small>";
    $("#start-button").disabled = false;
    $("#start-button").onclick = () => location.reload();
  }
}
boot();
requestAnimationFrame(frame);
// Opt-in diagnostics for repeatable smoke tests; never enabled by normal play.
if (new URLSearchParams(location.search).has("test"))
  window.apexTest = {
    get state() {
      return state;
    },
    get run() {
      return run;
    },
    get world() {
      return world;
    },
    collision,
    finish,
    updateRun,
  };

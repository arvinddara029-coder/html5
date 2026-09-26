/* ============ NEON RONIN — input: keyboard + mouse + touch ============ */
(function () {
  const U = NR.util;
  const I = (NR.input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, l: false, r: false }, touch: {} });

  const MAP = {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    jump: ["ArrowUp", "KeyW", "Space"],
    down: ["ArrowDown", "KeyS"],
    attack: ["KeyJ", "KeyX"],
    dash: ["KeyK", "ShiftLeft", "ShiftRight"],
    special: ["KeyL", "KeyC"],
    tactical: ["KeyE"],
    parry: ["KeyQ"],
    kunai: ["KeyR"],
    interact: ["KeyF"],
    pause: ["Escape", "KeyP"],
    mute: ["KeyM"],
  };
  const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

  I.down = function (a) {
    const ks = MAP[a];
    if (ks) for (const k of ks) if (I.keys[k]) return true;
    if (I.touch[a]) return true;
    if (a === "attack" && I.mouse.l) return true;
    if (a === "special" && I.mouse.r) return true;
    return false;
  };
  I.justPressed = (a) => !!I.pressed[a];
  I.axis = () => (I.down("right") ? 1 : 0) - (I.down("left") ? 1 : 0);
  I.postUpdate = () => { I.pressed = {}; };
  I.reset = () => { I.keys = {}; I.touch = {}; I.pressed = {}; I.mouse.l = I.mouse.r = false; document.querySelectorAll(".held").forEach(el => el.classList.remove("held")); };

  function fireAction(action) { I.pressed[action] = true; }

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (NR.game?.state !== "playing" && NR.game?.state !== "pause") return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    I.keys[e.code] = true;
    for (const a in MAP) if (MAP[a].includes(e.code)) fireAction(a);
  });
  window.addEventListener("keyup", (e) => { I.keys[e.code] = false; });
  window.addEventListener("blur", () => { I.reset(); if (NR.game) NR.game.autoPause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { I.reset(); if (NR.game) NR.game.autoPause(); } });

  window.addEventListener("mousemove", (e) => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; });
  window.addEventListener("mousedown", (e) => {
    if (e.target.closest("#ui, #touch, #play-tools, button, input")) return; // let UI buttons work
    if (e.button === 0) { I.mouse.l = true; fireAction("attack"); }
    if (e.button === 2) { I.mouse.r = true; fireAction("special"); }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) I.mouse.l = false;
    if (e.button === 2) I.mouse.r = false;
  });
  window.addEventListener("contextmenu", (e) => { if (!e.target.closest("#ui")) e.preventDefault(); });

  /* touch buttons (bound by ui.js) */
  I.bindTouchButton = function (el) {
    const act = el.dataset.act;
    const pointers = new Set();
    const on = (e) => {
      if (NR.game?.state !== "playing") return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); pointers.add(e.pointerId);
      I.touch[act] = true; fireAction(act); el.classList.add("held");
    };
    const off = (e) => {
      pointers.delete(e.pointerId);
      if (!pointers.size) { I.touch[act] = false; el.classList.remove("held"); }
    };
    el.addEventListener("click", e => { if (e.detail === 0 && NR.game?.state === "playing") fireAction(act); });
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("lostpointercapture", off);
  };
})();

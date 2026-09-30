/* Generates the eleven `assets/super-derived/<id>.png` guardian sheets.

   Background: the original pipeline rendered the Mario's Madness FBX models
   with three.js + headless Chromium (scripts/render-models.mjs). Those build
   tools and a GPU browser are not available in this environment, so the
   derived sheets are synthesized instead: each guardian becomes a 4-frame
   hovering statue strip (1024x256, four 256x256 cells) painted in a palette
   derived from the model's own identity hash — the same hover-bob animation
   the runtime expects (clip bounds 26,26,233,230 in super-content.js).

   Run: node scripts/gen-guardians.cjs
   Output is deterministic; re-running reproduces identical files. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "super-derived");

/* ids + names must match the guardian actors in js/super-content.js */
const GUARDIANS = [
  ["7c2bf9f635bc", "GB Guardian"],
  ["24586fa4fd6a", "John Dick Guardian"],
  ["8d70f5374aa8", "Mr Virtual v2 Guardian"],
  ["f1b2b30ad7ad", "OGN Mario v2 Guardian"],
  ["ae446ecdf36b", "IHY Luigi-AllOutfits Guardian"],
  ["6582f8e5ceeb", "IHY Luigi Guardian"],
  ["cb0778db5d7b", "OGN Luigi-AllOutfits Guardian"],
  ["e273b3e8e0b7", "OGN Luigi Guardian"],
  ["b726429cf34f", "StarmanM v2 Guardian"],
  ["efb3248a4a63", "SuperHorrorMario v2 Guardian"],
  ["86a1b136fe45", "SuperHorrorPeach v2 Guardian"],
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------- minimal PNG encoder (RGBA, filter 0) ---------------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------------- statue painter ---------------- */
function px(buf, W, x, y, col) {
  if (x < 0 || y < 0 || x >= W || y >= 256) return;
  const i = (y * W + x) * 4;
  buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = col[3];
}
function block(buf, W, x, y, w, h, col) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(buf, W, i, j, col);
}
function shade(c, f) {
  return [Math.min(255, c[0] * f) | 0, Math.min(255, c[1] * f) | 0, Math.min(255, c[2] * f) | 0, c[3]];
}

function paintGuardian(id, name) {
  const W = 1024, H = 256;
  const buf = Buffer.alloc(W * H * 4); // transparent
  const r = rng(hash(id + ":" + name));
  // palette from identity: stone base + glow accent
  const hue = r();
  const base = [
    96 + (r() * 50) | 0,
    92 + (hue * 60) | 0,
    110 + ((1 - hue) * 70) | 0,
    255,
  ];
  const dark = shade(base, 0.55);
  const light = shade(base, 1.45);
  const glow = [
    [255, 96, 64], [128, 235, 255], [255, 214, 96], [178, 132, 255], [120, 255, 170],
  ][(hash(name) % 5)];
  const bob = [0, -3, -6, -3]; // hover loop across the four angles/frames

  for (let f = 0; f < 4; f++) {
    const ox = f * 256;
    const dy = bob[f];
    const cx = ox + 128;
    // floating shadow (stays on the ground line, shrinks with height)
    const sw = 60 - bob[f] * 2;
    block(buf, W, cx - sw / 2, 226, sw, 4, [10, 14, 20, 120]);
    const gy = dy; // global vertical offset for this frame
    // ---- stone body (pixel style, 4px blocks) ----
    const P = 4;
    const B = (x, y, w, h, col) => {
      for (let j = 0; j < h; j += P) for (let i = 0; i < w; i += P)
        px(buf, W, cx + x + i, 60 + gy + y + j, col),
        px(buf, W, cx + x + i + 1, 60 + gy + y + j, col),
        px(buf, W, cx + x + i, 60 + gy + y + j + 1, col),
        px(buf, W, cx + x + i + 1, 60 + gy + y + j + 1, col);
    };
    // head (varies slightly per guardian)
    const hw = 36 + (hash(id) % 3) * 8;
    B(-hw / 2, 0, hw, 32, base);
    B(-hw / 2, 0, hw, 8, light);          // crown light
    B(-hw / 2 + 4, 20, hw - 8, 4, dark);   // brow shadow
    // glowing eyes (blink on frame 2)
    if (f !== 2) {
      B(-hw / 2 + 8, 12, 6, 6, glow);
      B(hw / 2 - 14, 12, 6, 6, glow);
    } else {
      B(-hw / 2 + 8, 14, 6, 2, glow);
      B(hw / 2 - 14, 14, 6, 2, glow);
    }
    // torso
    B(-34, 34, 68, 56, base);
    B(-34, 34, 68, 8, light);
    B(-34, 82, 68, 8, dark);
    // cracked glowing core
    B(-6, 48, 12, 20, glow);
    B(-10, 54, 4, 8, shade(glow, 0.7));
    B(6, 52, 4, 10, shade(glow, 0.7));
    // arms (pose differs per frame → readable animation)
    const armUp = f === 1 || f === 3;
    if (armUp) {
      B(-56, 20, 16, 44, dark);
      B(40, 20, 16, 44, dark);
      B(-56, 12, 16, 10, glow);
      B(40, 12, 16, 10, glow);
    } else {
      B(-56, 40, 16, 48, dark);
      B(40, 40, 16, 48, dark);
    }
    // lower robe / broken pedestal
    B(-28, 92, 56, 36, shade(base, 0.8));
    B(-20, 128, 40, 14, dark);
    B(-12, 142, 24, 8, shade(base, 0.45));
    // floating debris rocks (deterministic)
    const rr = rng(hash(id) + f * 17);
    for (let k = 0; k < 5; k++) {
      const dx = -80 + rr() * 160, dyy = 150 + rr() * 40, s = 4 + rr() * 6;
      B(dx, dyy + (f % 2 ? -2 : 2), s, s, k % 2 ? dark : light);
    }
    // runic rim light under the statue
    B(-24, 150, 48, 2, [glow[0], glow[1], glow[2], 140]);
  }
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [id, name] of GUARDIANS) {
  const file = path.join(OUT, id + ".png");
  fs.writeFileSync(file, encodePNG(1024, 256, paintGuardian(id, name)));
  console.log("wrote", path.relative(ROOT, file));
}
console.log("done:", GUARDIANS.length, "guardian sheets");

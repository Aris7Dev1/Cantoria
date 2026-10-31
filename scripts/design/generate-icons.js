#!/usr/bin/env node
// Générateur d'icônes Cantoria — pur Node.js (stdlib uniquement, aucune dépendance).
// Re-génère assets/icon.png (Linux), assets/icon.ico (Windows) et assets/icon.icns (macOS)
// à partir de la géométrie vectorielle du logo (assets/logo/cantoria.svg).
//
// Usage : node scripts/design/generate-icons.js [--out <répertoire>] [--preview]
//   --out     répertoire cible (défaut : assets/ à la racine du dépôt)
//   --preview écrit aussi icon-preview-1024.png pour contrôle visuel
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const OUT_DIR = argValue("--out") || path.join(__dirname, "..", "..", "assets");
const PREVIEW = args.includes("--preview");

// ── Palette du logo (nuit) ────────────────────────────────────────────────
const COL = {
  fondHaut: [0x14, 0x27, 0x3f],
  fondBas: [0x0b, 0x12, 0x20],
  ringHaut: [0xfd, 0xe6, 0x8a],
  ringBas: [0xf5, 0x9e, 0x0b],
  creme: [0xff, 0xf7, 0xed],
  cordes: [0x5c, 0x3a, 0x1c],
  frettes: [0xb4, 0x53, 0x09],
  teal: [0x2d, 0xd4, 0xbf],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerpC = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// SDFs (distance extérieure positive), espace 1024
function sdRoundBox(px, py, cx, cy, bx, by, r) {
  const qx = Math.abs(px - cx) - bx;
  const qy = Math.abs(py - cy) - by;
  const ax = qx > 0 ? qx : 0;
  const ay = qy > 0 ? qy : 0;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
}
function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = clamp01((apx * abx + apy * aby) / (abx * abx + aby * aby));
  return Math.hypot(apx - t * abx, apy - t * aby);
}

// Géométrie (espace 1024) — identique à assets/logo/cantoria.svg
const G = {
  tile: { cx: 512, cy: 512, b: 280, r: 190 },
  ring: { cx: 512, cy: 530, radius: 260, half: 54, gapA: -72, gapB: 0 },
  cap1: { x: 772, y: 530, r: 54 },          // extrémité d'arc, angle 0°
  cap2: { x: 592.344, y: 282.725, r: 54 },  // extrémité d'arc, angle -72°
  hole: { cx: 512, cy: 530, r: 88 },
  strings: [
    { ax: 473, ay: 569, bx: 551, by: 491 },
    { ax: 487, ay: 583, bx: 565, by: 505 },
  ],
  stringHalf: 3.5,
  fretOrigin: { x: 690, y: 392 },
  fretC: Math.SQRT1_2, // rotation -45°
  board: { ax: 19, ay: 0, bx: 131, by: 0, r: 29 },
  frets: [45, 85, 125],
  fretHalfY: 29,
  fretHalfW: 2.5,
  dot: { cx: 65, cy: 0, r: 9 },
};

// Rendu anti-aliasé (SDF + rampe sur 1 pixel)
function renderIcon(size) {
  const k = 1024 / size; // unités 1024 par pixel de sortie
  const w = size, h = size;
  const px = new Uint8Array(w * h * 4);
  const gradFond = (X, Y) =>
    lerpC(COL.fondHaut, COL.fondBas, clamp01((X + Y - 84) / 1880));
  const gradRing = (Y) =>
    lerpC(COL.ringHaut, COL.ringBas, clamp01((Y - 216) / 628));
  const aa = (d) => clamp01(0.5 - d / k);
  const RAD = Math.PI / 180;

  for (let y = 0; y < h; y++) {
    const Y = ((y + 0.5) * 1024) / size;
    for (let x = 0; x < w; x++) {
      const X = ((x + 0.5) * 1024) / size;
      let R = 0, Gc = 0, B = 0, A = 0;

      // 1. Tuile de fond (coins arrondis, dégradé diagonal)
      let a = aa(sdRoundBox(X, Y, G.tile.cx, G.tile.cy, G.tile.b, G.tile.b, G.tile.r));
      if (a > 0) {
        const c = gradFond(X, Y);
        R = c[0] * a; Gc = c[1] * a; B = c[2] * a; A = a;
      }

      // 2. Anneau en C (arc + extrémités arrondies)
      const rdx = X - G.ring.cx, rdy = Y - G.ring.cy;
      const rr = rdx * rdx + rdy * rdy;
      const ringOuter = G.ring.radius + G.ring.half + 2;
      if (rr <= ringOuter * ringOuter) {
        const rad = Math.sqrt(rr);
        let cov = 0;
        const dAnn = Math.abs(rad - G.ring.radius) - G.ring.half;
        if (dAnn < 0.5 * k) {
          const ang = Math.atan2(rdy, rdx) / RAD;
          const inGap = ang > G.ring.gapA && ang < G.ring.gapB;
          if (!inGap) cov = aa(dAnn);
        }
        const dC1 = Math.hypot(X - G.cap1.x, Y - G.cap1.y) - G.cap1.r;
        const dC2 = Math.hypot(X - G.cap2.x, Y - G.cap2.y) - G.cap2.r;
        cov = Math.max(cov, aa(dC1), aa(dC2));
        if (cov > 0) {
          const c = gradRing(Y);
          R = c[0] * cov + R * (1 - cov);
          Gc = c[1] * cov + Gc * (1 - cov);
          B = c[2] * cov + B * (1 - cov);
          A = cov + A * (1 - cov);
        }
      }

      // 3. Rosace crème
      const dHole = Math.hypot(X - G.hole.cx, Y - G.hole.cy) - G.hole.r;
      a = aa(dHole);
      if (a > 0) {
        R = COL.creme[0] * a + R * (1 - a);
        Gc = COL.creme[1] * a + Gc * (1 - a);
        B = COL.creme[2] * a + B * (1 - a);
        A = a + A * (1 - a);
      }

      // 4. Cordes (2 segments fins)
      for (const s of G.strings) {
        a = aa(segDist(X, Y, s.ax, s.ay, s.bx, s.by) - G.stringHalf);
        if (a > 0) {
          R = COL.cordes[0] * a + R * (1 - a);
          Gc = COL.cordes[1] * a + Gc * (1 - a);
          B = COL.cordes[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
      }

      // 5-7. Manche (groupe tourné de -45°) : caisse, frettes, touche teal
      const gdx = X - G.fretOrigin.x, gdy = Y - G.fretOrigin.y;
      if (gdx > -60 && gdx < 160 && gdy > -150 && gdy < 60) {
        const lx = G.fretC * gdx - G.fretC * gdy;
        const ly = G.fretC * gdx + G.fretC * gdy;
        a = aa(segDist(lx, ly, G.board.ax, G.board.ay, G.board.bx, G.board.by) - G.board.r);
        if (a > 0) {
          R = COL.creme[0] * a + R * (1 - a);
          Gc = COL.creme[1] * a + Gc * (1 - a);
          B = COL.creme[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
        for (const fx of G.frets) {
          a = aa(segDist(lx, ly, fx, -G.fretHalfY, fx, G.fretHalfY) - G.fretHalfW);
          if (a > 0) {
            R = COL.frettes[0] * a + R * (1 - a);
            Gc = COL.frettes[1] * a + Gc * (1 - a);
            B = COL.frettes[2] * a + B * (1 - a);
            A = a + A * (1 - a);
          }
        }
        a = aa(Math.hypot(lx - G.dot.cx, ly - G.dot.cy) - G.dot.r);
        if (a > 0) {
          R = COL.teal[0] * a + R * (1 - a);
          Gc = COL.teal[1] * a + Gc * (1 - a);
          B = COL.teal[2] * a + B * (1 - a);
          A = a + A * (1 - a);
        }
      }

      const o = (y * w + x) * 4;
      px[o] = Math.round(clamp01(R / 255) * 255);
      px[o + 1] = Math.round(clamp01(Gc / 255) * 255);
      px[o + 2] = Math.round(clamp01(B / 255) * 255);
      px[o + 3] = Math.round(clamp01(A) * 255);
    }
  }
  return px;
}

// ── Encodeur PNG (RGBA 8 bits) ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(px, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filtre aucun
    Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO (payloads PNG) ───────────────────────────────────────────────────
function encodeICO(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    header[o] = e.size >= 256 ? 0 : e.size;
    header[o + 1] = e.size >= 256 ? 0 : e.size;
    header[o + 2] = 0;
    header[o + 3] = 0;
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(e.png.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

// ── ICNS (chunks PNG) ───────────────────────────────────────────────────
function encodeICNS(entries) {
  const chunks = entries.map((e) => {
    const head = Buffer.alloc(8);
    head.write(e.type, 0, "ascii");
    head.writeUInt32BE(8 + e.png.length, 4);
    return Buffer.concat([head, e.png]);
  });
  const total = chunks.reduce((n, c) => n + c.length, 8);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

// ── Génération ───────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

const t0 = Date.now();

// icon.png (Linux) — 512 px
fs.writeFileSync(path.join(OUT_DIR, "icon.png"), encodePNG(renderIcon(512), 512, 512));

// icon.ico (Windows) — 16 à 256 px
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
fs.writeFileSync(
  path.join(OUT_DIR, "icon.ico"),
  encodeICO(icoSizes.map((s) => ({ size: s, png: encodePNG(renderIcon(s), s, s) })))
);

// icon.icns (macOS) — 32 à 1024 px
const icnsMap = [
  ["ic11", 32], ["ic12", 64], ["ic07", 128],
  ["ic08", 256], ["ic09", 512], ["ic10", 1024],
];
fs.writeFileSync(
  path.join(OUT_DIR, "icon.icns"),
  encodeICNS(icnsMap.map(([type, s]) => ({ type, png: encodePNG(renderIcon(s), s, s) })))
);

if (PREVIEW) {
  fs.writeFileSync(path.join(OUT_DIR, "icon-preview-1024.png"), encodePNG(renderIcon(1024), 1024, 1024));
}

for (const f of ["icon.png", "icon.ico", "icon.icns", ...(PREVIEW ? ["icon-preview-1024.png"] : [])]) {
  const p = path.join(OUT_DIR, f);
  console.log(f.padEnd(24), fs.statSync(p).size, "octets");
}
console.log("Généré en", Date.now() - t0, "ms");

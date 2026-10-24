/*
 * PNG minimal (8 bits, RGB/RGBA, non entrelacé : ce que produisent les captures Playwright/Electron),
 * sans dépendance. Sert à la comparaison pixel à pixel.
 */
const zlib = require("node:zlib");

function decodePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) throw new Error("PNG invalide");
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`PNG non pris en charge (profondeur ${depth}, type ${colorType}, entrelacement ${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("PNG tronqué");
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("filtre PNG inconnu : " + filter);
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      px[o] = line[x * bpp]; px[o + 1] = line[x * bpp + 1]; px[o + 2] = line[x * bpp + 2];
      px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: px };
}

function encodePng({ width, height, data }) {
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Compare deux captures. Dimensions différentes = changement total.
function diffImages(a, b, perChannelTolerance = 8) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sameSize: false, changedPixels: Math.max(a.width * a.height, b.width * b.height), changedRatio: 1, diff: null };
  }
  const n = a.width * a.height;
  const out = Buffer.alloc(n * 4);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    if (d > perChannelTolerance) {
      changed++;
      out[o] = 255; out[o + 1] = 0; out[o + 2] = 80; out[o + 3] = 255;
    } else {
      const g = Math.round((a.data[o] + a.data[o + 1] + a.data[o + 2]) / 3 * 0.35);
      out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
    }
  }
  return { sameSize: true, changedPixels: changed, changedRatio: changed / n, diff: { width: a.width, height: a.height, data: out } };
}

module.exports = { decodePng, encodePng, diffImages };

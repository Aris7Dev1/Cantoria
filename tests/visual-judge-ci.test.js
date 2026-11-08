const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { encodePng, decodePng } = require("../scripts/visual/png");
const { visuallyIdentical } = require("../scripts/visual/judge-ci");

/* Reconstruit un PNG en recompressant l'IDAT : octets différents, pixels identiques —
   le cas de production (ré-encodage, filtres PNG) que le pré-filtre doit neutraliser. */
const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), data]);
  let c = 0xffffffff;
  for (let i = 0; i < body.length; i++) c = CRC_TABLE[(c ^ body[i]) & 255] ^ (c >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}
function reencodePng(buf, level) {
  const out = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const idat = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IDAT") idat.push(data);
    else if (type !== "IEND") out.push(chunk(type, data));
    pos += 12 + len;
    if (type === "IEND") break;
  }
  out.push(chunk("IDAT", zlib.deflateSync(zlib.inflateSync(Buffer.concat(idat)), { level })));
  out.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(out);
}

function solidPng(r, g, b) {
  const width = 8, height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return encodePng({ width, height, data });
}

test("visuallyIdentical : octets égaux => identique", () => {
  const a = solidPng(30, 30, 60);
  assert.ok(visuallyIdentical(a, Buffer.from(a)), "copie octet à octet");
});

test("visuallyIdentical : octets différents mais pixels identiques => identique", () => {
  const a = solidPng(30, 30, 60);
  let alt = reencodePng(a, 1);
  if (alt.equals(a)) alt = reencodePng(a, 9);
  assert.ok(!alt.equals(a), "l'alternative doit différer octet à octet");
  assert.deepEqual(decodePng(alt).data, decodePng(a).data, "même pixels après décodage");
  assert.ok(visuallyIdentical(a, alt), "ré-encodage sans différence visible : pas d'appel au modèle");
});

test("visuallyIdentical : dérive de rendu sous la tolérance => identique", () => {
  const a = solidPng(30, 30, 60);
  const width = 8, height = 8;
  const data = Buffer.from(decodePng(a).data);
  data[3] = 34; data[4] = 33; // écart de 3-4 par canal, sous la tolérance de rendu
  const b = encodePng({ width, height, data });
  assert.ok(!a.equals(b));
  assert.ok(visuallyIdentical(a, b), "écart imperceptible : pas d'appel au modèle");
});

test("visuallyIdentical : différence visible => jugé", () => {
  const a = solidPng(30, 30, 60);
  const b = solidPng(200, 200, 200);
  assert.ok(!visuallyIdentical(a, b), "pixels réellement différents");
  const width = 8, height = 8;
  const data = Buffer.from(decodePng(a).data);
  data[0] = 255; data[1] = 255; data[2] = 255; // un seul pixel franchement changé
  const c = encodePng({ width, height, data });
  assert.ok(!visuallyIdentical(a, c), "un pixel visible au-dessus de la tolérance");
});

test("visuallyIdentical : PNG illisible => jamais sauté", () => {
  assert.ok(!visuallyIdentical(solidPng(30, 30, 60), Buffer.from("pas un png")), "décodage impossible");
  assert.ok(!visuallyIdentical(Buffer.from("a"), Buffer.from("b")), "aucun des deux n'est un PNG");
});

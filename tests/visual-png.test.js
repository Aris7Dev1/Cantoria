const test = require("node:test");
const assert = require("node:assert/strict");
const { decodePng, encodePng, diffImages } = require("../scripts/visual/png");

function image(w, h, fn) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  return { width: w, height: h, data };
}

test("encodage puis décodage : image identique", () => {
  const img = image(7, 5, (x, y) => [x * 30, y * 40, (x + y) * 10]);
  const back = decodePng(encodePng(img));
  assert.equal(back.width, 7); assert.equal(back.height, 5);
  assert.ok(back.data.equals(img.data));
});

test("décodage refuse ce qui n'est pas un PNG", () => {
  assert.throws(() => decodePng(Buffer.from("pas un png")), /PNG invalide/);
});

test("diffImages : identique, légère variation tolérée, vrai changement compté", () => {
  const a = image(10, 10, () => [100, 100, 100]);
  assert.equal(diffImages(a, a).changedRatio, 0);
  const slight = image(10, 10, () => [104, 100, 100]);
  assert.equal(diffImages(a, slight, 8).changedPixels, 0);
  const changed = image(10, 10, (x) => (x < 2 ? [255, 0, 0] : [100, 100, 100]));
  const d = diffImages(a, changed, 8);
  assert.equal(d.changedPixels, 20);
  assert.equal(d.changedRatio, 0.2);
  assert.equal(d.diff.width, 10);
});

test("diffImages : dimensions différentes = changement total", () => {
  const d = diffImages(image(4, 4, () => [0, 0, 0]), image(5, 4, () => [0, 0, 0]));
  assert.equal(d.sameSize, false);
  assert.equal(d.changedRatio, 1);
});

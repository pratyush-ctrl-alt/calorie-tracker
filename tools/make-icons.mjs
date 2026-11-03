// Generates the PNG icons with no dependencies:  node tools/make-icons.mjs
// Three horizontal progress bars on black. Full-bleed, so it also works as a maskable icon.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0, 0, 0];
// the app's three headline colours: calories (amber), protein (violet), fibre (sand)
const BARS = [[255, 176, 32], [157, 140, 255], [216, 195, 154]];
const FILL = [0.8, 0.58, 0.38]; // how full each bar is

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const mix = (c, a) => c.map((v, i) => Math.round(BG[i] * (1 - a) + v * a));

function render(size, scale) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const barH = 0.125 * scale * size;
  const pitch = 0.215 * scale * size;
  const trackW = 0.60 * scale * size;
  const x0 = c - trackW / 2 + barH / 2, x1 = c + trackW / 2 - barH / 2; // centre line of the rounded ends
  const SS = 3;
  // distance from a point to a horizontal segment: inside a rounded bar when <= half its height
  const inBar = (px, py, cy, from, to) => {
    const dx = Math.min(Math.max(px, from), to);
    return Math.hypot(px - dx, py - cy) <= barH / 2;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        let col = BG;
        BARS.forEach((color, i) => {
          const cy = c + (i - 1) * pitch;
          const fillEnd = x0 + (x1 - x0) * FILL[i];
          if (inBar(px, py, cy, x0, fillEnd)) col = color;
          else if (inBar(px, py, cy, x0, x1)) col = mix(color, 0.22);
        });
        for (let k = 0; k < 3; k++) acc[k] += col[k];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (SS * SS));
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
const out = (name, size, scale = 1) => writeFileSync(new URL(`../icons/${name}`, import.meta.url), render(size, scale));
out('icon-192.png', 192);
out('icon-512.png', 512);
out('icon-maskable-512.png', 512, 0.9);
out('apple-touch-icon.png', 180);
console.log('icons written');

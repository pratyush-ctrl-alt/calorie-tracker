// Generates the PNG icons with no dependencies:  node tools/make-icons.mjs
// A white plate (ring + inner disc) on the app's green. Full-bleed, so it also works as a maskable icon.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [47, 111, 90];
const FG = [255, 255, 255];

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

function render(size, scale) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const ring = [0.30 * scale * size, 0.355 * scale * size]; // inner/outer radius of the rim
  const disc = 0.215 * scale * size;
  const SS = 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const r = Math.hypot(x + (sx + 0.5) / SS - c, y + (sy + 0.5) / SS - c);
        if ((r >= ring[0] && r <= ring[1]) || r <= disc) cover++;
      }
      const a = cover / (SS * SS);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + FG[i] * a);
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

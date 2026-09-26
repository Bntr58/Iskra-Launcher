'use strict';

/*
 * Generates placeholder icons with no external deps:
 *   renderer/assets/icon.ico  (16..256, PNG-compressed entries) -> .exe / installer / taskbar
 *   renderer/assets/icon.png  256x256                           -> fallback window icon
 *   renderer/assets/logo.png  160x160 (transparent)             -> header logo
 *
 * Replace these files with your own art whenever you like. Re-run: node scripts/gen-icons.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function render(size, withBg) {
  const out = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const half = size * 0.5;
  const rad = size * 0.22;          // corner radius of the background square
  const R = size * 0.47;            // spark radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // --- background layer: rounded square ---
      let bR = 0, bG = 0, bB = 0, bA = 0;
      if (withBg) {
        const qx = Math.abs(x - cx) - (half - rad - 1);
        const qy = Math.abs(y - cy) - (half - rad - 1);
        const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
        const cov = clamp(rad - dist + 0.5, 0, 1);
        bR = 26; bG = 26; bB = 30; bA = 255 * cov;
      }

      // --- spark layer: 4-point astroid  (|dx|/R)^0.5 + (|dy|/R)^0.5 <= 1 ---
      const dx = Math.abs(x - cx) / R;
      const dy = Math.abs(y - cy) / R;
      const s = Math.sqrt(dx) + Math.sqrt(dy);
      const cov = clamp((1.0 - s) / (2.2 / R) + 0.5, 0, 1);
      const t = y / size;
      const sR = 250, sG = 210 - t * 45, sB = 55, sA = 255 * cov;

      // --- composite spark over background ---
      const a1 = sA / 255;
      const a0 = bA / 255;
      const oa = a1 + a0 * (1 - a1);
      let oR = 0, oG = 0, oB = 0;
      if (oa > 0) {
        oR = (sR * a1 + bR * a0 * (1 - a1)) / oa;
        oG = (sG * a1 + bG * a0 * (1 - a1)) / oa;
        oB = (sB * a1 + bB * a0 * (1 - a1)) / oa;
      }

      const i = (y * size + x) * 4;
      out[i] = Math.round(oR);
      out[i + 1] = Math.round(oG);
      out[i + 2] = Math.round(oB);
      out[i + 3] = Math.round(oa * 255);
    }
  }
  return out;
}

// Pack several PNGs into a Windows .ico (PNG-compressed entries, fine on Windows Vista+).
function encodeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(count, 4);  // image count
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const e = dir.subarray(i * 16, i * 16 + 16);
    e[0] = img.size >= 256 ? 0 : img.size; // width  (0 means 256)
    e[1] = img.size >= 256 ? 0 : img.size; // height
    e[2] = 0;                              // colours in palette
    e[3] = 0;                              // reserved
    e.writeUInt16LE(1, 4);                 // colour planes
    e.writeUInt16LE(32, 6);                // bits per pixel
    e.writeUInt32LE(img.buf.length, 8);    // size of image data
    e.writeUInt32LE(offset, 12);           // offset of image data
    offset += img.buf.length;
  });
  return Buffer.concat([header, dir, ...images.map((img) => img.buf)]);
}

const assets = path.join(__dirname, '..', 'renderer', 'assets');
fs.mkdirSync(assets, { recursive: true });

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map((size) => ({ size, buf: encodePng(size, size, render(size, true)) }));

fs.writeFileSync(path.join(assets, 'icon.ico'), encodeIco(icoImages));
fs.writeFileSync(path.join(assets, 'icon.png'), icoImages.find((i) => i.size === 256).buf);
fs.writeFileSync(path.join(assets, 'logo.png'), encodePng(160, 160, render(160, false)));
console.log('Wrote renderer/assets/icon.ico (16..256), icon.png (256), logo.png (160)');

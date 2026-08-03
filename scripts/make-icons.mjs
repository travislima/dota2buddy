#!/usr/bin/env node
/**
 * Generates the PWA icons as real PNGs, with no image dependencies —
 * pixels are computed directly and encoded with node's built-in zlib.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- minimal PNG encoder ---- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  // 10-12 default: deflate, adaptive filter, no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- the mark: dark tile, angular "D" in the warm gradient ----
   Polygons mirror public/icon.svg, divided through by its 64-unit viewBox. ---- */

const N = (pts) => pts.map(([x, y]) => [x / 64, y / 64]);

// Outer D, and the counter punched out of it.
const D_OUTER = N([[14, 11], [34, 11], [53, 32], [34, 53], [14, 53]]);
const D_COUNTER = N([[25, 21], [32, 21], [41, 32], [32, 43], [25, 43]]);

const TILE = [0x12, 0x16, 0x1f];

/** Standard ray-casting point-in-polygon. */
function inPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const mix = (a, b, t) => a + (b - a) * t;

function shade(u, v) {
  // Diagonal gradient across the mark, matching the SVG's linearGradient.
  const t = Math.min(1, Math.max(0, (u + v) / 2));
  const hi = [255, 138, 99];
  const lo = [200, 68, 46];
  return [0, 1, 2].map((i) => mix(hi[i], lo[i], t));
}

/** Coverage of tile and mark at a pixel, supersampled for smooth edges. */
function sample(x, y, size) {
  const S = 4;
  let tile = 0, mark = 0;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S) / size;
      const v = (y + (sy + 0.5) / S) / size;

      // rounded square tile
      const r = 0.234;
      const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
      const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (Math.hypot(dx, dy) <= r) tile++;

      if (inPoly(u, v, D_OUTER) && !inPoly(u, v, D_COUNTER)) mark++;
    }
  }
  const n = S * S;
  return { tile: tile / n, mark: mark / n };
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { tile, mark } = sample(x, y, size);
      const warm = shade(x / size, y / size);

      // Mark over tile, then the rounded-square coverage becomes alpha.
      const o = (y * size + x) * 4;
      for (let i = 0; i < 3; i++) rgba[o + i] = Math.round(mix(TILE[i], warm[i], mark));
      rgba[o + 3] = Math.round(tile * 255);
    }
  }
  return encodePNG(size, size, rgba);
}

for (const size of [192, 512]) {
  const png = render(size);
  await writeFile(resolve(ROOT, `public/icon-${size}.png`), png);
  console.log(`✓ public/icon-${size}.png (${(png.length / 1024).toFixed(1)} KB)`);
}

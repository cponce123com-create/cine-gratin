/**
 * Generates the PWA icons as real PNG files.
 *
 * The manifest must reference images with valid dimensions and formats: an SVG
 * declared as "192x192 PNG" is rejected by the browser and breaks the install
 * prompt. This script rasterises the brand mark (a rounded square with a play
 * triangle) into PNG files using only Node built-ins, so the assets are
 * reproducible in CI without adding a native dependency.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../frontend/public");

/** Brand palette. */
const BACKGROUND = [10, 10, 10, 255]; // #0A0A0A
const ACCENT = [229, 9, 20, 255]; // #E50914
const PLAY = [255, 255, 255, 255];

/** CRC table (PNG chunk checksum). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes an RGBA pixel buffer as a PNG. */
function encodePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Coverage of a rounded rectangle at a given point (anti-aliased). */
function roundedRectCoverage(x, y, size, radius) {
  const inset = size * 0.06;
  const min = inset;
  const max = size - inset;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const distance = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, radius - distance + 0.5));
}

/** Coverage of the play triangle (barycentric test). */
function triangleCoverage(x, y, triangle) {
  const [[x1, y1], [x2, y2], [x3, y3]] = triangle;
  const sign = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d1 = sign(x, y, x1, y1, x2, y2);
  const d2 = sign(x, y, x2, y2, x3, y3);
  const d3 = sign(x, y, x3, y3, x1, y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos) ? 1 : 0;
}

function blend(target, offset, color, alpha) {
  if (alpha <= 0) return;
  const a = alpha;
  for (let i = 0; i < 3; i++) {
    target[offset + i] = Math.round(target[offset + i] * (1 - a) + color[i] * a);
  }
  target[offset + 3] = Math.max(target[offset + 3], Math.round(255 * a));
}

/** Renders the icon and returns the PNG buffer. */
function renderIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * (maskable ? 0.18 : 0.22);
  const inset = size * (maskable ? 0.16 : 0.06);

  // The play triangle, centred in the safe area.
  const cx = size / 2;
  const cy = size / 2;
  const half = size * (maskable ? 0.2 : 0.24);
  const triangle = [
    [cx - half * 0.8, cy - half],
    [cx - half * 0.8, cy + half],
    [cx + half, cy],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;

      // Background
      pixels[offset] = BACKGROUND[0];
      pixels[offset + 1] = BACKGROUND[1];
      pixels[offset + 2] = BACKGROUND[2];
      pixels[offset + 3] = 255;

      // Accent rounded square
      const coverage = roundedRectCoverage(x + 0.5, y + 0.5, size, radius);
      if (coverage > 0) blend(pixels, offset, ACCENT, coverage);

      // Play triangle
      const inside = triangleCoverage(x + 0.5, y + 0.5, triangle);
      if (inside > 0) blend(pixels, offset, PLAY, inside);
    }
  }

  void inset;
  return encodePng(size, size, pixels);
}

const targets = [
  { file: "pwa-192x192.png", size: 192, options: {} },
  { file: "pwa-512x512.png", size: 512, options: {} },
  { file: "pwa-maskable-512x512.png", size: 512, options: { maskable: true } },
  { file: "apple-touch-icon.png", size: 180, options: { maskable: true } },
];

mkdirSync(outputDir, { recursive: true });

for (const target of targets) {
  const png = renderIcon(target.size, target.options);
  writeFileSync(path.join(outputDir, target.file), png);
  console.log(`✓ ${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}

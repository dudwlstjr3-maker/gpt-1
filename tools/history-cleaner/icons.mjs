/**
 * 기록 지우개 아이콘 — 외부 의존성 없이 PNG 를 직접 그린다.
 * 파란 둥근 사각형 위에 시계(기록)와 그 위를 긋는 사선(지움).
 *
 *   node tools/history-cleaner/icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../extensions/history-cleaner/icons');
const SIZES = [16, 32, 48, 128];

const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];

/* ----------------------------- PNG 인코딩 ----------------------------- */

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // 필터 없음
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- 그리기 ------------------------------- */
// 좌표는 0~1. 각 도형은 '안에 있나'만 답하고, 픽셀마다 4×4 로 나눠 찍어 경계를 부드럽게 한다.

function inRoundRect(x, y, r) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function distToSegment(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}

// 작은 크기에서는 선을 굵게 해야 뭉개지지 않는다
function shape(size) {
  const small = size <= 16;
  return {
    corner: 0.22,
    ring: { r: 0.29, w: small ? 0.11 : 0.075 },
    hands: !small,
    slash: { w: small ? 0.11 : 0.075, gap: small ? 0.09 : 0.06 },
  };
}

function colorAt(x, y, sh) {
  if (!inRoundRect(x, y, sh.corner)) return null;
  const SLASH = [0.2, 0.2, 0.8, 0.8];
  const ds = distToSegment(x, y, ...SLASH);
  if (ds <= sh.slash.w / 2) return WHITE;
  if (ds <= sh.slash.w / 2 + sh.slash.gap) return BLUE; // 사선과 시계 사이 틈

  const r = Math.hypot(x - 0.5, y - 0.5);
  if (Math.abs(r - sh.ring.r) <= sh.ring.w / 2) return WHITE;
  if (sh.hands) {
    const hw = sh.ring.w / 2;
    if (distToSegment(x, y, 0.5, 0.5, 0.5, 0.33) <= hw) return WHITE;
    if (distToSegment(x, y, 0.5, 0.5, 0.36, 0.5) <= hw) return WHITE;
  }
  return BLUE;
}

function render(size) {
  const sh = shape(size);
  const N = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < N; sy += 1) {
        for (let sx = 0; sx < N; sx += 1) {
          const c = colorAt((px + (sx + 0.5) / N) / size, (py + (sy + 0.5) / N) / size, sh);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / (N * N)) * 255);
      }
    }
  }
  return out;
}

for (const size of SIZES) {
  const file = resolve(OUT_DIR, `${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log('wrote', file);
}

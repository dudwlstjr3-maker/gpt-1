/**
 * PWA 아이콘 생성기 — 외부 의존성 없이 PNG 를 직접 인코딩한다.
 * (빌드 시 npm run icons 로 실행되며, 결과는 public/icons 에 저장된다.)
 *
 * 그리는 것: 어두운 배경 + Fear→Greed 반원 게이지 + 바늘.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/icons');

/* ----------------------------- PNG 인코딩 ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** rgba: Uint8Array of w*h*4 */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy
      ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ 드로잉 ------------------------------ */

const STOPS = [
  { p: 0, c: [255, 107, 107] },
  { p: 0.25, c: [255, 166, 87] },
  { p: 0.5, c: [227, 197, 103] },
  { p: 0.75, c: [102, 209, 158] },
  { p: 1, c: [52, 211, 153] },
];

function gradientColor(t) {
  const p = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (p >= a.p && p <= b.p) {
      const w = (p - a.p) / (b.p - a.p);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * w),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * w),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * w),
      ];
    }
  }
  return STOPS[STOPS.length - 1].c;
}

/** 안티에일리어싱을 위한 부드러운 가장자리 */
function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function drawIcon(size, { padding = 0.08, score = 68 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.63;
  const R = size * (0.5 - padding) * 0.98;
  const thick = R * 0.26;
  const rOuter = R;
  const rInner = R - thick;

  const needleAngle = Math.PI - (score / 100) * Math.PI;
  const nx = Math.cos(needleAngle);
  const ny = -Math.sin(needleAngle);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;

      // 배경: 위에서 아래로 은은한 그라데이션
      const g = y / size;
      let r = Math.round(16 + 6 * (1 - g));
      let gr = Math.round(21 + 8 * (1 - g));
      let b = Math.round(33 + 10 * (1 - g));
      let a = 255;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isUpper = dy <= 0.5;

      // 게이지 아크
      if (isUpper && dist <= rOuter + 1.5 && dist >= rInner - 1.5) {
        const angle = Math.atan2(-dy, dx); // 0..π
        const t = 1 - angle / Math.PI;
        const [ar, ag, ab] = gradientColor(t);
        const cover =
          smooth(rInner - 1.2, rInner + 0.6, dist) * (1 - smooth(rOuter - 0.6, rOuter + 1.2, dist));
        r = Math.round(r + (ar - r) * cover);
        gr = Math.round(gr + (ag - gr) * cover);
        b = Math.round(b + (ab - b) * cover);
      }

      // 바늘 (중심에서 뻗는 선)
      const proj = dx * nx + dy * ny;
      if (proj > 0 && proj < rInner * 0.92) {
        const perp = Math.abs(dx * -ny + dy * nx);
        const halfWidth = Math.max(1.4, size * 0.016);
        const cover = 1 - smooth(halfWidth - 1, halfWidth + 0.8, perp);
        if (cover > 0) {
          r = Math.round(r + (240 - r) * cover);
          gr = Math.round(gr + (246 - gr) * cover);
          b = Math.round(b + (255 - b) * cover);
        }
      }

      // 중심 허브
      const hub = Math.max(2.5, size * 0.038);
      if (dist < hub + 1) {
        const cover = 1 - smooth(hub - 1, hub + 0.8, dist);
        r = Math.round(r + (240 - r) * cover);
        gr = Math.round(gr + (246 - gr) * cover);
        b = Math.round(b + (255 - b) * cover);
      }

      buf[i] = r;
      buf[i + 1] = gr;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

/* ------------------------------- 실행 ------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0.1 },
  { file: 'icon-512.png', size: 512, padding: 0.1 },
  // maskable 은 안전 영역(가운데 80%) 안에 그린다
  { file: 'maskable-512.png', size: 512, padding: 0.19 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.11 },
  { file: 'favicon-32.png', size: 32, padding: 0.06 },
];

for (const t of targets) {
  const rgba = drawIcon(t.size, { padding: t.padding });
  writeFileSync(resolve(OUT_DIR, t.file), encodePng(t.size, t.size, rgba));
  process.stdout.write(`  생성: public/icons/${t.file} (${t.size}x${t.size})\n`);
}

process.stdout.write('PWA 아이콘 생성 완료\n');

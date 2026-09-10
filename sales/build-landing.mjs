// 판매 랜딩 페이지를 굽는다.
// landing.src.html 의 {{IMG:파일명}} 자리에 screenshots/파일명.jpg 를
// data URI 로 심어서 landing.html 하나로 만든다. 외부 이미지 호스팅이
// 필요 없어서 어디에 올려도 그림이 깨지지 않는다.
//
//   node sales/build-landing.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const SRC = here('./landing.src.html');
const OUT = here('./landing.html');
const SHOTS = here('./screenshots');

let html = readFileSync(SRC, 'utf8');
const used = new Set();

html = html.replace(/\{\{IMG:([a-z0-9-]+)\}\}/g, (_, name) => {
  const b64 = readFileSync(`${SHOTS}/${name}.jpg`).toString('base64');
  used.add(name);
  return `data:image/jpeg;base64,${b64}`;
});

const leftover = html.match(/\{\{IMG:[^}]*\}\}/g);
if (leftover) {
  console.error('채우지 못한 자리가 있습니다:', leftover.join(', '));
  process.exit(1);
}

writeFileSync(OUT, html);
console.log(`이미지 ${used.size}장을 심었습니다 — ${[...used].join(', ')}`);
console.log(`${OUT} · ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);

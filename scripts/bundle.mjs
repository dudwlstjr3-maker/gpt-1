/**
 * 검토용 묶음 만들기 — 남에게(또는 다른 AI에게) 코드를 통째로 넘길 때 쓴다.
 *
 *   npm run bundle
 *
 * 무엇을 내는가
 *   **파일 하나.** dist/market-mood-3-검토.zip 안에 소스 전부와 요청서가 들어 있다.
 *
 *   예전에는 크기별로 여섯 덩이로 갈라 냈는데, 받는 사람이 여섯 번 올려야 했다.
 *   압축 파일 하나면 한 번에 끝나고, 받는 쪽이 필요한 파일만 골라 읽을 수 있어
 *   오히려 낫다 (갈라 놓으면 어느 덩이에 뭐가 있는지 몰라 다 읽어야 한다).
 *
 * 왜 요청서를 같이 넣는가
 *   맥락 없이 코드만 던지면 이 앱이 **일부러 지키는 규칙**을 버그로 지적하고 온다.
 *   (결측을 0으로 안 채우는 것, 유료 시세를 안 긁는 것, DEMO 와 LIVE 를 안 섞는 것…)
 *   그래서 규칙과 "이건 일부러 그런 것" 목록을 맨 앞 파일로 넣는다.
 *
 * 무엇을 담지 않는가
 *   .env.local · node_modules · .next · dist · .git.
 *   키가 담길 수 있는 파일은 애초에 걸러 낸다 — .env.example(빈 서식)만 담는다.
 */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 압축 전에 파일을 모아 두는 자리 */
const OUT = path.join(ROOT, 'dist', 'review');

/** 담지 않는 것 — 무겁거나, 생성물이거나, 비밀이 담길 수 있는 것 */
const SKIP_DIR = new Set(['node_modules', '.next', 'dist', '.git', 'public']);
const SKIP_FILE = /^\.env\.local|^\.env$|\.log$|-lock\.json$/;
/** 읽을 수 없는 파일은 담지 않는다 — 검토하는 사람은 코드를 읽는다 */
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.zip']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    if (SKIP_DIR.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (!SKIP_FILE.test(e.name) && !SKIP_EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */

const all = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).replaceAll('\\', '/');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

console.log('검토용 묶음을 만듭니다\n');

/* 요청서를 맨 앞에 둔다. 파일 이름이 00 으로 시작해야 목록에서 먼저 보인다. */
const asks = path.join(ROOT, 'tools', 'review');
for (const name of fs.existsSync(asks) ? fs.readdirSync(asks).sort() : []) {
  fs.copyFileSync(path.join(asks, name), path.join(OUT, `00-${name.replace(/^\d+-/, '')}`));
}

/* 나머지는 저장소 구조를 그대로 옮긴다 — 경로가 곧 설명이다 */
for (const f of all) {
  const dest = path.join(OUT, rel(f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}

/* 담긴 것 한눈에 */
const tree = all.map(rel).sort();
fs.writeFileSync(
  path.join(OUT, '00-담긴-파일.txt'),
  `Market Mood 3 — 검토용 묶음\n만든 날 ${new Date().toISOString().slice(0, 10)}\n` +
    `파일 ${tree.length}개\n\n` +
    '먼저 읽을 것\n  00-검토-요청.md      규칙과 무엇을 봐 달라\n' +
    '  00-업그레이드-요청.md  다음에 뭘 만들면 좋을지\n' +
    '  README.md            설계 문서 (왜 이렇게 만들었는지 · 코드보다 먼저)\n\n' +
    `담긴 파일\n${tree.map((t) => `  ${t}`).join('\n')}\n`,
);

const zip = path.join(ROOT, 'dist', 'market-mood-3-검토.zip');
fs.rmSync(zip, { force: true });
const res = spawnSync('zip', ['-qr9', zip, '.'], { cwd: OUT });
if (res.status !== 0) {
  console.error('zip 이 실패했습니다:', res.stderr?.toString() ?? res.error?.message);
  process.exit(1);
}

const kb = (fs.statSync(zip).size / 1024).toFixed(0);
console.log(`  ${path.relative(ROOT, zip)}  (${kb} KB · 파일 ${tree.length + 3}개)`);
console.log('\n이 파일 하나만 올리면 됩니다.');

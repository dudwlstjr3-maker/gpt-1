/**
 * 쫄탐일보를 내 컴퓨터에서 켠다 — 윈도에서는 저장소 맨 위의 start.bat 을 더블클릭하면 이 파일이 돈다.
 * (맥·리눅스는 `node tools/start/launch.mjs`)
 *
 * 하는 일, 순서대로:
 *   1. 이미 켜져 있으면(:3000 /api/health 가 답하면) 브라우저만 연다.
 *      → 개발 서버가 떠 있는 채로 빌드해서 .next 를 망가뜨리는 일을 막는다.
 *   2. 3000 번을 다른 프로그램이 쓰고 있으면 멈추고 알린다.
 *   3. 처음이거나 package-lock.json 이 바뀌었으면 `npm ci`.
 *   4. 빌드가 없거나 코드가 빌드보다 새로우면 `npm run build`. (`--rebuild` 로 강제)
 *   5. `npm start` 로 켜고, /api/health 가 답하면 브라우저를 열고 DEMO/LIVE 를 알려 준다.
 * 이 창을 닫거나 Ctrl+C 를 누르면 꺼진다.
 *
 * 의존성 없음 — Node 기본 모듈만 쓴다. API 키는 .env.local 에 (없으면 DEMO 로 켜진다).
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const WIN = process.platform === 'win32';
const REBUILD = process.argv.includes('--rebuild');
const NO_OPEN = process.argv.includes('--no-open');
process.chdir(ROOT);

const say = (line = '') => console.log(line);
const stop = (why, how) => {
  say();
  say(`[멈춤] ${why}`);
  if (how) say(`       ${how}`);
  process.exit(1);
};

/** 바깥 입력을 섞지 않는 고정된 명령만 돌린다 (npm 은 윈도에서 .cmd 라 셸이 필요하다) */
const run = (cmd) => spawnSync(cmd, { shell: true, stdio: 'inherit' }).status === 0;

async function health() {
  try {
    const res = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function portFree() {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(PORT);
  });
}

function openBrowser() {
  if (NO_OPEN) return;
  const cmd = WIN ? `start "" ${URL}` : process.platform === 'darwin' ? `open ${URL}` : `xdg-open ${URL}`;
  const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function tellMode(h, ownsServer = true) {
  say();
  say(`  열린 주소  ${URL}`);
  say(`  지금 모드  ${h.mode}${h.mode === 'DEMO' ? ' (샘플 데이터 — 실제 시세가 아닙니다)' : ''}`);
  if (h.reason) say(`  이유       ${h.reason}`);
  say(`  키 파일    .env.local ${existsSync(join(ROOT, '.env.local')) ? '있음' : '없음 — 키를 넣으려면 .env.example 을 .env.local 로 복사해 채우세요'}`);
  say();
  // 서버는 처음 켠 창에서 돈다. 두 번째로 누른 창은 브라우저만 열고 닫힌다.
  say(ownsServer ? '  이 창을 닫거나 Ctrl+C 를 누르면 쫄탐일보가 꺼집니다.' : '  끄려면 처음 켠 쫄탐일보 창을 닫으세요. 이 창은 닫혀도 됩니다.');
  say();
}

/** 이 목록 안의 파일이 마지막 빌드보다 새로우면 다시 빌드한다 (git 이 없어도 — ZIP 으로 받은 경우 — 된다) */
const BUILD_INPUTS = ['src', 'public', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'];

function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, name)));
  return newest;
}

function needsBuild() {
  const id = join(ROOT, '.next', 'BUILD_ID');
  if (REBUILD || !existsSync(id)) return true;
  const built = statSync(id).mtimeMs;
  return BUILD_INPUTS.some((p) => newestMtime(join(ROOT, p)) > built);
}

/** package-lock.json 이 바뀌었는지 — 지난 설치 때의 지문을 node_modules 안에 남겨 둔다 */
const lockHash = () => createHash('sha256').update(readFileSync(join(ROOT, 'package-lock.json'))).digest('hex');
const LOCK_MARK = join(ROOT, 'node_modules', '.jjoltam-lock-sha256');
const needsInstall = () => !existsSync(LOCK_MARK) || readFileSync(LOCK_MARK, 'utf8').trim() !== lockHash();

async function main() {
  say();
  say('  쫄탐일보 — 쫄리나, 탐나나');
  say(`  ${ROOT}`);
  say();

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) stop(`Node.js ${process.versions.node} 는 너무 오래됐습니다. 20 이상이 필요합니다.`, 'https://nodejs.org/ 에서 LTS 를 받아 설치한 뒤 다시 실행하세요.');
  if (!existsSync(join(ROOT, 'package.json'))) stop('쫄탐일보 폴더가 아닙니다.', 'start.bat 은 쫄탐일보 저장소 맨 위 폴더에 있어야 합니다.');

  // 1. 이미 켜져 있으면 브라우저만
  const running = await health();
  if (running) {
    say('  이미 켜져 있습니다 — 브라우저만 엽니다.');
    tellMode(running, false);
    openBrowser();
    return;
  }

  // 2. 3000 번을 다른 프로그램이 쓰고 있으면
  if (!(await portFree())) {
    stop(`${PORT} 번 문을 다른 프로그램이 쓰고 있습니다.`, '그 프로그램을 끄거나 컴퓨터를 다시 켠 뒤 다시 실행하세요.');
  }

  // 3. 설치
  if (needsInstall()) {
    say('  [1/3] 필요한 부품을 설치합니다 (처음 한 번은 몇 분 걸립니다)...');
    if (!run('npm ci --no-audit --no-fund')) stop('설치에 실패했습니다.', '인터넷 연결을 확인하고 다시 실행하세요.');
    writeFileSync(LOCK_MARK, lockHash());
  } else {
    say('  [1/3] 부품은 이미 설치되어 있습니다.');
  }

  // 4. 빌드
  if (needsBuild()) {
    say('  [2/3] 앱을 만듭니다 (1분쯤 걸립니다)...');
    if (!run('npm run build')) stop('빌드에 실패했습니다.', '위의 오류를 확인하세요. 다시 해 보려면: start.bat --rebuild');
  } else {
    say('  [2/3] 바뀐 것이 없어 지난번에 만든 것을 그대로 씁니다.');
  }

  // 5. 켜기
  say('  [3/3] 켭니다...');
  const server = spawn('npm start', { shell: true, stdio: 'inherit' });
  server.on('exit', (code) => process.exit(code ?? 0));
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const h = await health();
    if (h) {
      tellMode(h);
      openBrowser();
      return;
    }
  }
  say('  60초가 지나도 응답이 없습니다. 위의 메시지를 확인하세요.');
}

main();

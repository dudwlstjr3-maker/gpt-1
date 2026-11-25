/**
 * 윈도에서 더블클릭으로 켜는 start.bat 과 그 뒤의 tools/start/launch.mjs.
 *
 * start.bat 에는 ASCII 만 둔다. 한글을 넣으면 콘솔 코드 페이지가 다를 때 줄이 깨지고,
 * 깨진 줄이 명령으로 실행될 수 있다 (예전 작업대 런처에서 정한 규칙). 한글 안내는
 * Node 가 UTF-8 로 찍는다. 줄 끝은 CRLF — LF 로만 끝나면 cmd 가 라벨·goto 를 잘못 읽는 일이 있다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bat = readFileSync(join(root, 'start.bat'));
const launch = readFileSync(join(root, 'tools/start/launch.mjs'), 'utf8');

test('start.bat 은 ASCII 만 쓴다', () => {
  const bad = [...bat].findIndex((b) => b > 0x7f);
  assert.equal(bad, -1, `${bad} 번째 바이트가 ASCII 가 아니다`);
});

test('start.bat 의 줄 끝은 모두 CRLF', () => {
  const text = bat.toString('latin1');
  const lf = (text.match(/\n/g) ?? []).length;
  const crlf = (text.match(/\r\n/g) ?? []).length;
  assert.ok(lf > 0 && lf === crlf, `줄 ${lf}개 중 CRLF ${crlf}개`);
  assert.match(readFileSync(join(root, '.gitattributes'), 'utf8'), /^\*\.bat text eol=crlf$/m);
});

test('start.bat 은 Node 를 확인하고 런처를 부르며, Node 가 없으면 한글 안내를 연다', () => {
  const text = bat.toString('latin1');
  assert.match(text, /where node/);
  assert.match(text, /LSS 20/);
  assert.match(text, /node "%~dp0tools\\start\\launch\.mjs" %\*/);
  assert.match(text, /notepad "%~dp0tools\\start\\HELP-ko\.txt"/);
  assert.ok(existsSync(join(root, 'tools/start/HELP-ko.txt')));
});

test('런처는 Node 기본 모듈만 쓴다 — 새 의존성 없음', () => {
  const imports = [...launch.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((m) => !m.startsWith('node:')), []);
});

test('런처가 부르는 npm 명령이 package.json 에 있다', () => {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
  assert.match(launch, /run\('npm run build'\)/);
  assert.match(launch, /spawn\('npm start'/);
  assert.ok(scripts.build && scripts.start, 'build · start 스크립트');
  assert.match(scripts.start, /-p 3000/);
  assert.match(launch, /const PORT = 3000;/);
});

test('이미 켜져 있으면 다시 빌드하지 않는다 — 켜진 서버 옆에서 빌드하면 .next 가 망가진다', () => {
  const first = launch.indexOf('await health()');
  assert.ok(first > -1 && first < launch.indexOf("run('npm run build')"));
  assert.ok(launch.indexOf('portFree()') < launch.indexOf("run('npm run build')"));
});

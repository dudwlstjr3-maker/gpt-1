/**
 * 이 저장소는 쫄탐일보 전용이다 (AGENTS.md 7절 '이 저장소의 범위').
 *
 * 예전에 이 저장소에 다른 프로젝트 브랜치가 올라왔다 — 포커 EV 도구 둘, 크롬 확장,
 * 분양톡 UI, 영업 랜딩 페이지. 하나라도 main 에 병합되면 그 프로젝트의 최상위 파일·폴더
 * (extensions/ · bunyangtalk/ · sales/ · LICENSE · 루트 index.html · build.mjs · test/ …)가
 * 함께 들어온다. 그래서 "main 의 최상위에 무엇이 있어도 되는가" 를 목록으로 못박는다.
 *
 * 쫄탐일보에 정말 새 최상위 항목이 필요하면 아래 목록에 더하고, 왜 필요한지 PR 에 적는다.
 * 목록에 없는 것이 보이면 먼저 "다른 프로젝트가 섞인 것 아닌가" 를 의심한다.
 *
 * git 이 추적하는 파일만 본다. node_modules · .next · dist · .env.local 처럼
 * 각자 기계에만 있는 것은 걸리지 않는다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOWED_TOP_LEVEL = [
  '.env.example',
  '.github',
  '.gitignore',
  '.gitkeep',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'docs',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'public',
  'scripts',
  'src',
  'tools',
  'tsconfig.json',
];

/** git 이 추적하는 최상위 항목. git 저장소가 아니면(검토용 zip 등) null. */
function trackedTopLevel() {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return [...new Set(r.stdout.split('\0').filter(Boolean).map((p) => p.split('/')[0]))].sort();
}

const tracked = trackedTopLevel();

test('main 의 최상위에는 쫄탐일보 것만 있다', { skip: tracked === null && 'git 저장소가 아니라 건너뜀' }, () => {
  const foreign = tracked.filter((name) => !ALLOWED_TOP_LEVEL.includes(name));
  assert.deepEqual(
    foreign,
    [],
    `쫄탐일보 목록에 없는 최상위 항목: ${foreign.join(', ')} — 다른 프로젝트가 섞였는지 먼저 본다 (AGENTS.md 7절)`,
  );
});

test('다른 프로젝트 브랜치가 들고 오는 이름은 목록에 없다', () => {
  // 실제로 이 저장소에 올라왔던 다른 프로젝트 브랜치의 최상위 항목들.
  // 누가 "목록에 더하면 되겠지" 하고 이 이름들을 허용하는 일을 막는다.
  for (const name of ['extensions', 'bunyangtalk', 'sales', 'LICENSE', 'index.html', 'build.mjs', 'test']) {
    assert.ok(!ALLOWED_TOP_LEVEL.includes(name), `${name} 은 다른 프로젝트의 것이다`);
  }
});

test('지금 추적 중인 최상위 항목이 목록과 정확히 같다 — 목록이 낡지 않게', { skip: tracked === null && 'git 저장소가 아니라 건너뜀' }, () => {
  // 목록에만 있고 저장소에는 없는 이름이 남아 있으면, 지운 것을 다시 들여올 구멍이 된다.
  const missing = ALLOWED_TOP_LEVEL.filter((name) => !tracked.includes(name));
  assert.deepEqual(missing, [], `목록에는 있는데 저장소에 없는 항목: ${missing.join(', ')} — 목록에서 뺀다`);
});

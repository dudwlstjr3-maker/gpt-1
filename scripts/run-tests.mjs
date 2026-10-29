/**
 * 순수 로직 단위 테스트를 한 번에 돌린다.
 *
 *   npm test
 *
 * scripts/ 의 *.test.mjs 를 폴더에서 찾아 `node --test` 에 넘긴다.
 * package.json 에 `node --test scripts/*.test.mjs` 로 적지 않은 이유:
 *   · Windows cmd.exe 는 * 를 펼치지 않는다.
 *   · node --test 가 글롭을 직접 받는 것은 Node 21 부터라, engines(>=20.9)의 Node 20 에서 깨진다.
 * 목록을 손으로 적지 않는 이유는 verify.mjs 의 unitTests() 와 같다 —
 * 새 테스트를 만들고도 안 돌린 채 지나간다.
 */

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const files = readdirSync(here)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join('scripts', name));

if (files.length === 0) {
  console.error('단위 테스트 파일이 없습니다 (scripts/*.test.mjs).');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

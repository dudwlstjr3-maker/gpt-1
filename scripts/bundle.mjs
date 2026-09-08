/**
 * 검토용 묶음 만들기 — 남에게(또는 다른 AI에게) 코드를 통째로 넘길 때 쓴다.
 *
 *   npm run bundle
 *
 * 왜 필요한가
 *   소스가 146개 파일 1MB 남짓이다. 하나씩 올릴 수도 없고, 통째로 붙이면
 *   업로드 한도에 걸린다. 그래서 **읽는 사람이 한 덩이씩 소화할 수 있는 크기로**
 *   갈라 담고, 파일마다 경로를 붙여 어디서 온 코드인지 잃지 않게 한다.
 *
 * 왜 요청서를 같이 내는가
 *   맥락 없이 코드만 던지면 이 앱이 **일부러 지키는 규칙**을 버그로 지적하고 온다.
 *   (결측을 0으로 안 채우는 것, 유료 시세를 안 긁는 것, DEMO 와 LIVE 를 안 섞는 것…)
 *   그래서 규칙과 "이건 일부러 그런 것" 목록을 앞에 붙인다.
 *
 * 무엇을 담지 않는가
 *   .env.local · node_modules · .next · dist · .git.
 *   키가 담길 수 있는 파일은 애초에 걸러 낸다 — .env.example(빈 서식)만 담는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'review');

/** 담지 않는 것 — 무겁거나, 생성물이거나, 비밀이 담길 수 있는 것 */
const SKIP_DIR = new Set(['node_modules', '.next', 'dist', '.git', 'public']);
const SKIP_FILE = /^\.env\.local|^\.env$|\.log$|-lock\.json$/;

const EXT_LANG = {
  '.ts': 'ts', '.tsx': 'tsx', '.mjs': 'js', '.mts': 'ts', '.js': 'js',
  '.css': 'css', '.json': 'json', '.md': 'md', '.html': 'html',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    if (SKIP_DIR.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (!SKIP_FILE.test(e.name)) out.push(full);
  }
  return out;
}

/** 한 덩이를 만든다 */
function part(title, note, files) {
  const rel = (f) => path.relative(ROOT, f).replaceAll('\\', '/');
  const lines = [
    `# ${title}`,
    '',
    note,
    '',
    `담긴 파일 ${files.length}개:`,
    '',
    ...files.map((f) => `- \`${rel(f)}\``),
    '',
    '---',
    '',
  ];
  for (const f of files) {
    const lang = EXT_LANG[path.extname(f)] ?? '';
    lines.push(`## \`${rel(f)}\``, '', '```' + lang, fs.readFileSync(f, 'utf8').trimEnd(), '```', '');
  }
  return lines.join('\n');
}

function write(name, body) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
  console.log(`  ${name.padEnd(28)} ${String(kb).padStart(5)} KB`);
  return Number(kb);
}

/* ------------------------------------------------------------------ */

const all = walk(ROOT);
const pick = (re) => all.filter((f) => re.test(path.relative(ROOT, f).replaceAll('\\', '/'))).sort();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

console.log('검토용 묶음을 만듭니다 (dist/review/)\n');

/* 0. 요청서 — 손으로 쓴 글이라 원본을 그대로 옮긴다 */
const askSrc = path.join(ROOT, 'tools', 'review');
for (const name of fs.existsSync(askSrc) ? fs.readdirSync(askSrc) : []) {
  write(name, fs.readFileSync(path.join(askSrc, name), 'utf8'));
}

/* 1. 설계 문서 — 왜 이렇게 만들었는지가 다 여기 있다 */
write('11-설계문서.md', part(
  '설계 문서 (README)',
  '이 앱이 무엇이고 왜 이렇게 만들었는지. **코드보다 이걸 먼저 읽어야 한다.**\n' +
  '점수 산식·데이터 출처·못 붙인 것과 그 이유가 전부 여기 적혀 있다.',
  [...pick(/^README\.md$/), ...pick(/^\.env\.example$/), ...pick(/^package\.json$/)],
));

/* 2. 규칙과 계산 — 순수 로직. 버그가 있으면 값이 조용히 틀린다 */
write('12-규칙과-계산.md', part(
  '규칙과 계산 (순수 로직)',
  '네트워크가 섞이지 않은 순수 함수들이다. 여기가 틀리면 화면의 숫자가 조용히 틀린다.\n' +
  '`.mjs` 인 파일은 `node --test` 로 따로 태우려고 일부러 순수 자바스크립트로 두었다.',
  [...pick(/^src\/lib\//), ...pick(/^src\/types\//), ...pick(/^src\/server\/(fng|regime|risk|summary|config|http|cache)/)],
));

/* 3. 데이터 연결 */
write('13-데이터-연결.md', part(
  '데이터 연결 (어댑터 · 제공사)',
  'DEMO 와 LIVE 를 같은 인터페이스 뒤에 둔다. **한 응답 안에서 둘을 섞지 않는다.**\n' +
  '제공사 파일마다 머리에 약관·지연·재배포 조건을 적어 두었다.',
  pick(/^src\/server\/adapters\//),
));

/* 4. 화면 — 한 덩이로 묶으면 500KB 가 넘어 읽는 쪽이 다 못 담는다. 둘로 가른다. */
write('14-화면-부품.md', part(
  '화면 ① 부품 (React 컴포넌트)',
  '차트는 전부 손으로 그린 인라인 SVG 다 — 이 앱의 실행 의존성은 next·react·react-dom 셋뿐이다.\n' +
  '색만으로 뜻을 전하지 않는다(기호와 글자를 늘 함께 둔다).',
  pick(/^src\/components\//),
));

write('14-화면-라우트.md', part(
  '화면 ② 라우트와 API (Next.js App Router)',
  '`src/app/api/` 가 서버 쪽 진입점이고, 나머지는 화면이다.\n' +
  '`globals.css` 에 색 토큰이 다 있다 — 다크가 기본이고 라이트는 토큰만 바꿔 낀다.',
  pick(/^src\/app\//),
));

/* 5. 검증 */
write('15-검증.md', part(
  '검증',
  '`npm run verify` 984건 · `npm run check:parse` 47건 · 단위 테스트 91건.\n' +
  'verify 는 돌아가는 서버를 상대로 하고, check:parse 는 제공사 응답 모양을 흉내 낸 대역 서버로 LIVE 경로를 태운다.\n' +
  'check:live 는 키를 넣고 실제 제공사에 물어보는 것이라 이 환경에서는 돌지 않는다.',
  pick(/^scripts\//),
));

console.log('\n끝났습니다. dist/review/ 안의 파일을 순서대로 올리세요.');
console.log('전체를 한 번에 못 올리면 11 → 12 → 13 순서가 가장 중요합니다.');

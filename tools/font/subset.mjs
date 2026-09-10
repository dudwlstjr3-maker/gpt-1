/**
 * Pretendard 자르기.
 *
 * 왜 자르나
 *   Pretendard Variable 원본은 2.0MB 다. 한글 음절이 11,172자라서 그렇다.
 *   그런데 이 앱이 화면에 쓰는 한글은 869자뿐이다 — 원본에서 쓰는 글자만
 *   남기면 8분의 1 이하로 줄어든다.
 *
 * 어떻게 고르나
 *   원본(src/**, tools/preview/template.html)에 실제로 들어 있는 글자를 전부
 *   모은다. 화면에 나오는 말은 모두 여기에서 온다 — 종목 이름도, 지표 이름도,
 *   설명 문장도 카탈로그와 어댑터에 적혀 있다.
 *
 * 여기 없는 글자가 나오면
 *   시스템 글꼴로 떨어진다(맑은 고딕 등). 지금은 그럴 길이 없지만, 나중에
 *   한국 시장 데이터처럼 바깥에서 한글 이름이 들어오면 이 스크립트를 다시 돌려야
 *   한다. `npm run font` 한 번이면 된다.
 *
 * 쓰는 법
 *   1) 원본을 tools/font/PretendardVariable.woff2 에 둔다
 *      (https://github.com/orioncactus/pretendard — SIL Open Font License 1.1)
 *   2) npm run font
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { glob } from 'node:fs/promises';

const run = promisify(execFile);

const SRC = 'tools/font/PretendardVariable.woff2';
const OUT = 'public/fonts/pretendard-subset.woff2';

/** 어디에서 글자를 모으나 */
const SOURCES = ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.mjs', 'tools/preview/template.html'];

/**
 * 원본에 없어도 늘 넣는 것.
 * 숫자·라틴·문장부호는 값과 기호를 그리는 데 반드시 필요하고,
 * 자모(ㄱ~ㅣ)는 글자가 깨졌을 때 낱자로 보이는 자리다.
 */
const ALWAYS = [
  [0x20, 0x7e], // 기본 라틴
  [0xa0, 0xff], // 라틴 보충 (© ± ° 등)
  [0x2010, 0x203a], // 붙임표 · 따옴표 · 말줄임
  [0x20a9, 0x20ac], // ₩ €
  [0x2190, 0x21ff], // 화살표
  [0x25a0, 0x25ff], // 도형 (▲▼●○)
  [0x2600, 0x27bf], // 기호 (★☆✓)
  [0x3000, 0x303f], // 한중일 부호 (· 〰)
  [0x3130, 0x318f], // 한글 자모
  [0xff00, 0xff65], // 전각
];

async function main() {
  const chars = new Set();
  for (const pattern of SOURCES) {
    for await (const file of glob(pattern)) {
      const text = await readFile(file, 'utf8');
      for (const ch of text) chars.add(ch.codePointAt(0));
    }
  }

  const points = new Set(chars);
  for (const [a, b] of ALWAYS) for (let c = a; c <= b; c += 1) points.add(c);

  const hangul = [...points].filter((c) => c >= 0xac00 && c <= 0xd7a3);
  const list = [...points]
    .filter((c) => c >= 0x20)
    .sort((a, b) => a - b)
    .map((c) => `U+${c.toString(16).toUpperCase()}`)
    .join(',');

  await mkdir('public/fonts', { recursive: true });
  await run('pyftsubset', [
    SRC,
    `--unicodes=${list}`,
    '--flavor=woff2',
    '--layout-features=*',
    `--output-file=${OUT}`,
  ]);

  const { size } = await (await import('node:fs/promises')).stat(OUT);
  console.log(`글자 ${points.size}자 (한글 ${hangul.length}자) → ${OUT} ${(size / 1024).toFixed(0)}KB`);
}

main().catch((e) => {
  console.error('글꼴 자르기 실패:', e.message);
  process.exit(1);
});

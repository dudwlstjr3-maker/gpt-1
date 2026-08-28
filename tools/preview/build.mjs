/**
 * 미리보기 HTML 빌드.
 *
 * 실행 중인 서버에서 그날의 스냅샷을 받아 template.html 에 박아 넣어
 * 파일 하나로 도는 자립형 HTML 을 만든다. 외부 요청은 폰트 말고 없다.
 *
 *   npm run build && npm start &
 *   node tools/preview/build.mjs            → dist/market-mood-3-preview.html
 *   node tools/preview/build.mjs --out 경로   → 원하는 곳에
 *
 * DEMO 월드는 KST 날짜로 시드가 정해지므로 날마다 다른 값이 나온다.
 * 매일 이 스크립트를 다시 돌리면 그날치 미리보기가 만들어진다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PREVIEW_BASE_URL ?? 'http://localhost:3000';

const outFlag = process.argv.indexOf('--out');
const OUT =
  outFlag !== -1 && process.argv[outFlag + 1]
    ? path.resolve(process.argv[outFlag + 1])
    : path.resolve(HERE, '../../dist/market-mood-3-preview.html');

/** 자산 상세까지 담고 싶은 종목. 없으면 조용히 건너뛴다. */
const ASSET_IDS = ['spx', 'kospi', 'btc'];

async function j(url) {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const snapshot = await j('/api/snapshot');
  if (!snapshot?.sections) throw new Error('스냅샷 모양이 예상과 다릅니다.');

  // 부분 실패 화면을 미리보기에서도 전환해 볼 수 있게 같이 담는다
  const partial = await j('/api/snapshot?scenario=partial');

  const details = {};
  for (const m of ['us', 'kr', 'crypto']) details[m] = (await j(`/api/fng/${m}`)).detail;

  const assets = {};
  for (const id of ASSET_IDS) {
    try {
      assets[id] = await j(`/api/asset/${id}`);
    } catch (e) {
      console.log(`  자산 ${id} 건너뜀: ${e.message}`);
    }
  }

  const bundle = { capturedAt: new Date().toISOString(), snapshot, partial, details, assets };

  const tpl = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');
  if (!tpl.includes('__DATA__')) throw new Error('template.html 에 __DATA__ 자리표시자가 없습니다.');

  // </script> 가 데이터 안에 있으면 스크립트 태그가 먼저 닫힌다. < 를 이스케이프한다.
  const html = tpl.replace('__DATA__', JSON.stringify(bundle).replace(/</g, '\\u003c'));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  const mb = (html.length / 1024 / 1024).toFixed(2);
  console.log(`미리보기 생성: ${OUT} (${mb}MB, 모드 ${snapshot.mode})`);
  if (Number(mb) > 15) console.log('  주의: 16MB 에 가깝습니다. 히스토리 길이를 줄이세요.');
}

main().catch((e) => {
  console.error('미리보기 빌드 실패:', e.message);
  process.exit(1);
});

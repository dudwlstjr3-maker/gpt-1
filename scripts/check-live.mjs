/**
 * LIVE 연결 점검 — 키를 넣고 네트워크가 열린 곳에서 돌린다.
 *
 *   cp .env.example .env.local   # 키 채우기
 *   npm run check:live
 *
 * 제공사마다 실제로 한 번씩 불러 보고, 어느 화면이 살아나는지 그대로 보여준다.
 * 실패는 감추지 않는다 — 무엇이 왜 안 되는지 적는다.
 */

import { readFile } from 'node:fs/promises';

/* .env.local 을 직접 읽는다 (next 없이 도는 스크립트라서) */
try {
  const raw = await readFile('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* 없으면 실제 환경변수만 쓴다 */
}

const CG = process.env.CRYPTO_BASE_URL || 'https://api.coingecko.com/api/v3';
const BN = process.env.CRYPTO_DERIV_BASE_URL || 'https://fapi.binance.com';
const FRED = process.env.MACRO_BASE_URL || 'https://api.stlouisfed.org/fred';
const FRED_KEY = process.env.MACRO_API_KEY || '';

let ok = 0;
let bad = 0;

async function probe(label, url, pick) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: process.env.CRYPTO_API_KEY ? { 'x-cg-demo-api-key': process.env.CRYPTO_API_KEY } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const shown = pick(body);
    console.log(`  ✓ ${label} — ${shown}  (${Date.now() - t0}ms)`);
    ok += 1;
  } catch (e) {
    console.log(`  ✗ ${label} — ${e instanceof Error ? e.message : String(e)}`);
    bad += 1;
  }
}

console.log('\n[크립토] CoinGecko · Binance — 키 없이 됩니다');
await probe('코인 시세', `${CG}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`,
  (b) => `BTC $${b.bitcoin?.usd?.toLocaleString()} · ETH $${b.ethereum?.usd?.toLocaleString()}`);
await probe('시장 전체', `${CG}/global`,
  (b) => `전체 시총 $${(b.data?.total_market_cap?.usd / 1e9).toFixed(0)}B · BTC 도미넌스 ${b.data?.market_cap_percentage?.btc?.toFixed(1)}%`);
await probe('BTC 일별 시계열', `${CG}/coins/bitcoin/market_chart?vs_currency=usd&days=200&interval=daily`,
  (b) => `${b.prices?.length ?? 0}일치`);
await probe('상위 코인', `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
  (b) => `${b.length}개`);
await probe('스테이블코인 시총', `${CG}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=20&page=1&sparkline=false`,
  (b) => `$${(b.reduce((a, r) => a + (r.market_cap ?? 0), 0) / 1e9).toFixed(0)}B`);
await probe('펀딩비', `${BN}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=21`,
  (b) => `최근 ${b.length}회 · 마지막 ${(Number(b.at(-1)?.fundingRate) * 100).toFixed(4)}%`);
await probe('미결제약정', `${BN}/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=30`,
  (b) => `${b.length}일치`);

console.log('\n[거시] FRED — 무료 키가 있어야 합니다');
if (!FRED_KEY) {
  console.log('  · MACRO_API_KEY 가 비어 있습니다. https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 발급');
  bad += 1;
} else {
  for (const [label, id] of [['VIX', 'VIXCLS'], ['하이일드 스프레드', 'BAMLH0A0HYM2'], ['장단기 금리차', 'T10Y2Y'], ['원/달러', 'DEXKOUS'], ['미국 CPI', 'CPIAUCSL']]) {
    await probe(label, `${FRED}/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`,
      (b) => `${b.observations?.[0]?.date} = ${b.observations?.[0]?.value}`);
  }
}

console.log('\n[미국·한국 시세] 아직 연결되지 않았습니다');
console.log('  · 미국 시세(US_MARKET_API_KEY)와 한국 시세·수급(KR_MARKET_API_KEY)은 제공사를 정한 뒤 붙입니다.');
console.log('  · 붙기 전까지 그 시장은 DEMO 이거나 해당 카드만 오류로 표시됩니다.');

console.log(`\n결과: ${ok}건 성공, ${bad}건 실패`);
console.log(ok > 0
  ? '크립토 카드와 심리 점수, 위험 신호등(VIX·스프레드·금리)이 실제 값으로 채워집니다.'
  : '한 곳도 닿지 않았습니다. 네트워크가 막혀 있는지 먼저 확인하세요.');
process.exit(bad > 0 && ok === 0 ? 1 : 0);

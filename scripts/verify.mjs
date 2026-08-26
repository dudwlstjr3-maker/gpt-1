/**
 * 검증 스크립트 — 실행 중인 서버(기본 http://localhost:3000)를 상대로
 * 요구사항의 검증 기준을 자동으로 확인한다.
 *
 *   npm run build && npm start &   (또는 npm run dev)
 *   npm run verify
 */

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log(`검증 대상: ${BASE}\n`);

  /* ---------------- 1. 기본 스냅샷 ---------------- */
  console.log('[1] 홈 스냅샷 (scenario=normal)');
  const { status, body: snap } = await getJson('/api/snapshot?scenario=normal');
  check('스냅샷 응답 200', status === 200, `status=${status}`);
  check('모드가 DEMO 또는 LIVE', snap.mode === 'DEMO' || snap.mode === 'LIVE', `mode=${snap.mode}`);

  const fng = snap.sections?.fng?.data ?? [];
  check('미국·한국·크립토 카드 3개', fng.length === 3, `${fng.map((f) => f.market).join(', ')}`);

  for (const f of fng) {
    check(
      `[${f.market}] 점수가 0~100 범위 또는 산출 불가`,
      f.score === null || (f.score >= 0 && f.score <= 100),
      `score=${f.score}`,
    );
    const sum = f.components.reduce((a, c) => a + c.weight, 0);
    check(`[${f.market}] 구성요소 가중치 합계 100%`, Math.abs(sum - 100) < 0.001, `합계=${sum}`);

    for (const c of f.components) {
      const subSum = c.subMetrics.reduce((a, s) => a + s.weight, 0);
      if (Math.abs(subSum - 100) >= 0.001) {
        check(`[${f.market}] ${c.id} 하위 가중치 합계 100`, false, `합계=${subSum}`);
      }
      if (c.score !== null && (c.score < 0 || c.score > 100)) {
        check(`[${f.market}] ${c.id} 구성요소 점수 범위`, false, `score=${c.score}`);
      }
      for (const s of c.subMetrics) {
        if (s.score !== null && (s.score < 0 || s.score > 100)) {
          check(`[${f.market}] ${s.id} 하위 점수 범위`, false, `score=${s.score}`);
        }
      }
    }
    check(
      `[${f.market}] 결측 구성요소가 0점으로 처리되지 않음`,
      f.components.every((c) => c.available || c.score === null),
      '',
    );
    check(`[${f.market}] 신뢰도 표기`, ['high', 'medium', 'low'].includes(f.confidence), f.confidence);
    check(`[${f.market}] 산식 버전 기록`, typeof f.formulaVersion === 'string' && f.formulaVersion.length > 0, f.formulaVersion);
    check(`[${f.market}] 30일 미니 차트 존재`, Array.isArray(f.spark) && f.spark.length > 0, `${f.spark.length}개 포인트`);
  }

  /* ---------------- 2. 가격 ---------------- */
  console.log('\n[2] 가격 카드');
  const quotes = snap.sections?.quotes?.data ?? {};
  const flat = ['us', 'kr', 'crypto'].flatMap((m) => quotes[m] ?? []);
  check('세 시장 모두 시세 존재', ['us', 'kr', 'crypto'].every((m) => (quotes[m] ?? []).length > 0),
    ['us', 'kr', 'crypto'].map((m) => `${m}:${(quotes[m] ?? []).length}`).join(' '));
  check('모든 가격에 기준 시각(asOf) 존재', flat.every((q) => typeof q.meta?.asOf === 'string' && !Number.isNaN(Date.parse(q.meta.asOf))));
  check('모든 가격에 지연 정보 존재', flat.every((q) => q.meta?.sources?.[0] && q.meta.sources[0].delayMinutes !== undefined));
  check('모든 가격에 실시간/지연 상태 표기', flat.every((q) => ['live', 'delayed', 'stale', 'demo'].includes(q.meta?.freshness)));
  check('가격이 없으면 null 이며 사유가 있음', flat.every((q) => q.price !== null || typeof q.unavailableReason === 'string'));

  const requiredUs = ['spx', 'ndx', 'dji', 'rut', 'vix', 'ust2', 'ust10', 'us_spread_10_2', 'dxy', 'gold', 'wti', 'nvda', 'aapl', 'msft', 'amzn', 'tsla'];
  const requiredKr = ['kospi', 'kosdaq', 'kospi200', 'vkospi', 'usdkrw', 'ktb3', 'ktb10', 'samsung', 'hynix', 'hyundai', 'naver', 'kakao'];
  const requiredCr = ['btc', 'eth', 'xrp', 'sol', 'bnb', 'total_mcap', 'total_vol', 'btc_dom', 'stable_mcap', 'funding', 'open_interest', 'liquidations'];
  const has = (list, ids) => ids.filter((id) => !list.some((q) => q.id === id));
  check('미국 필수 항목 모두 존재', has(quotes.us ?? [], requiredUs).length === 0, has(quotes.us ?? [], requiredUs).join(','));
  check('한국 필수 항목 모두 존재', has(quotes.kr ?? [], requiredKr).length === 0, has(quotes.kr ?? [], requiredKr).join(','));
  check('크립토 필수 항목 모두 존재', has(quotes.crypto ?? [], requiredCr).length === 0, has(quotes.crypto ?? [], requiredCr).join(','));

  /* ---------------- 3. 나머지 섹션 ---------------- */
  console.log('\n[3] 요약 · 캘린더 · 지표 · 수급');
  const summary = snap.sections?.summary?.data;
  check('오늘의 시장 요약 최대 3줄', Array.isArray(summary?.lines) && summary.lines.length <= 3, `${summary?.lines?.length}줄`);
  check('요약이 사실/해석을 구분', (summary?.lines ?? []).every((l) => ['fact', 'interpretation', 'insufficient'].includes(l.kind)));
  check('경제 캘린더 존재', (snap.sections?.calendar?.data ?? []).length > 0, `${snap.sections?.calendar?.data?.length ?? 0}건`);
  check('거시 지표 존재', (snap.sections?.macro?.data ?? []).length > 0, `${snap.sections?.macro?.data?.length ?? 0}개`);
  check('한국 수급 데이터 존재', snap.sections?.flows?.data !== null);
  check('마지막 전체 업데이트 시각 존재', typeof snap.lastFullUpdate === 'string' && !Number.isNaN(Date.parse(snap.lastFullUpdate)));

  /* ---------------- 4. 결측/재조정 시나리오 ---------------- */
  console.log('\n[4] 부분 실패 시나리오 (결측 재조정 · 산출 불가)');
  const { body: partial } = await getJson('/api/snapshot?scenario=partial');
  const pf = partial.sections?.fng?.data ?? [];
  const us = pf.find((f) => f.market === 'us');
  const kr = pf.find((f) => f.market === 'kr');
  check('미국: 일부 결측이어도 70% 이상이면 재조정 후 산출', us?.score !== null, `coverage=${us?.coverage}, score=${us?.score}`);
  check('미국: 결측 구성요소의 적용 가중치 0', (us?.components ?? []).every((c) => c.available || c.effectiveWeight === 0));
  check('미국: 재조정된 적용 가중치 합계 100', Math.abs((us?.components ?? []).reduce((a, c) => a + c.effectiveWeight, 0) - 100) < 0.5,
    `${(us?.components ?? []).reduce((a, c) => a + c.effectiveWeight, 0).toFixed(2)}%`);
  check('한국: 70% 미만이면 산출 불가', kr?.score === null && typeof kr?.unavailableReason === 'string',
    `coverage=${kr?.coverage}`);
  check('한국: 산출 불가 사유 제공', typeof kr?.unavailableReason === 'string' && kr.unavailableReason.length > 0);

  /* ---------------- 5. 상태 시나리오 ---------------- */
  console.log('\n[5] 상태 재현 시나리오');
  const { body: empty } = await getJson('/api/snapshot?scenario=empty');
  check('빈값 시나리오: 섹션 상태 empty', empty.sections?.quotes?.status === 'empty', empty.sections?.quotes?.status);
  const { body: stale } = await getJson('/api/snapshot?scenario=stale');
  check('오래된 데이터 시나리오: stale 표시', stale.sections?.quotes?.status === 'stale' || stale.sections?.quotes?.data?.us?.[0]?.meta?.freshness === 'stale',
    stale.sections?.quotes?.status);
  const { body: errorSnap } = await getJson('/api/snapshot?scenario=error');
  check('전체 오류 시나리오: fatalError', typeof errorSnap.fatalError === 'string');
  const { body: loading } = await getJson('/api/snapshot?scenario=loading');
  check('로딩 시나리오: 섹션 상태 loading', loading.sections?.fng?.status === 'loading');

  /* ---------------- 6. 상세 라우트 ---------------- */
  console.log('\n[6] 상세 API');
  for (const m of ['us', 'kr', 'crypto']) {
    const { status: s, body } = await getJson(`/api/fng/${m}`);
    check(`[${m}] 점수 상세 200`, s === 200, `status=${s}`);
    const d = body.detail;
    check(`[${m}] 산식·기여도·출처 제공`,
      Array.isArray(d?.methodology?.steps) && d.methodology.steps.length > 0 &&
      d.components.some((c) => c.contributionDay !== null) &&
      (d.meta?.sources ?? []).length > 0);
    check(`[${m}] 히스토리 길이 (3년 차트용)`, (d?.history ?? []).length > 200, `${d?.history?.length ?? 0}개`);
    check(`[${m}] 모든 히스토리 점수 0~100`, (d?.history ?? []).every((p) => p.v === null || (p.v >= 0 && p.v <= 100)));
    check(`[${m}] 벤치마크 시계열 제공`, (d?.benchmark?.series ?? []).length > 0, d?.benchmark?.name);
  }

  const { status: assetStatus, body: asset } = await getJson('/api/asset/spx');
  check('종목 상세 200', assetStatus === 200);
  check('1D·1W·1M·3M·1Y 구간 제공', ['1D', '1W', '1M', '3M', '1Y'].every((r) => (asset.ranges?.[r] ?? []).length > 1));
  check('F&G 겹쳐보기 데이터 제공', ['1M', '3M', '1Y'].every((r) => (asset.fngOverlay?.[r] ?? []).length > 1));

  const { status: hs, body: health } = await getJson('/api/health');
  check('health 200', hs === 200);
  check('health 에 키 값이 노출되지 않음', !JSON.stringify(health).match(/API_KEY"\s*:\s*"[^"]+"/));

  /* ---------------- 결과 ---------------- */
  console.log(`\n결과: ${pass}건 통과, ${fail}건 실패`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('검증 실행 실패:', e);
  process.exit(1);
});

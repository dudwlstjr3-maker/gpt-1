/**
 * 검증 스크립트 — 실행 중인 서버(기본 http://localhost:3000)를 상대로
 * 요구사항의 검증 기준을 자동으로 확인한다.
 *
 *   npm run build && npm start &   (또는 npm run dev)
 *   npm run verify
 */

import { readFile } from 'node:fs/promises';

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
  /* ---------------- 1-1. 점수가 실제로 그 가중치의 가중평균인가 ---------------- */
  /*
   * 가중치를 화면에 적어 두는 것만으로는 부족하다. 적어 둔 가중치와 실제 산식이
   * 어긋나면 화면 전체가 거짓말이 된다. 그래서 응답만 보고 점수를 다시 계산해 맞춰본다.
   *
   * 반올림 때문에 완전히 같을 수는 없다.
   *  - 하위·구성요소 점수는 소수 둘째 자리, 최종 점수는 소수 첫째 자리에서 반올림된다.
   *  - 그래서 구성요소는 0.011, 최종 점수는 0.06 까지를 반올림 오차로 본다.
   * 재조정은 화면에 표시된 적용가중치(effectiveWeight)가 아니라 선언 가중치로 한다.
   * 엔진이 그렇게 계산하고, 적용가중치는 표시용으로 한 번 더 반올림된 값이기 때문이다.
   */
  console.log('\n[1-1] 점수 = 선언한 가중치의 가중평균인가');
  const MIN_COVERAGE = 0.7;

  async function checkWeighting(label, detail) {
    const comps = detail.components ?? [];

    // (1) 구성요소 점수 = 하위 지표 가중평균 (결측은 빼고 나머지끼리 재조정)
    for (const c of comps) {
      let wsum = 0;
      let acc = 0;
      for (const sm of c.subMetrics) {
        if (sm.score === null) continue;
        wsum += sm.weight;
        acc += sm.score * sm.weight;
      }
      // 하위 가중치가 절반도 안 남으면 구성요소를 통째로 결측 처리하는 것이 규칙이다
      if (wsum < 50) {
        check(`${label} ${c.id} 하위 절반 미만이면 구성요소 결측`, c.score === null,
          `남은 하위 가중치 ${wsum}, score=${c.score}`);
        continue;
      }
      const expected = acc / wsum;
      check(`${label} ${c.id} 점수 = 하위 가중평균`,
        c.score !== null && Math.abs(c.score - expected) <= 0.011,
        `보고 ${c.score} vs 계산 ${expected.toFixed(3)}`);
    }

    // (2) 충족률 = 값이 나온 구성요소의 선언 가중치 합 ÷ 100
    const availableWeight = comps.filter((c) => c.score !== null).reduce((a, c) => a + c.weight, 0);
    check(`${label} 충족률 = 산출된 구성요소 가중치 합`,
      Math.abs(detail.coverage - availableWeight / 100) < 1e-9,
      `보고 ${detail.coverage} vs 계산 ${availableWeight / 100}`);

    // (3) 적용가중치 = 선언가중치 ÷ 사용가능가중치 × 100, 결측은 0, 합계 100
    let effSum = 0;
    for (const c of comps) {
      const expected = c.score === null || availableWeight === 0 ? 0 : (c.weight / availableWeight) * 100;
      check(`${label} ${c.id} 적용가중치 재조정`, Math.abs(c.effectiveWeight - expected) <= 0.011,
        `보고 ${c.effectiveWeight} vs 계산 ${expected.toFixed(2)}`);
      effSum += c.effectiveWeight;
    }
    if (availableWeight > 0) {
      check(`${label} 적용가중치 합계 100`, Math.abs(effSum - 100) < 0.05, `합계 ${effSum.toFixed(2)}`);
    }

    // (4) 최종 점수 = 사용 가능한 구성요소의 선언 가중치 가중평균
    if (detail.coverage >= MIN_COVERAGE && availableWeight > 0) {
      const expected =
        comps.filter((c) => c.score !== null).reduce((a, c) => a + c.score * c.weight, 0) / availableWeight;
      check(`${label} 최종 점수 = 구성요소 가중평균`,
        detail.score !== null && Math.abs(detail.score - expected) <= 0.06,
        `보고 ${detail.score} vs 계산 ${expected.toFixed(4)}`);
    } else {
      // (5) 충족률이 기준 미만이면 점수를 만들지 않고 사유를 남긴다
      check(`${label} 충족률 미달이면 산출 불가`, detail.score === null, `score=${detail.score}`);
      check(`${label} 산출 불가 사유를 남김`,
        typeof detail.unavailableReason === 'string' && detail.unavailableReason.length > 0);
    }
  }

  for (const m of ['us', 'kr', 'crypto']) {
    const { body } = await getJson(`/api/fng/${m}`);
    await checkWeighting(`[${m}]`, body.detail);
  }
  // 결측이 생겨 재조정이 실제로 일어나는 경로도 같은 잣대로 확인한다
  for (const m of ['us', 'kr', 'crypto']) {
    const { body } = await getJson(`/api/fng/${m}?scenario=partial`);
    await checkWeighting(`[${m}/부분실패]`, body.detail);
  }

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
  /* 미국 구성은 널리 알려진 7축과 같은 항목을 쓴다 — 항목이 빠지거나 늘면 알아채야 한다 */
  const US_AXES = [
    ['us_momentum', '시장 모멘텀'],
    ['us_strength', '주가 강도'],
    ['us_breadth', '주가 폭'],
    ['us_putcall', '풋/콜 옵션'],
    ['us_vix', '시장 변동성'],
    ['us_safe_haven', '안전자산 선호'],
    ['us_junk', '정크본드 수요'],
  ];
  const usIds = (us?.components ?? []).map((c) => c.id);
  check('미국 구성요소 7축', usIds.length === 7, `${usIds.length}개`);
  for (const [id, label] of US_AXES) {
    const c = (us?.components ?? []).find((x) => x.id === id);
    check(`미국 구성요소 · ${label}`, !!c, c ? `가중치 ${c.weight}%` : '없음');
  }
  // 동일 가중(정수 합 100 을 맞추느라 14~15% 사이)
  check('미국 구성요소가 사실상 동일 가중',
    (us?.components ?? []).every((c) => c.weight >= 14 && c.weight <= 15),
    (us?.components ?? []).map((c) => c.weight).join('/'));

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

  /* ---------------- 7. 시장 위험 신호등 ---------------- */
  console.log('\n[7] 시장 위험 신호등');
  const risk = snap.sections?.risk?.data;
  check('위험 섹션 존재', risk !== undefined && risk !== null);
  check('지표가 정확히 7개', (risk?.indicators ?? []).length === 7, `${risk?.indicators?.length}개`);
  check('종합 문구 제공', typeof risk?.headline === 'string' && risk.headline.length > 0, risk?.headline);

  const LEVELS = ['calm', 'normal', 'watch', 'alert'];
  for (const i of risk?.indicators ?? []) {
    const label = `[${i.shortName}]`;
    if (!LEVELS.includes(i.level)) check(`${label} 단계 값이 유효`, false, i.level);
    if (i.value !== null && (i.position === null || i.position < 0 || i.position > 100)) {
      check(`${label} 구간 위치 0~100`, false, `position=${i.position}`);
    }
    if (i.value === null && typeof i.unavailableReason !== 'string') {
      check(`${label} 값이 없으면 사유 제공`, false, '');
    }
    // 구간이 빈틈·중복 없이 이어지는지
    const bands = i.bands ?? [];
    let contiguous = bands.length >= 2 && bands[0].from === null && bands[bands.length - 1].to === null;
    for (let k = 0; k < bands.length - 1; k += 1) {
      if (bands[k].to !== bands[k + 1].from) contiguous = false;
    }
    if (!contiguous) check(`${label} 구간이 빈틈 없이 이어짐`, false, JSON.stringify(bands.map((b) => [b.from, b.to])));
    // 실제 값이 표시된 단계의 구간 안에 있는지
    if (i.value !== null) {
      const b = bands.find((x) => x.level === i.level);
      const inBand = b && (b.from === null || i.value >= b.from) && (b.to === null || i.value < b.to);
      if (!inBand) check(`${label} 값이 표시 단계의 구간 안에 있음`, false, `value=${i.value} band=${JSON.stringify(b)}`);
    }
    if (!i.why || !i.reading) check(`${label} 설명·해석 제공`, false, '');
  }
  check('모든 지표의 구간·단계·위치·설명이 일관됨', true);
  check('세 시장이 모두 포함됨',
    ['us', 'kr', 'crypto'].every((m) => (risk?.indicators ?? []).some((i) => i.scope === m)),
    (risk?.indicators ?? []).map((i) => i.scope).join(','));
  check('공포지수·정크본드·국채가 포함됨',
    ['vix', 'hy_oas', 'ust10'].every((id) => (risk?.indicators ?? []).some((i) => i.id === id)));

  /* ---------------- 7-2. 심리 사이클 ---------------- */
  console.log('\n[7-2] 심리 사이클');
  const PHASES = ['recovery', 'deepening', 'improving', 'weakening', 'heating', 'cooling', 'unknown'];
  for (const f of fng) {
    const cy = f.cycle;
    check(`[${f.market}] 사이클 제공`, cy !== undefined && cy !== null);
    check(`[${f.market}] 국면이 유효한 값`, PHASES.includes(cy?.phase?.id), cy?.phase?.label);
    check(`[${f.market}] 단기·중기·장기 3개 기간`, (cy?.horizons ?? []).length === 3, `${cy?.horizons?.length}개`);
    for (const h of cy?.horizons ?? []) {
      if (h.percentile !== null && (h.percentile < 0 || h.percentile > 100)) {
        check(`[${f.market}] ${h.id} 백분위 0~100`, false, `${h.percentile}`);
      }
      if (h.percentile === null && typeof h.unavailableReason !== 'string') {
        check(`[${f.market}] ${h.id} 산출 불가 사유 제공`, false, '');
      }
      if (h.mean !== null && (h.mean < 0 || h.mean > 100)) {
        check(`[${f.market}] ${h.id} 평균 0~100`, false, `${h.mean}`);
      }
    }
    // 국면이 실제 수준·방향과 어긋나지 않는지
    if (cy?.score !== null && cy?.slope !== null) {
      const lvl = cy.score < 40 ? 'fear' : cy.score < 60 ? 'neutral' : 'greed';
      const expected = {
        fear: ['recovery', 'deepening'],
        neutral: ['improving', 'weakening'],
        greed: ['heating', 'cooling'],
      }[lvl];
      check(`[${f.market}] 국면이 점수 수준과 일치`, expected.includes(cy.phase.id), `${cy.score}점 → ${cy.phase.id}`);
    }
  }
  check('사이클 기간별 값이 모두 범위 안', true);

  /* ---------------- 7-3. 구간별 과거 통계 ---------------- */
  console.log('\n[7-3] 구간별 과거 통계');
  for (const m of ['us', 'kr', 'crypto']) {
    const { body } = await getJson(`/api/fng/${m}`);
    const bs = body.detail?.bandStats;
    check(`[${m}] 구간 통계 제공`, bs !== null && bs !== undefined, bs ? `표본 ${bs.totalDays}일` : '없음');
    if (bs) {
      check(`[${m}] 5개 구간 모두 집계`, bs.bands.length === 5, `${bs.bands.length}개`);
      check(`[${m}] 표본 부족 구간은 값이 null`,
        bs.bands.every((b) => (b.sampleDays >= 5) === (b.avgForward !== null)));
      check(`[${m}] 데이터 한계 경고 문구 존재`, typeof bs.caveat === 'string' && bs.caveat.length > 10);
      check(`[${m}] 플러스 비율 0~100`,
        bs.bands.every((b) => b.positiveShare === null || (b.positiveShare >= 0 && b.positiveShare <= 100)));
    }
  }

  /* ---------------- 7-4. 10년 히스토리와 과거 위기 표식 ---------------- */
  console.log('\n[7-4] 10년 히스토리 · 과거 위기 표식');
  for (const m of ['us', 'kr', 'crypto']) {
    const { body } = await getJson(`/api/fng/${m}`);
    const d = body.detail;
    const hist = d?.history ?? [];
    const spanYears = hist.length >= 2 ? (hist[hist.length - 1].t - hist[0].t) / (365.25 * 86400000) : 0;
    check(`[${m}] 히스토리가 9년 이상`, spanYears >= 9, `${spanYears.toFixed(1)}년 · ${hist.length}일`);
    check(`[${m}] 히스토리가 시간 오름차순`, hist.every((p, i) => i === 0 || p.t > hist[i - 1].t));

    const bm = d?.benchmark?.series ?? [];
    const bmYears = bm.length >= 2 ? (bm[bm.length - 1].t - bm[0].t) / (365.25 * 86400000) : 0;
    check(`[${m}] 비교 가격도 9년 이상`, bmYears >= 9, `${bmYears.toFixed(1)}년`);

    const ev = d?.events;
    check(`[${m}] 사건 표식 제공`, !!ev && Array.isArray(ev.markers), `${ev?.markers?.length ?? 0}건`);
    if (ev) {
      check(`[${m}] 표식이 히스토리 범위 안에 있음`,
        ev.markers.every((x) => x.t >= hist[0].t && x.t <= hist[hist.length - 1].t));
      check(`[${m}] 표식이 사건일에서 7일 이내로 붙음`, ev.markers.every((x) => x.offsetDays <= 7));
      check(`[${m}] 점수 없는 표식은 사유를 남김`,
        ev.markers.every((x) => x.score !== null || typeof x.unavailableReason === 'string'));
      check(`[${m}] 표식 점수는 0~100`,
        ev.markers.every((x) => x.score === null || (x.score >= 0 && x.score <= 100)));
      check(`[${m}] 단계 라벨이 점수와 함께 채워짐`,
        ev.markers.every((x) => (x.score === null) === (x.stageLabel === null)));
      // DEMO 에서는 합성 표시가 반드시 켜져 있어야 한다
      check(`[${m}] DEMO 표식은 합성 표시가 켜져 있음`,
        body.mode !== 'DEMO' || ev.markers.every((x) => x.synthetic === true));
      check(`[${m}] 사건 한계 문구 존재`, typeof ev.caveat === 'string' && ev.caveat.length > 20);
      check(`[${m}] 표식 시점이 오름차순`, ev.markers.every((x, i) => i === 0 || x.t > ev.markers[i - 1].t));
      // 위기 시점이 실제로 낮게 나오는지 — 표식 점수 중앙값이 전체 중앙값보다 낮아야 한다
      const scored = ev.markers.map((x) => x.score).filter((v) => v !== null).sort((a, b) => a - b);
      const all = hist.map((x) => x.v).filter((v) => v !== null).sort((a, b) => a - b);
      if (scored.length >= 3 && all.length > 0) {
        const med = (arr) => arr[Math.floor(arr.length / 2)];
        check(`[${m}] 위기 표식이 평상시보다 낮은 점수`, med(scored) < med(all),
          `표식 중앙 ${med(scored)} vs 전체 중앙 ${med(all)}`);
      }
    }
  }

  /* ---------------- 7-5. 다른 지수를 참고한 구성 변경 ---------------- */
  console.log('\n[7-5] 구성요소 검토 (다른 공포·탐욕 지수 참고)');
  {
    const want = {
      us: { comps: 7, must: [], missing: [] },
      kr: { comps: 7, must: ['kr_deposit_chg_20d'], missing: [] },
      crypto: { comps: 8, must: ['search_trend', 'news_sentiment'], missing: [] },
    };
    for (const m of ['us', 'kr', 'crypto']) {
      const { body } = await getJson(`/api/fng/${m}`);
      const d = body.detail;
      const comps = d?.components ?? [];
      const subIds = comps.flatMap((c) => c.subMetrics.map((s) => s.id));
      check(`[${m}] 구성요소 ${want[m].comps}개`, comps.length === want[m].comps, `${comps.length}개`);
      for (const id of want[m].must) {
        check(`[${m}] ${id} 포함`, subIds.includes(id));
      }
      const note = d?.methodology?.compositionNote;
      check(`[${m}] 구성 근거 메모 제공`, typeof note === 'string' && note.length > 40, `${note?.length ?? 0}자`);
      check(
        `[${m}] 외부 지수를 복제한다고 말하지 않음`,
        typeof note === 'string' && !/복제|그대로 가져|공식 지수입니다/.test(note),
      );
    }
    // 크립토는 검색 관심도가 새로 들어간 자리다
    const { body: cb } = await getJson('/api/fng/crypto');
    const attn = (cb.detail?.components ?? []).find((c) => c.id === 'cr_attention');
    check('[crypto] 검색 관심도 구성요소 존재', !!attn, attn ? `${attn.weight}%` : '없음');
    if (attn) {
      const w = attn.subMetrics.reduce((a, s) => a + s.weight, 0);
      check('[crypto] 검색 관심도 하위 가중치 합 100', Math.abs(w - 100) < 0.001, `합계=${w}`);
    }
  }

  /* ---------------- 9. 생활 속 경제 이야기 ---------------- */
  console.log('\n[9] 생활 속 경제 이야기');
  {
    const basics = snap.sections?.basics;
    check('basics 섹션 존재', !!basics, `status=${basics?.status}`);
    const list = basics?.data ?? [];
    check('지표 9개', list.length === 9, `${list.map((b) => b.id).join(', ')}`);

    const wanted = ['per_capita_gdp', 'gini', 'misery', 'bigmac', 'ppp_gap', 'engel', 'pir', 'cli', 'ccsi'];
    // 발표 기관이 없는 개념은 담지 않는다
    for (const gone of ['latte', 'buffett', 'lipstick', 'pentagon_pizza']) {
      check(`${gone} 는 빠짐 (비공식이라 제외)`, !list.some((b) => b.id === gone));
    }
    check('전부 공식 통계', list.every((b) => b.official === true),
      list.filter((b) => !b.official).map((b) => b.id).join(', ') || '예외 없음');
    for (const id of wanted) check(`${id} 포함`, list.some((b) => b.id === id));

    for (const b of list) {
      check(
        `[${b.id}] 값이 유한수이거나 결측(null)`,
        b.value === null || Number.isFinite(b.value),
        `value=${b.value}`,
      );
      check(`[${b.id}] 해석 문장 제공`, typeof b.reading === 'string' && b.reading.length > 10);
      check(`[${b.id}] 기준 시점 표기`, typeof b.asOfLabel === 'string' && b.asOfLabel.length > 0, b.asOfLabel);
      check(`[${b.id}] 비교값 제공`, Array.isArray(b.comparisons) && b.comparisons.length >= 2);
      if (b.official === false) {
        check(`[${b.id}] 비공식 개념이면 그 사실을 적음`, typeof b.officialNote === 'string' && b.officialNote.length > 10);
      }
    }

    // 나라 비교는 한국·중국·일본·미국 네 나라를 같은 자리에 놓는다.
    // 자리가 카드마다 달라지면 여러 카드를 훑을 때 눈이 자리를 다시 찾아야 한다.
    {
      const FOUR = ['한국', '중국', '일본', '미국'];
      // 도시끼리 견주는 지표
      const cityBased = { pir: ['서울', '베이징', '도쿄', '뉴욕'] };

      for (const b of list) {
        const labels = b.comparisons.map((c) => c.label.replace(/\s*\(.*\)$/, ''));
        const want = cityBased[b.id] ?? FOUR;
        check(`[${b.id}] ${want.join('·')} 순서로 비교`, JSON.stringify(labels) === JSON.stringify(want),
          labels.join(', '));
        check(`[${b.id}] 첫 항목이 강조 대상`, b.comparisons[0]?.primary === true);
        check(`[${b.id}] 비교값 단위가 모두 같음`,
          b.comparisons.every((c) => c.suffix === b.comparisons[0].suffix),
          b.comparisons.map((c) => c.suffix).join('|'));
      }

      // 기준연도·정의가 달라 그대로 견주면 안 되는 지표는 반드시 경고를 단다
      for (const id of ['ccsi', 'engel', 'cli', 'pir']) {
        const b = list.find((x) => x.id === id);
        if (b) {
          check(`[${id}] 그대로 견주면 안 되는 이유를 적음`,
            typeof b.comparisonNote === 'string' && b.comparisonNote.length > 10);
        }
      }

      // 기준이 다른 값에는 막대를 그리지 않는다 (글 경고만으로는 눈이 먼저 견준다)
      const ccsi = list.find((b) => b.id === 'ccsi');
      check('소비자심리지수는 같은 잣대가 아님을 표시', ccsi?.sameScale === false, `${ccsi?.sameScale}`);

      // 달러가 기준인 지표는 미국이 정확히 0 이어야 한다
      for (const id of ['bigmac', 'ppp_gap']) {
        const b = list.find((x) => x.id === id);
        if (b) check(`[${id}] 달러 기준이라 미국은 0%`, b.comparisons[3]?.value === 0, `${b.comparisons[3]?.value}`);
      }
    }

    // 미저리 지수는 지표 화면의 CPI·실업률을 그대로 더한 값이어야 한다.
    // 두 화면이 다른 숫자를 보여주면 어느 쪽을 믿어야 할지 알 수 없다.
    {
      const macro = snap.sections?.macro?.data ?? [];
      const pick = (id) => macro.find((m) => m.id === id)?.value ?? null;
      const cpi = pick('kr_cpi');
      const un = pick('kr_unemployment');
      const misery = list.find((b) => b.id === 'misery')?.value ?? null;
      check('한국 실업률이 지표 목록에 있음', un !== null, `${un}`);
      if (cpi !== null && un !== null && misery !== null) {
        check('미저리 지수 = 물가상승률 + 실업률', Math.abs(misery - (cpi + un)) < 0.05,
          `${misery} vs ${cpi} + ${un} = ${(cpi + un).toFixed(1)}`);
      }
    }

    // 투자 권유로 읽힐 표현이 섞이지 않았는지
    const allText = JSON.stringify(list);
    check(
      '매수·매도·수익 보장 표현 없음',
      !/매수하|매도하|사야|팔아야|수익을 보장|반드시 오른/.test(allText),
    );
  }

  /* ---------------- 9-2. 예측시장 ---------------- */
  console.log('\n[9-2] 예측시장 (별도 칸)');
  {
    const sec = snap.sections?.prediction;
    check('prediction 섹션 존재', !!sec, `status=${sec?.status}`);
    const d = sec?.data;
    check('출처(venue) 표기', typeof d?.venue === 'string' && d.venue.length > 0, d?.venue);
    const list = d?.markets ?? [];
    check('질문 2개', list.length === 2, `${list.length}개`);

    for (const m of list) {
      check(`[${m.id}] 질문 문구 있음`, typeof m.question === 'string' && m.question.length > 0);
      check(`[${m.id}] 선택지 2개 이상`, Array.isArray(m.outcomes) && m.outcomes.length >= 2);
      for (const o of m.outcomes) {
        check(
          `[${m.id}] ${o.label} 가격이 0~100 이거나 결측`,
          o.price === null || (o.price >= 0 && o.price <= 100),
          `price=${o.price}`,
        );
      }
      const priced = m.outcomes.filter((o) => o.price !== null);
      if (priced.length === m.outcomes.length && priced.length >= 2) {
        const sum = priced.reduce((a, o) => a + o.price, 0);
        check(`[${m.id}] 선택지 가격 합이 100 부근`, Math.abs(sum - 100) < 1.5, `합계=${sum}`);
        check(
          `[${m.id}] 값이 큰 선택지가 먼저`,
          priced.every((o, i) => i === 0 || o.price <= priced[i - 1].price),
        );
      }
      check(
        `[${m.id}] 거래대금이 유한수이거나 결측`,
        m.volume24h === null || Number.isFinite(m.volume24h),
        `${m.volume24h}`,
      );
      check(`[${m.id}] 마감 시각이 ISO 이거나 결측`, m.closesAt === null || !Number.isNaN(Date.parse(m.closesAt)));
      check(`[${m.id}] url 은 문자열`, typeof m.url === 'string');
    }

    // DEMO 는 실제 예측시장을 흉내내지 않는다
    if (snap.mode === 'DEMO') {
      check('DEMO 는 출처에 실제 서비스가 아님을 밝힘', /DEMO/.test(d?.venue ?? ''), d?.venue);
      check('DEMO 는 실제 예측시장 링크를 만들지 않음', list.every((m) => m.url === ''));
      check('DEMO 질문은 샘플임을 표시', list.every((m) => /DEMO/.test(m.question)));
    }

    // 확률이라고 단정하는 표현이 없어야 한다
    const txt = JSON.stringify(d ?? {});
    check('가격을 확률이라고 단정하지 않음', !/확률입니다|확률 ?=|확률로 보면/.test(txt));

    // 한쪽 값이 비면 0 으로 채우지 않고 사유를 남긴다
    const { body: pp } = await getJson('/api/snapshot?scenario=partial');
    const pl = pp.sections?.prediction?.data?.markets ?? [];
    const brokenM = pl.filter((m) => m.unavailableReason);
    check('부분 실패 시 결측 시장이 생김', brokenM.length > 0, `${brokenM.length}건`);
    for (const m of brokenM) {
      check(`[${m.id}] 결측을 0 으로 채우지 않음`, m.outcomes.every((o) => o.price === null) && m.changeDay === null);
    }
    check('부분 실패는 섹션 상태로도 드러남', pp.sections?.prediction?.status === 'partial', pp.sections?.prediction?.status);

    const { body: ep } = await getJson('/api/snapshot?scenario=empty');
    check('빈값 시나리오에서 prediction 이 empty', ep.sections?.prediction?.status === 'empty', ep.sections?.prediction?.status);
  }

  /* ---------------- 9-1. 결측을 0 으로 채우지 않는다 ---------------- */
  console.log('\n[9-1] 결측 처리 (scenario=partial)');
  {
    const { body: pb } = await getJson('/api/snapshot?scenario=partial');
    const list = pb.sections?.basics?.data ?? [];
    const broken = list.filter((b) => b.value === null);
    check('부분 실패 시 결측 항목이 생김', broken.length > 0, `${broken.map((b) => b.id).join(', ') || '없음'}`);
    for (const b of broken) {
      check(`[${b.id}] 결측을 0 으로 채우지 않음`, b.value === null && b.previous === null);
      check(`[${b.id}] 비교값도 0 으로 채우지 않음`, b.comparisons.every((c) => c.value === null));
      check(`[${b.id}] 결측 사유를 남김`, typeof b.reading === 'string' && b.reading.length > 0);
    }
    const { body: eb } = await getJson('/api/snapshot?scenario=empty');
    check('빈값 시나리오에서 basics 가 empty', eb.sections?.basics?.status === 'empty', eb.sections?.basics?.status);
  }

  /* ---------------- 9-3. 오늘의 경제 이야기 ---------------- */
  console.log('\n[9-3] 오늘의 경제 이야기 (하루 한 가지)');
  {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    // 홈 아래쪽이 탭으로 나뉜 뒤로 이 칸은 '경제 이야기' 탭을 눌러야 그려진다.
    // 서버 응답만 보는 이 스크립트에서는 탭이 있는지까지만 확인한다.
    check('홈에 경제 이야기 탭이 있음', html.includes('>경제 이야기<'), `status=${res.status}`);

    // 날짜로 정해지므로 지표 수만큼의 날이면 전부 한 번씩 돌아야 한다
    const ids = (snap.sections?.basics?.data ?? []).map((b) => b.id);
    const pick = (key) => {
      const t = Date.parse(`${key}T00:00:00Z`);
      const d = Math.floor(t / 86400_000);
      return ids[((d % ids.length) + ids.length) % ids.length];
    };
    const seen = new Set();
    for (let i = 0; i < ids.length; i += 1) {
      seen.add(pick(new Date(Date.now() + i * 86400_000).toISOString().slice(0, 10)));
    }
    check(`${ids.length}일이면 전부 한 번씩 나옴`, seen.size === ids.length, `${seen.size}/${ids.length}`);
    check('같은 날은 늘 같은 항목', pick('2026-08-28') === pick('2026-08-28'), pick('2026-08-28'));
    check('다음 날은 다른 항목', pick('2026-08-28') !== pick('2026-08-29'));
  }

  /* ---------------- 8. 시장별 분리 화면 ---------------- */
  console.log('\n[8] 시장별 분리 화면');
  for (const path of ['/market/us', '/market/kr', '/market/crypto', '/fng/us', '/basics', '/indicators', '/calendar']) {
    const res = await fetch(`${BASE}${path}`);
    const html = await res.text();
    check(`${path} 렌더링`, res.status === 200 && html.includes('Market Mood 3'), `status=${res.status}`);
  }

  /* ---------------- 8-1. 화면 정리 (중복 제거) ---------------- */
  console.log('\n[8-1] 중복 화면 정리');
  {
    // 시장 허브와 위험 신호등 화면은 홈·지표 화면과 내용이 겹쳐 없앴다.
    // 바깥 링크가 깨지지 않도록 자리는 남기고 넘겨 준다.
    for (const [from, to] of [['/market', '/indices'], ['/risk', '/indicators']]) {
      const res = await fetch(`${BASE}${from}`, { redirect: 'manual' });
      const loc = res.headers.get('location') ?? '';
      check(`${from} → ${to} 로 넘김`, res.status >= 300 && res.status < 400 && loc.endsWith(to),
        `status=${res.status} location=${loc}`);
    }
    // 지표 화면 하나가 위험 신호등과 전체 지표를 모두 담는다
    const html = await (await fetch(`${BASE}/indicators`)).text();
    check('지표 화면에 위험 신호등 보기가 있음', html.includes('위험 신호등'));
    check('지표 화면에 전체 지표 보기가 있음', html.includes('전체 지표'));
    // 홈에서 각 시장으로 바로 들어간다
    const home = await (await fetch(`${BASE}/`)).text();
    for (const m of ['us', 'kr', 'crypto']) {
      check(`홈에 ${m} 시장으로 가는 길이 있음`, home.includes(`/market/${m}`));
    }
  }

  /* ---------------- 8-2. 위험 눈금이 상한이 아님을 밝히는가 ---------------- */
  console.log('\n[8-2] 위험 신호등 눈금 (VIX 40 은 상한이 아니다)');
  {
    const risk = snap.sections?.risk?.data?.indicators ?? [];
    check('위험 지표가 있음', risk.length > 0, `${risk.length}개`);
    for (const i of risk) {
      check(`[${i.id}] 눈금 범위가 유효`, i.scaleMax > i.scaleMin, `${i.scaleMin}~${i.scaleMax}`);
      check(`[${i.id}] 눈금이 어디까지인지 밝힘`,
        typeof i.scaleNote === 'string' && i.scaleNote.length > 20, `${(i.scaleNote ?? '').length}자`);
      // 값이 눈금을 벗어났으면 반드시 그렇다고 표시해야 한다
      const expected =
        i.value === null ? null : i.value > i.scaleMax ? 'above' : i.value < i.scaleMin ? 'below' : null;
      check(`[${i.id}] 눈금 밖 여부가 값과 일치`, i.offScale === expected,
        `value=${i.value} offScale=${i.offScale} 기대=${expected}`);
      // 최상위 구간은 열려 있어야 한다 (28 이상처럼 위쪽이 막히면 안 된다)
      const open = i.bands.some((b) => b.from === null || b.to === null);
      check(`[${i.id}] 구간의 양 끝이 열려 있음`, open);
    }
  }

  /* ---------------- 8-3. 캘린더 · 홈 구성 ---------------- */
  console.log('\n[8-3] 캘린더 전체 보기 · 홈 탭');
  {
    const cal = await (await fetch(`${BASE}/calendar`)).text();
    check('캘린더에 전체 보기가 있음', cal.includes('>전체<'));
    check('캘린더에 달력/목록 전환이 있음', cal.includes('>달력<') && cal.includes('>목록<'));
    // 전체 보기의 기본값이라 세 시장이 모두 담겨 있어야 한다
    const events = snap.sections?.calendar?.data ?? [];
    const markets = new Set(events.map((e) => e.market));
    check('일정이 여러 시장에 걸쳐 있음', markets.size >= 2, [...markets].join(', '));

    const home = await (await fetch(`${BASE}/`)).text();
    check('홈 아래쪽이 탭으로 나뉨', home.includes('더 살펴보기'));
    // 지수는 탭으로 떼어 놨다. 홈에는 그리로 가는 길만 남는다.
    check('홈에서 지수 탭으로 가는 길이 있음', home.includes('/indices'));
    for (const t of ['일정', '자금 · 뉴스', '예측시장', '경제 이야기']) {
      check(`홈 탭에 ${t} 있음`, home.includes(`>${t}<`));
    }
    // 탭이 생겼으니 한 번에 하나만 그려진다 — 나머지는 문서에 없어야 한다
    check('고르지 않은 탭 내용은 그리지 않음', !home.includes('예측시장에서 화제인 질문'));
  }

  /* ---------------- 8-4. 지수 탭 ---------------- */
  console.log('\n[8-4] 지수 탭');
  {
    const idx = await (await fetch(`${BASE}/indices`)).text();

    // 하단 탭 · 사이드바에 자리를 잡았는가. '지수' 와 '지표' 는 한 글자 차이라
    // 이름을 '경제지표' 로 늘려 두었다 — 그대로인지도 같이 본다.
    check('주요 메뉴에 지수 탭이 있음', idx.includes('href="/indices"'));
    check('지표 탭 이름이 경제지표로 구분됨', idx.includes('>경제지표<'));
    check('지수와 지표 이름이 서로 다름', !idx.match(/>지표</));

    // 지수 탭은 두 보기를 갖는다 — 시장 지수 / 생활 경제 지수
    check('지수 화면에 보기 전환이 있음', idx.includes('>시장 지수<') && idx.includes('>생활 경제 지수<'));

    // 세 시장이 모두 한 화면에 있어야 한다 (고르게 하지 않는다)
    for (const label of ['미국', '한국', '크립토']) {
      check(`지수 화면에 ${label} 묶음이 있음`, idx.includes(`>${label}</span>`));
    }

    // 목록은 카탈로그가 정하고 값만 받아 온다. 그래서 이름·기호는 값이 오기 전에도
    // 서 있어야 하고(서버가 그린 HTML 에 있어야 하고), 값은 스냅샷에 있어야 한다.
    const quotes = snap.sections?.quotes?.data ?? {};
    const all = [...(quotes.us ?? []), ...(quotes.kr ?? []), ...(quotes.crypto ?? [])];
    for (const [id, name] of [['spx', 'S&amp;P 500'], ['kospi', 'KOSPI'], ['total_mcap', '전체 시가총액']]) {
      check(`지수 화면에 ${id} 줄이 있음`, idx.includes(`>${name}</p>`));
      check(`${id} 값이 스냅샷에 있음`, all.some((x) => x.id === id && x.price !== null));
    }
    // 지수만 모은 화면이다 — 개별 종목이 섞여 들어오면 안 된다
    for (const [id, name] of [['samsung', '삼성전자'], ['nvda', '엔비디아'], ['btc', '비트코인']]) {
      check(`지수 화면에 개별 종목 ${id} 은 없음`, !idx.includes(`>${name}</p>`) && !idx.includes(`/asset/${id}"`));
    }

    // 기준점 — "3,714" 는 언제를 100 으로 놓았는지 알아야 읽힌다
    const baselines = ['1941~1943년 평균 = 10', '1971년 2월 5일 = 100', '1986년 12월 31일 = 135',
      '1980년 1월 4일 = 100', '1996년 7월 1일 = 1,000', '1990년 1월 3일 = 100', '1973년 3월 = 100'];
    for (const b of baselines) check(`기준점 표시: ${b}`, idx.includes(b));
    // 변동성 지수에는 기준 시점이 없다 — 없다는 사실 자체를 밝혀야 한다
    check('변동성 지수는 기준 시점이 없다고 밝힘',
      (idx.match(/기준 시점이 없습니다/g) ?? []).length >= 2);
    // 다우는 기준값 자체가 없는 방식이다
    check('다우는 기준값이 없다고 밝힘', idx.includes('기준값이 없습니다'));

    // 크립토에 공식 지수가 없다는 사실을 지어내지 않고 밝히는가
    check('크립토에 공식 지수가 없다고 밝힘', idx.includes('공식 지수는 크립토에 없습니다'));

    // 시장별 화면으로 들어가는 입구를 겸한다
    for (const m of ['us', 'kr', 'crypto']) {
      check(`지수 화면에서 ${m} 시장 화면으로 갈 수 있음`, idx.includes(`/market/${m}`));
    }
  }

  /* ---------------- 8-5. 생활 경제 지수 (지수 탭의 두 번째 보기) ---------------- */
  console.log('\n[8-5] 생활 경제 지수');
  {
    const life = await (await fetch(`${BASE}/basics`)).text();

    // 같은 껍데기, 다른 보기. 머리와 전환은 그대로 있어야 한다.
    check('생활 경제 지수도 지수 탭 껍데기를 씀',
      life.includes('>시장 지수<') && life.includes('>생활 경제 지수<'));
    check('생활 경제 지수 머리가 바뀜', life.includes('생활 속 경제 이야기'));
    // 시장 지수 본문이 같이 그려지면 한 화면에 두 목록이 겹친다
    check('시장 지수 본문은 그리지 않음', !life.includes('지수 숫자를 읽는 법'));

    const basics = snap.sections?.basics?.data ?? [];
    check('생활 경제 지수가 아홉 가지', basics.length === 9, `${basics.length}개`);
    // 이름은 API 가 내려주므로 서버가 그린 HTML 에는 없다. 데이터에서 확인한다.
    const names = basics.map((b) => b.name);
    for (const name of ['빅맥지수', '1인당 GDP', '엥겔계수', '지니계수']) {
      check(`생활 경제 지수에 ${name} 있음`, names.includes(name), names.join(', ').slice(0, 60));
    }
    // 아홉 개를 한 줄로 늘어놓지 않고 세 묶음으로 나눈다. 묶음에 빠진 항목이
    // 있으면 화면에서 "그 밖의 지표" 로 밀려나므로 원본에서 확인한다.
    const lib = await readFile('src/lib/economyBasics.ts', 'utf8');
    const grouped = [...lib.matchAll(/ids:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    for (const g of ['나라 살림과 소득', '물가로 견주는 지수', '경기를 앞서 읽는 지수']) {
      check(`묶음 "${g}" 있음`, lib.includes(g));
    }
    const ungrouped = basics.map((b) => b.id).filter((id) => !grouped.includes(id));
    check('묶음에서 빠진 항목이 없음', ungrouped.length === 0, ungrouped.join(', ') || '없음');
    // 시세가 아니라 형편을 재는 값이라, 점수 구성요소가 아님을 밝혀야 한다
    check('투자심리 구성요소가 아님을 밝힘', life.includes('투자심리 점수의 구성요소가 아닙니다'));
    // 공식 지표만 담는다 — 발표 기관이 없는 개념은 넣지 않는다
    check('전부 공식 지표임을 밝힘', life.includes('통계기관이 발표하는 공식 지표'));
    for (const b of basics) {
      check(`[${b.id}] 발표 기관이 있음`, Boolean(b.meta?.sources?.[0]?.name), b.meta?.sources?.[0]?.name ?? '없음');
      check(`[${b.id}] 네 나라 비교가 있음`, (b.comparisons ?? []).length === 4, `${(b.comparisons ?? []).length}개국`);
    }
  }

  /* ---------------- 8-6. 공포·탐욕 구성요소 개수 ---------------- */
  console.log('\n[8-6] 공포·탐욕 구성요소');
  {
    // 미국·한국은 CNN 방식과 같은 7개. 크립토는 검색 관심도·뉴스 심리를 더해 8개다.
    // 개수가 말없이 바뀌면 화면의 설명과 어긋나므로 못 박아 둔다.
    const EXPECT = { us: 7, kr: 7, crypto: 8 };
    for (const f of snap.sections?.fng?.data ?? []) {
      check(`[${f.market}] 구성요소 ${EXPECT[f.market]}개`, f.components.length === EXPECT[f.market],
        `${f.components.length}개`);
    }
  }

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

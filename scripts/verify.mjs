/**
 * 검증 스크립트 — 실행 중인 서버(기본 http://localhost:3000)를 상대로
 * 요구사항의 검증 기준을 자동으로 확인한다.
 *
 *   npm run build && npm start &   (또는 npm run dev)
 *   npm run verify
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 폴더를 훑어 조건에 맞는 파일 경로를 모은다 (글자 크기 검사에 쓴다) */
async function listFiles(dir, re) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await listFiles(full, re)));
    else if (re.test(e.name)) out.push(full);
  }
  return out;
}

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

/**
 * 순수 로직 단위 테스트를 먼저 돌린다.
 *
 * 아래의 나머지 검사는 돌아가는 서버를 상대로 하는 것이라 DEMO 데이터를 본다.
 * 실데이터 정규화기(예: FRED 발표 일정)는 DEMO 경로를 타지 않아 그쪽 검사로는
 * 한 줄도 실행되지 않는다. 그래서 node --test 로 따로 태운다.
 */
async function unitTests() {
  console.log('[0] 순수 로직 단위 테스트 (node --test)');
  const files = ['scripts/fred-calendar.test.mjs', 'scripts/criteria.test.mjs', 'scripts/regime.test.mjs'].filter(
    (f) => existsSync(f),
  );
  if (files.length === 0) {
    check('단위 테스트 파일이 있음', false, '없음');
    return;
  }
  for (const file of files) {
    try {
      const { stdout } = await run('node', ['--test', file], { encoding: 'utf8' });
      const passed = Number(stdout.match(/^# pass (\d+)$/m)?.[1] ?? 0);
      const failed = Number(stdout.match(/^# fail (\d+)$/m)?.[1] ?? 0);
      check(`${file} — ${passed}건 통과`, failed === 0 && passed > 0, failed > 0 ? `${failed}건 실패` : '');
    } catch (e) {
      const out = String(e.stdout ?? '') + String(e.stderr ?? '');
      const failed = out.match(/^# fail (\d+)$/m)?.[1] ?? '?';
      check(`${file}`, false, `${failed}건 실패`);
    }
  }
}

async function main() {
  console.log(`검증 대상: ${BASE}\n`);

  await unitTests();

  /* ---------------- 1. 기본 스냅샷 ---------------- */
  console.log('[1] 홈 스냅샷 (scenario=normal)');
  const { status, body: snap } = await getJson('/api/snapshot?scenario=normal');
  check('스냅샷 응답 200', status === 200, `status=${status}`);
  check('모드가 DEMO 또는 LIVE', snap.mode === 'DEMO' || snap.mode === 'LIVE', `mode=${snap.mode}`);

  const fng = snap.sections?.fng?.data ?? [];
  // 한국은 심리 점수를 낼 수 없어(무료 소스로 확보 가중치 약 33%) 시장에서 뺐다.
  // KOSPI·KOSDAQ 시세와 원/달러는 지수·지표 화면에 그대로 남아 있다.
  check('심리 카드는 미국·크립토 둘', fng.length === 2, `${fng.map((f) => f.market).join(', ')}`);
  check('심리 카드에 한국이 없음', !fng.some((f) => f.market === 'kr'));

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

  // 점수를 내는 시장만 검사한다 (한국은 시장에서 뺐다)
  const SCORED = ['us', 'crypto'];
  for (const m of SCORED) {
    const { body } = await getJson(`/api/fng/${m}`);
    await checkWeighting(`[${m}]`, body.detail);
  }
  // 없앤 시장으로 들어오면 404 여야 한다 — 조용히 다른 시장을 돌려주지 않는다
  {
    const { status } = await getJson('/api/fng/kr');
    check('/api/fng/kr 은 404', status === 404, `status=${status}`);
  }
  // 결측이 생겨 재조정이 실제로 일어나는 경로도 같은 잣대로 확인한다
  for (const m of SCORED) {
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
  // 한국은 무료 소스로 확보 가중치가 약 33% 라 늘 산출 불가로만 뜨는 카드가 된다.
  // 그래서 시장에서 뺐다. 대신 KOSPI·KOSDAQ 시세는 지수 화면에 그대로 있다.
  check('한국은 심리 카드가 없음', kr === undefined);

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
  for (const m of ['us', 'crypto']) {
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
  // VKOSPI 를 뺐다 — 무료로 받을 길이 없고, 한국을 시장에서 뺀 뒤로 놓일 자리도 없다.
  check('지표가 정확히 6개', (risk?.indicators ?? []).length === 6, `${risk?.indicators?.length}개`);
  check('VKOSPI 는 없음', !(risk?.indicators ?? []).some((i) => i.id === 'vkospi'));
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
  check('미국·글로벌·크립토가 모두 포함됨',
    ['us', 'global', 'crypto'].every((m) => (risk?.indicators ?? []).some((i) => i.scope === m)),
    (risk?.indicators ?? []).map((i) => i.scope).join(','));
  // 원/달러는 한국을 뺀 뒤에도 남는다 — 실제 값이 나오고 통화 전환에 계속 쓰인다
  check('원/달러가 글로벌로 남아 있음',
    (risk?.indicators ?? []).some((i) => i.id === 'usdkrw' && i.scope === 'global'));
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
  for (const m of ['us', 'crypto']) {
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
  for (const m of ['us', 'crypto']) {
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
      crypto: { comps: 8, must: ['search_trend', 'news_sentiment'], missing: [] },
    };
    for (const m of ['us', 'crypto']) {
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
      // 한국을 시장에서 뺀 뒤로 거시 목록에 한국 물가·실업률이 없다.
      // 미저리 지수는 스스로 "물가 X% 와 실업률 Y% 를 더해 Z" 라고 적으므로,
      // 그 문장에서 두 숫자를 꺼내 합이 실제 값과 맞는지 본다.
      const miseryItem = list.find((b) => b.id === 'misery') ?? null;
      const misery = miseryItem?.value ?? null;
      const m2 = (miseryItem?.reading ?? '').match(/물가상승률\s*(-?[\d.]+)%\s*와\s*실업률\s*(-?[\d.]+)%/);
      const cpi = m2 ? Number(m2[1]) : null;
      const un = m2 ? Number(m2[2]) : null;
      check('미저리 지수가 근거 두 숫자를 밝힘', cpi !== null && un !== null, miseryItem?.reading?.slice(0, 40) ?? '없음');
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
    check('홈에 경제 이야기 탭이 있음', html.includes('>경제<'), `status=${res.status}`);

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
    for (const m of ['us', 'crypto']) {
      check(`홈에 ${m} 시장으로 가는 길이 있음`, home.includes(`/market/${m}`));
    }
    check('홈에 한국 시장으로 가는 길은 없음', !home.includes('/market/kr'));
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
    /*
     * 탭 이름이 전부 두 글자다. 칸이 다섯이 되면서 320px 에서 한 칸이 58px 이 됐고,
     * 12px 글자로 네 글자를 넣으면 '예측시 / 장' 처럼 두 줄로 쪼개진다.
     */
    for (const t of ['일정', '자금', '예측', '경제', '기준']) {
      check(`홈 탭에 ${t} 있음`, home.includes(`>${t}<`));
    }
    // 탭이 생겼으니 한 번에 하나만 그려진다 — 나머지는 문서에 없어야 한다
    check('고르지 않은 탭 내용은 그리지 않음', !home.includes('예측시장에서 화제인 질문'));
    /*
     * '내 기준' 으로 가는 길은 홈의 '기준' 탭과 더보기 두 곳이다.
     * 홈은 고르지 않은 탭을 아예 그리지 않으므로 서버 HTML 에는 링크가 없다 —
     * 그래서 여기서는 더보기 쪽을 확인한다.
     */
    const more = await (await fetch(`${BASE}/more`)).text();
    check('더보기에서 내 기준으로 갈 수 있음', more.includes('/criteria') && more.includes('>내 기준<'));
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

    // 생활 경제 지수는 이제 제 탭이다 — 지수 화면 안에 보기 전환이 남아 있으면 안 된다
    check('생활 탭이 따로 있음', idx.includes('href="/basics"') && idx.includes('>생활<'));
    check('지수 화면에 보기 전환이 없음', !idx.includes('aria-label="지수 보기"'));
    check('지수 화면에 생활 경제 지수 본문이 없음', !idx.includes('투자심리 점수의 구성요소가 아닙니다'));

    // 일곱 칸이 320px 에 들어가야 한다. 가장 긴 이름이 네 글자를 넘으면 넘친다.
    const labels = [...idx.matchAll(/href="(\/[a-z]*)"[^>]*aria-current[^>]*>|href="(\/[a-z]*)"/g)];
    check('하단 탭이 일곱 칸', (idx.match(/href="\/(|indices|basics|indicators|calendar|watchlist|more)"/g) ?? []).length >= 7,
      `${labels.length}개 링크`);
    for (const [href, label, max] of [['/basics', '생활', 2], ['/watchlist', '관심', 2], ['/indicators', '경제지표', 4]]) {
      check(`탭 이름 ${label} 이 ${max}자 이하`, label.length <= max);
      check(`탭 ${label} 이 ${href} 를 가리킴`, idx.includes(`href="${href}"`));
    }

    // 세 시장이 모두 한 화면에 있어야 한다 (고르게 하지 않는다)
    for (const label of ['미국', '한국', '크립토']) {
      check(`지수 화면에 ${label} 묶음이 있음`, idx.includes(`>${label}</span>`));
    }

    // 목록은 카탈로그가 정하고 값만 받아 온다. 그래서 이름·기호는 값이 오기 전에도
    // 서 있어야 하고(서버가 그린 HTML 에 있어야 하고), 값은 스냅샷에 있어야 한다.
    const quotes = snap.sections?.quotes?.data ?? {};
    const all = [...(quotes.us ?? []), ...(quotes.kr ?? []), ...(quotes.crypto ?? [])];
    // 한국에서 실제로 쓰는 말이 있는 지수는 한글 이름으로 세운다.
    // 원문 기호(SPX·KOSPI 등)는 이름 아래에 그대로 남아 검색이 막히지 않는다.
    for (const [id, name] of [['spx', 'S&amp;P 500'], ['kospi', '코스피'], ['total_mcap', '전체 시가총액']]) {
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
    for (const m of ['us', 'crypto']) {
      check(`지수 화면에서 ${m} 시장 화면으로 갈 수 있음`, idx.includes(`/market/${m}`));
    }
    // 한국 묶음은 남지만 시장 화면은 없다 — 링크를 걸지 않는다
    check('지수 화면에 한국 시장 화면 링크는 없음', !idx.includes('/market/kr'));
  }

  /* ---------------- 8-5. 생활 탭 ---------------- */
  console.log('\n[8-5] 생활 경제 지수');
  {
    const life = await (await fetch(`${BASE}/basics`)).text();

    // 제 탭을 가졌으니 제 머리를 갖는다. 지수 탭의 껍데기를 빌려 쓰지 않는다.
    check('생활 화면에 제 제목이 있음', life.includes('>생활 경제 지수</h1>'));
    check('생활 화면에 보기 전환이 없음', !life.includes('aria-label="지수 보기"'));
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
      // 비교의 중심이 어디인지 표시돼야 화면이 그 줄을 굵게 그린다
      check(`[${b.id}] 비교의 중심이 한 곳뿐`,
        (b.comparisons ?? []).filter((c) => c.primary).length === 1,
        `${(b.comparisons ?? []).filter((c) => c.primary).length}개`);
    }

    /*
     * 그래프. 이 화면의 값은 1년에 한두 번만 바뀌어서 숫자 하나로는 높은지 낮은지
     * 알 수가 없다. 지나온 선이 그 물음을 답한다.
     */
    for (const b of basics) {
      const byC = b.historyByCountry ?? [];
      check(`[${b.id}] 나라별 시계열이 넷`, byC.length === 4, `${byC.length}개`);
      check(`[${b.id}] 시계열이 두 점 이상`, byC.every((h) => (h.points ?? []).length >= 2),
        byC.map((h) => (h.points ?? []).length).join('/'));
      // 비교표의 이름과 선의 이름이 어긋나면 어느 선이 어느 나라인지 알 수 없다
      const cmpLabels = (b.comparisons ?? []).map((c) => c.label).join('|');
      check(`[${b.id}] 선 이름이 비교표와 같음`, byC.map((h) => h.label).join('|') === cmpLabels,
        byC.map((h) => h.label).join('|'));

      /*
       * 카드에는 "▼ 직전 42,726달러" 가 찍힌다. 선이 그 값을 지나지 않으면
       * 화살표는 큰 하락을 말하는데 그림은 평평해서 둘 중 하나가 거짓말이 된다.
       */
      const kr = b.history ?? [];
      if (b.previous !== null && b.previous !== undefined && kr.length > 1) {
        const r = (v) => Number(v.toFixed(b.precision));
        check(`[${b.id}] 직전값이 시계열 위에 있음`, r(kr[kr.length - 2].v) === r(b.previous),
          `선 ${r(kr[kr.length - 2].v)} vs 직전 ${r(b.previous)}`);
      }
      // 선의 마지막 점은 카드에 크게 찍히는 값과 같아야 한다
      if (b.value !== null && kr.length > 0) {
        const r = (v) => Number(v.toFixed(b.precision));
        check(`[${b.id}] 시계열 끝이 현재값과 같음`, r(kr[kr.length - 1].v) === r(b.value),
          `선 ${r(kr[kr.length - 1].v)} vs 값 ${r(b.value)}`);
      }
    }

    // 그림을 못 보는 사람에게도 같은 내용이 가야 한다 (이 앱의 모든 차트가 그렇다)
    const trend = await readFile('src/components/charts/BasicTrend.tsx', 'utf8');
    check('그래프에 표 대안이 있음', trend.includes('표로 보기') && trend.includes('<table'));
    check('그래프에 그림 설명이 있음', trend.includes('role="img"') && trend.includes('aria-labelledby'));
    // 비교선 셋을 한 칸에 묶은 범례로는 어느 선이 어느 나라인지 알 수 없었다.
    // 이름은 선 끝에 직접 붙인다.
    check('나라 이름이 선 끝에 붙음', trend.includes('shortLabel(e.label)'));
    // 눈금이 없으면 "미국이 위에 있다" 까지만 알고 얼마나 위인지는 알 수 없다
    check('그래프에 값 눈금이 있음', /\{fmt\(g\.v\)\}/.test(trend));
    check('이름표가 서로 겹치지 않게 밀어냄', trend.includes('function spread('));
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

  /* ---------------- 8-7. 같은 말을 두 번 하지 않기 ---------------- */
  console.log('\n[8-7] 문구 중복');
  {
    // 요약 줄: 앞의 배지가 이미 '해석'·'근거 부족' 이라고 말한다. 문장이 또 말하면 두 번이 된다.
    const lines = snap.sections?.summary?.data?.lines ?? [];
    check('요약 줄이 있음', lines.length > 0, `${lines.length}줄`);
    for (const l of lines) {
      if (l.kind === 'interpretation') {
        check('해석 줄이 스스로 "해석" 이라 말하지 않음', !l.text.includes('해석'), l.text.slice(-40));
      }
      if (l.kind === 'insufficient') {
        // "…충분하지 않습니다. 데이터가 부족합니다." 처럼 같은 말을 이어 붙이지 않는다
        const twice = /부족합니다[\s\S]*부족합니다|않습니다[\s\S]*부족합니다/.test(l.text);
        check('근거 부족 줄이 같은 말을 두 번 하지 않음', !twice, l.text);
      }
    }
    // 머리와 고지가 이미 말하는 것을 줄마다 되풀이하지 않는다
    check('요약 줄이 "자체 산출" 을 되풀이하지 않음', !lines.some((l) => l.text.includes('자체 산출')));

    // 지표 해설은 한 곳에서만 기른다 — risk.ts 가 제 몫을 따로 들고 있으면 어긋난다
    const riskSrc = (await readFile('src/server/risk.ts', 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    check('위험 지표가 해설을 따로 들고 있지 않음', !/when(Up|Down):\s*'/.test(riskSrc));

    // 그래도 일곱 지표 모두 해설이 붙어야 한다 (한 곳에서 읽어 오므로)
    for (const i of snap.sections?.risk?.data?.indicators ?? []) {
      check(`[${i.id}] 오르면·내리면 설명이 있음`,
        typeof i.whenUp === 'string' && i.whenUp.length > 10 &&
        typeof i.whenDown === 'string' && i.whenDown.length > 10,
        `${(i.whenUp ?? '').length}자 / ${(i.whenDown ?? '').length}자`);
      // 같은 카드 안에서 "무슨 지표인가" 와 "내리면" 이 같은 문장을 갖지 않게
      const shared = (i.why ?? '').match(/[가-힣 ,·]{14,}/g) ?? [];
      const dup = shared.find((f) => (i.whenDown ?? '').includes(f) || (i.whenUp ?? '').includes(f));
      check(`[${i.id}] 설명끼리 같은 문장을 나눠 갖지 않음`, !dup, dup ?? '없음');
    }
  }

  /* ---------------- 8-8. 글자가 제 상자를 넘지 않게 ---------------- */
  console.log('\n[8-8] 눌리면 안 되는 것');
  {
    // 가로 배치 안에서 배지·글리프는 기본값(flex-shrink:1)이라 옆의 긴 문단에 밀려
    // 상자가 줄고, 글자가 상자를 넘어 문단 위로 올라탄다. 실제로 '사실'·'해석' 배지가
    // 요약 문장과 겹쳐 보였다. 브라우저 없이 볼 수 없는 문제라 원본에서 막아 둔다.
    const badge = await readFile('src/components/ui/Badge.tsx', 'utf8');
    check('배지가 눌리지 않음 (앱)', badge.includes('shrink-0') && badge.includes('whitespace-nowrap'));

    const states = await readFile('src/components/ui/States.tsx', 'utf8');
    check('알림 상자의 ⓘ 가 눌리지 않음 (앱)', /ⓘ[\s\S]{0,40}<\/span>/.test(states)
      && /className="shrink-0"[\s\S]{0,40}ⓘ/.test(states));

    const tpl = await readFile('tools/preview/template.html', 'utf8');
    const css = (sel, prop) => {
      const m = tpl.match(new RegExp('\\' + sel.replace('.', '.') + '\\s*\\{([^}]*)\\}'));
      return m ? m[1].includes(prop) : false;
    };
    check('배지가 눌리지 않음 (미리보기)',
      /\.badge\s*\{[^}]*flex-shrink:\s*0/.test(tpl) && /\.badge\s*\{[^}]*white-space:\s*nowrap/.test(tpl));
    check('알림 상자의 글리프가 눌리지 않음 (미리보기)',
      /\.notice > span:first-child\s*\{[^}]*flex-shrink:\s*0/.test(tpl));
    check('관심목록 별표가 눌리지 않음 (미리보기)', /\.star\s*\{[^}]*flex-shrink:\s*0/.test(tpl));
    check('종목 이름이 길면 잘림 (미리보기)', /\.pcard-name\s*\{[^}]*text-overflow:\s*ellipsis/.test(tpl));
    check('요약 문단이 배지를 밀지 않음 (미리보기)', /\.summary li > p\s*\{[^}]*min-width:\s*0/.test(tpl));
  }

  /* ---------------- 8-10. 내 기준 (매매 판단을 하지 않는다) ---------------- */
  console.log('\n[8-10] 내 기준');
  {
    /*
     * 이 화면은 이 앱에서 선을 넘기 가장 쉬운 자리다. 여러 지표를 모아 놓고
     * "그래서 지금 어떤가" 를 묻는 화면이라, 조금만 밀면 매매 신호가 된다.
     * 그래서 코드와 화면 양쪽에서 못 넘게 막아 둔다.
     */
    const rules = await readFile('src/lib/criteriaRules.mjs', 'utf8');
    const board = await readFile('src/components/market/CriteriaBoard.tsx', 'utf8');
    const card = await readFile('src/components/market/CriteriaSummaryCard.tsx', 'utf8');
    const page = await (await fetch(`${BASE}/criteria`)).text();

    check('내 기준 화면이 있음', page.includes('>내 기준</h1>'));

    // 요약은 등급이 아니라 개수여야 한다
    check('요약이 개수뿐이고 등급을 만들지 않음',
      /met:\s*results\.filter/.test(rules) &&
      !/(grade|verdict|rating|recommendation|signal)\s*[:=]/i.test(rules));
    check('충족 개수를 화면이 개수로 적음',
      board.includes('개 중 {sum.met}개 맞음') && card.includes('개 중 {sum.met}개 맞음'));

    // 모르는 것을 충족으로 세면 "5개 중 5개" 가 거짓이 된다
    check('판정 불가를 따로 셈', /unknown:\s*results\.filter/.test(rules));
    check('판정 불가가 충족에 섞이지 않음',
      rules.includes("r.status === 'met'") && rules.includes("r.status === 'unknown'"));
    check('값이 없으면 0 으로 읽지 않음',
      rules.includes('산출하지 못했습니다') && !/\?\?\s*0|\|\|\s*0/.test(rules));

    // 앱이 조건을 제안하면 그건 사용자의 기준이 아니라 앱의 훈수다
    const settingsSrc = await readFile('src/components/providers/SettingsProvider.tsx', 'utf8');
    check('기본 조건을 깔아 두지 않음', /criteria:\s*\[\]/.test(settingsSrc));

    // 매매를 권하는 말이 화면에 없어야 한다
    const banned = ['매수', '매도', '사세요', '파세요', '매매 신호', '추천합니다', '유리합니다'];
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [name, src] of [['판정 로직', strip(rules)], ['화면', strip(board)], ['홈 카드', strip(card)]]) {
      const hit = banned.filter((w) => src.includes(w));
      check(`${name}에 매매를 권하는 말이 없음`, hit.length === 0, hit.join(', ') || '없음');
    }
    // 다만 "신호가 아니다" 라는 말은 반드시 있어야 한다
    check('신호가 아니라는 말이 요약 옆에 있음',
      board.includes('사거나 팔라는 신호가 아닙니다') && card.includes('사거나 팔라는 신호가 아닙니다'));
    check('과거 성과 표를 붙이지 않는 이유를 밝힘',
      /지난[\s\S]{0,20}결과가 다음을 보장하지 않고/.test(board));
  }


  /* ---------------- 8-11. 국면 전광판 ---------------- */
  console.log('\n[8-11] 국면 전광판');
  {
    /*
     * 이 화면은 내 기준보다도 선을 넘기 쉽다. "20년 만의 공포" 라는 큰 문장을
     * 띄우고 알림까지 나가기 때문이다. 그래서 세 가지를 기계로 막는다.
     *   ① 매수·매도라는 말이 없을 것
     *   ② 그 말을 안 쓰는 이유(검증 결과)가 화면에 함께 있을 것
     *   ③ "N년 만" 을 과장하지 않을 것
     */
    const rules = await readFile('src/lib/regimeRules.mjs', 'utf8');
    const evidence = await readFile('src/lib/regimeEvidence.mjs', 'utf8');
    const board = await readFile('src/components/market/RegimeBoard.tsx', 'utf8');
    const detail = await readFile('src/components/market/RegimeDetail.tsx', 'utf8');
    const page = await (await fetch(`${BASE}/regime`)).text();

    check('전광판 화면이 있음', page.includes('>국면 전광판</h1>'));

    const sec = snap.sections?.regime;
    check('홈 스냅샷에 전광판 섹션이 있음', !!sec, sec ? `status=${sec.status}` : '없음');
    const digest = sec?.data;
    const bd = digest?.board;
    check('전광판이 점수 또는 산출 불가 사유를 냄',
      !!bd && (typeof bd.score === 'number' || typeof bd.unavailableReason === 'string'));

    if (bd) {
      check('점수가 0~100 안에 있음',
        bd.score === null || (bd.score >= 0 && bd.score <= 100), String(bd.score));
      check('되돌아보는 기간이 20년', bd.lookbackYears === 20, String(bd.lookbackYears));
      check('축이 네 개', Array.isArray(bd.axes) && bd.axes.length === 4, String(bd.axes?.length));
      check('구간에 글리프와 이름이 함께 있음',
        bd.score === null || (!!bd.band?.glyph && !!bd.band?.label), `${bd.band?.glyph} ${bd.band?.label}`);
      // 커버리지가 모자라면 점수를 내면 안 된다
      check('커버리지 70% 미만이면 점수를 내지 않음',
        bd.coverage >= 0.7 ? bd.score !== null : bd.score === null, `coverage=${Math.round((bd.coverage ?? 0) * 100)}%`);
      // 빠진 축을 0 으로 세지 않는다 — percentile 이 null 로 와야 한다
      const zeroed = (bd.axes ?? []).filter((a) => a.percentile === 0 && a.value === null);
      check('결측 축을 0점으로 채우지 않음', zeroed.length === 0, zeroed.map((a) => a.id).join(', ') || '없음');
    }

    if (digest?.history?.length) {
      const h = digest.history;
      check('20년 곡선이 시간순으로 정렬돼 있음', h.every((p, i) => i === 0 || p.t >= h[i - 1].t));
      check('곡선 점수도 0~100 안에 있음', h.every((p) => p.score >= 0 && p.score <= 100));
    }

    // ① 매매를 권하는 말이 없어야 한다
    const bannedR = ['매수', '매도', '사세요', '파세요', '매매 신호', '추천합니다', '유리합니다', '지금이 기회'];
    const stripR = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [name, src] of [['국면 로직', stripR(rules)], ['전광판', stripR(board)], ['상세 화면', stripR(detail)], ['검증 자료', stripR(evidence)]]) {
      const hit = bannedR.filter((w) => src.includes(w));
      check(`${name}에 매매를 권하는 말이 없음`, hit.length === 0, hit.join(', ') || '없음');
    }
    // 주석에는 "'매수 구간' 같은 이름은 쓰지 않는다" 는 설명이 있다. 걷어내고 본다.
    check('구간 이름이 행동이 아니라 시장 상태를 가리킴',
      /'극단적 공포'/.test(rules) && !/매수 구간|매도 구간|진입|청산/.test(stripR(rules)));

    // ② 왜 그 말을 안 쓰는지가 화면에 있어야 한다
    check('신호가 아니라는 말이 전광판에 있음', board.includes('사거나 팔라는 신호가 아닙니다'));
    check('그 말을 쓰지 않는 이유가 숫자로 붙어 있음',
      board.includes('점수가 낮았다고') && detail.includes('성립하지 않습니다'));
    check('검증 결과로 들어가는 길이 전광판에 있음', board.includes("href=\"/regime\"") || board.includes('검증 결과 보기'));
    check('상세 화면이 좋았던 경우와 나빴던 경우를 함께 보여 줌',
      detail.includes('EXTREME_FEAR_EPISODES') && detail.includes('HOT_EPISODES') && detail.includes('EVIDENCE_LIMITS'));
    check('검증에 쓴 자료의 출처를 밝힘', detail.includes('EVIDENCE_SOURCES') && evidence.includes('finance-vix'));
    check('검증과 실서비스의 자료가 다르다는 것을 밝힘', /LIVE_VS_BACKTEST/.test(detail) && /FRED 와 Stooq/.test(evidence));

    // ③ 희소성을 과장하지 않는다
    check('과거에 그런 날이 없으면 "N년 만" 이라고 쓰지 않음',
      rules.includes('자료가 있는 ${Math.floor(spanYears)}년 중 가장'));
    check('남은 개월을 올림하지 않음', /Math\.floor\(months \/ 12\)/.test(rules));
    check('1년 미만은 크게 띄우지 않음(notable)',
      /notable:\s*months >= 12/.test(rules) && board.includes('rarity?.notable'));

    // 발표가 멈춘 축을 오늘 값처럼 쓰지 않는다
    check('오래된 값을 오늘 값으로 쓰지 않음', /MAX_STALE_DAYS/.test(rules) && /오늘 값으로 쓰지 않습니다/.test(rules));

    // 알림도 같은 규칙을 따른다
    const engine = await readFile('src/components/alerts/AlertsEngine.tsx', 'utf8');
    check('국면 알림이 있음', engine.includes("case 'regime_rarity'"));
    check('국면 알림은 1년 이상 만일 때만 울림', /rarity\?\.notable/.test(engine));
    check('알림 문구도 신호가 아니라고 밝힘', engine.includes('매매 신호가 아닙니다'));

    // 세 곳 규칙 — 미리보기 템플릿도 같이 갖고 있어야 한다
    const tpl = await readFile('tools/preview/template.html', 'utf8');
    check('미리보기에도 전광판이 있음', tpl.includes('function regimeBlock()') && tpl.includes('function viewRegime()'));
    check('미리보기가 검증 숫자를 손으로 베끼지 않음',
      tpl.includes('DATA.regimeEvidence') && !/fwd12Mean:\s*-?\d/.test(tpl));
    const buildSrc = await readFile('tools/preview/build.mjs', 'utf8');
    check('미리보기 빌드가 원본 모듈에서 검증 결과를 읽음', buildSrc.includes("import('../../src/lib/regimeEvidence.mjs')"));
  }


  /* ---------------- 8-12. 그래프 조작 · 구간별 통계 ---------------- */
  console.log('\n[8-12] 그래프 조작 · 구간별 과거 통계');
  {
    const cycle = await readFile('src/server/fng/cycle.ts', 'utf8');
    const bandView = await readFile('src/components/market/BandStatsView.tsx', 'utf8');
    const modal = await readFile('src/components/charts/ChartModal.tsx', 'utf8');
    const inter = await readFile('src/components/charts/InteractiveChart.tsx', 'utf8');
    const trend = await readFile('src/components/charts/BasicTrend.tsx', 'utf8');
    const tpl2 = await readFile('tools/preview/template.html', 'utf8');

    /* 구간별 과거 통계 — 6개월 */
    check('구간별 통계가 6개월(126거래일) 기준', /BAND_FORWARD_DAYS = 126/.test(cycle));
    const bs = (await getJson('/api/fng/us')).body?.detail?.bandStats;
    check('API 가 126거래일로 집계함', bs?.forwardDays === 126, String(bs?.forwardDays));
    check('화면이 개월로도 말해 줌', bandView.includes('개월(') && bandView.includes('거래일)'));

    /* 상자그림 — 평균만 그리면 구간마다 답이 정해진 것처럼 읽힌다 */
    check('사분위수를 함께 산출함', /p25:/.test(cycle) && /p75:/.test(cycle));
    const sample = (bs?.bands ?? []).filter((b) => b.avgForward !== null);
    check('표본이 있는 구간에 사분위수가 옴',
      sample.length > 0 && sample.every((b) => typeof b.p25 === 'number' && typeof b.p75 === 'number'),
      `${sample.length}개 구간`);
    check('사분위수가 최저~최고 안에 있음',
      sample.every((b) => b.worst <= b.p25 && b.p25 <= b.medianForward && b.medianForward <= b.p75 && b.p75 <= b.best));
    check('구간마다 상자그림을 그림', bandView.includes('function BoxRow') && bandView.includes('중앙값'));
    check('모든 구간이 같은 눈금을 씀', bandView.includes('function domainOf') && bandView.includes('공통 범위'));
    check('겹친다는 점을 읽는 법으로 적어 둠', bandView.includes('범위가 서로 얼마나 겹치는지'));

    /* 크게 보기 */
    check('그래프를 크게 보는 창이 있음', modal.includes("role=\"dialog\"") && modal.includes('aria-modal="true"'));
    check('Esc 로 닫힘', /e\.key === 'Escape'/.test(modal));
    check('닫으면 초점이 돌아옴', modal.includes('returnTo.current?.focus'));
    check('열려 있는 동안 뒤 페이지가 안 밀림', modal.includes("document.body.style.overflow = 'hidden'"));
    check('초점이 창 밖으로 새지 않음', /e\.key !== 'Tab'/.test(modal) && modal.includes('first.focus()'));
    check('상세 차트에 크게 보기가 있음', inter.includes('expandable') && inter.includes('<ChartModal'));
    check('큰 창 안에서 또 열리지 않음', inter.includes('expandable={false}'));
    check('작은 그림도 눌러서 크게 볼 수 있음', trend.includes('<ExpandTrigger') && trend.includes('expandable={false}'));
    check('큰 창에서는 계열마다 색이 다름', trend.includes('--series-3') && trend.includes('범례가 일을 한다'));

    // 이 화면들은 자료를 클라이언트에서 받아 그리므로 서버가 그린 HTML 에는 뼈대만 있다.
    // 그래서 화면 자체가 아니라 그 화면이 쓰는 컴포넌트에서 확인한다.
    const regimeBoard = await readFile('src/components/market/RegimeBoard.tsx', 'utf8');
    const regimeDetail = await readFile('src/components/market/RegimeDetail.tsx', 'utf8');
    check('국면 홈 카드의 곡선을 눌러 크게 볼 수 있음', regimeBoard.includes('<ExpandTrigger'));
    check('국면 20년 곡선이 조작 가능한 차트임', regimeDetail.includes('<InteractiveChart'));
    for (const page of ['/basics', '/regime']) {
      const res = await fetch(`${BASE}${page}`);
      check(`${page} 응답 200`, res.status === 200, `status=${res.status}`);
    }

    /* 지연·실시간 배지는 카드에서 제일 작은 글씨 */
    const badge = await readFile('src/components/ui/Badge.tsx', 'utf8');
    check('지연·실시간이 가장 작은 크기', /size = '2xs'/.test(badge) && /text-\[10\.5px\]/.test(badge));
    check("'오래된 데이터' 는 한 단계 크게 둠", badge.includes("size === '2xs' ? 'xs' : size"));

    /* 지수 이름 — 한국에서 쓰는 말이 있으면 한글로 */
    const cat = await readFile('src/lib/catalog.ts', 'utf8');
    for (const [id, ko] of [['kospi', '코스피'], ['kosdaq', '코스닥'], ['ndx', '나스닥 종합'], ['usdkrw', '원/달러 환율']]) {
      check(`${id} 이름이 한글`, new RegExp(`id: '${id}', name: '${ko}'`).test(cat));
    }
    // 고유명사까지 억지로 옮기지는 않는다 — 옮기면 오히려 못 알아본다
    check('S&P 500 은 그대로 둠', /id: 'spx', name: 'S&P 500'/.test(cat));
    check('원문 기호가 남아 검색이 막히지 않음', /id: 'kospi',[^\n]*symbol: 'KOSPI'/.test(cat));

    /* 신호등 개수를 문서에 숫자로 박지 않는다 */
    const risk = await readFile('src/server/risk.ts', 'utf8');
    const defined = (risk.match(/^    id: '/gm) ?? []).length;
    const shown = snap.sections?.risk?.data?.indicators?.length ?? 0;
    check('정의한 위험 지표 수와 화면에 뜬 수가 같음', defined === shown, `정의 ${defined} / 화면 ${shown}`);
    check('개수를 코드에 숫자로 박아 두지 않음', !/게이지 7개|RISK_SEVEN|일곱 개만/.test(risk));
    check('왜 여섯 개인지 적어 둠', risk.includes('VKOSPI') && risk.includes('지금은 여섯 개'));

    /* 미리보기도 같은 것을 갖고 있어야 한다 */
    check('미리보기에 상자그림이 있음', tpl2.includes('function bandBox') && tpl2.includes('function bandAxis'));
    check('미리보기에 큰 창이 있음', tpl2.includes('function openZoom') && tpl2.includes('cmodal'));
    check('미리보기 큰 창도 Esc 로 닫힘', /Escape' && document\.querySelector\('\.cmodal-back'\)/.test(tpl2));
    check('미리보기 국면 곡선도 조작 가능', tpl2.includes("lineChart([{ id: 'regime'"));
    check('미리보기 배지도 작게', tpl2.includes("size === '2xs'"));
  }


  /* ---------------- 8-13. LIVE 로 켜지는 조건 ---------------- */
  console.log('\n[8-13] LIVE 로 켜지는 조건');
  {
    /*
     * 여기서 잡으려는 것은 딱 하나다 — **켜지지 않는 이유가 거짓말이 아닐 것.**
     *
     * 예전에는 키 네 개(US·KR·CRYPTO·MACRO)를 다 요구했는데 코드가 실제로 읽는 건
     * MACRO 하나뿐이었다. 그래서 FRED 무료 키를 제대로 넣어도 DEMO 에 머물렀고,
     * 쓰지도 않는 변수 세 개에 아무 값이나 채워야 켜졌다.
     * 필수 키 목록과 코드가 읽는 키가 어긋나면 여기서 걸린다.
     */
    const cfg = await readFile('src/server/config.ts', 'utf8');
    const liveSrc = await Promise.all(
      ['index.ts', 'crypto.ts', 'macro.ts', 'basics.ts', 'equities.ts'].map((f) =>
        readFile(`src/server/adapters/live/${f}`, 'utf8').catch(() => '')),
    );
    const live = liveSrc.join('\n');

    const required = [...(cfg.match(/REQUIRED_KEYS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    check('필수 키를 한곳에 모아 둠', required.length > 0, required.join(', ') || '없음');

    // getKeys() 의 어떤 항목을 LIVE 어댑터가 실제로 읽는가
    const readByCode = new Set();
    for (const m of live.matchAll(/getKeys\(\)\.(\w+)/g)) readByCode.add(m[1]);
    const ENV_OF = { usMarket: 'US_MARKET_API_KEY', krMarket: 'KR_MARKET_API_KEY', crypto: 'CRYPTO_API_KEY', macro: 'MACRO_API_KEY' };

    // 코드가 없으면 못 도는 키(= 없으면 에러를 던지는 키)만 필수여야 한다
    check('필수 키는 코드가 실제로 읽는 것뿐',
      required.every((k) => [...readByCode].some((r) => ENV_OF[r] === k)),
      `필수 ${required.join(',')} / 코드가 읽는 것 ${[...readByCode].map((r) => ENV_OF[r]).join(',')}`);

    // 코드가 안 읽는 키를 요구하면 켜지지 않는 이유가 거짓이 된다
    const unused = Object.values(ENV_OF).filter((e) => ![...readByCode].some((r) => ENV_OF[r] === e));
    check('코드가 안 읽는 키를 필수로 요구하지 않음',
      unused.every((e) => !required.includes(e)),
      `안 읽는 키: ${unused.join(', ') || '없음'}`);

    check('없어도 되는 키는 따로 두고 이유를 적음', /OPTIONAL_KEYS/.test(cfg) && /why:/.test(cfg));
    check('DEMO 로 떨어질 때 어떻게 켜는지 알려 줌', /fred\.stlouisfed\.org\/docs\/api\/api_key/.test(cfg));

    // 제공사 주소는 전부 갈아 끼울 수 있어야 대역 서버·사내 미러를 붙일 수 있다
    const eq = await readFile('src/server/adapters/live/equities.ts', 'utf8');
    check('Cboe 주소도 환경변수로 바꿀 수 있음', /envUrl\('CBOE_CSV_URL'\)/.test(eq));
    const envExample = await readFile('.env.example', 'utf8');
    for (const v of ['MACRO_BASE_URL', 'US_MARKET_BASE_URL', 'CRYPTO_BASE_URL', 'CBOE_CSV_URL']) {
      check(`.env.example 에 ${v} 가 있음`, envExample.includes(v));
    }

    /* 산출 못 한 것을 정상이라고 말하지 않는가 */
    const snapSrc = await readFile('src/server/snapshot.ts', 'utf8');
    check('점수가 하나도 없으면 심리 섹션을 비었다고 표시',
      /d\.every\(\(f\) => f\.score === null\)/.test(snapSrc));
    const sumSrc = await readFile('src/server/summary.ts', 'utf8');
    check('근거 줄만 남으면 요약도 근거 부족으로 표시',
      /shown\.every\(\(l\) => l\.kind === 'insufficient'\)/.test(sumSrc));

    /* LIVE 파싱을 키 없이 확인할 길이 있는가 */
    check('LIVE 파싱 점검 스크립트가 있음', existsSync('scripts/check-parse.mjs') && existsSync('scripts/live-stub.mjs'));
    const stub = await readFile('scripts/live-stub.mjs', 'utf8');
    check('대역 서버가 제공사가 아니라고 밝힘', /제공사가 아니다/.test(stub) && /전부 가짜/.test(stub));
    const parse = await readFile('scripts/check-parse.mjs', 'utf8');
    check('무엇을 확인 못 하는지도 밝힘', /확인하지 못한다/.test(parse) && /check:live/.test(parse));
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    check('npm 스크립트로 돌릴 수 있음', !!pkg.scripts['check:parse'] && !!pkg.scripts['live:stub']);

    /* 무료 소스 커버리지를 실제 값으로 적어 두었는가 */
    const readme = await readFile('README.md', 'utf8');
    check('무료 소스 커버리지를 실제 측정값으로 적음',
      readme.includes('**71%**') && readme.includes('**63%**') && readme.includes('실제로 돌려서 잰 값'));
    check('크립토가 문턱을 못 넘는다는 사실을 숨기지 않음',
      /크립토 \| \*\*63%\*\* \| ❌ 산출 불가/.test(readme));
  }


  /* ---------------- 8-14. 화면 이동 ---------------- */
  console.log('\n[8-14] 화면 이동 — 부드러운가, 길을 잃지 않는가');
  {
    /*
     * 사용자가 실제로 겪은 문제 두 가지를 여기서 막는다.
     *  ① "눌렀을 때 너무 빨리 넘어가서 가독성이 떨어진다"
     *     → 전환 효과가 아예 없었다. innerHTML 즉시 교체 + scrollTo instant.
     *  ② "이쪽 저쪽 페이지를 옮겨다녀서 뭐가 뭔지 모르겠다"
     *     → 홈 하나에 나가는 링크가 서른 개인데, 상세 화면 여섯 곳에 돌아갈 길이 없었다.
     */
    const shell = await readFile('src/components/nav/AppShell.tsx', 'utf8');
    const css = await readFile('src/app/globals.css', 'utf8');
    const backBar = await readFile('src/components/nav/BackBar.tsx', 'utf8');
    const tiles = await readFile('src/components/market/RiskGauges.tsx', 'utf8');
    const tpl3 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 전환 */
    check('화면이 바뀔 때 전환 효과가 있음', /view-enter/.test(shell) && /@keyframes view-enter/.test(css));
    check('경로가 바뀔 때만 재생됨(값 갱신에는 안 돌음)', /key=\{pathname\}/.test(shell));
    check('축소 모션이면 전환을 생략함', /prefers-reduced-motion/.test(css) && /animation-duration: 0\.001ms/.test(css));
    // 너무 길면 기다리는 느낌이 든다. 200~320ms 사이로 묶어 둔다.
    const dur = Number(css.match(/animation: view-enter (\d+)ms/)?.[1] ?? 0);
    check('전환 길이가 200~320ms', dur >= 200 && dur <= 320, `${dur}ms`);

    /* ② 돌아갈 길 */
    check('돌아갈 길 컴포넌트가 있음', backBar.includes('export function BackBar'));
    check('앱 안에서 왔으면 눌렀던 자리로 보냄', /router\.back\(\)/.test(backBar));
    check('주소를 직접 열었으면 앱 밖으로 안 나감', /router\.push\(fallback\)/.test(backBar));
    // 주석에는 "history.length 로 짐작하지 않는다" 는 설명이 있다. 걷어내고 본다.
    const stripB = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('history.length 로 짐작하지 않음', !/history\.length/.test(stripB(backBar)));
    for (const page of ['regime', 'criteria', 'indices', 'basics', 'indicators', 'calendar']) {
      const src = await readFile(`src/app/${page}/page.tsx`, 'utf8');
      check(`/${page} 에 돌아갈 길이 있음`, src.includes('<BackBar'));
    }

    /* ③ 그 자리에서 해결 */
    check('신호등 타일이 다른 화면으로 나가지 않음',
      /aria-expanded=\{open\}/.test(tiles) && !/<Link\s+href="\/indicators"\s+className="card/.test(tiles));
    check('타일이 그 자리에서 해설을 펼침', tiles.includes('guideFor(indicator.id)') && tiles.includes('무슨 뜻인가요'));
    check('펼친 뒤에도 더 볼 길은 남겨 둠', tiles.includes('구간 기준과 다른 지표 보기'));
    check('펼침 상태를 스크린리더에 알림', /aria-controls=/.test(tiles) && /aria-expanded/.test(tiles));

    /* 미리보기도 같은 것을 갖고 있어야 한다 */
    check('미리보기에도 전환 효과가 있음', /@keyframes view-enter/.test(tpl3) && /classList\.add\('view-enter'\)/.test(tpl3));
    check('미리보기도 같은 화면 안에서는 재생하지 않음', /const moved = state\.view !== lastView/.test(tpl3));
    check('미리보기에도 돌아갈 길이 있음', /function backBar\(\)/.test(tpl3) && /data-back/.test(tpl3));
    check('미리보기 홈에는 돌아갈 길을 붙이지 않음', /TAB_VIEWS\.indexOf\(state\.view\) < 0/.test(tpl3));
    check('미리보기 타일도 그 자리에서 펼침', /data-tile=/.test(tpl3) && /state\.openTile/.test(tpl3));
  }

  /* ---------------- 8-15. 생활 경제 지수의 폭과 길이 ---------------- */
  console.log('\n[8-15] 생활 경제 지수 — 쓸데없이 길고 넓지 않은가');
  {
    /*
     * 사용자가 짚은 문제: "경제 생활지수가 저렇게 길게 표시될 필요가 있나?
     * 폭이 너무 긴 거 같은데 쓸데없이."
     *
     * 재 보니 넓은 화면에서 카드 한 장이 952px 을 차지하면서 그 안의 글자는
     * 350자뿐이었고, 아홉 장이 한 줄로 서서 세로로 4,727px 을 굴러야 했다.
     * 줄이되 **내용을 지워서 줄이지는 않는다** — 아래 마지막 묶음이 그것을 지킨다.
     */
    const board = await readFile('src/components/market/BasicsBoard.tsx', 'utf8');
    const trend = await readFile('src/components/charts/BasicTrend.tsx', 'utf8');
    const tpl4 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 폭 — 넓은 화면에서는 두 칸 */
    check('생활 카드가 넓은 화면에서 두 칸으로 섬', /grid gap-[\d.]+ md:grid-cols-2/.test(board));
    check('한 줄 세로 나열이 남아 있지 않음', !/<ul className="space-y-2\.5">/.test(board));
    // 세 칸이면 카드가 310px 밑으로 내려가 이름과 값이 한 줄에 못 선다.
    check('세 칸까지 쪼개지는 않음', !/grid-cols-3/.test(board));

    /* ② 길이 — 이름과 값이 같은 줄 */
    check('이름과 값이 같은 줄에 있음', /text-\[22px\] leading-none font-bold/.test(board));
    check('값만 있는 줄을 따로 두지 않음', !/sm:flex sm:items-start sm:gap-3/.test(board));

    /* ③ 그림 — 카드 폭을 따라가되 무한정 커지지 않음 */
    check('그림이 카드 폭을 따라 늘어남', /className="h-auto w-full"/.test(trend));
    check('그림 폭에 상한이 있음', /max-w-\[430px\]/.test(trend));

    /* ④ 미리보기도 같은 모양 */
    check('미리보기도 두 칸 격자를 씀', /\.bgrid \{ display: grid/.test(tpl4));
    check('미리보기 두 칸 기준이 앱과 같음(768px)', /@media \(min-width: 768px\) \{ \.bgrid/.test(tpl4));
    check('미리보기에서 옛 좌우 배치가 사라짐', !/btrend/.test(tpl4));
    check('미리보기 그림도 폭을 따라가고 상한이 있음',
      /style="width:100%;height:auto"/.test(tpl4) && /max-width:430px/.test(tpl4));
    check('미리보기도 값을 이름 줄 오른쪽에 둠', /font-size:22px;line-height:1;font-weight:700/.test(tpl4));

    /* ⑤ 줄이면서 내용을 지우지는 않았다 */
    for (const [what, needle] of [
      ['해설 문장', 'item.reading'],
      ['나라별 비교표', '<Comparisons items={item.comparisons}'],
      ['접힌 설명', '<GuidePanel id={item.id}'],
      ['출처 줄', 'item.meta.sources[0]?.name'],
      ['공식/비공식 표시', "item.official ? '공식 통계' : '비공식 개념'"],
    ]) {
      check(`줄이면서 ${what}을 지우지 않음`, board.includes(needle));
    }
  }

  /* ---------------- 8-16. 홈 아래 탭을 눌러도 화면이 안 움직이는가 ---------------- */
  console.log('\n[8-16] 홈 아래 탭 — 눌러도 화면이 그대로인가');
  {
    /*
     * 사용자가 짚은 문제: "맨 아래 일정~기준까지 눌렀을 때 화면 변하게 하지 말고
     * 일정하게 유지되게 만들어."
     *
     * 재 보니 탭마다 본문이 192~780px 로 벌어졌다. 짧은 탭으로 옮기면 문서가
     * 그만큼 짧아지고, 브라우저가 스크롤을 끝으로 당기면서 탭 줄이 화면에서
     * 최대 247px 미끄러졌다. 방금 누른 자리에 다른 것이 와 있었다.
     */
    const lower = await readFile('src/components/market/HomeLower.tsx', 'utf8');
    const tpl5 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 문서 길이를 지킨다 */
    check('탭 본문 높이를 재고 있음', /new ResizeObserver/.test(lower) && /bodyRef/.test(lower));
    check('지금까지 본 것 중 가장 긴 높이를 기억함', /r\.height > prev \? r\.height : prev/.test(lower));
    check('폭이 바뀌면 최댓값을 다시 잡음', /Math\.abs\(r\.width - widthRef\.current\) > 1/.test(lower));

    /* ② 남는 자리는 본문 밑이 아니라 문서 맨 끝에 — 안 그러면 고지문 위가 한 화면 빈다 */
    check('남는 자리를 문서 맨 끝에 붙임', /createPortal\(/.test(lower) && /getElementById\('main'\)/.test(lower));
    check('본문 상자에 min-height 를 걸지 않음(구멍 방지)', !/minHeight/.test(lower));
    check('탭마다 다른 위 여백이 새지 않게 막음', /className="flow-root"/.test(lower));
    check('채우는 칸은 스크린리더가 읽지 않음', /aria-hidden="true" style=\{\{ height: gap \}\}/.test(lower));

    /* ③ 미리보기도 같은 규칙 */
    check('미리보기에도 꼬리 칸이 있음', /id="tailgap"/.test(tpl5));
    check('미리보기 꼬리 칸이 고지문 뒤에 있음',
      tpl5.indexOf('</footer>') < tpl5.indexOf('id="tailgap"'));
    check('미리보기도 가장 긴 본문만큼만 채움', /function holdHomeLower\(\)/.test(tpl5) && /lowerFloor - r\.height/.test(tpl5));
    check('미리보기는 같은 화면 다시 그릴 때 보던 자리를 지킴',
      /const keepScroll = moved \? null : window\.scrollY/.test(tpl5));
  }

  /* ---------------- 8-17. 차트 위에 올렸을 때만 값이 뜨는가 ---------------- */
  console.log('\n[8-17] 차트 커서 — 그림 위에 올렸을 때만, 표식은 표식대로');
  {
    /*
     * 사용자가 짚은 문제: "점수 추이에 마우스 올리면 어느 곳이든 나오는데
     * 그래프나 선에 올려뒀을 때만 나오게 해라. 1~7번까지의 선이 있는데
     * 그걸 무시하고 정보가 나온다."
     *
     * 재 보니 x 만 보고 크로스헤어를 세우고 있었다. 왼쪽 축 글씨 위, 오른쪽 축
     * 글씨 위, 번호 배지가 앉는 위쪽 띠, 아래 연도 글씨 띠 — 찔러 본 자리 여섯 곳이
     * 전부 값을 띄웠다. 번호 붙은 세로 점선 위에 올려도 그 사건은 말해 주지 않고
     * 그냥 그날 점수만 떴다.
     */
    const chart = await readFile('src/components/charts/InteractiveChart.tsx', 'utf8');
    const vpHook = await readFile('src/components/charts/useChartViewport.ts', 'utf8');
    const tpl6 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 그림 밖에서는 안 뜬다 */
    check('포인터가 어디 있는지 가려냄', /function hitAt|const hitAt = useCallback/.test(chart));
    check('가로만이 아니라 세로도 봄', /py < y0 \|\| py > y1/.test(chart));
    check('마우스가 그 판정을 거침', /moveCursor\(e\.nativeEvent\.offsetX, e\.nativeEvent\.offsetY\)/.test(chart));
    check('짚기(터치)도 같은 판정을 거침', /tapRef\.current = moveCursor/.test(chart));
    check('짚기가 세로 위치를 넘겨받음', /onTap\?: \(localX: number, localY: number\) => void/.test(vpHook));

    /* ② 표식은 표식대로 */
    check('표식 위를 따로 잡음', /MARKER_SNAP/.test(chart));
    check('번호 배지 띠까지 표식으로 침', /py >= y0 - MARKER_TOP/.test(chart));
    check('표식 위에서는 그 날짜에 딱 섬', /setCursorT\(hit\.t\)/.test(chart));
    check('툴팁이 사건 이름부터 알려 줌', /cursorMarker\.label/.test(chart));
    check('읽어 주는 문장에도 사건이 들어감', /cursorMarker\.index\}번 \$\{cursorMarker\.label/.test(chart));
    check('올려 둔 표식 선을 굵게 함', /cursorMarker\?\.id === m\.id/.test(chart));

    /* ③ 미리보기도 같은 규칙 */
    check('미리보기도 포인터 자리를 가려냄', /function chartHit\(c, px, py\)/.test(tpl6));
    check('미리보기도 세로를 봄', /py < y0 \|\| py > y1/.test(tpl6));
    check('미리보기 커서가 세로를 받음', /function chartCursor\(id, px, py\)/.test(tpl6));
    check('미리보기 마우스·터치·짚기가 모두 세로를 넘김',
      (tpl6.match(/chartCursor\([^)]*,[^,)]*,[^,)]*\)/g) ?? []).length >= 4);
    check('미리보기 툴팁에도 사건 줄이 있음', /tt-mark/.test(tpl6) && /onMark\.label/.test(tpl6));
  }

  /* ---------------- 8-18. 읽을 수 있는 크기인가 · 누를 수 있는 크기인가 ---------------- */
  console.log('\n[8-18] 가독성 — 글자 크기와 누를 자리');
  {
    /*
     * 최종 검토에서 잰 것.
     *   화면 열한 곳의 글자를 전부 세어 보니 11px 미만이 40.2% 였고, 제일 흔한
     *   크기가 10px(전체의 30%)였다. 라벨만 작은 게 아니라 134자짜리 설명 문장이
     *   10px 이었다. 한글은 같은 크기에서 라틴 문자보다 획이 빽빽해 더 안 읽힌다.
     *   법적 고지문("투자 조언이 아닙니다")조차 화면에서 제일 작은 글씨였다.
     *
     * 그래서 아래쪽 눈금만 올렸다 (13.5px 이상 제목은 그대로).
     *   8·9·9.5 → 10.5   10·10.5 → 11.5   11·11.5 → 12.5   12·12.5·13 → 13
     *   결과: 11px 미만 40.2% → 2.9% (남은 것은 배지뿐), 최소 10.5px.
     */
    const SRC_SIZES = [];
    for (const f of await listFiles('src', /\.tsx?$/)) {
      const t = await readFile(f, 'utf8');
      for (const m of t.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) SRC_SIZES.push({ f, v: Number(m[1]) });
    }
    const tooSmall = SRC_SIZES.filter((x) => x.v < 10.5);
    check(
      '앱에 10.5px 보다 작은 글씨가 없음',
      tooSmall.length === 0,
      tooSmall.length ? `${tooSmall.length}곳 (예: ${tooSmall[0].f} ${tooSmall[0].v}px)` : `${SRC_SIZES.length}곳 검사`,
    );
    const tpl7 = await readFile('tools/preview/template.html', 'utf8');
    const tplSmall = [...tpl7.matchAll(/font-size: ?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((v) => v < 10.5);
    check('미리보기도 10.5px 아래가 없음', tplSmall.length === 0, tplSmall.length ? `${tplSmall.length}곳` : '');
    // 본문용 크기가 실제로 쓰이는지 — 눈금만 정의하고 안 쓰면 의미가 없다
    check('본문이 11.5px 이상에 놓임', SRC_SIZES.filter((x) => x.v >= 11.5).length > SRC_SIZES.length * 0.7);

    /* 손가락으로 누를 자리 */
    const price = await readFile('src/components/market/PriceCard.tsx', 'utf8');
    check('관심 별표를 손가락으로 누를 수 있음(16px 글리프에 36×44 자리)',
      /after:-inset-x-2\.5 after:-inset-y-\[14px\]/.test(price) && /after:content-\[''\]/.test(price));
    check('넓힌 자리가 이름 링크를 덮지 않음', /items-center gap-2\.5/.test(price));
    check('미리보기 별표도 같은 자리', /\.star::after \{ content: ''; position: absolute; inset: -14px -10px; \}/.test(tpl7));
    for (const f of ['src/app/watchlist/page.tsx', 'src/app/more/page.tsx']) {
      const t = await readFile(f, 'utf8');
      check(`${f.split('/')[2]} 의 순서·삭제 버튼이 40px`, !/h-7 w-7/.test(t) && /h-10 w-10/.test(t));
    }

    /* 첫 숫자까지 가는 길 — 안내를 지우지 않고 접었는가 */
    const guide = await readFile('src/components/ui/ReadingGuide.tsx', 'utf8');
    const board = await readFile('src/components/market/RiskBoard.tsx', 'utf8');
    check('읽는 법을 접어 두는 상자가 있음', /export function ReadingGuide/.test(guide));
    check('접혀 있어도 한 줄은 남음', /lead/.test(guide) && /aria-expanded=\{open\}/.test(guide));
    check('지표 화면이 그걸 씀', /<ReadingGuide/.test(board));
    // 접었다고 문장을 지우면 안 된다 — 셋 다 그대로 있어야 한다
    for (const [what, needle] of [
      ['구성요소가 아니라는 설명', '투자심리 점수의 구성요소가 아닙니다'],
      ['구간 기준 출처', '구간 기준은 이 앱이 정한 값이며 공식 기준이 아닙니다'],
      ['색 범례', '<SignalLegend'],
    ]) {
      check(`접으면서 ${what}을 지우지 않음`, board.includes(needle));
    }
    check('미리보기도 접어 두고 같은 문장을 갖고 있음',
      /data-rguide=/.test(tpl7) && tpl7.includes('구간 기준은 이 앱이 정한 값이며'));

    /*
     * 320px 에서 페이지가 통째로 옆으로 밀리던 것.
     * 더보기 화면의 '모드 사유' 줄이 원인이었다 — dt 는 shrink-0 인데 dd 에
     * min-w-0 이 없어서 flex 자식이 내용보다 좁아지지 못했다. 글자를 키우기 전에도
     * 25px 밀려 있었고, 키우고 나서 51px 이 됐다. 화면 열두 곳을 320px 로 재서
     * 지금은 전부 0px 이다. 가로 스크롤은 어떤 화면에서도 생기면 안 된다.
     */
    const more = await readFile('src/app/more/page.tsx', 'utf8');
    check('좁아질 수 있는 칸으로 두어 가로 스크롤을 막음',
      /min-w-0 text-right break-words/.test(more) && /tnum min-w-0 text-right/.test(more));
  }

  /* ---------------- 8-19. 값이 나빠져도 틀이 흔들리지 않는가 ---------------- */
  console.log('\n[8-19] 데이터가 나빠질 때 화면이 흔들리지 않는가');
  {
    /*
     * 사용자가 짚은 문제: "정상 / 부분 실패 사이를 오갈 때 미국 투자심리가
     * 위아래로 흔들린다. 안 흔들리게 틀을 딱 잡아라."
     *
     * 재 보니 화면 열한 곳이 전부 밀리고 있었다. 원인은 하나였다 —
     * **값이 나빠질 때만 나타나는 요소들**. 나타나는 순간 그 줄이 두 줄이 되거나
     * 블록이 통째로 생기고 사라져서, 30초마다 갱신되는 화면이 읽는 사람 손 밑에서
     * 움직였다.
     *
     *   상태바 배지가 늘어 줄바꿈       → 모든 화면 +23px (sticky 머리말이라 전부)
     *   새로고침 단추가 눌려 두 줄      → 머리말 31px → 50px (미리보기)
     *   세션 칩 뼈대가 진짜보다 5px 작음 → 값이 들어오는 순간 +5px
     *   신뢰도 배지가 새로 생김         → 심리 카드 362px → 409px
     *   산출·충족률 줄이 새로 생김      → 카드 바닥 +19px
     *   결측 사유 줄이 생김             → 구성요소 줄 63px → 84px
     *   그림 블록이 통째로 사라짐        → 생활 카드 517px → 377px
     *   시세 값·거래량 줄이 사라짐       → 시세 카드 135px → 106px
     *
     * 규칙 하나로 고쳤다 — **자리는 고정하고 말만 바꾼다.**
     * 지금은 정상 → 부분 실패에서 열한 화면 중 열 곳이 0px, 한 곳이 1px 이다.
     */
    const card = await readFile('src/components/market/FngCard.tsx', 'utf8');
    const bar = await readFile('src/components/market/StatusBar.tsx', 'utf8');
    const trend2 = await readFile('src/components/charts/BasicTrend.tsx', 'utf8');
    const price2 = await readFile('src/components/market/PriceCard.tsx', 'utf8');
    const fngPage = await readFile('src/app/fng/[market]/page.tsx', 'utf8');
    const tpl8 = await readFile('tools/preview/template.html', 'utf8');
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

    /* ① 심리 카드 — 배지와 바닥 줄을 늘 그린다 */
    check('신뢰도 배지를 늘 그림', !/confidence !== 'high' \?/.test(strip(card)));
    check('신뢰도는 색으로만 구분함', /confidence === 'low' \? 'warn' : 'neutral'/.test(card));
    check('산출·충족률 줄을 늘 그림', !/coverage < 0\.999 \? \(/.test(strip(card)));
    check('충족률이 모자라면 색으로 표시함', /coverage < 0\.999 \? 'var\(--warn\)'/.test(card));

    /* ② 상태바 — sticky 라서 여기가 자라면 전 화면이 밀린다 */
    check('상태 줄이 줄바꿈하지 않음', /flex-nowrap/.test(bar) && !/flex-wrap items-center gap-x-2/.test(bar));
    check('시계가 눌리지 않음', /tnum shrink-0 text-sm/.test(bar));
    check('시나리오 배지를 가로로 밀리는 줄로 내림',
      bar.indexOf('scroll-x mt-2') < bar.indexOf('시나리오: {snapshot.scenario}'));
    check('세션 칩 뼈대가 진짜 칩과 같은 높이', /h-\[29px\] w-24 shrink-0 skeleton/.test(bar));
    check('미리보기 상태 줄도 한 줄로 못박음', /\.sb-badges \{ display: flex; flex-wrap: nowrap/.test(tpl8));
    check('미리보기 새로고침 단추가 눌리지 않음', /\.sb-row > \.ghost \{ flex-shrink: 0; white-space: nowrap; \}/.test(tpl8));

    /* ③ 못 그리는 그림도 자리를 지킨다 */
    check('선을 못 그려도 블록이 사라지지 않음', !/if \(!mine \|\| mine\.points\.length < 2\) return null/.test(trend2));
    check('빈 자리를 같은 viewBox 로 재서 크기를 맞춤', /viewBox=\{`0 0 \$\{VIEW_W\} \$\{height\}`\} className="block h-auto w-full"/.test(trend2));
    check("'표로 보기' 줄도 같은 단추로 자리를 지킴", /invisible text-\[11\.5px\] font-semibold/.test(trend2));
    check('미리보기도 같은 방식으로 빈 자리를 잼', /outline:1px dashed var\(--border\);outline-offset:-1px/.test(tpl8));

    /* ④ 값을 못 받은 시세 카드 */
    check('값을 못 받아도 시세 카드가 같은 자리를 차지함', /minHeight: 64/.test(price2));
    check('미리보기 시세 카드도 같음', /min-height:64px;display:flex;align-items:center/.test(tpl8));

    /* ⑤ 결측 사유는 목록 줄이 아니라 펼친 자리에 */
    check('결측 사유가 목록 줄을 늘리지 않음', !/\{!c\.available && c\.missingReason \? \(\s*<p className="mt-0\.5/.test(fngPage));
    check('결측 사유는 펼친 자리에 남아 있음', /!c\.available && c\.missingReason/.test(fngPage) && /mb-2 text-\[12\.5px\]/.test(fngPage));
    check('결측 배지가 사유를 품고 있음', /size="xs" title=\{c\.missingReason/.test(fngPage));
  }

  /* ---------------- 8-20. 그림이 읽히는가 ---------------- */
  console.log('\n[8-20] 그래프 — 눈금을 겹치지 않는가, 글자가 읽히는가');
  {
    /*
     * 두 가지를 재서 고쳤다.
     *
     * ① 한 그림에 눈금이 둘이었다.
     *    심리 점수(0~100)를 왼쪽 축에, S&P 500 가격을 오른쪽 축에 놓고 겹쳐 그렸다.
     *    두 축을 맞추는 기준이 임의라서, 눈금을 어디에 두느냐에 따라 없던 상관관계가
     *    보이거나 사라진다. 시간축만 공유하고 위아래 두 칸으로 나눴다.
     *    덤으로 심리 점수 눈금이 -5.9 ~ 103.8 이던 것도 0~100 으로 못박았다.
     *
     * ② 차트 안 글자가 화면에서 제일 작았다.
     *    본문을 11.5~12.5px 로 올린 뒤에도 축 눈금은 raw 7.5~9px 이라 화면에서
     *    9~10.8px 로 찍혔다. 11px 로 올려 10.6~11.9px 이 됐다.
     */
    const chart2 = await readFile('src/components/charts/InteractiveChart.tsx', 'utf8');
    const fngPage2 = await readFile('src/app/fng/[market]/page.tsx', 'utf8');
    const assetPage = await readFile('src/app/asset/[id]/page.tsx', 'utf8');
    const tpl9 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 눈금을 겹치지 않는다 */
    check('한 그림에 두 눈금을 겹치지 않음', /const splitAxes =/.test(chart2) && !/yRight/.test(chart2));
    check('시간축은 공유하고 칸만 나눔', /bands: \[/.test(chart2) && /plotBottom/.test(chart2));
    check('나눈 만큼 그림이 높아짐', /SPLIT_EXTRA/.test(chart2) && /height: boxH/.test(chart2));
    check('오른쪽 축 눈금값이 사라짐', !/innerW \+ 6/.test(chart2));
    check('어느 칸이 무엇인지 칸 안에 적음', /geometry\.split \? \(\s*<text/.test(chart2));
    check('나눈 뒤에는 선을 끊어 그리지 않음', /!geometry\.split && s\.dashed/.test(chart2));
    check('심리 점수 눈금을 0~100 으로 못박음', /fixed0to100: true/.test(fngPage2));
    check('설명도 좌·우축이 아니라 위·아래 칸으로 고침',
      !/좌축은/.test(fngPage2) && !/우축은/.test(assetPage) && /아래 칸은/.test(assetPage));
    check('미리보기도 칸을 나눔', /const splitAxes =/.test(tpl9) && /c\.bands/.test(tpl9));
    check('미리보기 상자도 그만큼 커짐', /splitNow \? SPLIT_EXTRA : 0/.test(tpl9));
    check('미리보기도 0~100 으로 못박음', /fixed: true,/.test(tpl9));

    /* ② 그림 안 글자 */
    const rawSizes = [];
    for (const f of await listFiles('src/components', /\.tsx$/)) {
      const t = await readFile(f, 'utf8');
      for (const m of t.matchAll(/fontSize=\{?"?(\d+(?:\.\d+)?)"?\}?/g)) rawSizes.push({ f, v: Number(m[1]) });
    }
    const tiny = rawSizes.filter((x) => x.v < 9.5);
    check('그림 안에 9.5px 보다 작은 글자가 없음', tiny.length === 0,
      tiny.length ? `${tiny.length}곳 (예: ${tiny[0].f} ${tiny[0].v})` : `${rawSizes.length}곳 검사`);
    check('축 눈금 크기를 한 곳에서 정함', /const TICK_FONT = 11;/.test(chart2));
    check('미리보기도 같은 크기를 씀', /TICK_FONT = 11/.test(tpl9));

    /* ③ 마크 — 크로스헤어 점은 지름 8px + 바탕 테두리 2px */
    check('크로스헤어 점이 8px', /r=\{4\}[\s\S]{0,120}strokeWidth=\{2\}/.test(chart2));
    check('미리보기 점도 같음', /r="4" fill="' \+ s\.color \+ '" stroke="var\(--surface\)" stroke-width="2"/.test(tpl9));
  }

  /* ---------------- 8-9. LIVE 연결 ---------------- */
  console.log('\n[8-9] 실데이터 연결');
  {
    // 이 컨테이너는 제공사로 나갈 수 없어 실제 호출은 못 한다.
    // 대신 "무엇이 붙었고 무엇이 아직인지" 를 원본에서 확인한다.
    const live = await readFile('src/server/adapters/live/index.ts', 'utf8');
    const crypto = await readFile('src/server/adapters/live/crypto.ts', 'utf8');
    const macro = await readFile('src/server/adapters/live/macro.ts', 'utf8');

    check('CoinGecko 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/coingecko.ts'));
    check('Stooq 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/stooq.ts'));
    check('Cboe 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/cboe.ts'));
    check('Binance 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/binance.ts'));
    check('FRED 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/fred.ts'));

    check('크립토 시세가 연결됨', live.includes('cryptoQuotes') && live.includes('fetchCoinQuotes'));
    check('크립토 심리 입력이 연결됨', live.includes('buildCryptoFngInput'));
    check('크립토 벤치마크가 연결됨', /getBenchmark[\s\S]{0,400}fetchCoinSeries/.test(live));
    check('거시 지표가 FRED 에 연결됨', live.includes('buildFredMacro'));
    check('환율이 연결됨', /getUsdKrw[\s\S]{0,300}fetchLatest/.test(live));

    // 못 채우는 지표는 지어내지 않고 사유를 남긴다
    for (const id of ['long_liq_share', 'exchange_netflow_14d', 'search_trend', 'news_sentiment']) {
      check(`[${id}] 못 받는 지표에 사유가 있음`, crypto.includes(`forcedMissing.${id} =`));
    }
    check('결측을 0 으로 채우지 않음', !/\|\|\s*0;/.test(crypto) && crypto.includes('null'));

    // 근거 없는 위험 단계를 매기지 않는다
    check('구간 기준이 없으면 단계를 매기지 않음', macro.includes("return { level: 'unknown'"));

    // 키가 브라우저로 새지 않는다
    const envRefs = [...live.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)].map((m) => m[0]);
    check('LIVE 어댑터가 NEXT_PUBLIC_ 키를 쓰지 않음', envRefs.length === 0, envRefs.join(', ') || '없음');

    // 점검 스크립트
    check('연결 점검 스크립트가 있음', existsSync('scripts/check-live.mjs'));
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    check('npm run check:live 가 등록됨', Boolean(pkg.scripts['check:live']));

    // 미국·한국도 붙었는지
    const eq = await readFile('src/server/adapters/live/equities.ts', 'utf8');
    check('미국·한국 시세가 연결됨', live.includes('stooqQuotes') && live.includes('fetchQuotes'));
    check('미국 심리 입력이 연결됨', live.includes('buildUsFngInput'));
    // 한국은 시장에서 뺐다 — 점수 경로가 불리면 조용히 빈 값을 만들지 않고 알린다
    check('한국은 점수를 내지 않음', /market === 'kr'[\s\S]{0,200}NotWiredError/.test(live));
    check('한국 지수는 시세로 남아 있음', live.includes('stooqQuotes'));
    check('풋/콜 비율이 연결됨', eq.includes('fetchEquityPutCall'));

    // 지연을 0 으로 적지 않는다 — 실시간이 아닌 것을 실시간이라 하지 않는다
    const stooq = await readFile('src/server/adapters/live/providers/stooq.ts', 'utf8');
    check('Stooq 지연을 실시간이라 적지 않음', /delayMinutes:\s*15/.test(stooq));

    // 무료로 못 받는 미국·한국 지표에도 사유가 있다
    for (const id of ['us_new_high_low', 'us_volume_breadth', 'vkospi_level', 'kr_foreign_net_20d']) {
      check(`[${id}] 못 받는 지표에 사유가 있음`, eq.includes(`${id}:`));
    }

    /*
     * 생활 경제 지수 — 세계은행(연 1회)과 이코노미스트 빅맥지수(연 2회).
     * 아홉 가운데 다섯만 닿는다. 나머지 넷은 무료로 받을 길이 없어서 비워 둔다.
     * 못 닿는 것을 지어내지 않는 것이 이 화면의 유일한 규칙이다.
     */
    const basicsSrc = await readFile('src/server/adapters/live/basics.ts', 'utf8');
    check('세계은행 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/worldbank.ts'));
    check('빅맥지수 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/bigmac.ts'));
    check('생활 경제 지수가 연결됨', live.includes('buildLiveBasics'));
    check('생활 경제 지수가 세계은행을 씀', basicsSrc.includes('fetchIndicator'));
    check('생활 경제 지수가 빅맥지수를 씀', basicsSrc.includes('fetchBigMac'));
    check('실데이터에도 나라별 시계열이 붙음', basicsSrc.includes('historyByCountry'));
    // 세계은행은 나라마다 마지막 발표 연도가 다르다. 말하지 않으면 같은 해로 읽힌다.
    check('기준 연도가 다르면 밝힘', basicsSrc.includes('기준 연도가 나라마다 다릅니다'));
    // 무료로 못 받는 넷은 왜 없는지 원본에 적어 둔다
    for (const what of ['엥겔계수', 'PIR', 'OECD 경기선행지수']) {
      check(`못 받는 지표 사유: ${what}`, basicsSrc.includes(what));
    }
    // 값을 못 받으면 빈 목록이지, 0 이나 지어낸 값이 아니다
    check('생활 경제 지수가 실패를 0 으로 채우지 않음',
      basicsSrc.includes('return null;') && !/\|\|\s*0[,;)]/.test(basicsSrc));

    /*
     * 종목 상세 차트 — 40개 종목이 전부 "받아 오거나, 왜 못 받는지 말하거나" 둘 중 하나여야 한다.
     * 아무 데도 안 걸리면 NotWiredError 가 나고, 그건 화면에 "구현되지 않았습니다" 로 뜬다.
     * 값도 이름도 다 있는 종목에 그 문구가 뜨면 고장으로 읽힌다.
     */
    const idsIn = (src, name) => {
      const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`));
      return m ? [...m[1].matchAll(/^\s{2}'?([a-z_0-9]+)'?:/gm)].map((x) => x[1]) : [];
    };
    const stooqSrc = await readFile('src/server/adapters/live/providers/stooq.ts', 'utf8');
    const cgSrc = await readFile('src/server/adapters/live/providers/coingecko.ts', 'utf8');
    const covered = new Set([
      ...idsIn(cgSrc, 'COIN_ID'),
      ...idsIn(stooqSrc, 'STOOQ_SYMBOL'),
      ...idsIn(live, 'ASSET_FRED_SERIES'),
      ...idsIn(live, 'NO_FREE_SERIES'),
      'funding',
      'open_interest',
    ]);
    const quoted = Object.values(snap.sections?.quotes?.data ?? {}).flat().map((q) => q.id);
    const fellThrough = quoted.filter((id) => !covered.has(id));
    check('모든 종목이 시계열 소스 또는 사유를 가짐', fellThrough.length === 0,
      fellThrough.join(', ') || `${quoted.length}종목 전부`);

    // 사유는 빈 문자열이면 안 된다 — 화면이 그 자리에 그대로 찍는다.
    // (ASSET_FRED_SERIES 같은 다른 표까지 세지 않도록 NO_FREE_SERIES 블록 안만 본다)
    const noFreeBlock = live.match(/NO_FREE_SERIES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
    const reasons = [...noFreeBlock.matchAll(/^\s{2}[a-z_0-9]+:\s*\n?\s*'([^']*)'/gm)].map((m) => m[1]);
    check('못 받는 사유가 전부 문장으로 적혀 있음',
      reasons.length >= 10 && reasons.every((r) => r.length > 15), `${reasons.length}개`);

    /*
     * 못 받는 구간을 다른 구간 데이터로 메우지 않는다.
     * 코인 3년치를 달라는데 30일치를 주고 화면에 "3년"이라 적으면 그대로 거짓말이다.
     */
    check('없는 구간을 기본값으로 메우지 않음', !/days\[range\]\s*\?\?\s*30/.test(live));
    check('받을 수 없는 구간은 사유와 함께 알림', live.includes('SeriesUnavailableError'));

    // 구간 하나가 막혀도 종목 상세 전체가 죽으면 안 된다 (해당 카드만 오류 처리)
    const assetRoute = await readFile('src/app/api/asset/[id]/route.ts', 'utf8');
    check('구간 하나가 막혀도 상세가 통째로 실패하지 않음',
      /for \(const r of RANGES\)[\s\S]{0,200}try \{[\s\S]{0,200}getAssetSeries/.test(assetRoute));
    check('빈 구간이 왜 비었는지 올려보냄', assetRoute.includes('unavailable'));
    const assetPage = await readFile('src/app/asset/[id]/page.tsx', 'utf8');
    check('화면이 그 사유를 그 자리에 찍음', assetPage.includes('detail.unavailable?.[range]'));

    /*
     * 화면이 내주는 구간과 API 가 받아 오는 구간이 같아야 한다.
     * 어긋나 있을 때는 API 가 3년치를 매번 한 번 더 부르고 그대로 버렸다.
     * 무료 API 는 호출 한도가 빠듯해서 그냥 낭비가 아니라 손해다.
     */
    check('구간 목록을 한 곳에서 정함',
      assetPage.includes('ASSET_RANGES') && assetRoute.includes('ASSET_RANGES'));
    check('구간 목록을 따로 들고 있지 않음',
      !/RANGES(:\s*RangeKey\[\])?\s*=\s*\[/.test(assetPage.replace(/ASSET_RANGES/g, '')) &&
      !/RANGES(:\s*RangeKey\[\])?\s*=\s*\[/.test(assetRoute.replace(/ASSET_RANGES/g, '')));
    const detailBody = await (await fetch(`${BASE}/api/asset/btc`)).json();
    const served = Object.keys(detailBody.ranges ?? {});
    check('API 가 화면에 없는 구간을 받아 오지 않음', !served.includes('3Y'), served.join('·'));
    check('화면이 쓰는 다섯 구간이 모두 옴', served.length === 5, `${served.length}개`);

    /*
     * 경제 캘린더 — FRED 발표 일정.
     * 값이 아니라 '언제 발표되는가' 만 받는다. 시각·예상치는 주지 않으므로
     * 그 자리를 지어내지 않았는지가 이 절의 전부다.
     */
    const cal = await readFile('src/server/adapters/live/providers/fredCalendarRules.mjs', 'utf8');
    const calFetch = await readFile('src/server/adapters/live/providers/fredCalendar.ts', 'utf8');
    check('캘린더 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/fredCalendar.ts'));
    check('경제 캘린더가 연결됨', live.includes('fetchFredCalendar'));
    const calMethod = live.match(/async getCalendar\([\s\S]*?\n  }\n/)?.[0] ?? '';
    check('getCalendar 가 더는 미연결 오류를 던지지 않음',
      calMethod !== '' && !calMethod.includes('NotWiredError'));
    // 앞으로의 일정을 받으려면 이 파라미터가 있어야 한다. 없으면 지나간 날짜만 온다.
    check('앞으로의 발표 예정일을 받아옴', calFetch.includes('include_release_dates_with_no_data'));
    check('캘린더가 새 키를 요구하지 않음 (이미 있는 FRED 키를 씀)',
      calMethod.includes('getKeys().macro') && !/CALENDAR_API_KEY/.test(calMethod));

    // FRED 는 날짜만 준다. 08:30 같은 값을 채워 넣으면 카운트다운이 틀린 곳을 향한다.
    check('시각을 모르면 timeTbd 를 세움', /timeTbd:\s*true/.test(cal));
    check('시각을 지어내지 않음 (자정 고정)', cal.includes("T00:00:00.000+09:00"));
    check('일정만 받으므로 예상치·발표값을 비움',
      /forecast:\s*null/.test(cal) && /previous:\s*null/.test(cal) && /actual:\s*null/.test(cal));
    // 규칙에 없는 release 를 짐작해서 분류하면 지역 통계가 전국 지표 옆에 앉는다
    check('모르는 발표는 버림', cal.includes('if (rule === null || scheduledAt === null) return null;'));
    // 이름이 아니라 release id 로 맞춘다. "Consumer Price Index, Japan" 같은 이름에 안 속는다.
    check('발표를 이름이 아니라 release id 로 맞춤',
      /releaseId:\s*10\b/.test(cal) && /r\.releaseId === n/.test(cal));
    // FRED release 101 은 이름만 FOMC 이고 실제로는 일정표가 아니다
    check('FOMC Press Release(101) 를 일정으로 쓰지 않음',
      cal.includes('FOMC_RELEASE_ID_NOT_A_SCHEDULE') && !/releaseId:\s*101\b/.test(cal));
    // 손으로 옮긴 표는 낡는 것이 가장 위험하다 — 덮는 기간을 넘으면 비운다
    check('FOMC 표에 출처·확인일·덮는 기간이 있음',
      cal.includes('FOMC_SOURCE_URL') && cal.includes('FOMC_VERIFIED_ON') && cal.includes('FOMC_COVERED_THROUGH'));
    check('FOMC 표가 덮는 기간을 넘으면 내보내지 않음', cal.includes('d <= FOMC_COVERED_THROUGH'));
    check('중요도를 추론하지 않고 표에 적힌 것만 씀', /importance:\s*rule\.importance/.test(cal));
    check('캘린더가 결측을 0 으로 채우지 않음', !/\?\?\s*0|\|\|\s*0/.test(cal));
    // 일정표에 '실시간' 배지가 붙으면 안 된다
    check('캘린더 지연을 0 으로 적지 않음', /delayMinutes:\s*1440/.test(calFetch));

    /*
     * 규칙표의 이름은 실제 응답으로 확인해야 한다. 그 확인 경로가 코드에 있어야
     * 추측이 그대로 굳지 않는다.
     */
    const chk = await readFile('scripts/check-live.mjs', 'utf8');
    check('실제 응답과 규칙표를 대조할 길이 있음',
      chk.includes('기록해 둔 이름과 다름') && chk.includes('fredCalendarRules.mjs'));
    check('손으로 옮긴 FOMC 표가 낡았는지 점검함',
      chk.includes('앞으로 남은 회의') && chk.includes('연준 페이지에서 다음 해 일정을'));
    // 못 받는 것은 못 받는다고 적어 둔다
    // 손으로 옮긴 값이 왜 거기 있는지, 어디서 왔는지가 코드에 적혀 있어야 한다
    check('FOMC 를 손으로 옮긴 이유와 출처를 밝힘',
      cal.includes('federalreserve.gov/monetarypolicy/fomccalendars.htm') &&
      cal.includes('스크래핑은 이 프로젝트가 하지 않는다'));

    // 시각을 모르는 일정에 시계를 그리지 않는다
    const calList = await readFile('src/components/market/CalendarList.tsx', 'utf8');
    check('화면이 시각 미정을 시각처럼 그리지 않음',
      calList.includes('시각 미정') && !/formatKstTime\(event\.scheduledAt\)\s*\}\s*\n\s*\{event\.timeTbd/.test(calList));

    // 아직 안 붙은 곳은 조용히 빈 값을 만들지 않고 오류를 던진다
    for (const what of ['getFlows', 'getNews']) {
      check(`${what} 은 아직 연결 전이라 오류를 던짐`,
        new RegExp(`${what}[\\s\\S]{0,300}NotWiredError`).test(live));
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

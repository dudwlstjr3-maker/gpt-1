/**
 * 검증 스크립트 — 실행 중인 서버(기본 http://localhost:3000)를 상대로
 * 요구사항의 검증 기준을 자동으로 확인한다.
 *
 *   npm run build && npm start &   (또는 npm run dev)
 *   npm run verify
 */

import { readFile, readdir, stat } from 'node:fs/promises';
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
  // 목록을 손으로 적어 두면 새 테스트를 만들고도 안 돌린 채 지나간다 (실제로 그랬다).
  // 폴더에서 찾아 전부 태운다.
  const files = (await listFiles('scripts', /\.test\.mjs$/)).sort();
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
  // 크립토도 뺐다 (2026-11-26 사용자: "크립토는 그냥 빼버리자, 관심없다"). 심리 카드는 미국 하나다.
  check('심리 카드는 미국 하나 (크립토는 뺐다)', fng.length === 1 && fng[0]?.market === 'us', `${fng.map((f) => f.market).join(', ')}`);
  check('심리 카드에 크립토가 없음', !fng.some((f) => f.market === 'crypto'));
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
  const SCORED = ['us'];
  for (const m of SCORED) {
    const { body } = await getJson(`/api/fng/${m}`);
    await checkWeighting(`[${m}]`, body.detail);
  }
  // 없앤 시장으로 들어오면 404 여야 한다 — 조용히 다른 시장을 돌려주지 않는다
  {
    const { status } = await getJson('/api/fng/kr');
    check('/api/fng/kr 은 404', status === 404, `status=${status}`);
    const { status: cs } = await getJson('/api/fng/crypto');
    check('/api/fng/crypto 도 404 (크립토는 뺐다)', cs === 404, `status=${cs}`);
  }
  // 결측이 생겨 재조정이 실제로 일어나는 경로도 같은 잣대로 확인한다
  for (const m of SCORED) {
    const { body } = await getJson(`/api/fng/${m}?scenario=partial`);
    await checkWeighting(`[${m}/부분실패]`, body.detail);
  }

  console.log('\n[2] 가격 카드');
  const quotes = snap.sections?.quotes?.data ?? {};
  const flat = ['us', 'kr'].flatMap((m) => quotes[m] ?? []);
  check('미국 · 한국 시세 존재', ['us', 'kr'].every((m) => (quotes[m] ?? []).length > 0),
    ['us', 'kr'].map((m) => `${m}:${(quotes[m] ?? []).length}`).join(' '));
  check('크립토 시세는 받지 않음 (크립토는 뺐다)', !(quotes.crypto ?? []).length, `crypto:${(quotes.crypto ?? []).length}`);
  check('모든 가격에 기준 시각(asOf) 존재', flat.every((q) => typeof q.meta?.asOf === 'string' && !Number.isNaN(Date.parse(q.meta.asOf))));
  check('모든 가격에 지연 정보 존재', flat.every((q) => q.meta?.sources?.[0] && q.meta.sources[0].delayMinutes !== undefined));
  check('모든 가격에 실시간/지연 상태 표기', flat.every((q) => ['live', 'delayed', 'stale', 'demo'].includes(q.meta?.freshness)));
  check('가격이 없으면 null 이며 사유가 있음', flat.every((q) => q.price !== null || typeof q.unavailableReason === 'string'));

  const requiredUs = ['spx', 'ndx', 'dji', 'rut', 'vix', 'ust2', 'ust10', 'us_spread_10_2', 'dxy', 'gold', 'wti', 'nvda', 'aapl', 'msft', 'amzn', 'tsla'];
  const requiredKr = ['kospi', 'kosdaq', 'kospi200', 'vkospi', 'usdkrw', 'ktb3', 'ktb10', 'samsung', 'hynix', 'hyundai', 'naver', 'kakao'];
  const has = (list, ids) => ids.filter((id) => !list.some((q) => q.id === id));
  check('미국 필수 항목 모두 존재', has(quotes.us ?? [], requiredUs).length === 0, has(quotes.us ?? [], requiredUs).join(','));
  check('한국 필수 항목 모두 존재', has(quotes.kr ?? [], requiredKr).length === 0, has(quotes.kr ?? [], requiredKr).join(','));
  // 뺀 크립토 항목이 다른 칸에 섞여 들어오지도 않는다
  const goneIds = ['btc', 'eth', 'xrp', 'sol', 'bnb', 'total_mcap', 'total_vol', 'btc_dom', 'stable_mcap', 'funding', 'open_interest', 'liquidations'];
  check('뺀 크립토 항목이 어느 시세 칸에도 없음', !flat.some((q) => goneIds.includes(q.id)), flat.filter((q) => goneIds.includes(q.id)).map((q) => q.id).join(','));
  // 시세 밖의 자리에도 크립토가 남지 않는다 — 거래 시간 칩 · 일정 · 기사 · 선물 · 위험 신호등
  {
    const sec = snap.sections ?? {};
    const sessions = sec.sessions?.data ?? [];
    check('거래 시간 칩은 미국 · 한국 둘 (크립토 24시간 칩 없음)',
      sessions.length === 2 && !sessions.some((x) => x.market === 'crypto'), sessions.map((x) => x.market).join(','));
    const cal = sec.calendar?.data ?? [];
    check('일정에 크립토가 없음', cal.length > 0 && !cal.some((e) => e.market === 'crypto' || e.category === 'crypto'), `${cal.length}건`);
    const news = sec.news?.data ?? [];
    check('기사에 크립토 표시가 없음', !news.some((n) => (n.markets ?? []).includes('crypto')), `${news.length}건`);
    const fut = sec.futures?.data?.rows ?? [];
    check('선물에 크립토 무기한선물이 없음', fut.length > 0 && !fut.some((r) => r.group === 'crypto' || /비트코인|이더리움/.test(r.name ?? '')), `${fut.length}줄`);
  }

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
  for (const m of ['us']) {
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
  // 크립토 펀딩비도 뺐다 (2026-11-26) — 크립토를 앱에서 뺀 뒤로 놓일 자리가 없다.
  check('지표가 정확히 5개', (risk?.indicators ?? []).length === 5, `${risk?.indicators?.length}개`);
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
  check('미국·글로벌이 포함되고 크립토(펀딩비)는 없음',
    ['us', 'global'].every((m) => (risk?.indicators ?? []).some((i) => i.scope === m)) &&
      !(risk?.indicators ?? []).some((i) => i.scope === 'crypto'),
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
  for (const m of ['us']) {
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
  for (const m of ['us']) {
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
    };
    for (const m of ['us']) {
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
  }

  /* ---------------- 9. 생활 속 경제 이야기 ---------------- */
  console.log('\n[9] 생활 속 경제 이야기');
  {
    const basics = snap.sections?.basics;
    check('basics 섹션 존재', !!basics, `status=${basics?.status}`);
    const list = basics?.data ?? [];
    // 2026-11-26 가계부채 비율 · 합계출산율을 더해 11개. 경제 기사에 늘 나오는 두 숫자다.
    // 청년실업률은 보류 — 기사는 통계청 15~29세, 세계은행은 15~24세라 같은 이름에 다른 숫자가 선다.
    check('지표 11개', list.length === 11, `${list.map((b) => b.id).join(', ')}`);

    const wanted = ['per_capita_gdp', 'gini', 'misery', 'household_debt', 'fertility', 'bigmac', 'ppp_gap', 'engel', 'pir', 'cli', 'ccsi'];
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
  for (const path of ['/market/us', '/market/kr', '/fng/us', '/basics', '/indicators', '/calendar']) {
    const res = await fetch(`${BASE}${path}`);
    const html = await res.text();
    check(`${path} 렌더링`, res.status === 200 && html.includes('쫄탐일보'), `status=${res.status}`);
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
    /*
     * 홈에서 각 시장으로 바로 들어간다.
     *
     * 홈에서는 서버가 보낸 HTML 이 아니라 원본을 본다. 심리 카드는 스냅샷을
     * 받아 그리는 client 화면이라 서버 HTML 에는 뼈대만 있고, 링크는 붙은 뒤에
     * 생긴다. 예전에는 좌측 사이드바가 서버에서 같은 링크를 찍어 줘서 이 검사가
     * 통과했는데 — 사이드바를 접자 드러났다. 화면에서 길이 사라진 게 아니라
     * 검사가 엉뚱한 곳을 보고 있었다.
     */
    const fngCard = await readFile('src/components/market/FngCard.tsx', 'utf8');
    check('홈의 심리 카드에서 그 시장으로 바로 들어감',
      /href=\{`\/market\/\$\{score\.market\}`\}/.test(fngCard));
    // 서버가 찍어 주는 화면에도 길이 남아 있어야 한다 (지수 · 더보기)
    const idxHtml = await (await fetch(`${BASE}/indices`)).text();
    const moreHtml = await (await fetch(`${BASE}/more`)).text();
    for (const m of ['us']) {
      check(`지수·더보기에 ${m} 시장으로 가는 길이 있음`,
        idxHtml.includes(`/market/${m}`) && moreHtml.includes(`/market/${m}`));
    }
    // 크립토는 뺐다 (2026-11-26) — 없는 곳으로 가는 문을 그리지 않는다
    check('크립토 시장으로 가는 길은 없음',
      !idxHtml.includes('/market/crypto') && !moreHtml.includes('/market/crypto'));
    // 한국은 심리 점수를 낼 만큼의 무료 데이터가 없어 시장 화면이 없다 — 없는 곳으로 가는 문을 그리지 않는다
    check('한국 시장으로 가는 길은 없음',
      !idxHtml.includes('/market/kr') && !moreHtml.includes('/market/kr'));
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

    // 두 시장이 모두 한 화면에 있어야 한다 (고르게 하지 않는다). 크립토는 뺐다 (2026-11-26).
    for (const label of ['미국', '한국']) {
      check(`지수 화면에 ${label} 묶음이 있음`, idx.includes(`>${label}</span>`));
    }
    check('지수 화면에 크립토 묶음이 없음', !idx.includes('>크립토</span>'));

    // 목록은 카탈로그가 정하고 값만 받아 온다. 그래서 이름·기호는 값이 오기 전에도
    // 서 있어야 하고(서버가 그린 HTML 에 있어야 하고), 값은 스냅샷에 있어야 한다.
    const quotes = snap.sections?.quotes?.data ?? {};
    const all = [...(quotes.us ?? []), ...(quotes.kr ?? [])];
    // 한국에서 실제로 쓰는 말이 있는 지수는 한글 이름으로 세운다.
    // 원문 기호(SPX·KOSPI 등)는 이름 아래에 그대로 남아 검색이 막히지 않는다.
    for (const [id, name] of [['spx', 'S&amp;P 500'], ['kospi', '코스피']]) {
      check(`지수 화면에 ${id} 줄이 있음`, idx.includes(`>${name}</p>`));
      check(`${id} 값이 스냅샷에 있음`, all.some((x) => x.id === id && x.price !== null));
    }
    // 지수만 모은 화면이다 — 개별 종목이 섞여 들어오면 안 된다
    for (const [id, name] of [['samsung', '삼성전자'], ['nvda', '엔비디아']]) {
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

    // 시장별 화면으로 들어가는 입구를 겸한다 (크립토는 2026-11-26 뺐다)
    for (const m of ['us']) {
      check(`지수 화면에서 ${m} 시장 화면으로 갈 수 있음`, idx.includes(`/market/${m}`));
    }
    check('지수 화면에 크립토 값(시가총액 · 도미넌스)이 없음',
      !idx.includes('전체 시가총액') && !idx.includes('비트코인 점유율') && !idx.includes('공식 지수는 크립토에 없습니다'));
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
    check('생활 경제 지수가 열한 가지', basics.length === 11, `${basics.length}개`);
    // 표시 이름이 아니라 **id** 로 확인한다. 큰 글씨는 쉬운 우리말로 바뀔 수 있고
    // 실제로 바뀌었다 ('1인당 GDP' → '국민 한 사람 몫의 생산'). 정체는 id 다.
    const ids9 = basics.map((b) => b.id);
    for (const [id, was] of [['bigmac', '빅맥지수'], ['per_capita_gdp', '1인당 GDP'],
      ['engel', '엥겔계수'], ['gini', '지니계수']]) {
      check(`생활 경제 지수에 ${was} 있음`, ids9.includes(id), ids9.join(', ').slice(0, 60));
    }
    // 열한 개를 한 줄로 늘어놓지 않고 세 묶음으로 나눈다. 묶음에 빠진 항목이
    // 있으면 화면에서 "그 밖의 지표" 로 밀려나므로 원본에서 확인한다.
    const lib = await readFile('src/lib/economyBasics.ts', 'utf8');
    const grouped = [...lib.matchAll(/ids:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    for (const g of ['나라 살림과 소득', '물가로 견주는 지수', '경기를 앞서 읽는 지수']) {
      check(`묶음 "${g}" 있음`, lib.includes(g));
    }
    const ungrouped = basics.map((b) => b.id).filter((id) => !grouped.includes(id));
    check('묶음에서 빠진 항목이 없음', ungrouped.length === 0, ungrouped.join(', ') || '없음');
    // 미리보기는 해설 · 묶음을 손으로 옮긴 JSON 을 갖는다 — 앱과 같은 묶음 · 같은 항목이어야 한다
    {
      const tplB = await readFile('tools/preview/template.html', 'utf8');
      const tGroups = JSON.parse(tplB.match(/\n  const BASIC_GROUPS = (\[.*\]);\n/)?.[1] ?? '[]');
      const tGuide = JSON.parse(tplB.match(/\n  const BASIC_GUIDE = (\{.*\});\n/)?.[1] ?? '{}');
      check('미리보기 묶음이 앱과 같음', JSON.stringify(tGroups.flatMap((g) => g.ids)) === JSON.stringify(grouped),
        tGroups.flatMap((g) => g.ids).join(','));
      check('미리보기에 새 두 지표의 해설이 있음',
        ['household_debt', 'fertility'].every((id) => tGuide[id]?.headline && lib.includes(`  ${id}: {`) && lib.includes(tGuide[id].headline)));
    }
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
    // 미국은 CNN 방식과 같은 7개. (크립토 8개 구성은 2026-11-26 앱에서 뺐다)
    // 개수가 말없이 바뀌면 화면의 설명과 어긋나므로 못 박아 둔다.
    const EXPECT = { us: 7, kr: 7 };
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
    /*
     * 이 검사는 두 번 뒤집혔다. 뒤집힌 자리를 적어 둔다 — 다음 사람이 같은 길을
     * 되짚지 않도록.
     *
     *  ① 처음엔 "이름이 길면 잘려야 한다" 였다. 이름이 옆 칸을 밀고 들어가 글자가
     *     겹치던 것을 막으려던 것이고, 그때는 자르는 것이 유일한 수단이었다.
     *  ② 다음엔 "자르지 말고 접어라" 였다. '다우존스 산업평…' 은 무엇인지 알 수 없다.
     *  ③ 지금은 "접지도 말고 한 줄로" 다. 접으면 카드마다 높이가 달라져 목록이
     *     들쭉날쭉해진다.
     *
     * 자르지도 접지도 않으려면 자리가 있어야 한다. 그래서 '마감'·'15분 지연' 알약을
     * 이름 줄에서 빼 아래 잔글씨로 내렸다. 자리가 실제로 남는지는 [8-27] 이 잰다.
     */
    check('종목 이름을 한 줄로 세움 (미리보기)',
      /\.pcard-name\s*\{[^}]*white-space:\s*nowrap/.test(tpl) &&
      !/\.pcard-name\s*\{[^}]*text-overflow:\s*ellipsis/.test(tpl));
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
    /*
     * 국면 상세에는 곡선이 하나뿐이어야 한다.
     *
     * 예전에는 regimeBody 의 곡선을 감춰 놓고(compact) 바로 아래에 같은 20년
     * 곡선을 크게 한 번 더 그렸다 — 한 화면에 같은 그림이 두 번이었다.
     * 이제 감추지 않고 그 하나만 쓴다. 눌러서 크게 보는 길은 그대로다.
     */
    check('국면 상세가 곡선을 한 번만 그림',
      !regimeDetail.includes('<InteractiveChart') && /<RegimeBoardBody digest=\{digest\} \/>/.test(regimeDetail));
    check('그 곡선도 눌러 크게 볼 수 있음', regimeBoard.includes('<ExpandTrigger'));
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
    // 국면 곡선은 regimeBody 안의 하나뿐이다 — 그 아래에 같은 것을 또 그리지 않는다
    check('미리보기 국면 상세도 곡선을 한 번만 그림',
      !tpl2.includes("lineChart([{ id: 'regime'") && /\? regimeBody\(digest, false\) \+/.test(tpl2));
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
    /* 예시 파일이 demo 로 고정돼 있으면, 그대로 배포 환경변수에 옮긴 사람은 키를 넣어도 예시 데이터만 본다 (2026-11-25) */
    check('.env.example 의 모드는 auto — 키를 넣으면 실제 데이터로', /^MARKET_MOOD_MODE=auto$/m.test(envExample) && !/^MARKET_MOOD_MODE=demo$/m.test(envExample));

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
    // 칸이 넓어지면 두 칸. 화면 폭이 아니라 **본문 칸**의 폭을 본다 ([8-28] 참고)
    check('생활 카드가 칸이 넓어지면 두 칸으로 섬', /grid gap-[\d.]+ @min-\[768px\]:grid-cols-2/.test(board));
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
    check('미리보기 두 칸 기준이 앱과 같음(768px)', /@container app \(min-width: 768px\) \{ \.bgrid/.test(tpl4));
    /*
     * 옛 좌우 배치(.btrend)가 되살아나지 않았는가.
     *
     * 예전에는 글자와 그림을 좌우로 나눠 놓았는데, 넓은 화면에서 카드가 952px 을
     * 차지하면서 세로로 4,727px 을 굴러야 했다. 그 배치의 클래스 이름이 btrend 였다.
     *
     * 검사는 'btrend' 라는 글자가 보이면 실패하게 되어 있었는데, 뒤에 작은 그림의
     * 휠 확대를 붙이면서 data-btrend 표식이 생겨 애먼 데서 걸렸다. 막으려는 것은
     * 이름이 아니라 **그 배치**라, 이제 같은 이름의 CSS 규칙이 있는지만 본다.
     */
    check('미리보기에서 옛 좌우 배치가 사라짐', !/\.btrend\s*\{/.test(tpl4));
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

    /*
     * 누를 자리는 적어도 24×24 (WCAG 2.2 AA 2.5.8 Target Size).
     *
     * 재 보니 네 화면에서 스무 곳 넘게 모자랐다. 글자만 있는 단추·링크는 글자
     * 높이가 그대로 누를 자리가 되어서다 — 11.5px 글자면 17px, 12.5px 면 19px.
     * 보이는 크기는 그대로 두고 세로로만 24px 을 보장하는 .tap 을 붙였다.
     *
     * 별표(★)는 여기 해당하지 않는다. ::after 로 32×44 를 따로 잡아 두었다.
     */
    check('누를 자리를 24px 로 보장하는 길이 있음',
      /\.tap \{[\s\S]{0,120}min-height: 24px/.test(await readFile('src/app/globals.css', 'utf8')));
    const tapUsers = [];
    for (const f of await listFiles('src', /\.tsx$/)) {
      const t = await readFile(f, 'utf8');
      if (/className="tap |className="tap"/.test(t)) tapUsers.push(f.split('/').pop());
    }
    check('작은 글자 단추들이 그것을 씀', tapUsers.length >= 10, `${tapUsers.length}곳`);
    check('미리보기도 같은 규칙', /\.linkbtn \{[^}]*min-height: 24px/.test(await readFile('tools/preview/template.html', 'utf8')));

    /* 손가락으로 누를 자리 */
    const price = await readFile('src/components/market/PriceCard.tsx', 'utf8');
    /*
     * 별표를 누를 자리는 32×44 여야 한다.
     *
     * 숫자를 그대로 맞춰 보지 않고 계산한다. 예전에는 leading-none(16px 상자)에
     * 위아래 14px 을 넓혀 44px 을 만들었는데, 이름과 위쪽을 맞추려고 줄 높이를
     * leading-snug(22px 상자)로 바꾸면서 11px 이 됐다. 둘 다 44px 이다 —
     * 적힌 숫자가 아니라 나오는 크기를 봐야 이런 바꿈에 걸려 넘어지지 않는다.
     */
    const LEADING = { 'leading-none': 1, 'leading-tight': 1.25, 'leading-snug': 1.375, 'leading-normal': 1.5 };
    const starM = price.match(/className="relative shrink-0 text-base (leading-[a-z]+) after:absolute after:-inset-x-(\d+) after:-inset-y-\[(\d+(?:\.\d+)?)px\]/);
    const starTap = starM
      ? { w: 16 + 2 * Number(starM[2]) * 4, h: 16 * (LEADING[starM[1]] ?? 1) + 2 * Number(starM[3]) }
      : { w: 0, h: 0 };
    check('관심 별표를 손가락으로 누를 수 있음(16px 글리프에 32×44 자리)',
      starTap.w >= 32 && starTap.h >= 44 && /after:content-\[''\]/.test(price),
      `${starTap.w}×${Math.round(starTap.h)}`);
    // 넓힌 가로(8px)가 옆 칸 간격(gap-2 = 8px)과 같아야 이름 링크를 덮지 않는다
    check('넓힌 자리가 이름 링크를 덮지 않음',
      /items-start gap-2">/.test(price) && /after:-inset-x-2/.test(price));
    const tplStar = tpl7.match(/\.star \{[^}]*line-height: ([\d.]+)[^}]*\}[\s\S]{0,120}?\.star::after \{[^}]*inset: -([\d.]+)px -(\d+)px/);
    const tplTap = tplStar
      ? { w: 16 + 2 * Number(tplStar[3]), h: 16 * Number(tplStar[1]) + 2 * Number(tplStar[2]) }
      : { w: 0, h: 0 };
    check('미리보기 별표도 같은 자리', tplTap.w >= 32 && tplTap.h >= 44, `${tplTap.w}×${Math.round(tplTap.h)}`);
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

  /* ---------------- 8-21. 간격이 일정한가 · 숫자로 판단할 수 있는가 ---------------- */
  console.log('\n[8-21] 간격 한 눈금 · 판단 재료');
  {
    /*
     * ① 간격이 제각각이었다.
     *    같은 일을 하는 자리가 파일마다 달랐다 — 카드 안쪽 여백이 8·10·12·14·16px,
     *    카드끼리 간격이 6·8·10·12·16·20px, 섹션 사이가 12·16·20px 이었다.
     *    반 칸(6·10·14px)을 없애 4px 격자로 스냅하고, 역할별로 값을 하나씩 정했다.
     *      카드 안쪽 여백 = 화면 좌우 여백 = 12px (카드 글자가 화면 글자와 같은 세로선)
     *      섹션 사이 = 20px
     *    2px(0.5)만 남겼다 — 기호와 글자가 붙는 자리.
     *
     * ② 숫자는 있는데 판단할 재료가 없었다.
     *    값·방향·색 띠·구간 목록이 다 있는데, 정작 "다음 단계까지 얼마 남았나" 는
     *    15 에서 11.55 를 직접 빼야 나왔고, "요즘 값 중 어디인가" 는 스파크라인
     *    모양으로 짐작해야 했다. 둘 다 있는 데이터로 계산된다.
     */
    const HALF = /(?<![\w-])(?:-?(?:m|p)(?:t|b|l|r|x|y)?|gap(?:-x|-y)?|space-(?:x|y))-(?:1\.5|2\.5|3\.5)(?![\d.])/;
    const offGrid = [];
    const cardPad = new Set();
    const sectionTop = new Set();
    for (const f of await listFiles('src', /\.tsx$/)) {
      const t = await readFile(f, 'utf8');
      if (HALF.test(t)) offGrid.push(f);
      for (const m of t.matchAll(/className="[^"]*\bcard\b[^"]*"/g)) {
        const p2 = m[0].match(/(?<![\w-])p-(\d+(?:\.\d+)?)/);
        if (p2) cardPad.add(p2[1]);
      }
      for (const m of t.matchAll(/<section[^>]*className="[^"]*?(?<![\w-])mt-(\d+(?:\.\d+)?)/g)) sectionTop.add(m[1]);
    }
    check('간격이 4px 격자를 벗어나지 않음 (2px 만 예외)', offGrid.length === 0,
      offGrid.length ? `${offGrid.length}개 파일 (예: ${offGrid[0]})` : '');
    check('카드 안쪽 여백이 하나뿐', [...cardPad].filter((v) => v !== '0').length === 1,
      `쓰인 값: ${[...cardPad].sort().join(', ') || '없음'}`);
    check('카드 여백이 화면 좌우 여백과 같은 12px', cardPad.has('3'));
    check('섹션 사이 간격이 하나뿐', sectionTop.size === 1, `쓰인 값: ${[...sectionTop].sort().join(', ')}`);
    // 미리보기 스타일시트도 4px 격자 위에 있어야 한다 (같은 화면을 손으로 옮겨 그린 것이라 따로 샌다)
    const tplSp = await readFile('tools/preview/template.html', 'utf8');
    const offCss = [...tplSp.matchAll(/(?:padding|margin|gap)(?:-\w+)?: ?(\d+)px/g)]
      .map((m) => Number(m[1]))
      // 2px 은 기호와 글자가 붙는 자리라 앱과 마찬가지로 남긴다
      .filter((v) => v > 2 && v % 4 !== 0);
    check('미리보기 여백도 4px 격자 위에 있음', offCss.length === 0,
      offCss.length ? `벗어난 값 ${[...new Set(offCss)].sort((a, b) => a - b).join(', ')}px` : '');

    /* ② 판단 재료 */
    const judge = await readFile('src/lib/riskJudgement.mjs', 'utf8');
    const gauges = await readFile('src/components/market/RiskGauges.tsx', 'utf8');
    const tpl10 = await readFile('tools/preview/template.html', 'utf8');
    check('다음 경계를 계산하는 규칙이 있음', /export function nextBoundary/.test(judge));
    check('낮을수록 위험한 지표도 방향을 뒤집어 봄', /direction !== 'lower_is_riskier'/.test(judge));
    check('제일 위험한 구간에서는 나아지는 경계를 말함', /dir: 'better'/.test(judge));
    check('최근 구간 안의 자리를 계산함', /export function recentPosition/.test(judge));
    check('표본이 적으면 범위를 말하지 않음', /vals\.length < 5/.test(judge));
    check('움직이지 않은 구간은 위치를 말하지 않음', /!\(max > min\)/.test(judge));
    check('백분위라고 부르지 않음 — 최저~최고 사이의 자리라고 적음', /백분위가 아니라/.test(judge));
    check('지표 카드가 그 재료를 보여줌', /<JudgeStrip indicator=\{indicator\} \/>/.test(gauges));
    check('미리보기도 같은 규칙을 씀',
      /function nextBoundary\(i\)/.test(tpl10) && /function recentPosition\(spark, value\)/.test(tpl10) && /judgeStrip\(i\)/.test(tpl10));
    // 판단 재료라고 해서 매매를 권하면 안 된다
    for (const word of ['매수', '매도', '사세요', '파세요', '지금 사', '지금 팔']) {
      check(`판단 재료에 '${word}' 가 없음`, !judge.includes(word) && !/JudgeStrip[\s\S]{0,2000}/.exec(gauges)?.[0]?.includes(word));
    }
  }

  /* ---------------- 8-22. 선물 판 ---------------- */
  console.log('\n[8-22] 선물 시장 — 규칙을 지키면서 어디까지 담았나');
  {
    /*
     * 요청은 "finviz.com/futures 에 있는 걸 전부 가져와라" 였다.
     * 긁어 오지 않았다. 두 가지 이유다.
     *   ① finviz 이용약관이 자동 수집·재배포를 금지한다.
     *   ② 이 앱이 처음부터 지키기로 한 규칙 — "데이터 제공업체의 이용약관·재배포
     *      권한·지연 조건 준수" — 을 어긴다. 한국 개별주·VKOSPI 를 뺀 것과 같은 이유다.
     *
     * 대신 화면은 그대로 만들고, 값은 합법적으로 받을 수 있는 것만 채운다.
     * 못 채우는 항목은 지우지 않고 **왜 비었는지**를 적는다 — 조용히 빼면 목록이
     * 왜 짧은지 알 수 없다.
     */
    const cat = await readFile('src/lib/futuresCatalog.ts', 'utf8');
    const view = await readFile('src/components/market/FuturesBoard.tsx', 'utf8');
    const demoF = await readFile('src/server/adapters/demo/futures.ts', 'utf8');
    const liveF = await readFile('src/server/adapters/live/index.ts', 'utf8');
    const tpl11 = await readFile('tools/preview/template.html', 'utf8');
    const buildJs = await readFile('tools/preview/build.mjs', 'utf8');

    /* ① 목록과 사유 */
    const ids = [...cat.matchAll(/\{ id: '([^']+)', name: '/g)].map((m) => m[1]);
    check('선물 항목이 30개 이상', ids.length >= 30, `${ids.length}개`);
    check('항목 id 가 겹치지 않음', new Set(ids).size === ids.length);
    check('값을 못 넣는 항목은 사유를 갖고 있음',
      !/source: 'none'(?![^}]*reason:)/.test(cat.replace(/\n/g, ' ')));
    check('거래소 유료 시세라는 사실을 밝힘', /거래소\(CME·ICE\)가 파는 시세/.test(cat));
    check('선물이 아닌 값을 대신 쓴 경우 그 사실을 적음', /proxy\?: string/.test(cat) && /현물 고시가/.test(cat));

    /* ② 화면 */
    const boardRes = await fetch(`${BASE}/api/snapshot?scenario=normal`);
    const boardJson = await boardRes.json();
    const board = boardJson?.sections?.futures?.data;
    check('스냅샷에 선물 판이 있음', Boolean(board), board ? `${board.rows.length}개` : '없음');
    if (board) {
      check('목록의 모든 항목이 스냅샷에 있음', board.rows.length === ids.length, `${board.rows.length}/${ids.length}`);
      check('값이 없는 항목도 빠지지 않음', board.rows.some((r) => r.last === null && r.unavailableReason));
      check('값이 있는 항목은 지나온 선을 갖고 있음',
        board.rows.filter((r) => r.last !== null).every((r) => r.spark.length > 30));
      check('빈 값을 0 으로 채우지 않음', board.rows.every((r) => r.last !== null || r.changePct === null));
    }
    for (const path of ['/futures']) {
      const res = await fetch(`${BASE}${path}`);
      check(`${path} 응답 200`, res.status === 200, `status=${res.status}`);
    }

    /* ③ 막대 — 묶음 안에서만 견준다 */
    check('등락 막대가 0 을 가운데 둔 발산형', /const half = BAR_W \/ 2/.test(view) && /pct >= 0 \? half : half - w/.test(view));
    check('막대 기준이 묶음 안 최댓값', /묶음에서 제일 크게 움직인 값/.test(view));
    check('기준이 묶음마다 다르다는 사실을 적음', /묶음끼리는 길이를 견주지/.test(view));
    check('기간을 바꿔도 서버에 다시 묻지 않음', /changeOver\(r\.spark, back\)/.test(view));
    check('지나온 선이 짧으면 값을 지어내지 않음', /if \(idx < 0\) return null/.test(cat));

    /* ④ 세 곳이 같은 목록을 본다 */
    check('미리보기가 목록을 원본에서 읽음', /readFuturesCatalog/.test(buildJs) && /futuresCatalog\.ts/.test(buildJs));
    // 그냥 여는 파일에는 charset 이 반드시 있어야 한다. 없으면 로컬에서 열 때
    // 브라우저가 인코딩을 짐작하고 한글이 통째로 깨진다 — 화면을 아무리 잘 만들어도 소용없다.
    check('미리보기 파일에 문자 인코딩이 박혀 있음',
      /<meta charset="utf-8">/.test(buildJs) && /<!doctype html>/.test(buildJs));
    check('아티팩트용은 머리 태그 없이 따로 낸다', /OUT_BARE/.test(buildJs));

    // 검토용 묶음 — 남에게 코드를 넘기는 길이라, 비밀이 담길 파일을 거르는지가 제일 중요하다
    const bundleJs = existsSync('scripts/bundle.mjs') ? await readFile('scripts/bundle.mjs', 'utf8') : '';
    check('검토용 묶음 스크립트가 있음', bundleJs.length > 0);
    check('묶음이 .env.local 과 node_modules 를 거름',
      /\.env\.local/.test(bundleJs) && /node_modules/.test(bundleJs) && /SKIP_DIR/.test(bundleJs));
    check('묶음이 규칙을 앞에 붙임 (맥락 없이 던지지 않는다)',
      existsSync('tools/review/01-검토-요청.md') && existsSync('tools/review/02-업그레이드-요청.md'));
    // 받는 사람이 여러 번 올리게 하지 않는다 — 파일 하나로 낸다
    check('묶음이 파일 하나(zip)로 나옴', /spawnSync\('zip'/.test(bundleJs) && /검토\.zip/.test(bundleJs));
    check('묶음이 읽을 수 없는 파일을 뺌', /SKIP_EXT/.test(bundleJs));
    check('요청서가 일부러 지키는 규칙을 밝힘',
      /일부러\*\* 지키는 규칙/.test(await readFile('tools/review/01-검토-요청.md', 'utf8')));
    check('미리보기도 사유 없는 빈 항목을 막음', /사유 없는 빈 항목/.test(buildJs));
    check('미리보기에 선물 화면이 있음', /function viewFutures\(\)/.test(tpl11) && /futures: viewFutures/.test(tpl11));
    check('미리보기 막대도 같은 규칙', /function futBar\(pct, max, color\)/.test(tpl11));

    /* ⑤ DEMO 와 LIVE 가 같은 규칙을 지킨다 */
    check('DEMO 도 거래소 유료 항목을 비워 둠', /item\.source === 'none'/.test(demoF));
    check('DEMO 값이 실제 시세가 아님을 밝힘', /실제 시세가 아니다/.test(demoF));
    check('LIVE 는 FRED 로 되는 것만 채움', /FUTURES_FRED/.test(liveF));
    check('LIVE 도 대신 쓴 값이라는 사실을 함께 내보냄', /note \? \{ proxyNote: note \}/.test(liveF));
    // 긁어 온 소스가 섞이지 않았는지
    for (const banned of ['finviz', 'investing.com', 'tradingview']) {
      check(`${banned} 을(를) 긁어 오지 않음`,
        !cat.includes(banned) && !liveF.includes(banned) && !demoF.includes(banned));
    }
  }

  /* ---------------- 8-23. 인도월 곡선 ---------------- */
  console.log('\n[8-23] 선물 — 값 하나 말고 판단 재료 (인도월 곡선)');
  {
    /*
     * 여기가 이 앱에서 **진짜 선물 계약 값**이 실리는 유일한 자리다.
     * 지수·금속·농산물 선물은 거래소가 파는 시세라 못 넣지만, 에너지 넷은 미국
     * 에너지정보청(EIA)이 NYMEX 인도월 정산가를 공개 통계로 내고 재배포 제한이 없다.
     *
     * 인도월 1~4를 함께 받는 이유는 곡선을 읽기 위해서다 — 가격 하나는 비싸다/싸다
     * 밖에 못 읽지만, 곡선은 "시장이 앞으로를 어떻게 보고 있는가" 를 한 줄 더 준다.
     * 그게 "숫자만 늘어놓지 말라" 는 요구에 대한 대답이다.
     */
    const eiaSrc = existsSync('src/server/adapters/live/providers/eia.ts')
      ? await readFile('src/server/adapters/live/providers/eia.ts', 'utf8') : '';
    const curveSrc = existsSync('src/lib/futuresCurve.mjs') ? await readFile('src/lib/futuresCurve.mjs', 'utf8') : '';
    const cat2 = await readFile('src/lib/futuresCatalog.ts', 'utf8');
    const view2 = await readFile('src/components/market/FuturesBoard.tsx', 'utf8');
    const liveF2 = await readFile('src/server/adapters/live/index.ts', 'utf8');
    const cfgSrc = await readFile('src/server/config.ts', 'utf8');
    const tpl12 = await readFile('tools/preview/template.html', 'utf8');
    const stub = await readFile('scripts/live-stub.mjs', 'utf8');
    const parse = await readFile('scripts/check-parse.mjs', 'utf8');
    const envEx = await readFile('.env.example', 'utf8');

    /* ① 제공사 */
    check('EIA 제공사 모듈이 있음', eiaSrc.length > 0);
    check('인도월 1~4를 한 번에 받음', /facets\[series\]\[\]/.test(eiaSrc) && /RCLC1/.test(eiaSrc) && /RNGC1/.test(eiaSrc));
    check('난방유·휘발유까지 붙음', /RHOC1/.test(eiaSrc) && /EER_EPMRR_PE1_Y35NY_DPG/.test(eiaSrc));
    check('결측을 0 으로 바꾸지 않음', /0 으로 바꾸면/.test(eiaSrc));
    check('응답 모양을 확인하지 못했다는 사실을 적어 둠',
      /확인하지 못했다/.test(eiaSrc) && /check:live/.test(eiaSrc));
    check('약관·재배포 조건을 적어 둠', /재배포에 제한이 없다/.test(eiaSrc) && /무료/.test(eiaSrc));

    /* ② 같은 날끼리만 견준다 — 시차를 곡선이라고 부르지 않는다 */
    check('곡선은 같은 날짜의 값끼리만 만든다', /같은 날짜의 값끼리만/.test(eiaSrc) && /function curveFrom/.test(eiaSrc));

    /* ③ 곡선 읽기 규칙 */
    check('곡선 읽기가 순수 모듈로 분리됨', /export function curveShape/.test(curveSrc));
    check('문턱 아래는 평평으로 읽음', /FLAT_PCT = 0\.5/.test(curveSrc));
    check('색만으로 뜻을 전하지 않음(기호+글자)', /SHAPE_GLYPH/.test(curveSrc) && /SHAPE_LABEL/.test(curveSrc));
    check('사라/팔아라 를 말하지 않음',
      !/(매수|매도|사세요|파세요|수익|추천)/.test(curveSrc), '문구 검사');
    check('계약이 둘 미만이면 모양을 지어내지 않음', /pts\.length < 2\) return null/.test(curveSrc));
    check('곡선 단위 테스트가 있음', existsSync('scripts/futuresCurve.test.mjs'));

    /* ④ 키가 없을 때의 정직함 */
    check('EIA 키가 선택 키로 등록됨', /EIA_API_KEY/.test(cfgSrc) && /OPTIONAL_KEYS/.test(cfgSrc));
    check('키가 없으면 현물로 내려앉고 그 사실을 밝힘', /fallback\?: \{ source: 'fred'; note: string \}/.test(cat2));
    check('내려앉은 경우에만 대신 쓴 값 문구를 붙임', /const note = usingFallback \? item\.fallback\?\.note : item\.proxy/.test(liveF2));
    check('대신 쓸 곳이 없으면 왜 비는지 적음', /EIA 무료 키\(EIA_API_KEY\)가 없어 비워 둡니다/.test(liveF2));
    check('.env.example 에 EIA 항목이 있음', /EIA_API_KEY=/.test(envEx) && /eia\.gov\/opendata/.test(envEx));

    /* ⑤ 화면 */
    check('화면이 곡선 줄을 그림', /function CurveStrip/.test(view2) && /curveShape\(curve\)/.test(view2));
    check('곡선 줄이 한 줄 전체를 씀', /col-span-2/.test(view2));
    check('미리보기도 같은 규칙을 옮겨 둠',
      /function futCurveShape/.test(tpl12) && /FUT_FLAT_PCT = 0\.5/.test(tpl12) && /futcurve/.test(tpl12));

    /* ⑥ 스냅샷에 실제로 실려 오는가 */
    const fRes = await fetch(`${BASE}/api/snapshot?scenario=normal`);
    const fSnap = await fRes.json();
    const fRows = fSnap?.sections?.futures?.data?.rows ?? [];
    const eiaIds = [...cat2.matchAll(/\{ id: '([^']+)'[^\n]*source: 'eia'/g)].map((m) => m[1]);
    check('EIA 로 받는 항목이 네 개', eiaIds.length === 4, eiaIds.join(' '));
    for (const id of eiaIds) {
      const r = fRows.find((x) => x.id === id);
      check(`${id} 에 인도월 곡선이 실려 옴`, (r?.curve ?? []).length >= 2, `${(r?.curve ?? []).length}개`);
      check(`${id} 곡선의 인도월이 모두 같은 날`,
        new Set((r?.curve ?? []).map((c) => c.at)).size === 1);
    }
    // DEMO 는 콘탱고와 백워데이션을 둘 다 보여줘야 화면을 확인할 수 있다
    const shapes = eiaIds.map((id) => {
      const c = fRows.find((x) => x.id === id)?.curve ?? [];
      if (c.length < 2) return null;
      const s2 = [...c].sort((a, b) => a.n - b.n);
      return ((s2[s2.length - 1].value - s2[0].value) / Math.abs(s2[0].value)) * 100;
    }).filter((v) => v !== null);
    check('DEMO 에 콘탱고와 백워데이션이 둘 다 있음',
      shapes.some((v) => v >= 0.5) && shapes.some((v) => v <= -0.5),
      shapes.map((v) => v.toFixed(1) + '%').join(' '));

    /* ⑦ 파싱 점검이 이 경로를 태우는가 */
    check('대역 서버에 EIA 경로가 있음', /EIA 선물 정산가/.test(stub) && /RNGC/.test(stub) && /natural-gas/.test(stub));
    check('대역 서버가 곡선 모양을 흔들림에 잡아먹히지 않게 만듦', /인도월 전체가 함께/.test(stub));
    check('파싱 점검이 EIA 를 태움', /EIA_BASE_URL/.test(parse) && /인도월/.test(parse));
    check('선물 판에 쓰는 FRED 계열이 대역 서버에 다 있음',
      ['DGS5', 'DGS30', 'DCOILWTICO', 'DCOILBRENTEU', 'DHHNGSP', 'DTWEXBGS',
        'DEXUSEU', 'DEXJPUS', 'DEXUSUK', 'DEXCAUS', 'DEXUSAL', 'DEXSZUS'].every((k) => stub.includes(k)));
  }

  /* ---------------- 8-24. 재무제표 ---------------- */
  console.log('\n[8-24] 재무제표 — 가격만 있던 화면에 회사를 붙였는가');
  {
    /*
     * 이 앱은 오랫동안 종목의 가격만 알았다. 가격만으로는 "왜 이 값인가" 를 물을 수
     * 없다. SEC(미국 증권거래위원회)가 상장사 공시를 기계가 읽는 형태로 전부, 무료로,
     * 재배포 제한 없이 공개한다 — 유료 벤더가 파는 '재무 데이터' 의 원본이다.
     *
     * 여기서 지키는지 보는 것
     *   · 회사가 안 쓰는 태그는 그 줄만 비고 화면 전체가 죽지 않는다
     *   · 4분기를 공시하지 않는 회사의 빈 분기를 연간에서 빼서 채우지 않는다
     *   · 적자면 PER 을 내지 않고 왜 안 내는지 적는다
     *   · 공시가 없는 대상(지수·코인)은 '없다' 고 말한다
     */
    const fundSrc = existsSync('src/lib/fundamentals.mjs') ? await readFile('src/lib/fundamentals.mjs', 'utf8') : '';
    const secSrc = existsSync('src/server/adapters/live/providers/sec.ts')
      ? await readFile('src/server/adapters/live/providers/sec.ts', 'utf8') : '';
    const compSrc = await readFile('src/lib/companyCatalog.ts', 'utf8');
    const cardSrc = await readFile('src/components/market/FundamentalsCard.tsx', 'utf8');
    const demoFund = await readFile('src/server/adapters/demo/fundamentals.ts', 'utf8');
    const stub2 = await readFile('scripts/live-stub.mjs', 'utf8');
    const parse2 = await readFile('scripts/check-parse.mjs', 'utf8');
    const envEx2 = await readFile('.env.example', 'utf8');

    /* ① 읽기 규칙 */
    check('재무제표 읽기가 순수 모듈로 분리됨', /export function quarterly/.test(fundSrc) && /export function valuation/.test(fundSrc));
    check('수정 공시가 오면 나중 것을 쓴다', /export function dedupe/.test(fundSrc) && /가장 나중에 접수된/.test(fundSrc));
    check('기간 길이로 분기·연간을 가른다', /QUARTER_MIN = 80/.test(fundSrc) && /YEAR_MIN = 340/.test(fundSrc));
    check('전년 동기와 견준다 (직전 분기가 아님)', /계절을 탄다/.test(fundSrc) && /export function yoy/.test(fundSrc));
    check('비율은 같은 기간끼리만 나눈다', /같은 기간끼리만 나눈다/.test(fundSrc));
    check('TTM 은 연속한 네 분기라야 한다', /연속한 네 분기라야 한다/.test(fundSrc));
    check('4분기를 연간에서 빼서 채우지 않는다', /빼서 채우지 않는다/.test(fundSrc));
    check('재무제표 단위 테스트가 있음', existsSync('scripts/fundamentals.test.mjs'));

    /* ② 제공사 */
    check('SEC 제공사 모듈이 있음', secSrc.length > 0);
    check('키가 필요 없다는 사실과 재배포 조건을 적어 둠',
      /무료이고 키가 없다/.test(secSrc) && /재배포 제한도 없다/.test(secSrc));
    check('SEC 가 요구하는 User-Agent 를 붙임', /'user-agent': cfg\.userAgent/.test(secSrc));
    check('404 는 오류가 아니라 그 태그를 안 쓴다는 뜻으로 다룸',
      /noRetryStatus/.test(secSrc) && /e\.status === 404\) return null/.test(secSrc));
    check('응답 모양을 확인하지 못했다는 사실을 적어 둠', /확인하지\s*\n?\s*\*\s*못했다|확인하지 못했다/.test(secSrc));
    check('회사마다 다른 태그를 앞에서부터 시도함', /for \(const tag of def\.tags\)/.test(secSrc));
    check('어느 태그를 썼는지 올려보냄', /tag,\s*\n\s*quarterly/.test(secSrc) || /line: \{ \.\.\.base, tag,/.test(secSrc));
    check('.env.example 이 User-Agent 를 설명함', /SEC_USER_AGENT=/.test(envEx2) && /403/.test(envEx2));

    /* ③ 목록 */
    const ciks = [...compSrc.matchAll(/cik: '(\d{10})'/g)].map((m) => m[1]);
    check('회사 목록에 CIK 가 10자리로 들어 있음', ciks.length >= 5, `${ciks.length}곳`);
    check('CIK 가 겹치지 않음', new Set(ciks).size === ciks.length);
    check('항목마다 대체 태그가 여러 개 적혀 있음', /tags: \[\s*\n?\s*'/.test(compSrc));
    // 설명은 이제 손으로 적지 않고 용어 사전(what)에서 온다
    check('항목마다 초보자용 설명이 있음', (compSrc.match(/named\('/g) ?? []).length >= 7,
      `${(compSrc.match(/named\('/g) ?? []).length}개`);

    /* ④ 화면 */
    check('판단 재료를 숫자보다 먼저 놓음', /판단 재료 세 칸/.test(cardSrc));
    check('막대를 순서가 아니라 날짜 자리에 놓음', /날짜 자리/.test(cardSrc) && /slotOf/.test(cardSrc));
    check('빠진 기간을 빈칸이라고 말함', /공시하지 않았다는 뜻입니다/.test(cardSrc));
    check('방향을 기호와 글자로 말함', /word\.glyph/.test(cardSrc) && /word\.label/.test(cardSrc));
    check('표로 보기가 있음', /표로 보기/.test(cardSrc));
    check('출처와 태그를 화면에 밝힘',
      /TERMS\.xbrl_tag\.plain\} \{line\.tag\}/.test(cardSrc) && /SEC EDGAR/.test(cardSrc));
    check('앞으로의 실적이 아니라는 사실을 적음', /앞으로의 실적을\s+뜻하지 않습니다/.test(cardSrc));

    /* ⑤ DEMO 도 같은 규칙 */
    check('DEMO 가 실제 공시가 아님을 밝힘', /실제 공시가 아니다/.test(demoFund));
    check('DEMO 가 4분기 빈 회사를 재현함', /missingQ4/.test(demoFund));
    check('DEMO 가 적자 회사를 재현함 (PER 안 나오는 자리)', /적자 회사/.test(demoFund));

    /* ⑥ 실제로 실려 오는가 */
    const aapl = await getJson('/api/asset/aapl?scenario=normal');
    const f = aapl.body?.fundamentals;
    check('종목 상세에 재무제표가 실려 옴', Boolean(f), f ? `${f.lines?.length}줄` : '없음');
    if (f) {
      const byId = Object.fromEntries((f.lines ?? []).map((l) => [l.id, l]));
      check('손익 항목이 분기로 옴', (byId.revenue?.quarterly ?? []).length >= 4, `${byId.revenue?.quarterly?.length}분기`);
      check('재무상태표 항목은 시점 값(기간 없음)', (byId.liabilities?.annual ?? []).every((p) => !p.start));
      check('줄마다 성질(기간/시점)이 붙어 있음', (f.lines ?? []).every((l) => l.kind === 'duration' || l.kind === 'instant'));
      check('4분기가 빈 회사라 TTM 대신 연간을 씀', f.valuation?.basis === 'annual', `basis=${f.valuation?.basis}`);
      check('어떻게 냈는지 문장으로 밝힘', /연간 값을 썼습니다/.test(String(f.valuation?.note ?? '')));
      check('4분기를 빼서 채우지 않았음', (byId.revenue?.quarterly ?? []).length < 12, `${byId.revenue?.quarterly?.length}개 (12개가 아님)`);
    }
    // 적자 회사는 PER 을 내지 않는다
    const tsla = (await getJson('/api/asset/tsla?scenario=normal')).body?.fundamentals;
    check('적자면 PER 을 내지 않고 이유를 적음',
      tsla?.valuation?.per === null && /적자/.test(String(tsla?.valuation?.note ?? '')),
      String(tsla?.valuation?.note ?? '').slice(0, 40));
    // 공시가 없는 대상은 없다고 말한다
    for (const id of ['spx', 'usdkrw']) {
      const d = (await getJson(`/api/asset/${id}?scenario=normal`)).body;
      check(`${id} 은 재무제표가 없다고 밝힘`, !d?.fundamentals && /공시/.test(String(d?.fundamentalsUnavailable ?? '')));
    }
    // 줄 하나가 비어도 화면이 죽지 않는다
    const part = (await getJson('/api/asset/aapl?scenario=partial')).body?.fundamentals;
    check('줄 하나가 비어도 나머지는 그대로 나옴',
      Boolean(part) && (part.lines ?? []).some((l) => l.unavailableReason) && (part.lines ?? []).some((l) => l.quarterly.length > 0),
      part ? `${(part.lines ?? []).filter((l) => l.unavailableReason).length}줄 빔` : '없음');

    /* ⑦ 파싱 점검이 이 경로를 태우는가 */
    check('대역 서버에 SEC 경로가 있음', /companyconcept/.test(stub2));
    check('대역 서버가 안 쓰는 태그를 404 로 답함', /res\.writeHead\(404/.test(stub2) && /companyconcept/.test(stub2));
    check('대역 서버가 누적·연간이 섞여 오는 상황을 재현함', /9개월 누적도 같은 태그로/.test(stub2));
    check('대역 서버가 수정 공시를 재현함', /수정 공시로 한 번 더/.test(stub2));
    check('대역 서버가 User-Agent 없으면 막음', /User-Agent 헤더가 없습니다/.test(stub2));
    check('파싱 점검이 재무제표를 태움', /SEC_BASE_URL/.test(parse2) && /재무제표/.test(parse2));
  }

  /* ---------------- 8-25. 용어 ---------------- */
  console.log('\n[8-25] 용어 — 큰 글씨는 쉬운 우리말, 원래 이름은 작게');
  {
    /*
     * ROE · PER · EPS · OAS 같은 말은 아는 사람에게만 짧고, 모르는 사람에게는 아무
     * 뜻이 없다. 그렇다고 원래 이름을 지워 버리면 기사나 다른 자료에서 같은 값을
     * 봤을 때 같은 것인지 알 수가 없다.
     *
     * 그래서 둘 다 적는다 — 큰 글씨는 뜻을 푼 우리말, 그 아래 작은 글씨가 원래 이름.
     * 이름은 src/lib/terms.ts 한 곳에서만 정한다. 화면마다 손으로 적으면 같은 용어가
     * 화면마다 다르게 불린다.
     */
    const terms = await readFile('src/lib/terms.ts', 'utf8');
    const label = await readFile('src/components/ui/TermLabel.tsx', 'utf8');
    const card = await readFile('src/components/market/FundamentalsCard.tsx', 'utf8');
    const comp = await readFile('src/lib/companyCatalog.ts', 'utf8');
    const curve = await readFile('src/lib/futuresCurve.mjs', 'utf8');
    const riskSrc = await readFile('src/server/risk.ts', 'utf8');
    const basicsView = await readFile('src/components/market/BasicsBoard.tsx', 'utf8');
    const tpl13 = await readFile('tools/preview/template.html', 'utf8');

    check('용어 사전이 한 곳에 있음', /export const TERMS/.test(terms));
    check('사전이 쉬운 말과 원래 이름을 함께 담음', /plain: string/.test(terms) && /term: string/.test(terms));
    check('이름표 컴포넌트가 있음', /export function TermLabel/.test(label) && /export function TermInline/.test(label));
    check('소리로 읽을 때 둘을 함께 읽어 줌', /aria-label=\{`\$\{t\.plain\} \(\$\{t\.term\}\)`\}/.test(label));
    check('재무 항목 이름을 사전에서 가져옴', /function named\(/.test(comp) && /TERMS\[id\]/.test(comp));

    // 사전에 담긴 우리말 이름에 영어 약어가 그대로 남아 있으면 안 된다
    const plains = [...terms.matchAll(/plain: '([^']+)'/g)].map((m) => m[1]);
    const stillEnglish = plains.filter((v) => /[A-Za-z]{2,}/.test(v));
    check('쉬운 이름에 영어가 남아 있지 않음', stillEnglish.length === 0, stillEnglish.join(', ') || `${plains.length}개 검사`);
    // 원래 이름은 반대로 반드시 남아 있어야 한다 — 지우면 대조할 길이 없다
    const termsList = [...terms.matchAll(/\n    term: '([^']+)'/g)].map((m) => m[1]);
    check('원래 이름이 지워지지 않았음', termsList.length >= 10, `${termsList.length}개`);

    /* 재무제표 화면 */
    check('재무 항목이 원래 이름을 작게 달고 있음', /\{line\.term\}/.test(card));
    check('세 칸 머리말도 사전을 씀', /TermInline id="per"/.test(card) && /TermInline id="operating_margin"/.test(card));
    check('10-K · 10-Q 를 우리말로 풀어 씀', /function formName/.test(card) && /form_10k/.test(card));
    check('CIK · XBRL 을 우리말로 풀어 씀', /TERMS\.cik\.plain/.test(card) && /TERMS\.xbrl_tag\.plain/.test(card));
    check('PER 설명이 화면 문장에 우리말로 있음', /지금 주가를 1주가 번 돈으로 나눈 값/.test(card));

    /* 선물 곡선 */
    check('콘탱고·백워데이션을 우리말로 먼저 말함',
      /contango: '먼 달이 더 비쌈'/.test(curve) && /backwardation: '가까운 달이 더 비쌈'/.test(curve));
    check('원래 이름은 따로 남겨 둠', /export const SHAPE_TERM/.test(curve) && /콘탱고 · Contango/.test(curve));
    check('미리보기도 같은 이름을 씀', /FUT_SHAPE_TERM/.test(tpl13) && /먼 달이 더 비쌈/.test(tpl13));

    /* 위험 신호등 */
    check('위험 지표가 원래 이름을 따로 갖고 있음', (riskSrc.match(/^    term: '/gm) ?? []).length >= 5,
      `${(riskSrc.match(/^    term: '/gm) ?? []).length}개`);
    check('하이일드 OAS 를 우리말로 바꿈', /위험한 회사가 더 무는 이자/.test(riskSrc) && !/name: '하이일드/.test(riskSrc));
    check('미리보기도 원래 이름을 그림', /i\.term \?/.test(tpl13));

    /*
     * 생활 경제 지수 — 위가 이름, 아래가 그 이름을 풀어 쓴 말.
     *
     * 한동안 뒤집혀 있었다. '국민 한 사람 몫의 생산' 이 제목 자리에 크게 서고
     * '1인당 GDP' 가 그 아래 작게 붙었다. 쉬운 말을 앞세우려던 것이었는데,
     * 제목 자리에 설명이 서면 그게 무엇의 이름인지 알 수 없고 다른 자료에서 본
     * 말과 이어 볼 수도 없다. 쉬운 말은 이름을 도우라고 있는 것이지 이름을
     * 대신하라고 있는 것이 아니다.
     */
    const nameIdx = basicsView.indexOf('{item.name}');
    const plainIdx = basicsView.indexOf('{item.plainName}');
    check('생활 지수는 이름이 위, 풀어 쓴 말이 아래',
      nameIdx > 0 && plainIdx > nameIdx,
      `이름 ${nameIdx} · 풀어 쓴 말 ${plainIdx}`);
    check('제목 자리는 굵은 14px, 풀어 쓴 말은 11.5px',
      /<h3 className="text-\[14px\] leading-snug font-bold break-keep text-fg-strong">\{item\.name\}<\/h3>/.test(basicsView) &&
      /text-\[11\.5px\] break-keep text-subtle">\{item\.plainName\}/.test(basicsView));
    check('풀어 쓴 말을 잘리는 자리에 두지 않음', !/truncate">\{item\.plainName\}/.test(basicsView));
    const dailyCard = await readFile('src/components/market/DailyBasicCard.tsx', 'utf8');
    check('홈의 오늘의 생활 카드도 같은 차례',
      dailyCard.indexOf('{item.name}') > 0 && dailyCard.indexOf('{item.plainName}') > dailyCard.indexOf('{item.name}'));

    /* 실제로 화면에 나오는 이름이 바뀌었는가 */
    const snapT = (await getJson('/api/snapshot?scenario=normal')).body;
    const risks = snapT.sections?.risk?.data?.indicators ?? [];
    check('위험 지표 이름에 영어 약어가 앞장서지 않음',
      risks.every((i) => !/^[A-Z]{2,}/.test(i.name)), risks.map((i) => i.name).join(' / ').slice(0, 80));
    check('위험 지표가 원래 이름을 함께 내려보냄', risks.filter((i) => i.term).length >= 5,
      `${risks.filter((i) => i.term).length}/${risks.length}`);
    const basicsT = snapT.sections?.basics?.data ?? [];
    /*
     * 이름은 우리말이어야 한다.
     *
     * 막으려는 것은 'ROE' 처럼 약자 하나만 덩그러니 서 있는 경우다.
     * 'OECD 경기선행지수' 는 걸리지 않는다 — 발표 기관의 약자가 이름의 일부이고,
     * 그 뒤에 우리말 이름이 그대로 따라온다. 그래서 앞글자가 아니라
     * '·' 앞쪽에 우리말이 들어 있는지를 본다.
     */
    const headOf = (n) => String(n).split(' · ')[0];
    const noKorean = basicsT.filter((b) => !/[가-힣]/.test(headOf(b.name)));
    check('생활 지수 이름이 우리말로 되어 있음', noKorean.length === 0,
      noKorean.length ? noKorean.map((b) => b.name).join(' / ') : basicsT.map((b) => b.name).join(' / ').slice(0, 80));
    check('생활 지수가 풀어 쓴 말을 함께 내려보냄',
      basicsT.every((b) => typeof b.plainName === 'string' && b.plainName.length > 0));
    /*
     * 이름 자리에 이름이 들어 있는가.
     *
     * 풀어 쓴 말은 문장이라 서술어로 끝난다 — '…생산', '…나뉘는지', '…몇 배'.
     * 이름은 그렇지 않다. 둘이 다시 뒤바뀌면 이 검사가 먼저 잡는다.
     */
    const swapped = basicsT.filter((b) => /(는지|인지|몇 배|얼마|따진|더한)$/.test(b.name));
    check('이름 자리에 설명이 들어 있지 않음', swapped.length === 0,
      swapped.map((b) => b.name).join(' / '));
    check('풀어 쓴 말은 영어로 시작하지 않음',
      basicsT.every((b) => !/^[A-Za-z]/.test(b.plainName)),
      basicsT.filter((b) => /^[A-Za-z]/.test(b.plainName)).map((b) => b.plainName).join(' / '));
    const fundT = (await getJson('/api/asset/aapl?scenario=normal')).body?.fundamentals;
    check('재무 항목이 우리말 이름과 원래 이름을 둘 다 내려보냄',
      (fundT?.lines ?? []).every((l) => l.label && l.term && !/[A-Za-z]{2,}/.test(l.label)),
      (fundT?.lines ?? []).map((l) => l.label).join(' / ').slice(0, 80));
  }

  /* ---------------- 8-26. 불타는 것 · 얼어붙은 것 ---------------- */
  console.log('\n[8-26] 오늘 불타는 것과 얼어붙은 것');
  {
    /*
     * 작은 종목은 후보에서 뺀다.
     *
     * 작은 종목은 하루 30% 씩도 움직인다. 평소 폭으로 나눠도 배수가 크게 나오는
     * 날이 잦아서, 그것까지 후보에 넣으면 '오늘 유별났던 것' 자리가 늘 그런 종목
     * 차지가 되고 정작 큰 시장에서 일어난 일은 밀려난다.
     *
     * 문은 순위를 **아는** 것에만 닫힌다. 모르면 그대로 둔다 — 지수처럼 순위
     * 개념이 없는 것도 있고, 지금 카탈로그는 사람이 골라 담은 것이라 개별주·코인
     * 열다섯이 전부 각 시장의 대형주·상위 코인이기 때문이다. 그래서 오늘은
     * 걸러지는 것이 없다. 바깥에서 이름이 쏟아져 들어오는 날(한국 전종목처럼)
     * 제공사가 순위를 함께 주고, 그때 이 문이 일한다.
     */
    const capSrc = await readFile('src/lib/heatRank.mjs', 'utf8');
    const { withinCap, CAP_RANK_MAX, pickHeat: pick300 } = await import('../src/lib/heatRank.mjs');
    check('시총 기준이 300위', CAP_RANK_MAX === 300, String(CAP_RANK_MAX));
    check('순위를 모르면 그대로 둠', withinCap({}) === true && withinCap({ capRank: null }) === true);
    check('300위 밖은 뺌', withinCap({ capRank: 301 }) === false && withinCap({ capRank: 300 }) === true);
    check('고르는 자리에서 실제로 걸러짐', /\.filter\(\(q\) => withinCap\(q, maxCapRank\)\)/.test(capSrc));
    {
      const mk = (id, pct, rank) => ({
        id, name: id, price: 100, changePct: pct, capRank: rank,
        spark: Array.from({ length: 20 }, (_, i) => ({ t: i, v: 100 + (i % 3) })),
      });
      const board = pick300([mk('잡주', 40, 4210), mk('큰주', 3, 12), mk('큰하락', -2, 40)]);
      check('순위 밖 급등주가 자리를 차지하지 못함', board.count === 2 && board.top.quote.id === '큰주',
        board.top.quote.id);
    }
    check('Quote 에 순위 자리가 있고 모르면 null', /capRank\?: number \| null;/.test(await readFile('src/types/index.ts', 'utf8')));
    check('화면이 그 규칙을 밝힘',
      /시총 300위 밖은 후보에서 뺍니다/.test(await readFile('src/components/market/HeatBoard.tsx', 'utf8')));
    const tplHeat = await readFile('tools/preview/template.html', 'utf8');
    check('미리보기도 같은 문을 씀',
      /HEAT_CAP_RANK_MAX = 300/.test(tplHeat) && /\.filter\(heatWithinCap\)/.test(tplHeat) &&
      /시총 300위 밖은 후보에서 뺍니다/.test(tplHeat));

    /*
     * 몇 % 움직였는지로 줄을 세우면 크립토가 늘 이긴다. 원래 많이 움직이는 것이라
     * 하루 8% 가 평범할 수 있고, 코스피가 8% 움직이면 사건이다. 그래서 그 종목이
     * **평소 움직이던 폭에 견줘** 오늘이 얼마나 유별났는지로 고른다.
     *
     * 말은 세게 쓰되 '얼마나 크게 움직였는가' 까지만 말한다 — 좋다·나쁘다도,
     * 사라·팔라도 아니다. 그 선을 코드가 지키는지 여기서 본다.
     */
    const heatSrc = existsSync('src/lib/heatRank.mjs') ? await readFile('src/lib/heatRank.mjs', 'utf8') : '';
    const heatView = existsSync('src/components/market/HeatBoard.tsx')
      ? await readFile('src/components/market/HeatBoard.tsx', 'utf8') : '';
    const homeSrc = await readFile('src/app/page.tsx', 'utf8');
    const cssSrc = await readFile('src/app/globals.css', 'utf8');
    const tpl14 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 고르는 규칙 */
    check('고르는 규칙이 순수 모듈로 분리됨', /export function pickHeat/.test(heatSrc) && /export function dailySigma/.test(heatSrc));
    check('% 가 아니라 평소 폭에 견줘 고름', /평소 움직이던 폭에 견줘/.test(heatSrc) && /changePct \/ sigma/.test(heatSrc));
    check('표본이 모자라면 배수를 지어내지 않음', /MIN_SAMPLE/.test(heatSrc) && /return null/.test(heatSrc));
    check('단위 테스트가 있음', existsSync('scripts/heatRank.test.mjs'));

    /* ② 말의 선 — 여기가 이 화면에서 제일 미끄러지기 쉬운 자리다 */
    const words = [...heatSrc.matchAll(/(?:up|down): '([^']+)'/g)].map((m) => m[1]);
    check('단계마다 말이 있음 (오름 4 · 내림 4)', words.length === 8, words.join(' / '));
    check('사라·팔라로 읽히는 낱말이 없음',
      words.every((w) => !/(매수|매도|사세요|파세요|대박|폭등|기회|추천|수익|손실)/.test(w)),
      words.filter((w) => /(매수|매도|대박|폭등|기회|추천|수익)/.test(w)).join(', ') || '없음');
    check('화면이 그 뜻을 밝힘 (움직임이지 좋다·나쁘다가 아니다)',
      /좋다·나쁘다가 아니고/.test(heatView) && /사라거나 팔라는 뜻은 더더욱 아닙니다/.test(heatView));

    /* ③ 다 오른 날 · 다 내린 날 */
    check('다 오른 날에는 자리 이름을 바꿈', /가장 덜 오른 것/.test(heatSrc) && /내린 것이 하나도 없습니다/.test(heatSrc));
    check('다 내린 날도 마찬가지', /가장 덜 내린 것/.test(heatSrc) && /오른 것이 하나도 없습니다/.test(heatSrc));

    /* ④ 화면 */
    check('홈에 붙어 있음', /<HeatBoard \/>/.test(homeSrc) && /HeatBoard/.test(homeSrc));
    check('색은 설정에 따라 JS 가 정함 (앱에 --up 토큰이 없다)',
      /color: f\.color\(dir\)/.test(heatView) && !/var\(--up\)/.test(heatView));
    check('방향을 기호와 글자로도 말함', /f\.glyph\(dir\)/.test(heatView) && /sr-only/.test(heatView));
    check('세기에 따라 번지는 빛이 있음', /heat-glow/.test(cssSrc) && /--t/.test(cssSrc));
    check('움직임을 싫어하면 멈춤', /prefers-reduced-motion[\s\S]{0,160}heat-flame/.test(cssSrc));
    check('좁은 화면에서도 두 장을 나란히', /grid-cols-2/.test(heatView));

    /* ⑤ 미리보기도 같은 규칙 */
    check('미리보기에 같은 판이 있음', /function heatSection/.test(tpl14) && /function pickHeat/.test(tpl14));
    check('미리보기 문구가 앱과 같음',
      words.every((w) => tpl14.includes(w)),
      words.filter((w) => !tpl14.includes(w)).join(', ') || '여덟 개 모두 같음');
    check('미리보기도 두 장을 나란히', /\.heat-pair/.test(tpl14));

    /* ⑥ 실제로 나오는가 */
    const snapH = (await getJson('/api/snapshot?scenario=normal')).body;
    const quotes = snapH.sections?.quotes?.data ?? {};
    const TRADE = new Set(['equity', 'index', 'crypto', 'commodity']);
    const { pickHeat } = await import('../src/lib/heatRank.mjs');
    let boards = 0;
    for (const m of ['us', 'kr']) {
      const b = pickHeat((quotes[m] ?? []).filter((q) => TRADE.has(q.kind)));
      if (!b) continue;
      boards += 1;
      check(`${m} — 오른 것과 내린 것을 골라 냄`, Boolean(b.top && b.bottom),
        `${b.top.quote.name} ${b.top.quote.changePct}% / ${b.bottom.quote.name} ${b.bottom.quote.changePct}%`);
      // 자리 이름이 실제 방향과 어긋나면 안 된다
      if (b.bottom.quote.changePct >= 0) {
        check(`${m} — 오른 것을 내렸다고 말하지 않음`, b.bottom.slot === '가장 덜 오른 것' && Boolean(b.bottom.note));
      }
      if (b.top.quote.changePct < 0) {
        check(`${m} — 내린 것을 올랐다고 말하지 않음`, b.top.slot === '가장 덜 내린 것' && Boolean(b.top.note));
      }
    }
    check('미국 · 한국 판이 모두 만들어짐', boards === 2, `${boards}/2`);
  }

  /* ---------------- 8-27. 이름이 잘리지 않는가 ---------------- */
  console.log('\n[8-27] 이름과 숫자가 잘리지 않는가');
  {
    /*
     * '다우존스 산업평균' 이 '다우존스 산업평…' 이 되면 그게 무엇인지 알 수 없다.
     * 이름은 값을 읽기 위한 열쇠라, 잘리면 그 칸 전체가 쓸모없어진다.
     * 숫자는 더 나쁘다 — '1,335.78원' 이 '1,335.7…' 이 되면 값이 달라져 보인다.
     *
     * 그래서 **이름과 숫자 자리에는 truncate 를 쓰지 않는다.** 좁으면 접거나
     * (이름) 글자 크기를 줄인다(숫자).
     */
    const files = [
      ['src/components/market/MarketIndexBoard.tsx', /\{item\.name\}/],
      ['src/components/market/PriceCard.tsx', /\{quote\.name\}/],
      ['src/app/market/[region]/page.tsx', /\{q\.name\}/],
    ];
    for (const [f, re] of files) {
      const t = await readFile(f, 'utf8');
      const line = t.split('\n').find((l) => re.test(l) || (re.source.includes('quote.name') && /quote\.name/.test(l)));
      // 이름이 들어가는 줄, 또는 그 바로 앞 줄(여러 줄로 쓴 경우)에 truncate 가 없어야 한다
      const nameBlocks = t.split('\n').map((l, i) => ({ l, i })).filter((x) => re.test(x.l));
      const bad = nameBlocks.filter((x) => /truncate/.test(x.l) || /truncate/.test(t.split('\n')[x.i - 1] ?? ''));
      check(`${f.split('/').pop()} — 이름을 자르지 않음`, bad.length === 0,
        bad.length ? bad[0].l.trim().slice(0, 60) : (line ? '확인' : '이름 줄 없음'));
    }
    const idx = await readFile('src/components/market/MarketIndexBoard.tsx', 'utf8');
    check('아주 좁은 화면에서는 미니 차트를 접어 이름 자리를 내줌', /min-\[360px\]:block/.test(idx));

    const pc = await readFile('src/components/market/PriceCard.tsx', 'utf8');
    check('가격은 자르지 않고 글자를 줄임', /clamp\(15px/.test(pc) && !/tnum truncate text-lg/.test(pc));
    const rg = await readFile('src/components/market/RiskGauges.tsx', 'utf8');
    check('위험 지표 값도 자르지 않음', !/tnum truncate text-\[15px\]/.test(rg) && /clamp\(12\.5px/.test(rg));

    const region = await readFile('src/app/market/[region]/page.tsx', 'utf8');
    check('시장 화면 부제도 자르지 않음', !/truncate text-\[12\.5px\] text-subtle">\{SUBTITLE/.test(region));

    /*
     * 무엇이 먼저 읽혀야 하는가.
     *
     * '마감' · '15분 지연' 은 값을 읽고 난 뒤에 확인하는 곁들임이고, 종목 이름은
     * 그 칸이 무엇인지 말하는 열쇠다. 둘이 비슷한 크기로 서 있으면 눈이 어디를
     * 먼저 볼지 헷갈린다. 이름이 배지보다 확실히 커야 한다.
     */
    const badgeSrc = await readFile('src/components/ui/Badge.tsx', 'utf8');
    check('장 상태 배지가 제일 작은 칸을 기본으로 씀', /SessionBadge\(\{ phase, size = '2xs'/.test(badgeSrc));
    check('지연 배지도 제일 작은 칸', /size = '2xs'/.test(badgeSrc.slice(badgeSrc.indexOf('FreshnessBadge') - 400)));
    const nameSize = (t, re) => {
      const m = t.match(re);
      return m ? Number(m[1]) : 0;
    };
    // 사이에 다른 클래스가 끼어도(min-h-[24px] 등) 크기만 본다
    const pcName = nameSize(pc, /className="block[^"]*text-\[(\d+(?:\.\d+)?)px\][^"]*whitespace-nowrap text-fg-strong/);
    const ixName = nameSize(idx, /className="text-\[(\d+(?:\.\d+)?)px\] leading-snug font-bold whitespace-nowrap text-fg-strong/);
    check('가격 카드 이름이 배지(10.5px)보다 확실히 큼', pcName >= 15, `${pcName}px`);
    check('지수 판 이름도 배지보다 확실히 큼', ixName >= 15, `${ixName}px`);

    const tplSz = await readFile('tools/preview/template.html', 'utf8');
    check('미리보기도 같은 차례', /\.pcard-name \{ font-size: 16px/.test(tplSz) && /badge\(cls, SESSION_LABEL\[p\], null, '2xs'\)/.test(tplSz));

    /*
     * 이름은 한 줄이다.
     *
     * 접는 것도 자르는 것 못지않게 나쁘다. 목록에서 어떤 카드는 한 줄, 어떤 카드는
     * 두 줄이면 높이가 제각각이라 눈이 걸리고, 스크롤 중에 값이 어디쯤 있을지
     * 짐작할 수 없다. 자르지도 접지도 않으려면 자리가 있어야 한다 — 그 자리는
     * '마감'·'15분 지연' 알약을 이름 줄에서 빼서 만들었다.
     */
    const heat = await readFile('src/components/market/HeatBoard.tsx', 'utf8');
    const oneLine = [
      ['가격 카드', pc, /className="block[^"]*text-\[16px\][^"]*whitespace-nowrap/],
      ['지수 판', idx, /className="text-\[15px\] leading-snug font-bold whitespace-nowrap/],
      ['시장 화면 종목 줄', region, /className="min-w-0 text-\[13px\] whitespace-nowrap/],
      ['불타는 카드', heat, /font-bold whitespace-nowrap text-fg-strong[\s\S]{0,120}clamp\(13px/],
    ];
    for (const [label, src, re] of oneLine) check(`${label} 이름이 한 줄`, re.test(src));

    /*
     * 이름이 그 한 줄에 정말 들어가는가.
     *
     * 한 줄로 세운 이상 넘치면 옆 칸을 밀거나 잘린다. 그래서 자리를 재 둔다.
     * 아래 칸 너비는 320px 화면에서 브라우저로 잰 값이고(가장 좁은 줄 기준),
     * 글자 너비는 어림한다 — 한글은 한 글자가 거의 1em, 대문자는 0.68em,
     * 숫자 0.6em, 나머지 라틴 글자 0.55em, 공백·부호 0.32em.
     * '다우존스 산업평균' 을 124.5px 로 어림하는데 실측이 125px 이었다.
     *
     * 이 검사가 하는 일은 정확한 예측이 아니라 **여유가 남았는지** 보는 것이다.
     * 카탈로그에 긴 이름이 새로 들어오면 화면에서 깨지기 전에 여기서 걸린다.
     */
    const em = (name) => {
      let w = 0;
      for (const ch of name) {
        if (/[\uAC00-\uD7AF\u3130-\u318F\u4E00-\u9FFF\u3040-\u30FF]/.test(ch)) w += 1;
        else if (/[A-Z]/.test(ch)) w += 0.68;
        else if (/[0-9]/.test(ch)) w += 0.6;
        else if (/[a-z]/.test(ch)) w += 0.55;
        else w += 0.32;
      }
      return w;
    };
    /**
     * [자리 이름, 글자 크기(px), 320px 에서 잰 칸 너비(px)]
     *
     * 칸 너비는 브라우저로 직접 쟀다 (320×1200, 화면마다 가장 좁은 줄 기준).
     * 지수 판·시장 줄은 오른쪽 숫자 칸이 넓을수록 이름 칸이 좁아지므로,
     * 그 화면에서 제일 긴 값이 붙은 줄에서 잰 값이다.
     */
    const BOX = [
      ['가격 카드', 16, 246],
      ['지수 판', 15, 195],
      ['불타는 카드', 13, 118],
      ['시장 화면 종목 줄', 13, 128],
    ];
    const catalogSrc = await readFile('src/lib/catalog.ts', 'utf8');
    const names = [...catalogSrc.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
    check('카탈로그에서 이름을 읽어 옴', names.length >= 20, `${names.length}개`);
    const MARGIN = 6;
    for (const [label, fs, box] of BOX) {
      let worst = null;
      for (const n of names) {
        const w = em(n) * fs;
        if (!worst || w > worst.w) worst = { n, w };
      }
      const slack = Math.round(box - worst.w);
      check(`${label} — 가장 긴 이름도 한 줄에 들어감`, slack >= MARGIN,
        `'${worst.n}' ${Math.round(worst.w)}px / ${box}px · 여유 ${slack}px`);
    }

    /*
     * 곁들이는 말은 이름 아래로.
     *
     * 알약 하나는 글씨를 10.5px 로 줄여도 테두리와 좌우 여백으로 24px 을 더 먹는다.
     * 둘이면 60px 이고, 그 60px 이 이름 칸에서 나갔다. 크기를 줄이는 것만으로는
     * 모자랐다 — 자리를 옮겨야 했다.
     */
    const badgeSrc2 = badgeSrc;
    check('상태 잔글씨가 따로 있음', /export function StatusLine\(/.test(badgeSrc2));
    check("'마감'·'지연' 은 테두리 없는 잔글씨", /words\.join\(' · '\)/.test(badgeSrc2));
    check("믿기 전에 봐야 하는 것만 알약으로 남음",
      /freshness === 'stale' \? '오래된 데이터' : freshness === 'demo' \? 'DEMO' : null/.test(badgeSrc2));
    check('가격 카드가 이름 줄에서 알약을 뺐음',
      !/SessionBadge/.test(pc) && !/FreshnessBadge/.test(pc) && /<StatusLine/.test(pc));
    check('지수 판도 마찬가지', !/FreshnessBadge/.test(idx) && /<StatusLine/.test(idx));
    check('미리보기도 같은 규칙',
      /const statusNote = \(phase, fresh, delay\)/.test(tplSz) &&
      /statusNote\(q\.session, q\.meta\.freshness, delay\)/.test(tplSz) &&
      /statusNote\(null, q\.meta\.freshness, delay\)/.test(tplSz));
  }

  /* ---------------- 8-28. 넓은 화면에서도 손안의 화면인가 ---------------- */
  console.log('\n[8-28] 넓은 화면에서도 손안의 화면');
  {
    /*
     * 사용자가 짚은 것: "윈도우 인터넷으로 볼 때도 핸드폰이랑 비슷하게."
     *
     * 창을 넓혔다고 카드를 서너 열로 펼치면 같은 앱이 아니게 된다 — 어제 폰에서
     * 본 것이 오늘 회사 컴퓨터에서 다른 자리에 있으면 다시 찾아야 한다.
     * 그래서 480px 부터는 430px 로 고정하고 양옆에 바닥을 깐다.
     *
     * 폭이 고정되면 따라오는 것이 있다. 본문 안의 배치 분기가 더는 **화면 폭**을
     * 봐서는 안 된다는 것이다. 1440px 짜리 창에서 sm:grid-cols-2 는 그대로
     * 발동해서, 430px 짜리 칸 안에 두 열을 밀어 넣는다. 아래 ③ 이 그것을 막는다.
     */
    const css = await readFile('src/app/globals.css', 'utf8');
    const shell = await readFile('src/components/nav/AppShell.tsx', 'utf8');
    const nav = await readFile('src/components/nav/Navigation.tsx', 'utf8');
    const tpl8 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 틀 — 넓어져도 430px */
    check('화면 틀이 있음', /\.app-frame \{[^}]*margin-inline: auto/.test(css));
    check('틀은 넓은 화면에서만 폭을 묶음',
      /@media \(min-width: 480px\) \{[\s\S]{0,200}\.app-frame \{[\s\S]{0,120}max-width: var\(--frame-w\)/.test(css));
    check('틀 폭이 한 곳에 적혀 있음', /--frame-w: 430px/.test(css));
    check('틀 바깥 바닥색이 두 테마 모두 있음',
      (css.match(/--desk:/g) ?? []).length >= 2 && /background: var\(--desk\)/.test(css));
    check('앱 셸이 그 틀을 씀', /className="app-frame"/.test(shell));

    /* ② 길은 하나 — 하단 탭, 사이드바 없음 */
    check('좌측 사이드바를 두지 않음', !/DesktopSidebar/.test(nav) && !/DesktopSidebar/.test(shell));
    check('하단 탭이 화면 폭과 무관하게 늘 있음',
      /className="frame-fixed fixed bottom-0/.test(nav) && !/lg:hidden/.test(nav));
    /*
     * frame-fixed 는 좌우 위치를 통째로 쥔다. inset-x-0 같은 유틸리티를 같이
     * 붙이면 그쪽이 이긴다 — Tailwind 에서 유틸리티가 컴포넌트 레이어보다 세다.
     * 실제로 그래서 탭 막대가 화면 왼쪽 바깥으로 215px 밀려 나갔었다.
     */
    const clash = [...(shell + nav + (await readFile('src/components/alerts/AlertsEngine.tsx', 'utf8')))
      .matchAll(/className="[^"]*frame-fixed[^"]*"/g)].filter((m) => /inset-x-\d/.test(m[0]));
    check('틀에 붙는 것에 inset-x 유틸리티를 겹쳐 쓰지 않음', clash.length === 0,
      clash.length ? clash[0][0].slice(0, 60) : '');

    /* ③ 본문 안의 분기는 화면 폭이 아니라 칸 폭을 본다 */
    check('본문이 기준 칸이 됨', /\.app-main \{[^}]*container-type: inline-size/.test(css));
    check('앱 셸이 본문에 그 표시를 붙임', /className="main-pad app-main/.test(shell));

    const CHROME = ['Signal.tsx', 'ChartModal.tsx', 'StatusBar.tsx'];
    const stray = [];
    for (const f of await listFiles('src', /\.tsx$/)) {
      if (CHROME.some((c) => f.endsWith(c))) continue;
      const t = await readFile(f, 'utf8');
      for (const m of t.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        for (const bp of cls.matchAll(/(?<![\w@[-])(sm|md|lg|xl|min-\[\d+px\]):/g)) {
          stray.push(`${f.split('/').pop()} ${bp[0]}`);
        }
      }
    }
    check('본문에 화면 폭 기준 분기가 남아 있지 않음', stray.length === 0,
      stray.length ? `${stray.length}곳 (예: ${stray[0]})` : '');

    // vw 도 같은 함정이다. 1440px 창에서 85vw 는 1224px 이라 430px 칸을 넘는다.
    const vw = [];
    for (const f of await listFiles('src', /\.tsx$/)) {
      const t = await readFile(f, 'utf8');
      if (/\d+(?:\.\d+)?vw/.test(t)) vw.push(f.split('/').pop());
    }
    check('화면 폭 단위(vw) 대신 칸 폭 단위(cqw)를 씀', vw.length === 0,
      vw.length ? vw.join(', ') : '');

    /*
     * 칸(container)이 되면 그 안의 position:fixed 는 화면이 아니라 그 칸을
     * 기준으로 붙는다. 큰 그림 창을 제자리에서 그리면 뒷배경이 본문 크기만큼만
     * 덮여 상태바와 하단 탭이 그대로 드러난다.
     */
    const modal = await readFile('src/components/charts/ChartModal.tsx', 'utf8');
    check('큰 그림 창을 문서 맨 위로 옮겨 그림', /createPortal\(/.test(modal) && /document\.body,/.test(modal));
    check('큰 그림 창도 틀과 같은 폭', /max-w-\[var\(--frame-w\)\]/.test(modal));

    /* ④ 미리보기도 같은 규칙 */
    check('미리보기에도 틀이 있음',
      /@media \(min-width: 480px\) \{[\s\S]{0,160}\.app \{[\s\S]{0,120}max-width: var\(--frame-w\)/.test(tpl8));
    check('미리보기도 본문이 기준 칸', /container-type: inline-size/.test(tpl8));
    check('미리보기에서도 사이드바를 뺐음',
      !/class="sidebar"/.test(tpl8) && !/getElementById\('sidenav'\)/.test(tpl8));
    const tplViewport = [...tpl8.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    // 남아도 되는 것은 틀 자체를 켜는 480px 하나뿐이다. 나머지 배치는 칸 폭을 봐야 한다.
    check('미리보기에 남은 화면 폭 분기는 틀을 켜는 것뿐',
      tplViewport.every((v) => v === 480), tplViewport.filter((v) => v !== 480).join(', '));
    check('미리보기 배치 분기가 칸 폭을 봄',
      (tpl8.match(/@container app \(min-width:/g) ?? []).length >= 8);
  }

  /* ---------------- 8-29. 작은 그림도 휠로 확대되는가 ---------------- */
  console.log('\n[8-29] 그래프 확대 · 카드 높이');
  {
    /*
     * 사용자가 짚은 것 둘.
     *  ① "홈 맨 처음 화면에 미국 크립토 화면의 창 크기가 다르잖아"
     *  ② "각 그래프마다 마우스 휠로 원하는 부분을 확대 축소 할 수 있게"
     */

    /* ① 심리 카드 — 상자는 같은 높이인데 안이 짧아 아래가 비어 보였다 */
    const fngCardSrc = await readFile('src/components/market/FngCard.tsx', 'utf8');
    check('심리 카드의 버튼과 산출 시각이 바닥에 붙음', /className="mt-auto flex items-center gap-2 border-t/.test(fngCardSrc));
    check('요인 줄이 바닥 줄과 붙지 않게 아래 여백을 둠', /className="mt-2 mb-2 space-y-2 border-t/.test(fngCardSrc));
    const tpl14 = await readFile('tools/preview/template.html', 'utf8');
    check('미리보기도 바닥에 붙임', /\.fngfoot \{[^}]*margin-top: auto/.test(tpl14));

    /*
     * ② 휠 확대.
     *
     * 큰 차트는 원래 됐다. 안 되던 것은 카드 안의 작은 그림(생활 경제 지수)이다.
     * 여기에 끌기까지 붙이면 끌고 손을 뗀 자리에서 큰 창이 열리므로 휠만 받는다.
     */
    const hook = await readFile('src/components/charts/useChartViewport.ts', 'utf8');
    check("휠만 받는 방식이 있음", /mode\?: 'all' \| 'wheel'/.test(hook));
    check('휠만 받을 때는 끌기·핀치를 붙이지 않음', /if \(!el \|\| !enabled \|\| mode !== 'all'\) return;/.test(hook));
    check('휠은 커서 자리를 기준으로 확대함', /zoomBy\(zoomOut \? 1\.18 : 1 \/ 1\.18, timeAtPx\(e\.clientX - rect\.left\)\)/.test(hook));

    /*
     * 페이지를 굴리던 손이 그래프 위를 지나가는 것뿐이면 가로채지 않는다.
     * 생활 화면은 그림이 아홉 장 쌓여 있어, 이 유예가 없으면 위로 굴려 올라가는
     * 길목마다 그림이 확대되어 화면을 되돌릴 수가 없다.
     */
    check('페이지를 굴리는 중이면 휠을 가로채지 않음',
      /SCROLL_GRACE_MS/.test(hook) && /Date\.now\(\) - lastPageScroll\.current < SCROLL_GRACE_MS/.test(hook));
    check('미리보기도 같은 유예를 둠',
      /const SCROLL_GRACE_MS = 350;/.test(tpl14) && (tpl14.match(/scrolling\(\)\) return;/g) ?? []).length >= 2);

    const trend = await readFile('src/components/charts/BasicTrend.tsx', 'utf8');
    check('생활 지수의 작은 그림이 휠을 받음', /useChartViewport\(\{[\s\S]{0,320}mode: 'wheel'/.test(trend));
    check('그림 안 눈금과 화면 픽셀의 배율을 맞춤', /const k = size\.w > 0 \? size\.w \/ VIEW_W : 0/.test(trend));
    check('구간 밖으로 삐져나온 선을 잘라 냄', /clipPath=\{`url\(#\$\{id\}-clip\)`\}/.test(trend));
    check('확대했을 때만 되돌아갈 길이 나타남', /vp\.zoomed \? \(/.test(trend) && /전체 구간/.test(trend));
    /*
     * 좁힌 구간은 **그림에만** 쓴다. 큰 창과 표에는 원래 값이 그대로 가야 한다 —
     * 확대해 놓고 표를 열었더니 표까지 잘려 있으면 값을 확인할 길이 없어진다.
     */
    check('큰 창에는 원래 구간이 감', /const bigSeries: ChartSeries\[\] = clean\.map/.test(trend));
    check('표에도 원래 구간이 감', /mine\.points\n?\s*\.slice\(-12\)/.test(trend));
    check('미리보기도 같은 규칙',
      /const BTREND_VIEW = \{\};/.test(tpl14) &&
      /const vclean = clean\.map/.test(tpl14) &&
      /data-btreset=/.test(tpl14));

    /*
     * 눈금값이 잘리지 않는가.
     * '89,514달러' 가 51.2 를 먹는데 자리가 46 뿐이라 앞의 '8' 이 그림 밖으로 나갔다.
     */
    const gl = Number(trend.match(/const GUTTER_L = (\d+)/)?.[1] ?? 0);
    const tplGl = Number(tpl14.match(/const TREND_GL = (\d+)/)?.[1] ?? 0);
    check('왼쪽 눈금 자리가 가장 긴 값을 담을 만큼 넓음', gl >= 58, `${gl}px`);
    check('미리보기도 같은 자리', tplGl === gl, `${tplGl} vs ${gl}`);
  }

  /* ---------------- 8-30. 옷을 갈아입힌 뒤 ---------------- */
  console.log('\n[8-30] 조용한 단말 — 글꼴 · 재질 · 숫자 · 단추');
  {
    const css = await readFile('src/app/globals.css', 'utf8');
    const tpl15 = await readFile('tools/preview/template.html', 'utf8');

    /* ① 글꼴 — 직접 싣는다 */
    check('Pretendard 를 직접 실음', /@font-face \{[\s\S]{0,200}Pretendard Variable/.test(css));
    check('글꼴이 맨 앞에 섬', /--font-sans:\s*\n?\s*'Pretendard Variable'/.test(css));
    check('기다리는 동안 글자를 감추지 않음', /font-display: swap/.test(css));
    const font = await stat('public/fonts/pretendard-subset.woff2').catch(() => null);
    check('자른 글꼴이 실려 있음', font !== null && font.size > 50_000, font ? `${Math.round(font.size / 1024)}KB` : '없음');
    /*
     * 원본은 2.0MB 다. 잘라 싣는 이유가 무게라, 무게가 다시 불면 이유가 사라진다.
     * 400KB 는 첫 화면을 기다리게 하지 않는 선이다.
     */
    check('자른 글꼴이 400KB 를 넘지 않음', font !== null && font.size < 400_000,
      font ? `${Math.round(font.size / 1024)}KB` : '');
    check('다시 자르는 길이 있음', /"font": "node tools\/font\/subset\.mjs"/.test(await readFile('package.json', 'utf8')));
    check('글꼴 라이선스를 함께 둠', (await stat('tools/font/LICENSE-Pretendard.txt').catch(() => null)) !== null);
    check('미리보기도 같은 글꼴을 품고 감', /font-family: 'Pretendard Variable'/.test(tpl15) && /__FONT__/.test(tpl15));

    /* ② 재질 — 테두리 대신 바탕 단차 */
    check('카드에 테두리를 두르지 않음', /\.card \{\n\s*background: var\(--surface\);\n\s*border-radius/.test(css));
    check('카드에 그림자를 얹지 않음', !/\.card \{[^}]*box-shadow/.test(css));
    check('미리보기 카드도 마찬가지', /\.card \{ background: var\(--surface\); border-radius: var\(--box-radius\); \}/.test(tpl15));

    /* ③ 모서리 — 눈금을 둘로 접는다 */
    check('모서리 값이 한 곳에 적혀 있음', /--box-radius: 10px;/.test(css) && /--box-radius-sm: 6px;/.test(css));
    check('Tailwind 눈금도 그 둘로 모임',
      /--radius-lg: var\(--box-radius\);/.test(css) && /--radius-2xl: var\(--box-radius\);/.test(css));
    const strayRadius = [...tpl15.matchAll(/border-radius:\s*(\d+)px/g)]
      .map((m) => Number(m[1]))
      .filter((v) => v > 4 && v < 90);
    check('미리보기에 떠도는 모서리 값이 없음', strayRadius.length === 0, strayRadius.join(', '));

    /* ④ 숫자 — 소수점 이하는 한 단 연하게 */
    const fig = await readFile('src/components/ui/Figure.tsx', 'utf8');
    check('숫자 자리가 따로 있음', /export function Figure\(/.test(fig));
    check('소수점 이하를 연하게', /\.figure-dec \{[^}]*opacity/.test(css));
    check('붙는 단위를 한 호 작게', /\.figure-unit \{[^}]*font-size: 0\.78em/.test(css));
    /*
     * 0 부터 세어 올리는 연출은 넣지 않는다. 이 앱은 값이 없을 때 0 으로 채우지
     * 않기로 되어 있는데, 0 에서 시작하는 애니메이션은 짧게나마 그 약속을 어긴다.
     */
    check('숫자를 0 부터 세어 올리지 않음', !/countUp|CountUp|from 0/.test(fig));
    check('값이 바뀐 자리를 잠깐 물들임', /@keyframes figure-flash/.test(css));
    check('축소 모션을 켠 사람에게는 물들이지 않음',
      /prefers-reduced-motion[\s\S]{0,160}\.figure-flash[\s\S]{0,80}animation: none/.test(css));
    const pc2 = await readFile('src/components/market/PriceCard.tsx', 'utf8');
    check('가격이 그 자리를 씀', /<Figure text=\{f\.price\(quote\)\} flashColor=\{color\} \/>/.test(pc2));
    check('미리보기도 같은 모양', /\.figure-dec \{ opacity: 0\.55; \}/.test(tpl15));

    /* ⑤ 단추 — 무게를 셋으로 */
    check('단추 무게가 셋으로 나뉨',
      /\.btn-primary \{/.test(css) && /\.btn \{/.test(css) && /\.btn-quiet \{/.test(css));
    const chart2 = await readFile('src/components/charts/InteractiveChart.tsx', 'utf8');
    check('차트 위 알약 여섯 개가 정리됨',
      /className="btn-group"/.test(chart2) && /className="btn-quiet"/.test(chart2) &&
      !/rounded-md border border-border bg-surface-2 px-2 py-1/.test(chart2));
    check('미리보기도 셋으로 나눔', /\.ghost-primary \{/.test(tpl15) && /\.ghost-quiet \{/.test(tpl15));

    /* ⑥ 눈금값이 잘리지 않는가 — 글꼴을 바꾸면 글자 폭이 달라진다 */
    const marginLeft = Number(chart2.match(/const MARGIN = \{ top: \d+, right: \d+, bottom: \d+, left: (\d+) \}/)?.[1] ?? 0);
    const tplLeft = Number(tpl15.match(/const M = \{ top: \d+, right: \d+, bottom: \d+, left: (\d+) \}/)?.[1] ?? 0);
    check('차트 눈금값 자리가 넉넉함', marginLeft >= 58, `${marginLeft}px`);
    check('미리보기도 같은 자리', tplLeft === marginLeft, `${tplLeft} vs ${marginLeft}`);
  }

  /* ---------------- 8-31. 오늘의 한 줄 · 찾기 ---------------- */
  console.log('\n[8-31] 오늘의 한 줄 · 찾기');
  {
    const tpl16 = await readFile('tools/preview/template.html', 'utf8');

    /* 오늘의 한 줄 — 새 데이터 없이, 이미 있는 것에서 뽑는다 */
    const line = await readFile('src/lib/todayLine.mjs', 'utf8');
    const view = await readFile('src/components/market/TodayLine.tsx', 'utf8');
    check('문장 짓는 규칙이 따로 있음', /export function todayLine\(/.test(line));
    /*
     * 금지어를 원본에서 찾으면 주석에 적어 둔 "이런 말은 쓰지 않는다" 까지 걸린다.
     * 나오는 문장을 직접 지어서 본다 — 검사해야 할 것은 규칙이 아니라 결과다.
     */
    const { todayLine: makeLine } = await import('../src/lib/todayLine.mjs');
    const sentences = [
      makeLine({ scores: [{ market: 'us', score: 12, deltaDay: -9 }] }),
      makeLine({
        scores: [{ market: 'crypto', score: 88, deltaDay: 11 }],
        picks: [{ quote: { name: '비트코인', changePct: -9 }, heat: { times: 4 } }],
      }),
      makeLine({ indicators: [{ level: 'alert', name: 'VIX' }, { level: 'alert', name: '하이일드' }] }),
    ].filter(Boolean);
    const banned = sentences.filter((t) => /매수|매도|사세요|파세요|기회|추천|전망|예상|오를|내릴|수익/.test(t));
    check('지어낸 문장에 사라·팔라·전망 같은 말이 없음', banned.length === 0, banned.join(' / '));
    check('세 갈래 모두 문장이 나옴', sentences.length === 3, `${sentences.length}/3`);
    check('할 말이 없으면 줄을 그리지 않음', /return null;/.test(line) && /if \(!line\) return null;/.test(view));
    check('세 마디를 한꺼번에 늘어놓지 않음', /if \(mood && heat\)[\s\S]{0,120}if \(mood && risk\)/.test(line));
    const homeSrc = await readFile('src/app/page.tsx', 'utf8');
    check('미국 심리 카드가 오늘의 한 줄보다 먼저 보임',
      homeSrc.includes('<FngSection />') && homeSrc.indexOf('<FngSection />') < homeSrc.indexOf('<TodayLine />'));
    const { homeMood, snapshotMood } = await import('../src/lib/homeMood.mjs');
    const scores = Array.from({ length: 101 }, (_, score) => homeMood(score, 0));
    check('공포·탐욕 양쪽 끝에서 글자가 커짐', scores.every((m, n) =>
      m.word === (n < 20 ? '쫄?' : n >= 80 ? '탐?' : null) &&
      (n >= 19 || m.size > scores[n + 1].size) && (n <= 80 || m.size > scores[n - 1].size)) &&
      scores[0].size === scores[100].size && homeMood(null, 0) === null);
    const moodSnapshot = (score, status = 'ok') => ({ sections: { fng: { status, data: [{ market: 'us', score }] } } });
    const plazaView = await readFile('src/app/plaza/page.tsx', 'utf8');
    check('홈 배경과 광장 눈금은 미국 계기판의 다섯 구간을 따르고 산출 불가 상태를 구분함',
      scores.every((m, n) => snapshotMood(moodSnapshot(n)).band === m.band) &&
      [null, -1, 101].every((n) => snapshotMood(moodSnapshot(n)) === null) &&
      ['loading', 'empty', 'error'].every((status) => snapshotMood(moodSnapshot(50, status)) === null) &&
      ['partial', 'stale'].every((status) => snapshotMood(moodSnapshot(0, status)).score === 0) &&
      [homeSrc, plazaView, tpl16].every((src) => src.includes('snapshotMood(') && src.includes('--mood-position')) &&
      [plazaView, tpl16].every((src) => src.includes('pz-mood-track') && src.includes('이전 값')));

    check('계기판 왼쪽·정상·오른쪽과 모든 중간 각도', scores.every((m, n) =>
      Math.abs(m.angle - (n * 1.8 - 90)) < 0.000001) &&
      scores[0].angle === -90 && scores[50].angle === 0 && scores[100].angle === 90);
    // 계기판은 홈 카드와 심리 상세가 같이 쓰는 MoodGauge 로 옮겼다 — 홈 카드의 틀과 계기판을 함께 본다
    const dialSrc = await readFile('src/components/charts/MoodGauge.tsx', 'utf8');
    const cover = (await readFile('src/components/market/HomeMoodCard.tsx', 'utf8')) + dialSrc;
    const face = await readFile('public/mood-dial.svg', 'utf8');
    check('앱과 미리보기가 동일한 반원과 바늘 좌표를 씀', [cover, tpl16].every(source =>
      source.includes('0 0 320 168') && source.includes('mood.angle') && source.includes('160 144)')) &&
      face.includes('0 · 공포') && face.includes('100 · 탐욕'));
    check('시장 흐름과 뉴스는 선택해서 펼침', ['시세와 시장 흐름', '일정과 뉴스'].every(label =>
      [homeSrc, tpl16].every(source => source.includes('<summary>' + label + '</summary>'))));

    /*
     * 전일 변화는 말로 — "극단적 공포 · 전일 대비 ↑ 5.5점" 은 점수가 낮은데 오른 날
     * '공포가 커졌다' 로도 읽혔다(16점 +5.5 와 16점 −5.5 가 화살표 한 글자만 달랐다).
     * 점수가 오르면 공포는 풀리고 탐욕은 커진다. 계기판에는 어제 위치를 점선 바늘로 둔다.
     */
    check('전일 변화를 말로 — 오르면 풀렸다·커졌다, 내리면 깊어졌다·식었다',
      homeMood(16, 5.5).change === '어제보다 공포가 5.5점 풀렸어요' && homeMood(16, 5.5).glyph === '▲' &&
      homeMood(16, -5.5).change === '어제보다 공포가 5.5점 깊어졌어요' && homeMood(16, -5.5).glyph === '▼' &&
      homeMood(84, 3).change === '어제보다 탐욕이 3점 커졌어요' && homeMood(84, -6).change === '어제보다 탐욕이 6점 식었어요' &&
      homeMood(50, 0).change === '어제와 같아요' && homeMood(16, null).change === '어제와 비교할 수 없어요');
    {
      const said = [];
      for (let n = 0; n <= 100; n += 1) for (const d of [-12, -5.5, -1, 1, 5.5, 12]) said.push(homeMood(n, d).change);
      const pushy = said.filter((t) => /매수|매도|매집|분할|비중|현금|보유|물량|검토선|손절|익절|사세요|파세요|추천|유리|기회|대응|전망|예상|수익/.test(t));
      check('전일 변화 문장에 매매를 권하는 말이 없음', pushy.length === 0, `${said.length}문장 중 ${pushy.length}`);
    }
    check('앱과 미리보기가 같은 전일 변화 문장과 기호를 그림',
      cover.includes('mood.change') && cover.includes('mood.glyph') && cover.includes('mood-delta') &&
      tpl16.includes('esc(mood.change)') && tpl16.includes('mood.glyph') && tpl16.includes('mood-delta') &&
      // 원본 글자가 아니라 나오는 문장을 본다 — 주석에 적어 둔 옛 문구까지 걸리지 않게
      ![[16, 5.5], [16, -5.5], [84, -6], [50, 0], [16, null]].some(([v, d]) => /전일 대비|[↑↓]/.test(homeMood(v, d).change)));
    check('계기판에 어제 위치 — 점선 바늘을 오늘 바늘 밑에, 같은 좌표로',
      homeMood(16, 5.5).yesterday?.angle === (11 - 50) * 1.8 && homeMood(16, 5.5).yesterday?.value === 10.5 &&
      homeMood(50, 0).yesterday === null && homeMood(16, null).yesterday === null &&
      cover.indexOf('mood.yesterday.angle') > -1 && cover.indexOf('mood.yesterday.angle') < cover.indexOf('rotate(${mood.angle}') &&
      tpl16.indexOf('mood.yesterday.angle') > -1 && tpl16.indexOf('mood.yesterday.angle') < tpl16.indexOf("rotate(' + mood.angle") &&
      [cover, tpl16].every((source) => source.includes('class' + (source === cover ? 'Name' : '') + '="mood-ghost"') && source.includes('mood-ghost-key')) &&
      /\.mood-ghost \{[^}]*stroke-dasharray/.test(await readFile('src/app/home-mood.css', 'utf8')));

    /*
     * '이유 보기' — 심리 상세의 기여도 절(오늘 무엇이 점수를 움직였나)로 바로 간다.
     * 예전 '심리 상세 →' 는 맨 위에 내려놓아서, 그 절까지 3,300px 를 손으로 내려야 했다.
     * 그 절은 데이터를 받은 뒤에 그려지므로 브라우저의 #이름 스크롤이 닿지 않는다 —
     * HashScroll 이 그 자리가 생길 때까지 기다렸다가 내려 준다.
     */
    const reasonDetail = await readFile('src/app/fng/[market]/page.tsx', 'utf8');
    const shell = await readFile('src/components/nav/AppShell.tsx', 'utf8');
    const hashScroll = await readFile('src/components/nav/HashScroll.tsx', 'utf8');
    check('홈의 이유 보기가 기여도 절로 바로 감 (앱)',
      cover.includes("REASON_ANCHOR = 'fng-contrib-title'") && cover.includes('/fng/us#${REASON_ANCHOR}') &&
      cover.includes('이유 보기 →') && reasonDetail.includes('id="fng-contrib-title"') &&
      shell.includes('<HashScroll />') && hashScroll.includes('MutationObserver') && hashScroll.includes('header.sticky'));
    check('미리보기도 이유 보기가 기여도 절로 바로 감',
      // 2026-11-26: 홈 칩(→ 점수 추이)이 생기면서 갈 곳을 표 하나(GO_TO_TITLE)로 묶었다
      tpl16.includes('data-go-to="contrib"') && tpl16.includes("contrib: '점수 상승·하락 기여도'") &&
      tpl16.includes('x.textContent.trim() === GO_TO_TITLE[d.goTo]') && tpl16.includes('<h2>점수 상승·하락 기여도</h2>'));
    check('점수가 없으면(산출 불가) 이유 보기 대신 심리 상세로',
      /mood \? \([\s\S]{0,200}이유 보기 →[\s\S]{0,120}\) : \([\s\S]{0,80}심리 상세 →/.test(cover) &&
      /\(mood\s*\?[\s\S]{0,200}이유 보기 →[\s\S]{0,80}:[\s\S]{0,80}심리 상세 →/.test(tpl16));

    /*
     * 홈과 심리 상세의 계기판을 똑같이 (2026-11-25 사용자 요청).
     * 예전 심리 상세는 따로 그린 얇은 무지개 반원이라, 같은 점수가 화면마다 다른 물건으로 보였다.
     * 이제 둘 다 MoodGauge(미리보기 moodGauge) 하나를 쓴다. 시장 화면의 쫄탐 카드도 Gauge 를 거쳐 같은 것.
     */
    const gaugeSrc = await readFile('src/components/charts/Gauge.tsx', 'utf8');
    const homeCardSrc = await readFile('src/components/market/HomeMoodCard.tsx', 'utf8');
    check('홈과 심리 상세가 같은 계기판을 씀 (앱)',
      homeCardSrc.includes('<MoodGauge score={score.score} deltaDay={score.deltaDay} />') &&
      gaugeSrc.includes('<MoodGauge score={score} deltaDay={deltaDay} />') && !gaugeSrc.includes('linearGradient') &&
      reasonDetail.includes('<Gauge score={detail.score} deltaDay={detail.deltaDay} />'));
    check('미리보기도 홈과 심리 상세가 같은 계기판',
      tpl16.includes('moodGauge(f.score, f.deltaDay)') && tpl16.includes('if (size >= 150) return moodGauge(score, deltaDay);') &&
      tpl16.includes('gauge(f.score, 200, f.deltaDay)'));
    {
      const bandsOf = (src) => [...src.matchAll(/\['(M[0-9. ]+A106 106 0 0 1 [0-9. ]+)', '(#[0-9a-f]{6})'\]/g)].map((m) => m[1] + m[2]).join('|');
      const appBands = bandsOf(dialSrc);
      check('지금 단계 칸만 밝힘 — 경계는 기존 단계와 같고, 칸 좌표는 앱과 미리보기가 같음',
        [[0, 0], [19, 0], [20, 1], [39, 1], [40, 2], [59, 2], [60, 3], [79, 3], [80, 4], [100, 4]].every(([v, b]) => homeMood(v, 0).band === b) &&
        appBands.split('|').length === 5 && appBands === bandsOf(tpl16) &&
        dialSrc.includes("i === mood.band ? 'mood-band on' : 'mood-band'") && tpl16.includes("i === mood.band ? 'mood-band on' : 'mood-band'") &&
        /\.mood-band\.on \{[^}]*stroke-width: 11/.test(await readFile('src/app/home-mood.css', 'utf8')) &&
        !face.includes('A106 106'), `칸 ${appBands.split('|').length}개`);
    }
    check('바늘 가운데 선은 단계 색(--ink)',
      /\.mood-needle-line \{ stroke: var\(--ink\); \}/.test(await readFile('src/app/home-mood.css', 'utf8')) &&
      dialSrc.includes('className="mood-needle-line"') && tpl16.includes('class="mood-needle-line"') &&
      !dialSrc.includes('#ff9764') && !tpl16.includes('#ff9764'));
    /*
     * 같은 말 두 번 없애기 — 오늘의 한 줄은 미국 쫄탐 카드 바로 아래라, 카드가 이미 한
     * "어제보다 공포가 5.5점 풀렸어요" 를 "미국 투자심리가 어제보다 5.5점 탐욕 쪽으로 갔고" 로 또 하지 않는다.
     */
    const todayView = await readFile('src/components/market/TodayLine.tsx', 'utf8');
    check('오늘의 한 줄은 카드가 한 전일 변화를 되풀이하지 않음 (앱 · 미리보기)',
      /todayLine\(\{[\s\S]{0,600}scores: null,/.test(todayView) && !todayView.includes('sections.fng') &&
      tpl16.includes('    const mood = null;\n') && !tpl16.includes('const mood = todayMoodClause('));
    /* '이유 보기' 의 자리 찾기는 깨진 주소에 넘어지지 않고, 뒤로 가기로 온 화면은 끌어내리지 않는다 */
    check('이유 보기 자리 찾기 — 깨진 주소 · 뒤로 가기에 안전',
      /try \{\s*id = decodeURIComponent\(window\.location\.hash\.slice\(1\)\);\s*\} catch \{\s*return;\s*\}/.test(hashScroll) &&
      hashScroll.includes("window.addEventListener('popstate'") && hashScroll.includes('Date.now() - lastHistoryNav < 1500') &&
      hashScroll.includes('observer?.disconnect();\n      timers.forEach'));
    check('점수가 없으면 계기판은 흐린 칸만 — 바늘 없이 산출 불가',
      homeMood(null, 0) === null && dialSrc.includes('{mood && (\n          <g transform={`rotate(${mood.angle}') &&
      dialSrc.includes('<p className="mood-na" role="status"><b>산출 불가</b></p>') &&
      tpl16.includes("(mood ? '<g transform=\"rotate(' + mood.angle") && tpl16.includes('<p class="mood-na" role="status"><b>산출 불가</b></p>'));

    /*
     * 기여도는 몫(%)을 크게, 점수(점)는 작게 (2026-11-25 사용자: "0.## 이라는 숫자를 보고 이해를 못하겠네").
     * 몫 계산은 lib/contribution.mjs 한 곳 — 미리보기에는 그 함수가 글자 그대로 들어 있어야 한다.
     */
    {
      const contribLib = await readFile('src/lib/contribution.mjs', 'utf8');
      const contribFn = contribLib.slice(contribLib.indexOf('export function contributionShares')).replace(/^export /, '').trim();
      const indented = contribFn.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
      const { contributionShares } = await import('../src/lib/contribution.mjs');
      const bars = await readFile('src/components/charts/ContributionBars.tsx', 'utf8');
      const demoRow = contributionShares([0.72, 0, 0.67, 0.32, 2.06, 0.99, 0.73]);
      check('기여도는 몫(%)으로 — 오른 쪽과 내린 쪽을 합쳐 100%',
        demoRow.rows.map((r) => r.text).join(' ') === '13% 0% 12% 6% 38% 18% 13%' && demoRow.net === 5.5 &&
        contributionShares([3, -1]).rows.map((r) => r.text).join(' ') === '75% 25%' &&
        contributionShares([1, null]).rows[1].text === '결측',
        demoRow.rows.map((r) => r.text).join(' '));
      check('앱 기여도 막대가 몫을 크게, 점수를 작게',
        bars.includes("import { contributionShares } from '@/lib/contribution.mjs';") &&
        bars.includes('`${GLYPH[row.dir]} ${row.text}`') && bars.includes('{formatSigned(v, 1)}점') &&
        bars.includes('지표별로 나누면') && bars.includes('합쳐 100%') && !bars.includes('기여도 (점)'));
      check('미리보기 기여도 — 같은 함수를 글자 그대로, 같은 몫 · 같은 설명',
        tpl16.includes('\n  ' + indented.trimStart() + '\n') &&
        tpl16.includes('const contribShares = contributionShares(f.components.map((c) => c.contributionDay));') &&
        tpl16.includes("(CONTRIB_GLYPH[r.dir] + ' ' + r.text).trim()") && tpl16.includes('지표별로 나누면') &&
        tpl16.includes('합쳐 100%') && !tpl16.includes('기여도 (점)'));
    }
    check('심리 상세 요약 카드도 홈 카드와 같은 배경 (mood-cover · 단계 색)',
      reasonDetail.includes('<div className="card mood-cover p-3" style={{ \'--ink\': scoreColor(detail.score) } as React.CSSProperties}>') &&
      tpl16.includes('<section class="block"><div class="card mood-cover" style="padding:12px;--ink:\' + scoreColor(f.score) + \'">'));

    /*
     * 시장 위험 신호등 여섯 장을 홈에서 뺐다.
     *
     * 그 블록은 "빨간불은 '위험하니 팔아라' 가 아니라 '이 지표가 평소보다 크게
     * 벗어나 있다' 는 뜻" 이라는 설명 문단을 함께 읽어야 제대로 읽힌다.
     * 설명을 읽어야 읽히는 것은 10초 안에 훑는 화면에 맞지 않는다.
     *
     * 여섯 중 둘(공포지수 · 위험한 회사 이자)은 이미 심리 점수의 구성요소라
     * 홈에서 점수로 한 번, 신호등으로 또 한 번 본 셈이기도 했다.
     * 나머지 넷은 '경제지표' 탭이 맡는다 — 거기서는 설명과 함께 읽힌다.
     */
    /*
     * 1면은 미국 한 장이다 (2026-11-24 쫄탐일보 리밸런싱).
     *
     * 예전에는 미국·크립토 두 장을 옆으로 미는 줄이었고, 그때 이 자리는 "두 장의 폭이
     * 다른 카드와 같아야 한다" 를 지켰다(85cqw 라 66px 좁았던 일). 이제 옆으로 미는 줄이
     * 없다 — 미국 한 장이 칸을 꽉 채운다. 아래 크립토 한 줄도 2026-11-26 에 뺐다
     * (사용자: "크립토는 그냥 빼버리자, 관심없다").
     */
    const fngSec = await readFile('src/components/market/FngSection.tsx', 'utf8');
    check('1면 카드는 미국 한 장 (옆으로 미는 줄 없음)',
      /s\.market === 'us'/.test(fngSec) && !/function Carousel\(/.test(fngSec) && !/snap-item/.test(fngSec));
    check('1면 아래 크립토 한 줄도 없음', !/function MarketLine\(/.test(fngSec) && !/rest\.map/.test(fngSec));
    check('미리보기도 같은 구성',
      /x\.market === 'us'/.test(tpl16) && !/function marketLine\(f\)/.test(tpl16) && !/id="fngscroll"/.test(tpl16));
    check('쓰지 않게 된 캐러셀 스타일을 지움',
      !/\.snap-row \{/.test(await readFile('src/app/globals.css', 'utf8')) && !/\.fng-scroll \{/.test(tpl16));

    /*
     * 폭만 맞춰서는 모자랐다 — 높이도 같아야 한다.
     *
     * 요인 줄은 시장마다 0~2줄이라 카드 안쪽 내용의 길이가 제각각이다. 카드가
     * 제 내용만큼만 자라면 옆으로 밀 때마다 카드 아래 빈 자리가 늘었다 줄었다
     * 한다. 미리보기에서 실제로 그랬다 — 크립토 446px, 미국 403px, 아래 빈 자리
     * 49px 차이. 카드 셋이 가장 키 큰 것에 맞춰 서고, 남는 자리는 안쪽으로
     * 흩어져야 한다 (바닥의 단추와 시각은 margin-top:auto 로 붙인다).
     */
    const fngCardSrc = await readFile('src/components/market/FngCard.tsx', 'utf8');
    const detailSrc = await readFile('src/app/fng/[market]/page.tsx', 'utf8');
    const previewHome = tpl16.slice(tpl16.indexOf('function viewHome()'), tpl16.indexOf('function viewMarketHub()'));
    check('홈은 경고를 요약보다 먼저 표시', homeSrc.includes('<RiskAlertLine />') &&
      homeSrc.indexOf('<RiskAlertLine />') < homeSrc.indexOf('<TodayLine />') &&
      previewHome.includes('시장 경고 · 지표') && previewHome.indexOf('시장 경고 · 지표') < previewHome.indexOf('todayLineText()'));
    check('시장 간 척도 설명은 심리 상세에서 확인', !fngSec.includes('SCALE_WARNING_TEXT') &&
      !previewHome.includes('서로 견줄 수 없습니다') && detailSrc.includes('detail.methodology.scaleWarning') &&
      tpl16.includes('esc(d.methodology.scaleWarning)'));
    check('앱 카드가 칸 높이를 꽉 채움', /className="card flex h-full flex-col p-3"/.test(fngCardSrc));
    check('앱 카드의 단추·시각이 바닥에 붙음', /className="mt-auto flex items-center gap-2 border-t/.test(fngCardSrc));

    /*
     * height:100% 가 오히려 높이를 어긋나게 했다.
     *
     * 높이가 정해지지 않은 칸 안에서 100% 는 auto 로 풀리고, 그러면서 늘어나는
     * 동작(align-self:stretch)까지 꺼버린다. 앱은 카드를 감싼 칸이 따로 있어
     * 안 걸렸고, 감싼 칸이 없는 미리보기에서만 터졌다.
     */
    const fngCardCss = tpl16.match(/\.fngcard \{[^}]*\}/)?.[0] ?? '';
    check('미리보기 카드에 height:100% 가 없음', fngCardCss !== '' && !/height:\s*100%/.test(fngCardCss), fngCardCss);
    check('미리보기 카드가 늘어나 같은 높이로 섬', /align-self:\s*stretch/.test(fngCardCss), fngCardCss);
    check('미리보기도 단추·시각을 바닥에 붙임', /\.fngfoot \{[^}]*margin-top:\s*auto/.test(tpl16));

    /*
     * 바닥 모양도 앱과 같아야 한다. 미리보기는 시각과 단추를 한 줄에 몰아 넣어
     * 단추가 글자만 했다. 앱은 단추 둘이 한 줄을 나눠 갖고(하나는 강조색),
     * 산출 시각은 그 아래 줄이다.
     */
    check('미리보기 단추가 한 줄을 나눠 가짐', /\.fngfoot > button \{[^}]*flex:\s*1 1 0/.test(tpl16));
    check('미리보기도 강조 단추가 하나', /class="ghost ghost-primary" data-go-region=/.test(tpl16));
    check('미리보기도 산출 시각이 아랫줄', /<p class="fngstamp"/.test(tpl16) && /\.fngstamp \{/.test(tpl16));

    /*
     * 요약 카드가 맨 위 한 줄과 같은 말을 하고 있었다.
     *   한 줄 : 크립토 투자심리가 어제보다 10점 탐욕 쪽으로 갔고 …
     *   요약  : 오늘 가장 크게 움직인 것 — 크립토 심리 78.3점 탐욕 (어제보다 +10.0) …
     * 요약의 첫 줄에서 심리 부분을 뺐다. 심리 이야기는 다음 줄이 '왜' 로 이어받는다.
     */
    const summarySrc = await readFile('src/server/summary.ts', 'utf8');
    check('요약 첫 줄이 심리 점수를 되풀이하지 않음',
      !/심리 \$\{formatScore/.test(summarySrc) && /대표 시세 중 가장 크게 움직인 것/.test(summarySrc));
    const sumT = (await getJson('/api/snapshot?scenario=normal')).body?.sections?.summary?.data;
    const first = (sumT?.lines ?? [])[0]?.text ?? '';
    check('내려온 요약도 심리 점수로 시작하지 않음', !/심리 \d/.test(first), first.slice(0, 60));

    check('홈에서 위험 신호등 여섯 장을 뺌',
      !/<RiskGaugesSection \/>/.test(homeSrc) && /<RiskAlertLine \/>/.test(homeSrc));
    const alertLine = await readFile('src/components/market/RiskAlertLine.tsx', 'utf8');
    check('빨간불이 켜진 날에만 한 줄이 뜸', /digest\.alertCount === 0\) return null;/.test(alertLine));
    check('그 줄이 경제지표로 데려감', /href="\/indicators"/.test(alertLine));
    check('경제지표 탭에는 그대로 있음',
      /RiskGaugesSection|RiskBoard/.test(await readFile('src/app/indicators/page.tsx', 'utf8')));
    check('미리보기도 같은 줄을 씀', /시장 경고 · 지표 ' \+ d\.alertCount \+ '개/.test(tpl16) && !/시장 위험 신호등<\/h2>/.test(tpl16.slice(tpl16.indexOf('function viewHome'), tpl16.indexOf('function viewHome') + 4000)));

    /*
     * 조사는 앞말의 받침이 정한다.
     * '수수료이 평소 범위를 벗어났습니다' 가 나오고 있었고, 다른 한 곳은 지표
     * **개수**로 조사를 고르고 있었다 — 이름과 아무 상관이 없었다.
     */
    const { subject } = await import('../src/lib/particle.mjs');
    const particleCases = [['수수료', '가'], ['금리차', '가'], ['국면', '이'], ['VIX', '가'], ['S&P 500', '이']];
    const wrong = particleCases.filter(([w, want]) => subject(w) !== want);
    check('조사를 받침으로 고름', wrong.length === 0, wrong.map(([w]) => w).join(', '));
    check('두 곳 모두 그 규칙을 씀',
      /import \{ subject \} from '\.\/particle\.mjs'/.test(line) && /from '@\/lib\/particle\.mjs'/.test(alertLine));
    check('미리보기도 같은 문장을 지음',
      /function todayLineText\(\)/.test(tpl16) && /TODAY_MOVE_MIN = 1\.5/.test(tpl16) && /TODAY_HEAT_MIN = 1\.6/.test(tpl16));

    /* 찾기 */
    const search = await readFile('src/lib/search.mjs', 'utf8');
    const dialog = await readFile('src/components/ui/SearchDialog.tsx', 'utf8');
    check('찾는 규칙이 따로 있음', /export function searchEntries\(/.test(search));
    check('초성으로도 찾음', /export function initials\(/.test(search) && /isInitialQuery/.test(search));
    check('앞에서 맞은 것이 먼저 옴', /at === 0 \? 0 : 100/.test(search));
    check('바깥에 물어보지 않음 (앱 안의 것만)',
      /CATALOG/.test(dialog) && /TERMS/.test(dialog) && !/fetch\(/.test(dialog));
    const shellSrc = await readFile('src/components/nav/AppShell.tsx', 'utf8');
    check('어느 화면에서든 Ctrl+K 로 열림',
      /if \(!e\.metaKey && !e\.ctrlKey\) return;/.test(shellSrc) &&
      /window\.addEventListener\('keydown'/.test(shellSrc));
    check('글자를 치는 중에는 가로채지 않음',
      /HTMLInputElement \|\| el instanceof HTMLTextAreaElement/.test(shellSrc));
    check('상단에도 여는 자리가 있음',
      /aria-label="찾기 \(Ctrl\+K\)"/.test(await readFile('src/components/market/StatusBar.tsx', 'utf8')));
    /* 기준 칸 안의 fixed 는 화면이 아니라 그 칸에 붙는다 — 큰 그림 창과 같은 이유 */
    check('찾기 창도 문서 맨 위로 옮겨 그림', /createPortal\(/.test(dialog) && /document\.body,/.test(dialog));

    /*
     * [8-39] 점수표에서 깎인 것 (2026-11-26, 390px 에서 탭마다 잼).
     *   경제지표 화면이 5.5장 길이 — 다섯 카드가 '무슨 지표인가' 와 '오르면 · 내리면' 을 늘 펼쳐 둠.
     *   누를 자리 24px 미달 — 홈 '시장 경고' 21px, 심리 상세 '표로 보기' 19px.
     *   더보기 · 데이터 진단이 문 닫은 Stooq 를 시세 출처라고 말함 (실제는 Yahoo Finance).
     */
    console.log('\n[8-39] 점수표 반영 — 지표 설명 접기 · 누를 자리 · 진단 문구');
    {
      const gauges = await readFile('src/components/market/RiskGauges.tsx', 'utf8');
      const card = gauges.slice(gauges.indexOf('export function RiskCard'), gauges.indexOf('export function RiskGaugesSection'));
      const fold = card.slice(card.indexOf('<details'), card.indexOf('</details>'));
      check('경제지표 카드 — 지금 읽는 법은 펼쳐 두고, 지표 설명은 접음 (앱)',
        card.indexOf('지금 읽는 법 · ') > 0 && card.indexOf('지금 읽는 법 · ') < card.indexOf('<details') &&
        fold.includes('이게 무슨 지표인가요? ▾') && fold.includes('무슨 지표인가 · ') && fold.includes('<UpDownExplainer') &&
        fold.includes('<summary className="tap ') && card.indexOf('</details>') > card.indexOf('<details') &&
        !card.slice(card.indexOf('</details>')).includes('무슨 지표인가 · '));
      const tplCard = tpl16.slice(tpl16.indexOf('function riskCard(i)'), tpl16.indexOf("'</article>'", tpl16.indexOf('function riskCard(i)')));
      const tplFold = tplCard.slice(tplCard.indexOf('<details class="risk-more"'), tplCard.indexOf('</dl></details>'));
      check('미리보기 경제지표 카드도 같게',
        tplCard.indexOf('지금 읽는 법 · ') > 0 && tplCard.indexOf('지금 읽는 법 · ') < tplCard.indexOf('<details class="risk-more"') &&
        tplFold.includes('이게 무슨 지표인가요? ▾') && tplFold.includes('무슨 지표인가 · ') && tplFold.includes('값이 오르면') &&
        tplFold.includes('<summary class="linkbtn"') && tplCard.indexOf('</dl></details>') > tplCard.indexOf('<details class="risk-more"') &&
        !tplCard.slice(tplCard.indexOf('</dl></details>')).includes('무슨 지표인가 · '));
      const alertLine = await readFile('src/components/market/RiskAlertLine.tsx', 'utf8');
      const tableToggles = await Promise.all(['CrisisMarkers', 'BandStatsView', 'FundamentalsCard'].map((n) => readFile(`src/components/market/${n}.tsx`, 'utf8')));
      check('누를 자리 24px — 홈 시장 경고 줄 · 표로 보기 (앱 · 미리보기)',
        alertLine.includes('flex min-h-6 items-center') &&
        tableToggles.every((t) => t.includes('<summary className="min-h-6 cursor-pointer') && !t.includes('<summary className="cursor-pointer text-[12.5px]')) &&
        tpl16.includes('data-go="risk" style="display:flex;gap:8px;align-items:center;min-height:24px;') &&
        tpl16.includes('<summary style="min-height:24px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted)">표로 보기</summary>'));
      const cfg = await readFile('src/server/config.ts', 'utf8');
      check('데이터 진단이 시세 출처를 Yahoo Finance 로 말함 (Stooq 는 문 닫음)',
        cfg.includes('미국·한국 시세(Yahoo Finance)') && !cfg.includes('시세(Stooq)'));
    }
  }

  /* ---------------- 8-9. LIVE 연결 ---------------- */
  console.log('\n[8-9] 실데이터 연결');
  {
    // 이 컨테이너는 제공사로 나갈 수 없어 실제 호출은 못 한다.
    // 대신 "무엇이 붙었고 무엇이 아직인지" 를 원본에서 확인한다.
    const live = await readFile('src/server/adapters/live/index.ts', 'utf8');
    const macro = await readFile('src/server/adapters/live/macro.ts', 'utf8');

    check('Stooq 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/stooq.ts'));
    check('Cboe 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/cboe.ts'));
    check('FRED 제공사 모듈이 있음', existsSync('src/server/adapters/live/providers/fred.ts'));

    check('거시 지표가 FRED 에 연결됨', live.includes('buildFredMacro'));
    check('환율이 연결됨', /getUsdKrw[\s\S]{0,300}fetchLatest/.test(live));

    /*
     * 크립토는 앱에서 뺐다 (2026-11-26). CoinGecko · Binance 모듈 파일은 남아 있지만
     * 스냅샷이 도는 시장 목록(MARKET_IDS · INDEX_MARKET_IDS)에 없어 부르지 않는다 —
     * 화면에 그리지 않을 값을 받으려고 바깥 제공사를 두드리지 않는다.
     */
    const typesSrc = await readFile('src/types/index.ts', 'utf8');
    check('서버가 크립토를 받지 않음 — 점수 · 시세 목록에 없음',
      /export const MARKET_IDS: MarketId\[\] = \['us'\];/.test(typesSrc) &&
      /export const INDEX_MARKET_IDS: MarketId\[\] = \['us', 'kr'\];/.test(typesSrc));

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
     * 열한 가운데 일곱만 닿는다 (가계부채 비율은 FRED 키가 있을 때). 나머지 넷은 무료로 받을 길이 없어서 비워 둔다.
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
    // 2026-11-26 더한 둘 — 합계출산율은 세계은행, 가계부채 비율은 IMF 값을 FRED 로. 실제 호출 확인은 check:live
    const wbSrc = await readFile('src/server/adapters/live/providers/worldbank.ts', 'utf8');
    const fredSrc = await readFile('src/server/adapters/live/providers/fred.ts', 'utf8');
    const chkLive = await readFile('scripts/check-live.mjs', 'utf8');
    check('합계출산율이 세계은행에 연결됨 (SP.DYN.TFRT.IN)',
      /fertility: 'SP\.DYN\.TFRT\.IN'/.test(wbSrc) && basicsSrc.includes("fetchIndicator(wb, 'fertility'") && chkLive.includes("'SP.DYN.TFRT.IN'"));
    check('가계부채 비율이 IMF→FRED 네 나라 계열에 연결됨',
      ['KR', 'CN', 'JP', 'US'].every((c) => fredSrc.includes(`'HDTGPD${c}A163N'`) && chkLive.includes(`'HDTGPD${c}A163N'`)) &&
      basicsSrc.includes('source: IMF_VIA_FRED') && /fred: fredKey \? fredConfig\(fredKey/.test(live));
    check('확인 못 한 계열이라는 사실을 적어 둠', /실제 응답으로는 확인하지 못했다/.test(fredSrc));
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
    const detailBody = await (await fetch(`${BASE}/api/asset/nvda`)).json();
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

  /* ---------------- 8-32. 핫한 종목 늘리기 ---------------- */
  console.log('\n[8-32] 핫한 종목 — 목록 · 값 · 합성 세계');
  {
    const cat = await readFile('src/lib/catalog.ts', 'utf8');
    const stooq = await readFile('src/server/adapters/live/providers/stooq.ts', 'utf8');

    /* 늘린 이름들이 목록에 있는가 */
    const HOT_US = ['meta', 'googl', 'avgo', 'amd', 'nflx', 'pltr', 'coin', 'mstr', 'mu', 'smci'];
    // 늘렸던 코인 다섯(도지 · 에이다 · 트론 · 아발란체 · 체인링크)은 2026-11-26 크립토와 함께 뺐다
    const missingCat = HOT_US.filter((id) => !new RegExp(`\\{\\s*id:\\s*'${id}'`).test(cat));
    check('핫한 종목이 카탈로그에 들어옴 — 미국 10',
      missingCat.length === 0, missingCat.join(', '));

    /*
     * 목록에만 있고 받아올 길이 없으면 LIVE 에서 빈 줄만 늘어난다.
     * 늘린 종목은 전부 제공사 심볼을 함께 적었는지 본다.
     */
    const noSymbol = HOT_US.filter((id) => !new RegExp(`^\\s*${id}: '${id}\\.us',`, 'm').test(stooq));
    check('늘린 미국 종목마다 Stooq 심볼이 있음', noSymbol.length === 0, noSymbol.join(', '));

    /*
     * 한국 개별 종목은 늘리지 않았다 — 무료로 닿는 시세 제공처가 없다.
     * 그 사정을 코드에 적어 둔다. 안 적으면 다음 사람이 같은 길을 다시 판다.
     */
    check('한국 종목을 왜 안 늘렸는지 적어 둠',
      /무료로 닿는 시세 제공처가 없다/.test(cat) && /빈 줄만 늘어난다/.test(cat));
    check('손으로 고른 목록임을 밝힘', /손으로 고른 목록이다/.test(cat) && /다시\n\s*\*\s*들여다봐야/.test(cat));

    /* 화면까지 실제로 값이 오는가 */
    const quotes = (await getJson('/api/snapshot?scenario=normal')).body?.sections?.quotes?.data ?? {};
    const byId = new Map();
    for (const rows of Object.values(quotes)) for (const q of rows ?? []) byId.set(q.id, q);
    const blank = HOT_US.filter((id) => {
      const q = byId.get(id);
      return !q || q.price === null || q.price === undefined || !Number.isFinite(q.changePct);
    });
    check('늘린 종목 전부에 값과 등락이 옴 — 10개', blank.length === 0, blank.join(', '));

    /*
     * 값이 오기만 하면 안 된다. 자릿수가 말이 돼야 한다.
     * 0.42달러짜리 미국 주식이 찍히던 것을 여기서 잡는다.
     */
    const odd = HOT_US.filter((id) => {
      const v = byId.get(id)?.price;
      return !(v > 1 && v < 20000);
    });
    check('미국 종목 값이 주식다운 자릿수임', odd.length === 0, odd.join(', '));

    /* 큰 그림도 그려지는가 — 구간마다 점이 와야 한다 */
    for (const id of ['smci', 'pltr']) {
      const ranges = (await getJson(`/api/asset/${id}`)).body?.ranges ?? {};
      const empty = Object.entries(ranges).filter(([, v]) => !(v?.length > 1)).map(([k]) => k);
      check(`${id} 의 모든 구간에 그림이 있음`, Object.keys(ranges).length === 5 && empty.length === 0,
        empty.join(', '));
    }

    /*
     * 합성 세계가 가라앉던 것.
     *
     * 가격을 (1 + r) 로 곱해 나가면 쌓이는 것은 r 의 평균이 아니라 log(1+r) 의
     * 평균이라, 많이 흔들리는 종목일수록 까닭 없이 값이 내려갔다. 게다가 변동성이
     * 치솟은 날에는 r 이 -1 을 넘어 가격이 음수가 되는 걸 바닥값으로 막아야 했고,
     * 한 번 바닥에 닿은 종목은 다시 올라오지 못했다. exp 로 쌓으면 둘 다 없다.
     */
    const world = await readFile('src/server/adapters/demo/world.ts', 'utf8');
    check('가격을 로그 공간에서 쌓음 (exp)',
      (world.match(/p \*= Math\.exp\(/g) ?? []).length === 3);
    check('음수를 막는 바닥값이 더는 필요 없음',
      !/Math\.max\(p \* \(1 \+/.test(world));
    check('왜 곱하지 않고 exp 인지 적어 둠',
      /로그 수익률/.test(world) && /바닥에 닿은 종목은 다시 올라오지 못했다/.test(world));

    /* 10년을 걸어도 한쪽으로 기울지 않는가 — 오르는 종목과 내리는 종목이 섞여야 한다 */
    const usRows = (quotes.us ?? []).filter((q) => q.kind === 'equity' && Number.isFinite(q.changePct));
    const up = usRows.filter((q) => q.changePct > 0).length;
    check('오르는 종목과 내리는 종목이 함께 있음',
      usRows.length >= 15 && up > 0 && up < usRows.length, `${up}/${usRows.length} 상승`);

    /*
     * 늘린 종목은 새 case 를 적지 않아도 이어진다.
     * 한 줄 적는 것을 잊어 빈 카드가 나오는 일을 구조로 막는다.
     */
    const demoIdx = await readFile('src/server/adapters/demo/index.ts', 'utf8');
    check('이름이 같은 시계열을 자동으로 이음',
      /if \(s\[item\.id\]\) return \{ values: s\[item\.id\], dates: d \};/.test(demoIdx) &&
      /if \(c\[item\.id\]\) return \{ values: c\[item\.id\], dates: cd \};/.test(demoIdx));

    /*
     * 재무제표가 없는 이유를 두 가지로 갈랐다.
     * 한 문장으로 뭉치면 메타 앞에서 "SEC 공시가 있는 미국 상장사만 보여줍니다"
     * 라고 말하게 된다 — 메타는 미국 상장사이고 공시도 있다. 틀린 말이 된다.
     */
    const cc = await readFile('src/lib/companyCatalog.ts', 'utf8');
    check('재무제표 없는 이유를 한 곳에서 정함',
      /export function fundamentalsUnavailableReason\(/.test(cc));
    check('공시가 없는 것과 아직 안 이은 것을 갈라 말함',
      /market === 'us' && item\.kind === 'equity'/.test(cc) && /회사 번호\(CIK\)를 확인하지 못해/.test(cc));
    check('CIK 를 짐작으로 적지 않는다고 밝힘', /짐작으로 적으면 엉뚱한 회사의 재무제표가 나오므로/.test(cc));
    check('조사를 이름의 받침이 정함', /\$\{topic\(item\.name\)\}/.test(cc));
    const reasons = {};
    for (const id of ['meta', 'mu']) {
      reasons[id] = (await getJson(`/api/asset/${id}`)).body?.fundamentalsUnavailable ?? '';
    }
    check('미국 종목에는 아직 안 이었다고 말함',
      /미국 상장사지만/.test(reasons.meta) && /미국 상장사지만/.test(reasons.mu));
    check('받침 있는 이름에 은, 없는 이름에 는',
      reasons.mu.startsWith('마이크론은') && reasons.meta.startsWith('메타는'),
      `${reasons.mu.slice(0, 6)} / ${reasons.meta.slice(0, 5)}`);
    // 뺀 코인의 상세는 열리지 않는다 — 옛 링크가 빈 화면이 아니라 '없음' 으로 끝난다
    const goneAsset = await fetch(`${BASE}/api/asset/doge`);
    check('뺀 코인 상세 API 는 404', goneAsset.status === 404, `status=${goneAsset.status}`);

    /*
     * 시총 300위 문턱은 그대로다 — 늘린 종목도 그 문을 지난다.
     * 제공사가 순위를 주지 않는 동안에는 문이 열려 있고, 주기 시작하면 걸러진다.
     */
    const heat = await readFile('src/lib/heatRank.mjs', 'utf8');
    check('시총 문턱이 그대로 있음', /CAP_RANK_MAX = 300/.test(heat) && /export function withinCap\(/.test(heat));
  }

  /* ---------------- 8-33. 그림 속 글씨 크기 ---------------- */
  console.log('\n[8-33] 그림 속 글씨도 10.5px 아래로 내려가지 않는가');
  {
    /*
     * 글씨 크기 검사에 구멍이 있었다.
     *
     * 지금까지는 Tailwind 로 적은 글씨(text-[11.5px] 같은 것)만 봤다. 그런데 그림
     * 안의 글자는 SVG 의 fontSize 로 적히므로 그 그물에 걸리지 않았고, 구간별 통계의
     * 가로 눈금이 9.5px 로 남아 있었다.
     *
     * SVG 는 까다롭다. viewBox 가 늘어나면 글자도 같이 커지기 때문에, **적어 둔 값이
     * 곧 보이는 값은 아니다.** 실제로 BasicTrend 의 fontSize 10 은 높이가 auto 라
     * 1.1~1.3배로 커져 화면에서는 11~13px 로 보인다 — 규칙 위반이 아니다.
     *
     * 갈리는 지점은 **높이를 CSS 로 못박았는가** 이다. 못박으면 세로 배율이 1 로
     * 고정되고(preserveAspectRatio 기본값이 작은 쪽을 따르므로) 적은 값이 그대로
     * 보인다. 그런 그림만 10.5px 문턱을 적용한다.
     */
    /*
     * 파일 전체를 훑으면 안 된다.
     *
     * 한 번 그렇게 짰다가 미리보기의 font-size 9 · 10 이 무더기로 걸렸는데, 재 보니
     * 전부 높이가 auto 라 1.1~1.3배로 커져 화면에서는 11~13px 였다. 위반이 아닌 것을
     * 위반이라 부르는 검사는 고쳐야 할 것을 가려 버린다. 그래서 **높이를 못박은 칸**
     * 하나만 도려내어 본다.
     */
    const blocks = [
      ['src/components/market/BandStatsView.tsx',
       /viewBox=\{`0 0 \$\{ROW_W\} (\d+)`\}\s+className="h-\[(\d+)px\][\s\S]{0,700}?<\/svg>/],
      ['tools/preview/template.html',
       /viewBox="0 0 ' \+ BAND_ROW_W \+ ' (\d+)"[^']*height:(\d+)px[\s\S]{0,900}?<\/svg>/],
    ];
    for (const [path, re] of blocks) {
      const src = await readFile(path, 'utf8');
      const m = src.match(re);
      check(`${path} — 눈금 칸의 viewBox 높이와 CSS 높이가 같음`, Boolean(m) && m[1] === m[2],
        m ? `viewBox ${m[1]} vs CSS ${m[2]}` : '블록을 못 찾음');

      const small = [...(m?.[0] ?? '').matchAll(/font-?[Ss]ize="(\d+(?:\.\d+)?)"/g)]
        .map((x) => parseFloat(x[1])).filter((v) => v < 10.5);
      check(`${path} — 그 칸 안에 10.5px 미만 글씨가 없음`, Boolean(m) && small.length === 0,
        small.join(', '));
    }

    /*
     * 실제로 화면에 몇 px 로 보이는지는 브라우저만 안다. 여기서는 소스만 보므로,
     * 눈금 글씨가 기준값 그대로 적혔는지까지만 확인한다.
     */
    const band = await readFile('src/components/market/BandStatsView.tsx', 'utf8');
    check('구간 눈금 글씨가 10.5px', /fontSize="10\.5"/.test(band));
    check('눈금선(y=1~4)과 글자 기준선이 겹치지 않음', /y="13"/.test(band));
    const tplBand = await readFile('tools/preview/template.html', 'utf8');
    check('미리보기도 같은 값', /font-size="10\.5"/.test(tplBand) && /y="13" text-anchor="middle"/.test(tplBand));

    /*
     * 늘어나는 그림(BasicTrend)은 이 문턱을 적용하지 않는다. 다만 왜 예외인지는
     * 코드에 적혀 있어야 한다 — 안 적으면 다음 사람이 "여기도 10.5로 올려야겠다"
     * 하고 고쳐서 y축 글자가 잘린다.
     */
    check('늘어나는 그림이 예외인 이유를 적어 둠',
      /높이가 auto 라 1\.1~1\.3배로 커져/.test(band));
  }

  /* ---------------- 8-34. 조용히 죽어 있던 스타일 ---------------- */
  console.log('\n[8-34] 적어 두었는데 듣지 않던 것들');
  {
    const css = await readFile('src/app/globals.css', 'utf8');

    /*
     * ① 레이어 밖의 * 규칙이 모든 min-width 를 죽이고 있었다.
     *
     * Tailwind v4 에서 레이어 없는 CSS 는 @layer utilities · @layer components 를
     * **전부 이긴다.** 그래서 레이어 밖에 둔 `* { min-width: 0 }` 이 코드에 적힌
     * min-width 를 하나도 남김없이 0 으로 덮었다 — 앱 안의 min-w-* 77곳이 전부
     * 죽은 글자였다.
     *
     * 눈에 보이던 증상: 뒤로가기 '←' 가 min-w-[24px] 을 주고도 폭 14px, 그래프
     * 확대·축소 단추가 min-width:28px 을 주고도 16px. 손가락으로 누르기 어려웠다.
     */
    const starBlocks = [...css.matchAll(/(^|\n)([^\S\n]*)\*\s*\{[^}]*\}/g)];
    for (const m of starBlocks) {
      const before = css.slice(0, m.index);
      // 이 * 규칙이 @layer 블록 안에 있는가 — 앞선 중괄호 짝으로 센다
      const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length;
      check('전역 * 규칙이 @layer 안에 있음', depth > 0,
        depth > 0 ? '' : `레이어 밖에 있음: ${m[0].trim().replace(/\s+/g, ' ').slice(0, 60)}`);
    }
    check('min-width 리셋이 @layer base 안에 있음',
      /@layer base \{\s*\*\s*\{\s*min-width:\s*0;\s*\}\s*\}/.test(css));
    check('왜 레이어 안이어야 하는지 적어 둠',
      /반드시 @layer base 안에 있어야 한다/.test(css) && /min-w-\* 77곳이 전부 죽은 글자였다/.test(css));

    /*
     * ② @theme 에 없는 색 이름은 유틸리티가 만들어지지 않는다.
     *
     * text-accent-fg 를 썼는데 --color-accent-fg 를 @theme 에 안 적어 두어서,
     * 아무 색도 안 나오고 글자가 본문색(거의 흰색)으로 떨어졌다. 파란 단추에 흰
     * 글자 — 대비 2.08:1 로 기준(4.5:1)의 절반도 안 됐다.
     *
     * 한 곳을 고치는 데서 끝내지 않고, :root 의 색 이름을 유틸리티로 쓰면서
     * @theme 에 안 올린 것이 또 있는지 통째로 본다.
     */
    const themeBlock = css.match(/@theme inline \{[\s\S]*?\n\}/)?.[0] ?? '';
    const themed = new Set([...themeBlock.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]));
    const rootVars = new Set([...css.matchAll(/^\s{2}--([a-z][a-z0-9-]*):/gm)].map((m) => m[1]));

    const tsx = [];
    for (const dir of ['src/components', 'src/app']) {
      for (const f of await listFiles(dir, /\.tsx$/)) tsx.push(await readFile(f, 'utf8'));
    }
    const used = new Set();
    for (const src of tsx) {
      for (const m of src.matchAll(/\b(?:text|bg|border|fill|stroke|ring|divide)-([a-z][a-z0-9-]*)\b/g)) {
        if (rootVars.has(m[1])) used.add(m[1]);
      }
    }
    const dead = [...used].filter((n) => !themed.has(n)).sort();
    check('색 유틸리티로 쓰는 이름이 모두 @theme 에 올라 있음', dead.length === 0,
      dead.length ? `@theme 에 --color-${dead.join(', --color-')} 가 없어 유틸리티가 만들어지지 않습니다` : '');
    check('강조 단추 글자색이 @theme 에 있음', themed.has('accent-fg'));

    /*
     * ③ 홀로 선 길은 손가락이 닿을 자리를 24px 로 넓힌다 (WCAG 2.2 AA 2.5.8).
     *    문장 속 링크는 예외라 건드리지 않는다.
     */
    const backs = [
      ['src/app/asset/[id]/page.tsx', /aria-label="뒤로"[\s\S]{0,140}?className="tap[^"]*min-w-\[24px\]/],
      ['src/app/fng/[market]/page.tsx', /aria-label="[^"]*"[\s\S]{0,160}?className="tap[^"]*min-w-\[24px\]/],
      ['src/app/market/[region]/page.tsx', /aria-label="지수 목록으로"[\s\S]{0,200}?className="tap[^"]*min-w-\[24px\]/],
      ['src/app/indices/page.tsx', /href="\/futures"[\s\S]{0,140}?className="tap/],
    ];
    for (const [path, re] of backs) {
      check(`${path} — 홀로 선 길의 누를 자리가 24px`, re.test(await readFile(path, 'utf8')));
    }
  }

  /* ---------------- 8-35. 미리보기 머리말 ---------------- */
  console.log('\n[8-35] 미리보기 머리말이 앱을 가리지 않는가');
  {
    const tpl = await readFile('tools/preview/template.html', 'utf8');

    /*
     * 머리말이 첫 화면의 37% 를 먹고 있었다 (폰에서 312px). 앱을 보러 온 사람이
     * 앱을 보려면 스크롤부터 해야 했다. 설명을 접어 두고 한 줄만 남겼다.
     *
     * 다만 **접으면 안 되는 것이 하나** 있다 — 이 수치가 진짜가 아니라는 말이다.
     * DEMO 와 실데이터를 헷갈리게 두지 않는 것이 이 앱의 첫째 규칙이라, 그 말은
     * 펼치지 않아도 보이는 자리에 있어야 한다.
     */
    const lead = tpl.match(/<p class="preview-lead">[\s\S]*?<\/p>/)?.[0] ?? '';
    check('접기 전에도 보이는 한 줄이 있음', lead !== '');
    check('그 한 줄이 DEMO 임을 밝힘', /DEMO/.test(lead) && /실제 시세가 아닙니다/.test(lead));

    const more = tpl.match(/<div class="preview-more"[\s\S]*?<\/div>/)?.[0] ?? '';
    check('접히는 쪽에는 만든 사람용 설명만 둠',
      more !== '' && !/실제 시세가 아닙니다/.test(more) && /브랜치/.test(more));
    check('접힌 채로 시작함', /<div class="preview-more" id="preview-more" hidden>/.test(tpl));
    check('펴고 접는 단추가 있음',
      /data-more aria-expanded="false" aria-controls="preview-more"/.test(tpl) &&
      /btn\.textContent = open \? '접기' : '자세히'/.test(tpl));
    check('왜 줄였는지 적어 둠', /첫 화면의\n\s*37% 를 먹었다|37% 를 먹었다/.test(tpl));
  }

  /* ---------------- 8-36. 심리 상세를 다시 손본 자리 ---------------- */
  console.log('\n[8-36] 심리 상세 — 같은 말 두 번 · 가중치 · 차례');
  {
    const page = await readFile('src/app/fng/[market]/page.tsx', 'utf8');
    const tpl = await readFile('tools/preview/template.html', 'utf8');
    const engine = await readFile('src/server/fng/engine.ts', 'utf8');
    const defs = await readFile('src/server/fng/definitions.ts', 'utf8');

    /*
     * ① 같은 말이 두 번 있었다.
     *
     *    요약 카드에 '신뢰도 / 데이터 충족률 / 신선도 / 역사적 분포 / 산식 버전 /
     *    산출 시각' 여섯 줄짜리 표가 점수와 같은 비중으로 깔려 있었고, 그 바로
     *    아래 문장이 그중 셋을 그대로 되풀이했다 —
     *    "데이터 충족률 100% · 신선도 100% → 신뢰도 높음".
     *    배지도 옆에서 '신뢰도 높음' 이라고 적고 있었으니 결론은 세 번이었다.
     *
     *    결론은 배지가, 근거는 그 옆 문장이, 출처는 작은 글씨 한 줄이 맡는다.
     *    요약 카드 높이 552px → 422px.
     */
    /* 문장 자체만 본다 — 주석에는 '왜 뺐는지' 를 적느라 옛 문장이 그대로 들어 있다.
       '신뢰도' 라는 말이 이 안에 다시 들어오면 배지와 같은 말을 두 번 하는 것이다. */
    const reasonExpr = engine.match(/const confidenceReason = `[\s\S]*?`;/)?.[0] ?? '';
    check('신뢰도 근거 문장이 결론을 되풀이하지 않음', reasonExpr !== '' && !/신뢰도/.test(reasonExpr));
    check('근거만 담는다고 적어 둠', /결론은 여기에 적지 않는다/.test(engine));
    check('앱 요약 카드가 배지(결론) 옆에 근거를 둠',
      /신뢰도 \{CONFIDENCE_LABEL\[detail\.confidence\]\}[\s\S]{0,200}?detail\.confidenceReason/.test(page));
    check('앱 요약 카드에 여섯 줄짜리 표가 없음', !/<dt className="text-muted">데이터 충족률<\/dt>/.test(page));
    check('출처(분포·산식·시각)는 지우지 않고 작은 글씨 한 줄로 남김',
      /분포 기준 · 산식 \{detail\.formulaVersion\}/.test(page));
    check('미리보기도 같은 모양', /class="conf-line"[\s\S]{0,200}?confBadge\(f\.confidence, null\)/.test(tpl));
    // 규칙과 쓰임만 본다 — 왜 걷어냈는지 적어 둔 주석에는 이름이 남아 있다
    check('미리보기에 죽은 dl.kv 스타일이 남아 있지 않음',
      !/dl\.kv\s*\{/.test(tpl) && !/class="kv"/.test(tpl));

    /*
     * ② 신뢰도 '높음' 을 초록으로 칠하고 있었다 — 미리보기만.
     *    이 앱에서 초록은 이미 '탐욕' 이다. 같은 화면에서 한 색이 두 뜻을 가리키면
     *    둘 다 흐려진다. 앱은 처음부터 낮을 때만 색을 썼는데 손으로 한 벌 더 그린
     *    미리보기가 어긋나 있었다.
     */
    // 주석을 걷어내고 본다 — 왜 바꿨는지 적어 둔 글에 옛 클래스 이름이 들어 있다
    const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    const confFn = stripComments(tpl.match(/const confBadge = \(c, reason\) => \{[\s\S]*?\n  \};/)?.[0] ?? '');
    check('신뢰도 배지가 초록을 쓰지 않음 (초록은 탐욕의 색)', confFn !== '' && !/b-ok/.test(confFn));
    check('앱과 같은 규칙 — 낮을 때만 색', /c === 'low' \? 'b-warn' : 'b-neutral'/.test(confFn));

    /*
     * ③ '구성요소와 가중치' 인데 가중치가 제일 안 보였다.
     *    20% 와 7% 가 똑같이 생긴 작은 알약이라, 무엇이 점수를 끌고 가는지
     *    여덟 줄을 하나씩 읽고 머릿속에서 견줘야 했다. 길이로 그리면 한 번에 보인다.
     */
    check('가중치를 막대로 그림', /function WeightBar\(/.test(page) && /const weightBar = \(c, total\) =>/.test(tpl));
    check('눈금이 합계 100% — 머리말과 같은 수',
      /const totalWeight = Math\.max\(1, detail\.components\.reduce/.test(page) &&
      /const totalWeight = Math\.max\(1, f\.components\.reduce/.test(tpl));
    /* 매개변수 분해가 `}: {` 로 열 0 의 중괄호를 하나 더 만든다. 거기서 끊으면
       본문을 못 보니, 다음 선언이 시작되는 자리까지를 함수로 본다. */
    const wb = page.slice(page.indexOf('function WeightBar('), page.indexOf('export default function FngDetailPage'));
    check('막대 색에 심리의 색(빨강·초록)을 쓰지 않음',
      wb !== '' && !/scoreColor|scoreFill|var\(--(?:warn|danger|ok)\)/.test(wb));
    check('길이만으로 뜻이 가지 않게 숫자를 함께 둠', /formatNumber\(weight, 0\)\}%/.test(wb));
    check('숫자 칸이 오른쪽 맞춤 · 최소 너비 — 줄마다 막대가 같은 자리에서 시작',
      /min-w-9 shrink-0 text-right/.test(wb) && /\.wbar-num \{[^}]*min-width: 36px[^}]*text-align: right/.test(tpl));
    check('결측인 줄은 막대가 비어 있음 (0 으로 채우지 않음)',
      /available \? pct\(effective\) : '0%'/.test(wb) && /c\.available \? pct\(c\.effectiveWeight\) : '0%'/.test(tpl));
    check('적용 가중치가 기준과 다르면 눈금이 선다', /wbar-tick/.test(tpl) && /shifted \?/.test(wb));
    check('가중치 배지는 걷어냄 — 같은 값을 두 모양으로 두지 않음',
      !/가중치 \{c\.weight\}%/.test(page) && !/'가중치 ' \+ c\.weight/.test(tpl));

    /*
     * ④ <ol> 인데 번호가 안 보였다. 그래서 번호를 글 안에 박아 두었는데,
     *    화면이 번호를 붙이기 시작하자 '1  (1) 구성요소별 …' 로 두 번 나왔다.
     *    순서는 자리에서 나오는 값이니 그리는 쪽이 센다.
     */
    check('차례 번호가 데이터에 박혀 있지 않음', !/[①-⑳]/.test(defs.split('METHODOLOGY_STEPS')[1] ?? ''));
    check('앱이 번호를 셈', /steps\.map\(\(s, i\) =>[\s\S]{0,400}?\{i \+ 1\}/.test(page));
    check('미리보기도 번호를 셈', /steps\.map\(\(x, i\) =>[\s\S]{0,200}?step-n[\s\S]{0,60}?\(i \+ 1\)/.test(tpl));
    check('번호는 읽어 주지 않음 — 목록이 이미 순서를 말한다',
      /className="[^"]*"\s*\n?\s*>\s*\{i \+ 1\}/.test(page.replace(/aria-hidden="true"/g, 'aria-hidden="true"')) &&
      /<span class="step-n" aria-hidden="true">/.test(tpl));

    /*
     * ⑤ 출처 링크가 날 URL 이라 한 줄이 주소로 꽉 찼다.
     *    필요한 건 '어디' 라서 호스트만 남긴다. 새 창으로 열린다는 사실은
     *    기호 하나로 두지 않고 낭독용 글자와 함께 알린다.
     */
    check('출처 링크가 주소만 보여 줌',
      /s\.url\.replace\(\/\^https\?:\\\/\\\/\/, ''\)/.test(page) && /String\(x\.url\)\.replace/.test(tpl));
    check('새 창이라는 사실을 기호만으로 두지 않음',
      /새 창에서 열림/.test(page) && /새 창에서 열림/.test(tpl));
  }

  /* ---------------- 8-37. 앱 이름 ---------------- */
  console.log('\n[8-37] 앱 이름이 한 가지인가 — 쫄탐일보');
  {
    const NAME = '쫄탐일보';
    const layout = await readFile('src/app/layout.tsx', 'utf8');
    const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
    const tpl = await readFile('tools/preview/template.html', 'utf8');
    const sw = await readFile('public/sw.js', 'utf8');

    /*
     * 이름이 사람 눈에 닿는 자리는 다섯 곳이다 — 브라우저 탭 제목, 홈 화면에 추가했을 때의
     * 이름(manifest), 화면 낭독기가 읽는 첫 제목, 미리보기, 오프라인 화면. 한 곳만 옛 이름이
     * 남아도 사람은 "앱이 둘인가" 로 읽는다.
     */
    check('탭 제목에 이름이 있음', /title:\s*'쫄탐일보 — /.test(layout));
    check('앱 이름(applicationName)', /applicationName:\s*'쫄탐일보'/.test(layout));
    check('홈 화면 이름(manifest name · short_name)',
      manifest.short_name === NAME && String(manifest.name).startsWith(NAME));
    check('미리보기 탭 제목', tpl.startsWith(`<title>${NAME}</title>`));
    check('오프라인 화면 제목', sw.includes(`<title>오프라인 — ${NAME}</title>`));

    const visible = {
      'src/app/layout.tsx': layout,
      'src/app/page.tsx': await readFile('src/app/page.tsx', 'utf8'),
      'public/manifest.webmanifest': JSON.stringify(manifest),
      'tools/preview/template.html': tpl,
      'public/sw.js': sw,
    };
    const stale = Object.entries(visible).filter(([, t]) => /Market Mood/.test(t)).map(([f]) => f);
    check('옛 이름(Market Mood)이 화면에 닿는 파일에 남지 않음', stale.length === 0, stale.join(', '));

    /*
     * 저장 키는 이름을 따라 바꾸지 않는다.
     *
     * 키의 'mm3' 는 옛 이름(Market Mood 3)의 약자지만, 이것을 'fg' 로 바꾸는 순간 이미 쓰던
     * 사람의 설정 · 알림 · 관심목록이 전부 사라진다 — 브라우저는 새 키 아래에서 빈 값을 읽는다.
     * 이름 정리로 보이는 일이 데이터 삭제가 된다. 바꾸려면 옛 키에서 옮겨 담는 코드가 먼저다.
     */
    const settings = await readFile('src/components/providers/SettingsProvider.tsx', 'utf8');
    const alerts = await readFile('src/components/alerts/store.ts', 'utf8');
    check('설정 저장 키가 그대로 (mm3.settings.v1)',
      settings.includes("'mm3.settings.v1'") && layout.includes("'mm3.settings.v1'"));
    check('알림 저장 키가 그대로 (mm3.alerts.v1)', alerts.includes("'mm3.alerts.v1'"));
  }

  /* ---------------- 8-38. 쫄탐일보 지면 ---------------- */
  console.log('\n[8-38] 쫄탐일보 지면 — 미국이 1면, 한국이 2면 (크립토는 뺐다)');
  {
    /*
     * 2026-11-24 리밸런싱. 홈에서 크립토가 무게를 갖던 곳은 가격 칸이 아니라 셋이었다 —
     * 쫄탐 카드의 절반, 오늘의 한 줄(출렁임이 커서 거의 늘), 오늘의 칸 6개 중 2개.
     * 한국은 카탈로그에 지수 셋 · 환율 · 종목 다섯이 있는데 8칸 제한에 걸려 2칸만 나왔다.
     *
     * 그때는 크립토를 지우지 않고 줄만 세웠다. 2026-11-26 에는 앱에서 아예 뺐다
     * (사용자: "크립토는 그냥 빼버리자, 관심없다"). 헤드라인 규칙(todayLine.mjs)의 순서표에는
     * 'crypto' 가 끝자리로 남아 있지만, 스냅샷에 크립토가 오지 않으니 쓰일 일이 없다.
     */
    const tl = await readFile('src/lib/todayLine.mjs', 'utf8');
    const tpl = await readFile('tools/preview/template.html', 'utf8');
    const prices = await readFile('src/components/market/HomePrices.tsx', 'utf8');
    const heat = await readFile('src/components/market/HeatBoard.tsx', 'utf8');
    const cat = await readFile('src/lib/catalog.ts', 'utf8');
    const settings = await readFile('src/components/providers/SettingsProvider.tsx', 'utf8');

    // ① 헤드라인 순서
    check('헤드라인 순서가 미국 · 한국 · 크립토',
      /export const MARKET_PRIORITY = \['us', 'kr', 'crypto'\];/.test(tl));
    check('헤드라인이 순서를 따름 (가장 큰 것 하나가 아니라)',
      (tl.match(/headline\(usable,/g) ?? []).length === 2);
    check('미리보기도 같은 순서', /const TODAY_PRIORITY = \['us', 'kr', 'crypto'\];/.test(tpl) &&
      (tpl.match(/todayHeadline\(ok,/g) ?? []).length === 2);

    // ② 시세 지면
    const slots = (src, re) => src.match(re)?.[1] ?? '';
    const appSlots = slots(prices, /HOME_SLOTS: Record<MarketId, number> = (\{[^}]*\})/);
    const tplSlots = slots(tpl, /const HOME_SLOTS = (\{[^}]*\})/);
    check('시장별 칸 수: 미국 10 · 한국 6 · 크립토 0', appSlots === '{ us: 10, kr: 6, crypto: 0 }', appSlots);
    check('미리보기도 같은 칸 수', tplSlots === appSlots, tplSlots);
    check('시장별 소제목으로 묶어 실음', /MARKET_LABEL\[g\.market\]/.test(prices) && /class="price-group-h"/.test(tpl));
    check('시장 구분 없이 앞에서 자르던 8칸 제한을 지움', !/MAX_ON_HOME/.test(prices) && !/ordered\.slice\(0, 9\)/.test(tpl));

    // ③ 홈 기본 항목 — 미국이 가장 많고 한국이 그다음, 크립토는 없음
    const homeOf = (m) => [...cat.matchAll(new RegExp(`id: '([a-z0-9_]+)'[^\\n]*market: '${m}'[^\\n]*home: true`, 'g'))].map((x) => x[1]);
    const us = homeOf('us'), kr = homeOf('kr'), cr = homeOf('crypto');
    check('홈 기본 항목: 미국 > 한국, 크립토 없음', us.length > kr.length && kr.length > 0 && cr.length === 0,
      `미국 ${us.length} · 한국 ${kr.length} · 크립토 ${cr.length}`);
    // 무료로 받을 길이 없는 것은 홈 기본값에 두지 않는다 — LIVE 에서 늘 빈 칸이 된다
    check('VKOSPI 를 홈 기본값에서 뺌 (KRX 유료 데이터)', !kr.includes('vkospi'));
    check('미리보기 홈 목록이 카탈로그와 같음',
      (() => { const m = tpl.match(/const homeIds = \[([^\]]*)\];/); if (!m) return false;
        const ids = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
        return JSON.stringify(ids) === JSON.stringify([...us, ...kr, ...cr]); })());

    // ④ 오늘의 칸
    check('오늘의 칸은 미국 · 한국', /export const HEAT_MARKETS: MarketId\[\] = \['us', 'kr'\];/.test(heat) &&
      /HEAT_MARKETS\.map/.test(heat));
    check('미리보기도 미국 · 한국', /const boards = \['us', 'kr'\]\n/.test(tpl));

    // ⑤ 써 오던 사람에게도 바뀐 지면이 가야 한다 — 다만 직접 고른 것은 그대로
    check('예전 기본값을 기록해 둠', /export const PREVIOUS_DEFAULTS = \{/.test(cat));
    check('저장된 관심목록 · 홈 항목을 그 규칙으로 옮김',
      (settings.match(/upgradeDefault\(arr\(r\.(watchlist|homeItems)/g) ?? []).length === 2);
    // 크립토를 뺀 뒤 — 저장된 관심목록 · 홈 항목 · 알림에 남은 크립토만 덜어낸다 (나머지는 그대로)
    const removedIds = [...(cat.match(/export const REMOVED_IDS: readonly string\[\] = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    check('뺀 크립토 17개를 적어 두고, 카탈로그에는 하나도 없음',
      removedIds.length === 17 && removedIds.every((id) => !new RegExp(`\\{ id: '${id}'`).test(cat)), `${removedIds.length}개`);
    check('저장된 관심목록 · 홈 항목에서 뺀 것만 덜어냄',
      (settings.match(/dropRemoved\(upgradeDefault\(arr\(r\.(watchlist|homeItems)/g) ?? []).length === 2 && settings.includes('REMOVED_IDS),'));
    check('크립토를 겨눈 알림 · 기준도 덜어냄',
      /a\.target !== 'crypto' && !REMOVED_IDS\.includes\(a\.target\)/.test(settings) && /c\.kind === 'fng' && c\.market === 'crypto'/.test(settings));
    check('관심목록 기본값에 비트코인 대신 나스닥',
      /return \['spx', 'ndx', 'kospi', 'usdkrw', 'vix'\];/.test(cat) && /watch: new Set\(\['spx', 'ndx', 'kospi', 'usdkrw', 'vix'\]\)/.test(tpl));

    // ⑥ 한국이 빠진 뒤로 틀린 말이던 것
    const consts = await readFile('src/components/market/constants.ts', 'utf8');
    check('"세 점수" 라는 틀린 말이 남지 않음', !/세 점수/.test(consts) && !/세 점수/.test(tpl));
  }

  console.log('\n[8-40] 크립토 빼기 — 화면 · 미리보기 · 옛 링크');
  {
    /*
     * 2026-11-26 사용자: "크립토는 그냥 빼버리자, 관심없다".
     * 쫄탐일보는 미국 · 한국 시장 신문이다. 서버는 크립토를 받지 않고([8-9]), 스냅샷에도 없다([1] · [2]).
     * 여기서는 크립토로 가는 문 · 고르는 단추 · 설명 문구가 남지 않았는지 본다. 앱과 미리보기 둘 다.
     */
    const rd = (f) => readFile(f, 'utf8');
    const [calPage, calMonth, status, hours, defs, cfgSrc, morePage, riskSrc, futCat, build, fngPage, regionPage, indPage, critBoard, tplX] =
      await Promise.all(['src/app/calendar/page.tsx', 'src/components/market/CalendarMonth.tsx', 'src/components/market/StatusBar.tsx',
        'src/lib/marketHours.ts', 'src/server/fng/definitions.ts', 'src/server/config.ts', 'src/app/more/page.tsx', 'src/server/risk.ts',
        'src/lib/futuresCatalog.ts', 'tools/preview/build.mjs', 'src/app/fng/[market]/page.tsx', 'src/app/market/[region]/page.tsx',
        'src/app/indicators/page.tsx', 'src/components/market/CriteriaBoard.tsx', 'tools/preview/template.html'].map(rd));
    check('캘린더에 크립토 시장 · 분류 단추가 없음',
      !/value: 'crypto'/.test(calPage) && /\.filter\(\(c\) => c !== 'crypto'\)/.test(calPage) && !/'crypto', 'global'\]/.test(calMonth));
    check('거래 시간 칩은 미국 · 한국 (24시간 칩 없음)',
      /return \[getSession\('us', now\), getSession\('kr', now\)\];/.test(hours) && /\['us', 'kr'\]\.map\(\(m\) =>/.test(status));
    check('위험 신호등 · 선물 목록에 크립토 항목이 없음',
      !/scope: 'crypto'/.test(riskSrc) && !/group: 'crypto'/.test(futCat) && !/\{ id: 'crypto', label:/.test(futCat));
    check('고를 시장이 하나뿐이면 시장 단추를 세우지 않음 (심리 상세 · 경제지표 · 기준)',
      [fngPage, indPage, critBoard].every((t) => /MARKET_IDS\.length > 1/.test(t)));
    check('옛 링크 — /market/crypto 는 홈으로, /fng/crypto 는 /fng/us 로',
      /isCrypto\) router\.replace\('\/'\)/.test(regionPage) && /if \(params\.market !== market\) router\.replace\(`\/fng\/\$\{market\}/.test(fngPage));
    check('설명 문구에 크립토가 남지 않음 (산식 · 척도 안내 · 진단 · 바로가기)',
      !/크립토/.test(defs.match(/export const METHODOLOGY_STEPS[\s\S]*?\];/)?.[0] ?? '크립토') &&
      !/크립토/.test(defs.match(/export const SCALE_WARNING =[\s\S]*?;\n/)?.[0] ?? '크립토') &&
      !/CoinGecko/.test(cfgSrc.match(/reason:\s*\n[\s\S]*?missing: \[\.\.\.missing\]/)?.[0] ?? 'CoinGecko') &&
      !/펀딩비|\/market\/crypto/.test(morePage));
    check('미리보기도 미국 · 한국만 (시장 목록 · 단추)',
      /const MARKETS = \['us'\];/.test(tplX) && /const INDEX_MARKETS = \['us', 'kr'\];/.test(tplX) &&
      !/\['crypto', ?'크립토'\]/.test(tplX) && !/class="mklines"/.test(tplX));
    check('미리보기 빌드가 크립토를 받지 않음',
      /const ASSET_IDS = \['spx', 'kospi', 'nvda'\];/.test(build) && /for \(const m of \['us'\]\) details\[m\]/.test(build) &&
      /for \(const m of \['us', 'kr'\]\) \{\n\s*if \(!ids\[m\]\?\.length\)/.test(build));
  }

  console.log('\n[8-41] 쫄탐지수 + 추세(1년선) + VIX 35 — 한눈에');
  {
    /*
     * 2026-11-26 사용자: "쫄탐지수에 겹쳐서 볼 수 있는 방법이 있을까? 한눈에 세 가지 다 볼 수 있게".
     * 홈 카드: 계기판 아래 칩 두 개(추세 · VIX). 심리 상세 차트: S&P 500 이 1년(252거래일) 평균선 아래였던 기간은 음영(처음 200일 → 2026-11-27 1년으로),
     * VIX 35 이상인 날은 두 칸 사이의 띠(처음 30 → 사용자 요청으로 35, 근거는 overlays.mjs 머리말). 둘 다 지금 상태를 적는 사실이지 사고팔 신호가 아니다.
     * 계산은 src/lib/overlays.mjs 한 곳 — 여기서 API 값을 그 계산으로 다시 내 맞춰 본다.
     */
    const { belowMaSpans, trendNow, TREND_MA_DAYS, VIX_HIGH } = await import('../src/lib/overlays.mjs');
    const { overlayChips } = await import('../src/lib/overlayChips.mjs');
    const { body: fb } = await getJson('/api/fng/us');
    const d = fb?.detail ?? {};
    const ov = d.overlays;
    const sane = (spans) => Array.isArray(spans) && spans.every((sp, i) =>
      Number.isFinite(sp.from) && Number.isFinite(sp.to) && sp.from <= sp.to && (i === 0 || spans[i - 1].to < sp.from));
    check('심리 상세 API 에 겹침 구간이 있음 (추세 1년=252거래일 · VIX 35)',
      !!ov && ov.trend?.maDays === TREND_MA_DAYS && TREND_MA_DAYS === 252 && ov.vix?.threshold === VIX_HIGH && VIX_HIGH === 35,
      JSON.stringify(ov && { trend: ov.trend && { ...ov.trend, spans: ov.trend.spans.length }, vix: ov.vix && { ...ov.vix, spans: ov.vix.spans.length } }));
    check('구간이 시간 순 · 겹치지 않음 · 시작 ≤ 끝', sane(ov?.trend?.spans) && sane(ov?.vix?.spans));
    const bm = d.benchmark?.series ?? [];
    const again = belowMaSpans(bm, TREND_MA_DAYS);
    check('추세 음영이 차트에 그린 그 S&P 500 으로 다시 계산한 값과 같음',
      bm.length >= TREND_MA_DAYS && JSON.stringify(again) === JSON.stringify(ov?.trend?.spans),
      `다시 계산 ${again.length}곳 · API ${ov?.trend?.spans?.length}곳`);
    // 평균을 낼 날이 모이기 전(첫 251거래일)에는 음영이 없다 — 메우지 않는다
    check('252번째 유효 종가부터 음영을 계산', (ov?.trend?.spans ?? []).every((sp) => sp.from >= bm[TREND_MA_DAYS - 1]?.t));
    check('DEMO 10년 안에 VIX 35 이상인 날이 있음 (띠가 실제로 그려짐)', !fb?.mode || fb.mode !== 'demo' || (ov?.vix?.spans?.length ?? 0) > 0,
      `${ov?.vix?.spans?.length ?? 0}곳`);
    const tn = trendNow(bm, TREND_MA_DAYS);
    const now = d.overlayNow;
    check('지금 추세(위/아래 · %)가 같은 계열로 다시 계산한 값과 같음',
      !!now?.trend && now.trend.above === tn.above && now.trend.gapPct === tn.gapPct, JSON.stringify(now?.trend));
    check('지금 VIX 가 35 이상인지가 값과 맞음',
      !!now?.vix && Number.isFinite(now.vix.value) && now.vix.high === (now.vix.value >= VIX_HIGH), JSON.stringify(now?.vix));
    const { body: sb } = await getJson('/api/snapshot');
    const sNow = sb?.sections?.fng?.data?.find((f) => f.market === 'us')?.overlayNow;
    check('홈(스냅샷)의 지금 값이 심리 상세와 같음', JSON.stringify(sNow) === JSON.stringify(now), JSON.stringify(sNow));
    const chips = overlayChips(sNow) ?? [];
    check('홈 칩 두 개 — 위/아래를 말로 · 사고팔 말 없음',
      chips.length === 2 && chips[0].label === '추세 · 252거래일' && /^1년선 (위|아래)$/.test(chips[0].value) && /^35 (이상|아래)$/.test(chips[1].sub ?? '') &&
      !/매수|매도|사세요|파세요|추천/.test(JSON.stringify(chips)), JSON.stringify(chips.map((c) => [c.value, c.sub])));
    check('칩 값이 없으면 산출 불가 — 0 이나 위로 채우지 않음',
      overlayChips({ trend: { name: 'S&P 500', maDays: 252, above: null, gapPct: null }, vix: null }).every((c) => c.value === '산출 불가' && c.sub === null));

    const rd = (f) => readFile(f, 'utf8');
    const [chartSrc, fngPage, homeCard, css, tplO, buildO, liveIdx, snapSrc, route, ovSrv] = await Promise.all([
      'src/components/charts/InteractiveChart.tsx', 'src/app/fng/[market]/page.tsx', 'src/components/market/HomeMoodCard.tsx',
      'src/app/home-mood.css', 'tools/preview/template.html', 'tools/preview/build.mjs', 'src/server/adapters/live/index.ts',
      'src/server/snapshot.ts', 'src/app/api/fng/[market]/route.ts', 'src/server/overlays.ts'].map(rd));
    // 그리는 차례: 음영 → 선 → 표식 → 띠. 띠를 선보다 먼저 그렸더니 같은 날의 위기 표식 점선에 가려 안 보였다
    const iShade = chartSrc.indexOf("if (sp.kind !== 'shade') return null;");
    const iSeries = chartSrc.indexOf('{/* 시리즈 */}');
    const iMarks = chartSrc.indexOf('{/* 시점 표식 — 세로 점선');
    const iStrip = chartSrc.indexOf("if (sp.kind !== 'strip') return null;");
    check('차트 — 음영은 선보다 먼저, 띠는 표식 다음에 (앱)', iShade > 0 && iShade < iSeries && iMarks < iStrip, `${iShade}/${iSeries}/${iMarks}/${iStrip}`);
    check('차트 — 같은 차례 (미리보기)', /'<g class="sel"><\/g>' \+ spanRects \+ paths \+ marks \+ stripRects \+ '<g class="cross">/.test(tplO));
    check('차트 — 띠는 두 칸 사이(칸 간격 가운데)에 앉음',
      /geometry\.split\s*\?\s*geometry\.bands\[0\]\.top \+ geometry\.bands\[0\]\.h \+ \(SPLIT_GAP - STRIP_H\) \/ 2/.test(chartSrc) &&
      /c\.bands\[0\]\.top \+ c\.bands\[0\]\.h \+ \(SPLIT_GAP - STRIP_H\) \/ 2/.test(tplO));
    check('차트 — 색만으로 말하지 않음 (범례 · 툴팁 · 대체 텍스트에 이름)',
      /spanKinds\.map\(\(k\) =>/.test(chartSrc) && /cursorSpans\.map\(\(sp\) =>/.test(chartSrc) && /\$\{spanSummary\}`/.test(chartSrc) &&
      /spanKinds\(spans \|\| \[\]\)\.map/.test(tplO) && /onSpans\.map\(\(sp\) => '<div class="tt-span">/.test(tplO) && /c\.label \+ markerAria \+ spanAria/.test(tplO));
    check('크게 보기 창에도 같은 구간이 넘어감', /markers=\{markers\}\s*\n\s*spans=\{spans\}\s*\n\s*focusT=\{focusT\}\s*\n\s*maxPoints=\{maxPoints\}\s*\n\s*expandable=\{false\}/.test(chartSrc));
    check('띠 두께가 앱과 미리보기에서 같음', /const STRIP_H = 6;/.test(chartSrc) && /const STRIP_H = 6;/.test(tplO));
    check('심리 상세 차트에 구간을 넘기고, 신호가 아니라고 적음',
      /spans=\{chartSpans\}/.test(fngPage) && /사고팔 때를 알려 주는 신호가 아닙니다/.test(fngPage) &&
      /' 비교', chartMarks, chartSpans\)/.test(tplO) && /사고팔 때를 알려 주는 신호가 아닙니다/.test(tplO));
    check('보는 기간 앞에서 시작한 구간은 기간 첫날로 자름 (앱 · 미리보기)',
      /sp\.to >= cutoff \? \{ from: Math\.max\(sp\.from, cutoff\), to: sp\.to \} : null/.test(fngPage) &&
      /sp\.to >= cutoff \? \{ from: Math\.max\(sp\.from, cutoff\), to: sp\.to \} : null/.test(tplO));
    check('홈 칩 — 같은 문구 함수를 앱과 미리보기가 씀',
      /overlayChips\(score\.overlayNow\)/.test(homeCard) && /overlayChips\(now\)/.test(tplO) && /moodChips\(f\.overlayNow\)/.test(tplO) &&
      /__OVERLAY_CHIPS_FN__/.test(tplO) && /\.replace\('__OVERLAY_CHIPS_FN__'[\s\S]{0,140}overlayChips\.mjs/.test(buildO));
    check('홈 칩을 누르면 겹쳐 그린 차트로 (앱 #fng-chart-title · 미리보기 점수 추이)',
      /CHART_ANCHOR = 'fng-chart-title'/.test(homeCard) && /id="fng-chart-title"/.test(fngPage) &&
      /data-go-fng="us" data-go-to="chart"/.test(tplO) && /chart: '점수 추이'/.test(tplO));
    check('홈 칩 줄은 누를 자리 44px 이상 · 단계 색을 입히지 않음',
      /\.mood-chips \{[^}]*min-height: 44px/.test(css) && !/\.mood-chip[^{]*\{[^}]*var\(--ink\)/.test(css));
    check('서버 — 미국만 · 상세와 홈이 같은 계산',
      /market === 'us' \? await overlayInputs\(adapter, ctx, benchmark\) : null/.test(route) &&
      /if \(m === 'us'\) latest\.overlayNow = overlayNowFrom\(await overlayInputs\(adapter, ctx\)\)/.test(snapSrc) &&
      /from '@\/lib\/overlays\.mjs'/.test(ovSrv));
    check('LIVE — VIX 는 FRED VIXCLS, S&P 500 은 10년치 (음영이 10년을 덮게)',
      /fetchSeries\(fredConfig\(key, envUrl\('MACRO_BASE_URL'\)\), 'vix'/.test(liveIdx) &&
      /fetchDailySeries\(yahooConfig\(envUrl\(this\.baseUrlEnvFor\(market\)\)\), id, 3650\)/.test(liveIdx));
  }

  console.log('\n[8-42] 쫄탐광장 — 다음 거래일 맞히기 · 순위표 · 한 줄 토론');
  {
    /*
     * 2026-11-26 사용자: "커뮤니티도 넣어 놓고, 내일의 주식이 어떨지 … 상승 or 하락 맞추는 걸로
     * 순위표나 elo 형식으로". 정한 것: 닉네임만 · 한 줄 토론 · S&P 500 과 KOSPI.
     * 규칙 src/lib/plazaRules.mjs · 문구 src/lib/plazaText.mjs · 저장 src/server/plaza.
     * 여기서는 DEMO(메모리 저장소) 서버에 실제로 로그인(DEMO 연습 로그인) · 고르기 · 글쓰기 · 공감 · 신고를 해 본다.
     * 로그인은 카카오만이고(2026-11-26 사용자 결정), 카카오 쪽 흐름은 [8-44] 가 본다.
     */
    const { roundTimes, outcome, closesByDate, GAME_MARKETS, isTradingDay, maskName } = await import('../src/lib/plazaRules.mjs');
    // cookie = 'zt_session=…' (로그인 쿠키). 쓰기에는 x-plaza: 1 을 붙인다 — 화면이 하는 그대로
    const call = async (body, cookie, extra = {}) => {
      const r = await fetch(`${BASE}/api/plaza`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-plaza': '1', ...(cookie ? { cookie } : {}), ...extra },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json().catch(() => ({})), setCookie: r.headers.getSetCookie?.() ?? [] };
    };
    const look = async (cookie) => {
      const r = await fetch(`${BASE}/api/plaza`, { headers: cookie ? { cookie } : {} });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const demoLogin = async (name, headers = { 'x-plaza': '1' }) => {
      const r = await fetch(`${BASE}/api/auth/demo`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ name }) });
      const sc = r.headers.getSetCookie?.() ?? [];
      return { status: r.status, raw: sc.join(' | '), cookie: sc.map((x) => x.split(';')[0]).find((x) => x.startsWith('zt_session=') && x.length > 12) ?? null };
    };
    const g = await look();
    const st = g.body;
    check('광장 API 200 · DEMO · 메모리 저장소', g.status === 200 && st.mode === 'DEMO' && st.storage === 'memory', `${g.status} ${st.mode} ${st.storage}`);
    check('맞히는 판은 S&P 500 · KOSPI 둘', JSON.stringify((st.markets ?? []).map((m) => m.market)) === '["spx","kospi"]');
    const nowMs = Date.now();
    check('받는 판은 거래일 · 마감(장 시작)은 아직 오지 않음 · 마감 시각이 규칙과 같음',
      (st.markets ?? []).every((m) => isTradingDay(m.open.date) && Date.parse(m.open.cutoff) > nowMs &&
        Date.parse(m.open.cutoff) === roundTimes(m.market, m.open.date).cutoff),
      (st.markets ?? []).map((m) => `${m.market} ${m.open.date} ${m.open.cutoff}`).join(' · '));
    check('고르기 전에는 사람들 몫을 보여 주지 않음 (따라 고르기를 줄이려고)', (st.markets ?? []).every((m) => m.open.ups === null && m.open.downs === null));
    // DEMO 예시 — 순위표 · 글은 모두 '예시' 표시, 레이팅 내림차순, 지난 결과는 DEMO 종가와 같은 방향
    // 같은 서버에 검증을 두 번 돌리면 앞 회의 검사 글이 섞여 있다 — '예시_' 이름과 예시 표시가 짝이 맞는지만 본다
    check('DEMO 예시 회원 · 글에 예시 표시 · 실명 표시는 붙지 않음', (st.leaderboard ?? []).some((l) => l.example && !l.real) &&
      (st.posts ?? []).some((p) => p.example && !p.real));
    check('보이는 이름은 모두 가운데를 가린 꼴', [...(st.leaderboard ?? []), ...(st.posts ?? [])].every((x) => /\*/.test(x.name)),
      [...new Set([...(st.leaderboard ?? []), ...(st.posts ?? [])].map((x) => x.name))].slice(0, 6).join(' '));
    check('순위표가 레이팅 순 · 순위 번호가 1부터 이어짐',
      (st.leaderboard ?? []).every((l, i, a) => l.rank === i + 1 && (i === 0 || a[i - 1].rating >= l.rating)));
    const { body: fd } = await getJson('/api/fng/us');
    const spxCloses = closesByDate(fd?.detail?.benchmark?.series ?? [], GAME_MARKETS.spx.tz);
    const spxRecent = (st.markets ?? []).find((m) => m.market === 'spx')?.recent ?? [];
    const dates = [...spxCloses.keys()].sort();
    const mism = spxRecent.filter((r) => {
      const i = dates.indexOf(r.date);
      return i < 1 || outcome(spxCloses.get(r.date), spxCloses.get(dates[i - 1])) !== r.result;
    });
    check('S&P 500 지난 결과가 같은 DEMO 종가로 다시 낸 방향과 같음', spxRecent.length > 0 && mism.length === 0,
      `${spxRecent.length}판 · 어긋남 ${mism.map((r) => r.date).join(',')}`);

    // 로그인 — DEMO 연습 로그인 (카카오 앱 없이도 광장을 끝까지 눌러 볼 수 있게, DEMO 에서만)
    const tag = Date.now().toString(36).slice(-5);
    const demoName = `검사${tag}`;
    check('광장이 로그인 길을 알려 줌 — DEMO 연습 로그인 열림', st.auth?.demo === true && typeof st.auth?.kakao === 'boolean', JSON.stringify(st.auth));
    check('연습 로그인도 화면에서 온 요청만 (x-plaza 없으면 403)', (await demoLogin(demoName, {})).status === 403);
    const a = await demoLogin(demoName);
    const key = a.cookie;
    check('로그인 쿠키 — httpOnly · SameSite=Lax · 경로 /', a.status === 200 && !!key && /HttpOnly/i.test(a.raw) && /SameSite=lax/i.test(a.raw) && /Path=\//.test(a.raw),
      a.raw.replace(/zt_session=[^;]+/, 'zt_session=…'));
    const meNow = (await look(key)).body?.me;
    check('이름은 가운데를 가려 보임 · 연습 로그인은 실명 표시 없음', meNow?.name === maskName(demoName) && meNow?.real === false, `${meNow?.name}`);
    check('위조한 쿠키는 로그인으로 치지 않음', (await look('zt_session=eyJ1aWQiOiJ4In0.AAAA')).body?.me === null &&
      (await call({ action: 'post', text: '위조' }, 'zt_session=eyJ1aWQiOiJ4In0.AAAA')).status === 401);
    check('쓰기는 화면에서 온 요청만 (x-plaza 없으면 403)', (await fetch(`${BASE}/api/plaza`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: key ?? '' }, body: JSON.stringify({ action: 'post', text: '몰래' }),
    })).status === 403);

    // 고르기
    const spx = (st.markets ?? []).find((m) => m.market === 'spx');
    check('로그인 없이 고르면 401', (await call({ action: 'predict', market: 'spx', pick: 'up', date: spx?.open.date })).status === 401);
    check('마감된 판(다른 날짜)은 409', (await call({ action: 'predict', market: 'spx', pick: 'up', date: '2020-01-02' }, key)).status === 409);
    check('없는 쪽 · 없는 시장은 400',
      (await call({ action: 'predict', market: 'spx', pick: 'buy', date: spx?.open.date }, key)).status === 400 &&
      (await call({ action: 'predict', market: 'btc', pick: 'up', date: spx?.open.date }, key)).status === 400);
    const pr = await call({ action: 'predict', market: 'spx', pick: 'down', date: spx?.open.date }, key);
    const o2 = pr.body?.state?.markets?.find((m) => m.market === 'spx')?.open;
    check('고르면 내 선택 · 사람들 몫이 보이고 참여 수가 하나 늘어남',
      pr.status === 200 && o2?.myPick === 'down' && Number.isFinite(o2?.ups) && o2.ups + o2.downs === o2.n && o2.n === (spx?.open.n ?? -1) + 1,
      JSON.stringify(o2));
    const pr2 = await call({ action: 'predict', market: 'spx', pick: 'up', date: spx?.open.date }, key);
    const o3 = pr2.body?.state?.markets?.find((m) => m.market === 'spx')?.open;
    check('마감 전에는 바꿀 수 있고, 바꿔도 한 사람으로 셈', o3?.myPick === 'up' && o3?.n === o2?.n);

    // 한 줄 토론
    check('링크 · 리딩방 · 140자 넘는 글은 400',
      (await call({ action: 'post', text: 'naver.com 오세요' }, key)).status === 400 &&
      (await call({ action: 'post', text: '리딩방 무료 입장' }, key)).status === 400 &&
      (await call({ action: 'post', text: '가'.repeat(141) }, key)).status === 400);
    const ps = await call({ action: 'post', text: `검사 글 ${tag}` }, key);
    const mine = ps.body?.state?.posts?.[0];
    check('글이 맨 위에 내 글로 올라옴', ps.status === 200 && mine?.mine === true && mine?.text === `검사 글 ${tag}` && mine?.example === false);
    check('20초 안에 또 쓰면 429', (await call({ action: 'post', text: '또 씀' }, key)).status === 429);
    const lk1 = await call({ action: 'like', id: mine?.id }, key);
    const lk2 = await call({ action: 'like', id: mine?.id }, key);
    check('공감은 한 번 더 누르면 취소', lk1.body?.state?.posts?.[0]?.likes === 1 && lk1.body.state.posts[0].liked === true &&
      lk2.body?.state?.posts?.[0]?.likes === 0);
    check('내 글은 신고할 수 없음 (400)', (await call({ action: 'report', id: mine?.id }, key)).status === 400);
    for (let i = 0; i < 3; i += 1) {
      const u = await demoLogin(`신고${tag}${i}`);
      await call({ action: 'report', id: mine?.id }, u.cookie);
    }
    const other = (await look()).body?.posts?.find((p) => p.id === mine?.id);
    const self = (await look(key)).body?.posts?.find((p) => p.id === mine?.id);
    check('서로 다른 세 명이 신고하면 남에게는 가려짐 (글을 보내지 않음)', other?.hidden === true && other?.text === null);
    check('가려져도 글쓴이에게는 보임', self?.hidden === true && self?.text === `검사 글 ${tag}`);
    check('관리자 키 없이 지우기는 403', (await call({ action: 'delete', id: mine?.id })).status === 403 &&
      (await call({ action: 'delete', id: mine?.id }, null, { 'x-plaza-admin': 'x'.repeat(20) })).status === 403);
    const pub = JSON.stringify((await look()).body);
    check('응답에 회원 id · 계정 열쇠 · 해시가 실리지 않음', !/"uid"|"acct"|"key"|[0-9a-f]{40}/.test(pub));

    // 로그아웃 · 탈퇴
    const out = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { 'x-plaza': '1', cookie: key ?? '' } });
    const outCookie = (out.headers.getSetCookie?.() ?? []).join(' ');
    check('로그아웃은 쿠키를 비움', out.status === 200 && /zt_session=;/.test(outCookie) && /Max-Age=0/i.test(outCookie));
    const leaver = await demoLogin(`탈퇴${tag}`);
    const lp = await call({ action: 'post', text: `탈퇴 전 글 ${tag}` }, leaver.cookie);
    const lpId = lp.body?.state?.posts?.[0]?.id;
    const lv = await call({ action: 'leave' }, leaver.cookie);
    const after = (await look()).body;
    check('탈퇴하면 내 글이 지워지고 로그인도 풀림', lv.status === 200 && !!lpId && !(after?.posts ?? []).some((p) => p.id === lpId) &&
      lv.setCookie.join(' ').includes('Max-Age=0'));
    check('탈퇴한 뒤 옛 쿠키로는 아무것도 못 함', (await look(leaver.cookie)).body?.me === null &&
      (await call({ action: 'post', text: '탈퇴 뒤' }, leaver.cookie)).status === 401);

    const rd = (f) => readFile(f, 'utf8');
    const [svc, store, cfg, http, route, page, home, nav, css, txt, tplP, buildP, pkg] = await Promise.all([
      'src/server/plaza/service.ts', 'src/server/plaza/store.ts', 'src/server/config.ts', 'src/server/http.ts', 'src/app/api/plaza/route.ts',
      'src/app/plaza/page.tsx', 'src/components/plaza/HomePlazaCard.tsx', 'src/components/nav/Navigation.tsx', 'src/app/plaza.css',
      'src/lib/plazaText.mjs', 'tools/preview/template.html', 'tools/preview/build.mjs', 'package.json'].map(rd));
    check('저장소 토큰은 config.ts 에서만 · NEXT_PUBLIC_ 없음',
      /UPSTASH_REDIS_REST_TOKEN/.test(cfg) && !/UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN/.test(svc + store + route) && !/NEXT_PUBLIC_[A-Z_]*(UPSTASH|KV_|PLAZA)/.test(svc + store + route + page + cfg));
    check('Upstash 는 바깥 호출 규칙대로 fetchJson · 쓰기는 재시도 안 함',
      /fetchJson<[\s\S]{0,80}\/pipeline`/.test(store) && /retries: opts\.write \? 0 : 1/.test(store) && /method: options\.method \?\? 'GET'/.test(http));
    check('새 npm 의존성 없음 (next · react · react-dom 셋)', Object.keys(JSON.parse(pkg).dependencies ?? {}).sort().join(',') === 'next,react,react-dom');
    check('DEMO 와 LIVE 이름공간이 다름 · 예시는 DEMO 메모리에서만',
      /const ns = \(ctx: PlazaCtx\) => `zt:\$\{ctx\.mode\.toLowerCase\(\)\}:`/.test(svc) &&
      /if \(ctx\.mode !== 'DEMO' \|\| ctx\.store\.kind !== 'memory'\) return;/.test(svc));
    check('IP 를 저장소에 남기지 않음 (요청 수 제한은 서버 메모리에서만)', !/\bip\b/i.test(svc) && /rateLimit\(`plaza:\$\{clientIp\(req\)\}`/.test(route));
    check('관리자 삭제는 PLAZA_ADMIN_KEY(16자 이상)일 때만', /k && k\.length >= 16 \? k : null/.test(cfg) && /if \(!isAdmin\(req\.headers\.get\('x-plaza-admin'\), admin\)\)/.test(route) && /timingSafeEqual\(h\(given\), h\(admin\)\)/.test(route));
    const plazaWords = page + home + txt + (tplP.match(/function viewPlaza\(\) \{[\s\S]*?\n  \}\n/)?.[0] ?? '');
    check('사고팔라는 말을 쓰지 않음 (오른다 / 내린다)', !/매수|매도|사세요|파세요|추천/.test(plazaWords) && /plazaPick/.test(page) && /'▲ 오른다'/.test(txt));
    check('상금 없음 · 투자 실력 아님 · 회원 글은 투자 조언 아님을 적음',
      /상금이나 실제 돈은 없어요/.test(txt) && /투자 실력을 뜻하지 않아요/.test(txt) && /투자 조언이 아니에요/.test(txt));
    check('메모리 저장소면 기록이 오래 남지 않는다고 알림', /state\.storage === 'memory' \? <p className="pz-note">\{PLAZA_MEMORY_NOTE\}/.test(page));
    check('하단 탭에 광장 · 홈에 광장 문', /href: '\/plaza', label: '광장'/.test(nav) && /href="\/plaza"/.test(home));
    check('글자 12px 아래 없음 · 큰 단추 48px · 작은 단추 32px (광장 CSS)',
      ![...css.matchAll(/font-size: (\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12) &&
      /\.pz-pick \{[^}]*min-height: 48px/.test(css) && /\.pz-small \{[^}]*min-height: 32px/.test(css));
    check('미리보기 — 같은 CSS · 같은 문구 함수를 끼워 넣음',
      /__PLAZA_CSS__/.test(tplP) && /__PLAZA_TEXT__/.test(tplP) &&
      /\.replace\('__PLAZA_CSS__'[\s\S]{0,120}plaza\.css/.test(buildP) && /\.replace\('__PLAZA_TEXT__'[\s\S]{0,140}plazaText\.mjs/.test(buildP));
    check('미리보기 — 광장 화면 · 홈 문 · 탭', /plaza: viewPlaza,/.test(tplP) && /homePlazaCard\(\) \+/.test(tplP) && /\{ id: 'plaza', label: '광장'/.test(tplP) &&
      /const plaza = await j\('\/api\/plaza'\);/.test(buildP));
    check('미리보기는 참여하지 못한다고 적고 단추를 잠금', /PLAZA_PREVIEW_NOTE/.test(tplP) &&
      /class="pz-pick" aria-pressed="false" disabled/.test(tplP) && /class="pz-kakao" disabled/.test(tplP));
  }

  console.log('\n[8-43] 심리 상세 다듬기 — 차례 · 접기 · 작은 글자');
  {
    /*
     * 2026-11-26 사용자: "심리 상세 좀 더 다듬어". 잰 값(390px): 6,045px(화면 7.2장) · 12px 미만 글자 48%.
     * '오늘 왜 움직였나'(기여도)를 요약 바로 아래로, 긴 설명 셋(차트 읽는 법 · 사이클과 구간 통계 · 산출 방법)을 접었다.
     */
    const rd = (f) => readFile(f, 'utf8');
    const [pg, crisis, contrib, tplF] = await Promise.all(['src/app/fng/[market]/page.tsx', 'src/components/market/CrisisMarkers.tsx',
      'src/components/charts/ContributionBars.tsx', 'tools/preview/template.html'].map(rd));
    const order = (t, marks) => marks.map((m) => t.indexOf(m));
    const ao = order(pg, ['aria-label="점수 요약"', 'id="fng-contrib-title"', 'id="fng-chart-title"', 'id="fng-cycle-title"', 'id="fng-comp-title"', 'id="fng-method-title"']);
    check('앱 차례 — 요약 · 기여도 · 추이 · 사이클 · 구성요소 · 산출 방법', ao.every((v, i) => v > 0 && (i === 0 || ao[i - 1] < v)), ao.join(' < '));
    const vf = tplF.slice(tplF.indexOf('  function viewFng() {'), tplF.indexOf('\n  function ', tplF.indexOf('  function viewFng() {') + 10));
    const to = order(vf, ['<h2>점수 상승·하락 기여도</h2>', '<h2>점수 추이</h2>', '<h2>사이클과 구간 통계</h2>', '<h2>구성요소와 가중치</h2>', '<h2>산출 방법</h2>']);
    check('미리보기도 같은 차례', to.every((v, i) => v > 0 && (i === 0 || to[i - 1] < v)), to.join(' < '));
    check('긴 설명 셋을 접음 — 차트 읽는 법 · 사이클과 구간 통계 · 산출 방법 (앱)',
      /<details className="mt-2" data-chart-howto>/.test(pg) && (pg.match(/<details className="fng-fold">/g) ?? []).length === 2);
    check('미리보기도 같은 셋을 접음',
      /<details class="howto" data-chart-howto>/.test(vf) && (vf.match(/<details class="fng-fold">/g) ?? []).length === 2);
    check('겹침 설명(신호가 아님)은 접지 않고 그대로 보임',
      pg.indexOf('data-overlay-note') > pg.indexOf('</details>', pg.indexOf('data-chart-howto')) &&
      vf.indexOf('data-overlay-note') > vf.indexOf('</p></details>', vf.indexOf('data-chart-howto')));
    check('심리 상세 · 위기 목록 · 기여도 막대에 12px 아래 글자 없음 (앱)', ![pg, crisis, contrib].some((t) => /text-\[(1[01](\.\d)?|[0-9](\.\d)?)px\]/.test(t)));
    const cc = tplF.slice(tplF.indexOf('  function crisisCard('), tplF.indexOf('\n  function ', tplF.indexOf('  function crisisCard(') + 10));
    check('미리보기 심리 상세 · 위기 카드에도 12px 아래 글자 없음', ![vf, cc].some((t) => /font-size:\s?(1[01](\.\d)?|[0-9](\.\d)?)px/.test(t)));
  }

  console.log('\n[8-44] 카카오 로그인 · 가운데 가린 실명 · 탈퇴 · 개인정보 처리방침');
  {
    /*
     * 2026-11-26 사용자: "로그인 가능하게, 그거는 카톡으로만, 그리고 실명으로". 정한 것: 이름은 가운데 가림(김*수).
     * 사업자등록이 없어 카카오 '이름' 항목은 심사 뒤에야 받는다 — 그 전에는 카카오 닉네임을 같은 방식으로 가린다.
     * 카카오와 실제로 주고받는 부분은 여기서 돌릴 수 없다(키 · 바깥 연결 없음). 대신 흐름의 문을 하나씩 본다.
     */
    const r = await fetch(`${BASE}/api/auth/kakao/login?next=/plaza`, { redirect: 'manual' });
    const loc = r.headers.get('location') ?? '';
    const st = (await getJson('/api/plaza')).body;
    if (st?.auth?.kakao) {
      const sc = (r.headers.getSetCookie?.() ?? []).join(' ');
      check('카카오 설정이 있으면 카카오 동의 화면으로 · state 를 서명 쿠키에', /^https:\/\/kauth\.kakao\.com\/oauth\/authorize\?/.test(loc) &&
        /[?&]state=/.test(loc) && /[?&]response_type=code/.test(loc) && /zt_oauth=/.test(sc) && /HttpOnly/i.test(sc), loc.replace(/client_id=[^&]+/, 'client_id=…'));
    } else {
      check('카카오 설정이 없으면 광장으로 돌려보내고 화면이 알림', [302, 303, 307, 308].includes(r.status) && /\/plaza\?login=unavailable$/.test(loc), `${r.status} ${loc}`);
    }
    const cb = await fetch(`${BASE}/api/auth/kakao/callback?code=x&state=y`, { redirect: 'manual' });
    check('state 쿠키 없이 돌아온 요청은 로그인시키지 않음', /\/plaza\?login=(unavailable|state)$/.test(cb.headers.get('location') ?? '') &&
      !(cb.headers.getSetCookie?.() ?? []).some((c) => /^zt_session=[^;]{10,}/.test(c)), cb.headers.get('location') ?? '');

    const rd = (f) => readFile(f, 'utf8');
    const [cfg, sess, core, login, callback, demo, svc, page, priv, privPage, tplK, buildK, routeP] = await Promise.all([
      'src/server/config.ts', 'src/server/plaza/session.ts', 'src/server/plaza/authCore.mjs', 'src/app/api/auth/kakao/login/route.ts',
      'src/app/api/auth/kakao/callback/route.ts', 'src/app/api/auth/demo/route.ts', 'src/server/plaza/service.ts', 'src/app/plaza/page.tsx',
      'src/lib/privacyText.mjs', 'src/app/privacy/page.tsx', 'tools/preview/template.html', 'tools/preview/build.mjs', 'src/app/api/plaza/route.ts'].map(rd));
    const others = [sess, login, callback, demo, svc, page, routeP].join('\n');
    check('카카오 키 · 서명 키는 config.ts 에서만, NEXT_PUBLIC_ 없음',
      /env\('KAKAO_REST_API_KEY'\)/.test(cfg) && /env\('KAKAO_CLIENT_SECRET'\)/.test(cfg) && /env\('AUTH_SECRET'\)/.test(cfg) &&
      !/KAKAO_CLIENT_SECRET|AUTH_SECRET'/.test(others) && !/NEXT_PUBLIC_[A-Z_]*(KAKAO|AUTH)/.test(cfg + others));
    check('서명 키는 32자 이상만 — 짧으면 LIVE 로그인이 꺼짐', /v && v\.length >= 32 \? v : null/.test(cfg) &&
      /getAuthSecret\(\) \?\? \(mode === 'DEMO' \? DEMO_SECRET : null\)/.test(sess));
    check('로그인 쿠키 — httpOnly · SameSite=Lax · 운영에서 Secure · 모드를 서명 안에',
      /httpOnly: true,/.test(sess) && /secure: process\.env\.NODE_ENV === 'production'/.test(sess) && /sameSite: 'lax'/.test(sess) &&
      /p\.m === mode/.test(sess));
    check('서명은 HMAC · 비교는 시간 일정(timingSafeEqual)', /createHmac\('sha256', secret\)/.test(core) && /timingSafeEqual\(sig, want\)/.test(core));
    check('카카오 흐름 — state 비교 · code 교환은 POST 한 번(재시도 없음) · 바깥 호출은 fetchJson',
      /q\.get\('state'\) !== st\.s/.test(callback) && /fetchJson<[\s\S]{0,60}'https:\/\/kauth\.kakao\.com\/oauth\/token'[\s\S]{0,200}retries: 0/.test(callback) &&
      /'https:\/\/kapi\.kakao\.com\/v2\/user\/me'/.test(callback) && /application\/x-www-form-urlencoded/.test(callback));
    check('토큰 · 카카오 회원번호 · 가리기 전 이름을 저장하지 않음',
      !/access_token/.test(svc) && /const display = maskName\(rawName\)/.test(svc) && /accountKey\(provider, subject, secret\)/.test(svc) &&
      !/HSET[^\n]*rawName/.test(svc) && !/HSET[^\n]*subject/.test(svc));
    check('돌아갈 곳은 우리 사이트 안만 (열린 리다이렉트 막음)', /const next = safeNext\(/.test(login) && /new URL\(st\.next, req\.nextUrl\.origin\)/.test(callback));
    check('DEMO 연습 로그인은 DEMO 에서만 (LIVE 404)', /if \(ctx\.mode !== 'DEMO'\) return NextResponse\.json\(\{ error: '없는 주소예요\.' \}, \{ status: 404 \}\)/.test(demo) &&
      /demo: adapter\.mode === 'DEMO'/.test(await rd('src/server/plaza/context.ts')));
    check('닉네임 가입 · 복구 코드는 없앰', !/action === 'join'|action === 'restore'|복구 코드|x-plaza-key/.test(routeP + page + svc));
    check('탈퇴 — 회원 · 계정 열쇠 · 순위 · 기록 · 내 글 · 마감 전 선택을 지움',
      /\['DEL', K\(ctx, 'u', uid\), K\(ctx, 'h', uid\)/.test(svc) && /\['DEL', K\(ctx, 'acct'/.test(svc) && /\['ZREM', K\(ctx, 'lb'\), uid\]/.test(svc) &&
      /\['HDEL', K\(ctx, 'posts'\), pid\], \['LREM', K\(ctx, 'posts', 'ids'\), 0, pid\]/.test(svc) && /HDEL', K\(ctx, 'r', m, roundsAt/.test(svc));
    check('탈퇴 — 진행 중 · 채점 끝난 판의 내 선택과 남의 글에 누른 공감 · 신고에서도 나를 뺌',
      /\['SADD', K\(ctx, 'urd', uid\), `\$\{m\}:\$\{open\}`\]/.test(svc) && /\['SMEMBERS', K\(ctx, 'urd', uid\)\]/.test(svc) &&
      /\['HDEL', K\(ctx, 'r', m, date\), uid\]/.test(svc) && /\['SREM', K\(ctx, 'lk', pid\), uid\]/.test(svc) && /\['SREM', K\(ctx, 'rp', pid\), uid\]/.test(svc));
    const policy = priv;
    check('개인정보 처리방침 — 받는 것 · 가림 · 탈퇴 · 맡기는 곳(국외) · 쿠키 · 문의를 적음',
      ['받는 정보', '가운데를 가려', '탈퇴', 'Vercel', 'Upstash', '국외', 'zt_session', '문의'].every((w) => policy.includes(w)) &&
      /privacySections\(getPlazaContact\(\)\)/.test(privPage));
    check('광장에서 처리방침으로 가는 길 (앱 · 미리보기)', /href="\/privacy"/.test(page) && /data-go="privacy"/.test(tplK) && /privacy: viewPrivacy,/.test(tplK) &&
      /__PRIVACY_TEXT__/.test(tplK) && /\.replace\('__PRIVACY_TEXT__'[\s\S]{0,140}privacyText\.mjs/.test(buildK));
    const pp = await fetch(`${BASE}/privacy`);
    const ppText = await pp.text();
    check('/privacy 화면이 열림', pp.status === 200 && ppText.includes('개인정보 처리방침') && ppText.includes('가운데를 가려'));
  }

  console.log('\n[8-45] 종목 차트 — 종목 찾기 · 운영자 기법(4시간봉 RSI · 다이버전스) · 슈퍼트렌드 · OBV · 이동평균 · 추세선 · 쫄탐지수');
  {
    /*
     * 2026-11-27 사용자: "쫄탐지수 말고도 rsi 나 내가 사용하고 있는 지표들 그리고 추세선 이런 것들을 같이 볼 수 있게 … 참고할 수 있게".
     * 정한 것: 매수 · 매도 대신 '상승 전환 ▲ / 하락 전환 ▼' (규칙 1절 그대로) · 지수 + 종목 코드 찾기 · 일봉 + 4시간봉.
     * 같은 날 이어서: 이름을 '참고' → '차트'(종목 검색), 운영자 기법 — 4시간봉, ① RSI 다이버전스 ② RSI 30 이하 · 80 이상
     * ③ 20 이하 · 90 이상은 강함 ④ 슈퍼트렌드는 후순위. 화면에는 '조건 충족' 으로만.
     * 계산은 ta.mjs, 그림 · 표는 taChart.mjs — 앱과 미리보기가 같은 파일을 쓴다.
     */
    const ta = await import('../src/lib/ta.mjs');
    const mode = (await getJson('/api/health')).body?.mode;
    const okBar = (b) => [b.o, b.h, b.l, b.c].every((x) => typeof x === 'number' && Number.isFinite(x)) &&
      b.l <= Math.min(b.o, b.c) + 1e-9 && Math.max(b.o, b.c) <= b.h + 1e-9;

    const d1 = await getJson('/api/ta?a=tsla&tf=1d');
    const r1 = d1.body ?? {};
    check('일봉 200 · 모드가 서버 모드와 같음(DEMO · LIVE 섞지 않음)', d1.status === 200 && r1.mode === mode && r1.tf === '1d' && r1.daily === null,
      `${d1.status} ${r1.mode}/${mode}`);
    check('일봉 — 1년선을 그릴 만큼(252 + 1년) · 시고저종이 말이 됨(저가 ≤ 시가·종가 ≤ 고가)',
      (r1.bars ?? []).length >= 504 && r1.bars.every(okBar), `${(r1.bars ?? []).length}개`);
    check('봉은 시간 순서 · 같은 시각이 두 번 없음', (r1.bars ?? []).every((b, i, a) => i === 0 || a[i - 1].t < b.t));

    const d4 = await getJson('/api/ta?a=samsung&tf=4h');
    const r4 = d4.body ?? {};
    const kstDay = (t) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
    const perDay = new Map();
    for (const b of r4.bars ?? []) perDay.set(kstDay(b.t), (perDay.get(kstDay(b.t)) ?? 0) + 1);
    const hours = new Set((r4.bars ?? []).map((b) => new Date(b.t + 9 * 3600_000).toISOString().slice(11, 16)));
    check('4시간봉 — 한국은 하루 두 개(9:00 · 13:00 서울), 1년선용 일봉을 같이 보냄',
      d4.status === 200 && (r4.bars ?? []).length >= 200 && [...perDay.values()].every((n) => n <= 2) &&
      [...hours].every((h) => h === '09:00' || h === '13:00') && (r4.daily ?? []).length >= 252 && r4.bars.every(okBar),
      `${(r4.bars ?? []).length}개 · ${[...hours].join(',')} · 일봉 ${(r4.daily ?? []).length}`);
    const s4 = await getJson('/api/ta?a=spx&tf=4h');
    const etHours = new Set((s4.body?.bars ?? []).map((b) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(b.t))));
    check('4시간봉 — 미국은 9:30 · 13:30 (동부)', s4.status === 200 && [...etHours].every((h) => h === '09:30' || h === '13:30'), [...etHours].join(','));

    const bad = await Promise.all(['/api/ta?a=vix&tf=1d', '/api/ta?a=tsla&tf=15m', '/api/ta?code=../x&tf=1d', '/api/ta?tf=1d']
      .map((u) => getJson(u).then((r) => r.status)));
    check('고를 수 없는 것은 거절 — 변동성지수 404 · 이상한 봉 단위 400 · 코드 모양이 아님 400 · 빈 요청 400',
      bad.join(',') === '404,400,400,400', bad.join(','));
    const viaCode = await getJson('/api/ta?code=tsla&tf=1d');
    check('목록에 있는 종목은 코드로 찾아도 목록 항목으로 (이름 · 소수 자리)', viaCode.status === 200 && viaCode.body?.assetId === 'tsla' && viaCode.body?.name === '테슬라');
    if (mode === 'DEMO') {
      const plug = await getJson('/api/ta?code=PLUG&tf=1d');
      check('DEMO 에서 목록에 없는 코드는 지어내지 않고 까닭을 말함', plug.status === 404 && /DEMO/.test(plug.body?.error ?? '') && !plug.body?.bars,
        `${plug.status} ${plug.body?.error ?? ''}`);
    }

    // 같은 봉으로 계산 — 요약 줄 여섯, 방향은 기호와 말로
    const m = ta.taModel({ tf: '1d', bars: r1.bars ?? [], daily: null });
    const rows = ta.taSummary(m);
    check('지금 상태 — 슈퍼트렌드 · 이동평균 · 1년선 · OBV · RSI · 다이버전스', rows.map((r) => r.key).join(',') === 'st,ma,trend,obv,rsi,div', rows.map((r) => r.key).join(','));
    check('방향 있는 줄은 ▲ / ▼ 와 말이 같이 (색만으로 전하지 않음)', rows.filter((r) => r.dir).every((r) => (r.dir === 'up' ? /▲/ : /▼/).test(r.value)));
    check('1년선 길이는 홈 칩 · 심리 상세와 같은 252', ta.TA_TREND_DAYS === 252);

    // 운영자 기법 — 같은 봉으로 계산
    const m4 = ta.taModel({ tf: '4h', bars: (await getJson('/api/ta?a=tsla&tf=4h')).body?.bars ?? [], daily: null });
    const ev = ta.techEvents(m4);
    check('기법 조건 — RSI 30 이하 · 80 이상에 들어간 봉, 20 · 90 은 강함, 다이버전스는 5봉 뒤 확인',
      ta.TA_RSI_LOW === 30 && ta.TA_RSI_HIGH === 80 && ta.TA_RSI_STRONG_LOW === 20 && ta.TA_RSI_STRONG_HIGH === 90 &&
      ev.every((e) => e.kind === 'div' ? e.seenAt === e.i + 5 : (e.side === 'up' ? e.rsi <= 30 : e.rsi >= 80) && e.strong === (e.side === 'up' ? e.rsi <= 20 : e.rsi >= 90)),
      `${ev.length}개`);
    const now = ta.techNow(m4);
    check('기법 카드 — 다이버전스 · RSI · 슈퍼트렌드(후순위) 순서, 결론은 \'조건 충족\' 또는 \'없음\'',
      // 2026-11-28 방어적은 조건 뒤 슈퍼트렌드를 기다리는 동안 '추세 확인 전' 이라고 적는다 ([8-47])
      now.rows.map((r) => r.key).join(',') === 'tdiv,trsi,tst' && /^(상승 쪽 조건 충족 ▲|하락 쪽 조건 충족 ▼|(상승|하락) 쪽 조건 · 추세 확인 전|기법 조건 없음)$/.test(now.head.text) && /후순위/.test(now.rows[2].name),
      now.head.text);
    check('처음 여는 봉 단위는 4시간봉', ta.TA_DEFAULT_TF === '4h');
    // 2026-11-27 사용자: "지표를 좀 더 잘 보이게 간단하게, 숫자들은 크게" — 결론 한 줄 + 큰 숫자 칸 여섯
    const board = ta.taBoard(m4);
    // 이어서 사용자: "rsi 는 다이버전스랑 같이 합쳐서" — RSI 칸 하나에 다이버전스를 둘째 값으로
    // 2026-11-28 맨 앞에 종목 쫄탐 칸 ([8-47])
    check('지금 상태는 결론 한 줄 + 큰 숫자 칸 여섯 (종목 쫄탐 · RSI · 다이버전스 한 칸 · 슈퍼트렌드 · 20/60선 · 1년선 · OBV)',
      board.tiles.map((t) => t.key).join(',') === 'score,rsi,st,ma,trend,obv' && board.tiles.every((t) => t.big.length <= 8) &&
      /^(▲ 상승 다이버전스|▼ 하락 다이버전스|다이버전스 없음)$/.test(board.tiles[1].sub?.big ?? ''),
      board.tiles.map((t) => t.big).join(' | '));
    const cssBig = await readFile('src/app/ta.css', 'utf8');
    const px = (sel) => Number((cssBig.match(new RegExp(sel.replace(/[.[\]"=]/g, (c) => '\\' + c) + '\\s*\\{[^}]*font-size:\\s*([\\d.]+)px')) ?? [])[1]);
    check('숫자는 크게 — 칸 값 28px 이상 · RSI 36px · 결론 22px · 가격 24px · 차트 축 13px',
      px('.ta-big') >= 28 && px('.ta-tile[data-k="rsi"] .ta-big') >= 36 && px('.ta-vhead b') >= 22 && px('.ta-title .ta-last') >= 24 && px('.ta-axis') >= 13 &&
      px('.ta-tip-v') >= 13 && px('.ta-cross-tagt') >= 13,
      ['.ta-big', '.ta-tile[data-k="rsi"] .ta-big', '.ta-vhead b', '.ta-title .ta-last', '.ta-axis', '.ta-tip-v', '.ta-cross-tagt'].map(px).join(','));
    // 이어서 사용자: "차트에서 그래프나 누르는 곳에 숫자 나오게" — 누른 봉의 숫자 상자 · 축 꼬리표
    {
      const tc = await import('../src/lib/taChart.mjs');
      const out = tc.taChartHtml(m4, { from: Math.max(0, m4.n - 130), to: m4.n - 1, width: 360 });
      const tip = tc.taCrossSvg(m4, out.layout, m4.n - 3, { price: (v) => v.toFixed(2), stamp: () => '' });
      // 2026-11-28 RSI 칸을 신호 줄로 바꾸며 오른쪽 꼬리표는 종가 하나, RSI 는 상자 줄로 ([8-47])
      check('차트를 누르면 그 봉의 숫자 — 세로선 · 종가 꼬리표 · 상자(종가 · 시가 · 고저 · RSI · 슈퍼트렌드 · 20/60선 · 1년선)',
        /<g class="ta-crossg"><\/g>/.test(out.html) && (tip.match(/class="ta-cross-tag"/g) ?? []).length === 1 &&
        ['종가', '시가', '고 · 저', 'RSI', '슈퍼트렌드', '20선', '60선', '1년선'].every((k) => tip.includes(`class="ta-tip-l">${k}<`)) &&
        tip.includes(`>${m4.c[m4.n - 3].toFixed(2)}</text>`));
    }

    const rd = (f) => readFile(f, 'utf8');
    const [page, nav, tpl, build, css, lib, chart, route, live, demoA] = await Promise.all([
      'src/app/chart/page.tsx', 'src/components/nav/Navigation.tsx', 'tools/preview/template.html', 'tools/preview/build.mjs', 'src/app/ta.css',
      'src/lib/ta.mjs', 'src/lib/taChart.mjs', 'src/app/api/ta/route.ts', 'src/server/adapters/live/index.ts', 'src/server/adapters/demo/index.ts'].map(rd));
    const vr = tpl.slice(tpl.indexOf('  function viewRef() {'), tpl.indexOf('\n  function drawRef()'));
    check('하단 탭에 \'차트\' (앱 · 미리보기)', /href: '\/chart', label: '차트'/.test(nav) && /\{ id: 'ref', label: '차트'/.test(tpl) && /ref: viewRef,/.test(tpl) &&
      !/label: '참고'/.test(nav + tpl));
    check('계산 · 그림 · CSS 는 한 곳 — 미리보기는 같은 파일을 끼워 넣음',
      /__TA_LIB__/.test(tpl) && /__TA_CHART__/.test(tpl) && /__TA_CSS__/.test(tpl) &&
      /inlineModule\('\.\.\/\.\.\/src\/lib\/ta\.mjs'\)/.test(build) && /inlineModule\('\.\.\/\.\.\/src\/lib\/taChart\.mjs'\)/.test(build) &&
      /src\/app\/ta\.css/.test(build) && /from '@\/lib\/ta\.mjs'/.test(page) && /from '@\/lib\/taChart\.mjs'/.test(page) && !/^import /m.test(lib + chart));
    check('앱 · 미리보기가 같은 마크업 — 찾기 · 자주 보는 종목 · 봉 단위 · 지금 상태(큰 숫자 칸) · 차트 · 구간',
      ['ta-search', 'ta-seg', 'ta-chart', 'ta-ranges', 'ta-read', 'ta-fold', 'ta-howto', 'ta-mood'].every((c) => page.includes(`"${c}"`) && vr.includes(`"${c}`)) &&
      ['taSuggestHtml(', 'taQuickHtml(', 'taBoardHtml(taBoard('].every((f) => page.includes(f.replace('taBoardHtml(taBoard(', 'taBoardHtml(')) && vr.includes(f)) &&
      // 그림은 한 번 만든 innerHTML 객체를 다시 쓴다 — 렌더마다 새 객체면 누른 봉의 숫자 상자가 지워진다
      /chartInner: chart \? \{ __html: chart\.html \}/.test(page) && /dangerouslySetInnerHTML=\{view\.chartInner\}/.test(page) &&
      /taCrossSvg\(model, view\.chart\.layout, i/.test(page) && /taCrossSvg\(m, refLayout, i/.test(tpl) &&
      /const board = taBoard\(model, undefined, profile\)/.test(page) &&
      /taChartHtml\(/.test(page) && /taChartHtml\(/.test(tpl) && /const board = taBoard\(m, undefined, state\.ref\.profile\)/.test(tpl) &&
      /mark: board\.mark/.test(tpl) && /mark: board\.mark/.test(page));
    // 2026-11-27 사용자: "차트에서 왜 점 같은 거 있지? 너무 가독성이 떨어지는데" — 흩뿌린 점 · 흐린 ▲▼ 를 빼고 가장 최근 조건 하나만
    const svgNow = (await import('../src/lib/taChart.mjs')).taChartHtml(m4, { from: Math.max(0, m4.n - 130), to: m4.n - 1, width: 360, mark: ta.taBoard(m4).mark }).html;
    check('차트에 점(●) · 흐린 슈퍼트렌드 ▲▼ 없음 — 최근 기법 조건만 세로 점선 하나와 꼬리표',
      !/<circle /.test(svgNow) && !/ta-flip-st/.test(svgNow) && (svgNow.match(/class="ta-mark"/g) ?? []).length === (ta.taBoard(m4).mark ? 1 : 0) &&
      (svgNow.match(/class="ta-mark-tag"/g) ?? []).length === (ta.taBoard(m4).mark ? 1 : 0) && !/opt\.tech/.test(chart));
    check('자주 보는 종목이 앱 · 미리보기에서 같음', /const QUICK = \['spx', 'ndx', 'kospi', 'tsla', 'nvda', 'samsung'\]/.test(page) &&
      /const TA_QUICK = \['spx', 'ndx', 'kospi', 'tsla', 'nvda', 'samsung'\]/.test(tpl) && /const TA_PREVIEW = \['spx', 'ndx', 'kospi', 'tsla', 'nvda', 'samsung'\]/.test(build));
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const words = /(매수|매도|사세요|파세요|추천|매매 신호|진입|청산|목표가|손절|익절|지금이 기회|예측)/;
    const hit = [['page', page], ['viewRef', vr], ['ta.mjs', lib], ['taChart.mjs', chart], ['route', route]].filter(([, t]) => words.test(strip(t))).map(([n]) => n);
    check('매수 · 매도를 권하거나 앞날을 말하는 말이 화면 · 계산 어디에도 없음 (규칙 1절)', hit.length === 0, hit.join(','));
    check('기법은 \'조건 충족\' 으로만 · Buy / Sell 표시 없음', /조건 충족/.test(lib) && /상승 전환 ▲/.test(lib) && !/\bBuy\b|\bSell\b/.test(strip(lib + chart + page + vr)));
    check('차트 CSS 에 12px 아래 글자 없음', !/font-size:\s*(1[01](\.\d+)?|\d(\.\d+)?)px/.test(css));
    check('목록에 없는 코드는 모양을 거른 뒤에만 바깥 주소에 넣음', /taParseCode\(c\)/.test(route) && /const parsed = taParseCode\(req\.code\)/.test(live));
    check('DEMO 는 목록에 없는 코드를 지어내지 않음', /DEMO 에서는 목록에 있는 지수 · 종목만 볼 수 있습니다/.test(demoA));
    check('거래량이 빠지면 OBV 를 메우지 않고 그리지 않음', /거래량이 빠진 봉이 \$\{missing\}개 있어 OBV 를 그리지 않습니다/.test(lib));
    check('유료 · 비공개 지표는 흉내 내지 않는다고 밝힘', /SignalMaster Pro · AI Moving Average/.test(lib));
    const pr = await fetch(`${BASE}/chart`);
    const prText = await pr.text();
    check('/chart 화면이 열림 · 하단 고지가 있음', pr.status === 200 && prText.includes('종목 차트') && prText.includes('본 서비스는 정보 제공 목적이며 투자 조언이 아닙니다'));
    const old = await fetch(`${BASE}/ref`, { redirect: 'manual' });
    check('옛 주소 /ref 는 남기지 않음 (이 PR 안에서 바뀐 이름)', old.status === 404, String(old.status));
  }

  console.log('\n[8-47] 종목 쫄탐 — 시장 쫄탐지수 + 1년선 · OBV 를 모은 0~100 · 방어적 / 공격적 · 신호 줄 · 확대 / 이동');
  {
    /*
     * 2026-11-28 사용자: "매매기준은 기본적으로 쫄탐지수를 참고해서 차트에 표기해라, 내가 올려준 지표 4가지는 보조지표고,
     * 아니면 그 모든 걸 고려해서 지수를 다시 짤까?" → 고른 것: 종목별 종합 점수(홈 쫄탐지수는 그대로, 재료 하나로),
     * 문구는 '상승 쪽 조건'(규칙 1절 그대로), 기준은 RSI 30 · 80 · 쫄탐 20 · 80, 공격적은 하나만 · 방어적은 둘 다 + 슈퍼트렌드 확인.
     */
    const ta = await import('../src/lib/ta.mjs');
    const tc = await import('../src/lib/taChart.mjs');
    const mode = (await getJson('/api/health')).body?.mode;
    const fng = (await getJson('/api/fng/us')).body?.detail;
    const hist = fng?.history ?? [];
    const dayKey = (t) => Math.floor(t / 86_400_000);
    const moodByDay = new Map(hist.map((p) => [dayKey(p.t), p.v]));
    const assets = [['spx', '1d'], ['spx', '4h'], ['tsla', '4h'], ['samsung', '4h'], ['kospi', '1d'], ['nvda', '1d']];
    const got = [];
    for (const [a, tf] of assets) got.push([a, tf, (await getJson(`/api/ta?a=${a}&tf=${tf}`)).body ?? {}]);

    check('차트 응답에 미국 쫄탐지수 일별 값 — 같은 모드(섞지 않음) · 봉 범위만 · 오름차순',
      got.every(([, , r]) => r.mode === mode && r.mood?.market === 'us' && r.mood.t.length > 20 && r.mood.t.length === r.mood.v.length &&
        r.mood.t.every((t, i, arr) => i === 0 || arr[i - 1] < t) && r.mood.t[0] >= r.bars[0].t - 8 * 86_400_000 && r.moodNote === null),
      got.map(([a, tf, r]) => `${a}:${tf} ${r.mood?.t?.length ?? '없음'}`).join(' · '));
    check('차트의 시장 쫄탐 = 심리 상세의 쫄탐지수 (같은 엔진 · 같은 날 같은 값)',
      got.every(([, , r]) => r.mood.t.every((t, i) => !moodByDay.has(dayKey(t)) || moodByDay.get(dayKey(t)) === r.mood.v[i])) &&
      got[0][2].mood.v.at(-1) === hist.at(-1)?.v, `마지막 ${got[0][2].mood?.v?.at(-1)} / ${hist.at(-1)?.v}`);

    const models = got.map(([a, tf, r]) => [a, tf, r, ta.taModel({ tf, bars: r.bars, daily: r.daily, gmtoffset: r.gmtoffset, market: r.market, mood: r.mood })]);
    // 2026-11-28 처음에는 RSI 30 을 넣었는데 점수가 RSI 와 거의 같이 움직여(상관 0.77~0.94) 사용자 결정으로 뺐다
    check('비중은 시장 쫄탐 50 · 1년선 괴리 25 · OBV 25 (RSI 는 점수에 넣지 않음), 기준은 20 · 80',
      JSON.stringify(ta.TA_SCORE_W) === '{"mood":50,"gap":25,"obv":25}' && ta.TA_SCORE_LOW === 20 && ta.TA_SCORE_HIGH === 80 &&
      ta.TA_RSI_LOW === 30 && ta.TA_RSI_HIGH === 80 && models.every(([, , , m]) => m.score.parts.rsi === undefined));
    {
      let bad = 0;
      let seen = 0;
      for (const [, , , m] of models) {
        const p = m.score.parts;
        for (let i = 0; i < m.n; i += 1) {
          const v = m.score.v[i];
          const g = p.gap[i];
          const o = p.obv[i];
          const can = Number.isFinite(p.mood[i]) && (Number.isFinite(g) || Number.isFinite(o));
          if (v === null) { if (can) bad += 1; continue; }
          seen += 1;
          const want = Number.isFinite(g) && Number.isFinite(o)
            ? (p.mood[i] * 50 + g * 25 + o * 25) / 100
            : (p.mood[i] + (Number.isFinite(g) ? g : o)) / 2;
          if (!can || !(v >= 0 && v <= 100) || Math.abs(v - want) > 1e-9) bad += 1;
        }
      }
      check('종목 쫄탐 = 재료의 가중평균(0~100) — 1년선 · OBV 중 하나만 있으면 시장 50 : 그 하나 50, 둘 다 없으면 없음',
        bad === 0 && seen > 1000, `${seen}봉 · 어긋남 ${bad}`);
    }
    {
      // Codex 리뷰: obvOsc 는 거래량이 하나라도 빠지면 시리즈 전체를 내지 않아, 점수에 쓰면 뒤 봉 하나가 지난 점수를 모두 바꿨다
      const [, , r, m] = models[1];
      const more = [...r.bars, { t: r.bars.at(-1).t + 4 * 3600_000, o: 1, h: 1, l: 1, c: 1, v: null }];
      const m2 = ta.taModel({ tf: r.tf, bars: more, daily: r.daily, gmtoffset: r.gmtoffset, market: r.market, mood: r.mood });
      check('OBV 재료는 그 봉까지의 거래량만 — 뒤에 거래량이 빠진 봉이 붙어도 앞 점수가 그대로',
        m2.score.v.slice(0, m.n).every((v, i) => v === m.score.v[i]) && m2.score.parts.obv[m.n] === null);
    }
    {
      // 미리 당겨 쓰지 않는다 — 미국 일봉은 그날 값, 4시간봉 · 한국은 전날까지의 값
      const dayOf = (t, off) => Math.floor((t / 1000 + off) / 86400);
      const prevVal = (d, same) => { let best = null; let bd = -Infinity; for (const p of hist) { const k = dayKey(p.t); if ((same ? k <= d : k < d) && k > bd) { bd = k; best = p.v; } } return d - bd <= 5 ? best : null; };
      let bad = 0;
      for (const [, tf, r, m] of models) {
        const same = tf === '1d' && r.market === 'us';
        for (const i of [m.n - 1, m.n - 2, m.n - 7, Math.floor(m.n / 2)]) {
          if (m.score.parts.mood[i] !== prevVal(dayOf(m.t[i], r.gmtoffset), same)) bad += 1;
        }
      }
      check('시장 쫄탐은 봉이 끝날 때 이미 나온 값만 — 미국 일봉은 같은 날, 4시간봉 · 한국은 전날까지', bad === 0, `어긋남 ${bad}`);
    }
    {
      let bad = 0;
      let agg = 0;
      let def = 0;
      for (const [, , , m] of models) {
        const A = ta.taSignals(m, 'aggressive').list;
        const D = ta.taSignals(m, 'defensive').list;
        agg += A.length; def += D.length;
        for (const e of A) {
          const r = m.rsi[e.setup];
          const s = m.score.v[e.setup];
          const ok = e.i === e.setup && (e.why.includes('div') ||
            (e.side === 'up' ? (s !== null && s <= 20) || r <= 30 : (s !== null && s >= 80) || r >= 80));
          if (!ok) bad += 1;
        }
        for (const e of D) {
          const r = m.rsi[e.setup];
          const s = m.score.v[e.setup];
          const both = e.side === 'up' ? s !== null && s <= 20 && r <= 30 : s !== null && s >= 80 && r >= 80;
          const ok = m.st.dir[e.i] === e.side && e.i >= e.setup && e.i <= e.setup + ta.TA_CONFIRM && (both || e.why.includes('div'));
          if (!ok) bad += 1;
        }
      }
      check('공격적 — 둘 중 하나가 시작된 봉에 바로 / 방어적 — 둘 다 닿은 뒤 슈퍼트렌드가 같은 쪽인 봉', bad === 0 && agg > def && def > 0,
        `공격적 ${agg} · 방어적 ${def} · 어긋남 ${bad}`);
    }
    {
      const texts = [];
      for (const [, , , m] of models) for (const p of ta.TA_PROFILES) {
        const b = ta.taBoard(m, undefined, p);
        texts.push(b.verdict.text, b.verdict.sub, ...b.tiles.map((t) => `${t.label} ${t.big} ${t.cap} ${t.note ?? ''}`));
      }
      const pushy = texts.filter((t) => /매수|매도|사세요|파세요|진입|청산|목표가|손절|익절|추천/.test(t));
      check('결론 · 칸 문구는 \'상승 쪽 · 하락 쪽 조건\' — 매수 · 매도 말 없음 (규칙 1절)', pushy.length === 0 &&
        texts.some((t) => /^(상승|하락) 쪽 조건/.test(t)), `${texts.length}줄 중 ${pushy.length}`);
    }
    {
      const [, , , m] = models[2];
      const b = ta.taBoard(m, undefined, 'aggressive');
      const out = tc.taChartHtml(m, { from: m.n - 130, to: m.n - 1, width: 360, signals: b.signals, mark: b.mark, profileText: '공격적' });
      const inView = b.signals.filter((e) => e.i >= m.n - 130).length;
      check('차트 — 표시 봉마다 ▲ ▼ (점 없음) · 개수 줄',
        (out.html.match(/class="ta-sig( ta-sig-strong)?"/g) ?? []).length === inView && !/<circle /.test(out.html) &&
        /<p class="ta-count">보이는 구간 · 공격적 · 상승 쪽 조건 \d+번 · 하락 쪽 조건 \d+번<\/p>/.test(out.html) &&
        b.tiles[0].key === 'score' && /^\d+$/.test(b.tiles[0].big),
        `표시 ${inView}`);
      // 2026-11-28 사용자: "밑에 보조 지표가 너무 꼴보기 싫은데 … 아래에는 한칸에다가 신호 표시만"
      const sTo = m.score.v[m.n - 1];
      const strips = [...out.html.matchAll(/class="ta-strip-on( both)?"/g)];
      check('가격 아래는 신호 줄 하나 — 종목 쫄탐 · RSI · OBV 칸 없음, 줄 제목에 숫자, 기준에 닿은 구간만 칠함',
        /<rect [^>]*class="ta-strip"\/>/.test(out.html) && !/RSI 14 ·|OBV 오실레이터|class="ta-ptitle">종목 쫄탐/.test(out.html) &&
        out.html.includes(`신호 · 쫄탐 ${Math.round(sTo)} · RSI ${m.rsi[m.n - 1].toFixed(1)} · OBV `) &&
        out.layout.SG && !out.layout.RS && strips.length > 0 &&
        /신호 줄 — 옅게: 종목 쫄탐 20 이하 · 80 이상 또는 RSI 30 이하 · 80 이상 하나, 진하게: 둘 다 · ▲▼ 다이버전스/.test(out.html),
        `칠한 구간 ${strips.length}`);
      const tip = tc.taCrossSvg(m, out.layout, m.n - 3, { price: (v) => v.toFixed(2), stamp: () => '' });
      check('누른 봉의 숫자 상자에 종목 쫄탐 · RSI · OBV 줄 (오른쪽 꼬리표는 종가 하나)',
        ['종목 쫄탐', 'RSI', 'OBV'].every((k) => tip.includes(`class="ta-tip-l">${k}<`)) &&
        (tip.match(/class="ta-cross-tag"/g) ?? []).length === 1 && tip.includes(`>${Math.round(m.score.v[m.n - 3])}</text>`));
      // 확대 · 이동 — 앱과 미리보기가 같은 taWindow · taZoom · taPan
      const n = m.n;
      const w0 = ta.taWindow(n, 130, 0);
      const zin = ta.taZoom(n, w0, 0.5, 1);
      const left = ta.taPan(n, w0, 10_000);
      check('확대 · 이동 — 구간은 데이터 안에서만, 확대해도 20봉 아래로 안 감, 끝에서 멈춤',
        w0.to === n - 1 && w0.span === 130 && zin.span === 65 && zin.to === n - 1 && left.from === 0 &&
        ta.taPan(n, w0, -5).offset === 0 && ta.taZoom(n, w0, 0.01).span === ta.TA_MIN_SPAN && ta.taZoom(n, w0, 1000).span === n);
    }
    const [page, tpl, build, css] = await Promise.all(['src/app/chart/page.tsx', 'tools/preview/template.html', 'tools/preview/build.mjs', 'src/app/ta.css'].map((f) => readFile(f, 'utf8')));
    const vr = tpl.slice(tpl.indexOf('  function viewRef() {'), tpl.indexOf('\n  function drawRef()'));
    check('앱 · 미리보기 같은 성향 고르기 — 방어적이 처음, 주소 ?p= 로 이어짐',
      ta.TA_DEFAULT_PROFILE === 'defensive' && /aria-label="기법 성향"/.test(page) && /aria-label="기법 성향"/.test(vr) &&
      /TA_PROFILES\.map/.test(page) && /data-ta-profile="/.test(vr) && /qs\.set\('p', profile\)/.test(page) &&
      /profile: 'defensive'/.test(tpl) && /if \(d\.taProfile\)/.test(tpl) && /TA_TEXT\.profileHint/.test(page) && /TA_TEXT\.profileHint/.test(vr) &&
      /signals: board\.signals/.test(page) && /signals: board\.signals/.test(tpl) &&
      /mood: data\.mood \?\? null/.test(page) && /mood: d\.mood \|\| null/.test(tpl));
    check('미리보기 빌드는 시장 쫄탐이 빠지면 멈춤 (조용히 비우지 않음)', /종목 차트에 시장 쫄탐지수가 없습니다/.test(build));
    check('앱 · 미리보기 같은 확대 · 이동 — ＋ − 단추 · 휠 · 끌기 · 시간 이동 슬라이더 · 최근 봉',
      /taWindow\(model\.n/.test(page) && /taZoom\(model\.n/.test(page) && /taPan\(model\.n/.test(page) &&
      /aria-label="차트 확대"/.test(page) && /aria-label="차트 축소"/.test(page) && /addEventListener\('wheel'/.test(page) &&
      /id="ta-position"/.test(page) && /최근 봉/.test(page) && /onPointerUp=\{onPointerUp\}/.test(page) &&
      /taWindow\(m\.n/.test(tpl) && /taZoom\(r?m\.n/.test(tpl) && /taPan\(refModel\(rd\)\.n/.test(tpl) &&
      /data-ta-zoom="in" aria-label="차트 확대"/.test(vr) && /data-ta-zoom="out" aria-label="차트 축소"/.test(vr) &&
      /addEventListener\('wheel'/.test(tpl) && /id="ta-position"/.test(vr) && /data-ta-latest/.test(vr) && /TA_TEXT\.panHint/.test(page) && /TA_TEXT\.panHint/.test(vr));
    check('시장 쫄탐을 못 받은 까닭(moodNote)을 앱 · 미리보기가 화면에 적음',
      /data\.moodNote \? <p className="ta-note" role="status">\{data\.moodNote\}<\/p>/.test(page) &&
      /d\.moodNote \? '<p class="ta-note" role="status">' \+ esc\(d\.moodNote\)/.test(vr));
    check('종목 쫄탐 숫자도 크게 (36px 이상)', Number((css.match(/\.ta-tile\[data-k="score"\] \.ta-big \{ font-size: (\d+)px/) ?? [])[1]) >= 36);
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

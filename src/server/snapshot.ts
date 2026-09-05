/**
 * 스냅샷 조립 — 홈 화면이 한 번의 요청으로 필요한 모든 섹션을 받는다.
 *
 *  - 섹션마다 TTL 이 다르다 (SECTION_TTL). 캐시 계층이 갱신 주기를 분리한다.
 *  - 한 섹션이 실패해도 다른 섹션은 정상 표시된다 (부분 오류).
 *  - 값 검증에 실패하면 임의 보정하지 않고 해당 항목만 결측/오류 처리한다.
 */

import { SECTION_STALE_AFTER, SECTION_TTL } from './config';
import { swr } from './cache';
import { getAdapter } from './adapters/registry';
import type { AdapterContext } from './adapters/types';
import { computeFng } from './fng/engine';
import { FORMULA_VERSION } from './fng/definitions';
import { buildSummary } from './summary';
import { buildRiskDigest } from './risk';
import { buildRegimeDigest, regimeMeta } from './regime';
import { getAllSessions } from '@/lib/marketHours';
import { kstDateKey } from '@/lib/format';
import { ValidationCollector, sanitizeSeries, score100 } from '@/lib/validate';
import type {
  DemoScenario,
  FngScore,
  MarketId,
  Meta,
  Quote,
  Section,
  SectionKey,
  SectionStatus,
  Snapshot,
  SnapshotSections,
} from '@/types';
import { INDEX_MARKET_IDS, MARKET_IDS } from '@/types';

/**
 * 홈 스냅샷이 만드는 히스토리 길이.
 * 사이클의 장기 창이 250일이라 그보다 길어야 한다. (상세 화면은 별도 라우트에서 더 길게 계산)
 */
const HOME_HISTORY_DAYS = 270;

function nowMeta(now: Date, sources: Meta['sources'] = []): Meta {
  return {
    asOf: now.toISOString(),
    fetchedAt: now.toISOString(),
    freshness: 'live',
    sources,
  };
}

/**
 * "오래된 데이터" 판정.
 *
 * 기준은 asOf 가 아니라 fetchedAt 이다. 제공사 계약상 15~20분 지연된 시세는
 * 정상 동작이지 오래된 데이터가 아니기 때문이다. 지연 자체는 별도 배지로 알린다.
 * 다만 asOf 가 지연 시간보다 훨씬 뒤처지면 실제로 갱신이 멈춘 것으로 본다.
 */
function ageStatus(meta: Meta, key: SectionKey, now: Date): SectionStatus | null {
  const fetchedAt = Date.parse(meta.fetchedAt);
  if (!Number.isNaN(fetchedAt) && now.getTime() - fetchedAt > SECTION_STALE_AFTER[key]) return 'stale';

  const asOf = Date.parse(meta.asOf);
  if (Number.isNaN(asOf)) return null;
  const declaredDelayMs = (meta.sources[0]?.delayMinutes ?? 0) * 60_000;
  const excessAge = now.getTime() - asOf - declaredDelayMs;
  return excessAge > SECTION_STALE_AFTER[key] ? 'stale' : null;
}

/** 섹션 하나를 만들면서 실패를 격리한다. */
async function section<T>(
  key: SectionKey,
  cacheKey: string,
  loader: () => Promise<{ data: T; meta: Meta; notes?: string[] }>,
  now: Date,
  isEmpty: (data: T) => boolean,
): Promise<Section<T>> {
  try {
    const result = await swr(cacheKey, loader, { ttlMs: SECTION_TTL[key] });
    const { data, meta, notes } = result.value;
    const mergedMeta: Meta = {
      ...meta,
      ...(notes && notes.length ? { notes: [...(meta.notes ?? []), ...notes] } : {}),
    };

    let status: SectionStatus = 'ok';
    if (isEmpty(data)) status = 'empty';
    // TTL 을 막 넘겨 백그라운드 갱신 중인 값은 "오래된 데이터"가 아니다.
    // 실제로 기준 시각이 뒤처졌거나(ageStatus), 갱신이 실패해 옛 값을 계속 쓰는 경우만 stale 로 본다.
    else if (ageStatus(mergedMeta, key, now) === 'stale' || (result.stale && result.error)) status = 'stale';
    else if (mergedMeta.notes && mergedMeta.notes.length > 0) status = 'partial';

    return {
      status,
      data,
      meta: mergedMeta,
      ...(result.error ? { error: `최신 갱신 실패 — 마지막 정상 데이터를 표시합니다. (${result.error})` } : {}),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: 'error',
      data: null,
      meta: nowMeta(now),
      error: message,
    };
  }
}

/* ------------------------------------------------------------------ */

export interface SnapshotOptions {
  scenario: DemoScenario;
  now?: Date;
}

export async function buildSnapshot({ scenario, now = new Date() }: SnapshotOptions): Promise<Snapshot> {
  const { adapter, reason } = getAdapter();
  const mode = adapter.mode;
  const ctx: AdapterContext = { now, scenario };
  const dayKey = kstDateKey(now);
  const ns = `${mode}:${scenario}:${dayKey}`;

  /* -------- 전체 오류 시나리오 -------- */
  if (mode === 'DEMO' && scenario === 'error') {
    return {
      mode,
      scenario,
      generatedAt: now.toISOString(),
      lastFullUpdate: now.toISOString(),
      usdKrw: null,
      formulaVersion: FORMULA_VERSION,
      sections: errorSections(now, '전체 오류 시나리오(DEMO): 스냅샷 조립에 실패했습니다.'),
      fatalError: 'DEMO 전체 오류 시나리오입니다. 실제 장애 상황의 화면을 재현합니다.',
    };
  }

  /* -------- 로딩 시나리오 -------- */
  if (mode === 'DEMO' && scenario === 'loading') {
    return {
      mode,
      scenario,
      generatedAt: now.toISOString(),
      lastFullUpdate: now.toISOString(),
      usdKrw: null,
      formulaVersion: FORMULA_VERSION,
      sections: loadingSections(now),
    };
  }

  /* -------- 환율 (통화 전환에 필요) -------- */
  let usdKrw: number | null = null;
  try {
    const fx = await swr(
      `${ns}:usdkrw`,
      async () => adapter.getUsdKrw(ctx),
      { ttlMs: SECTION_TTL.quotes },
    );
    usdKrw = fx.value;
  } catch {
    usdKrw = null;
  }

  /* -------- 세션 -------- */
  const sessions = await section(
    'sessions',
    `${ns}:sessions:${Math.floor(now.getTime() / 10_000)}`,
    async () => ({ data: getAllSessions(now), meta: nowMeta(now) }),
    now,
    (d) => d.length === 0,
  );

  /* -------- 시세 -------- */
  const quotes = await section(
    'quotes',
    `${ns}:quotes`,
    async () => {
      const c = new ValidationCollector();
      const byMarket = {} as Record<MarketId, Quote[]>;
      let latestMeta: Meta | null = null;
      // 시세는 세 묶음 모두 받는다 — 한국은 점수를 내지 않지만 KOSPI·KOSDAQ 은 지수 화면에 남는다
      for (const m of INDEX_MARKET_IDS) {
        const list = await adapter.getQuotes(m, ctx);
        byMarket[m] = list.map((q) => validateQuote(q, c));
        if (list[0]) latestMeta = list[0].meta;
      }
      return {
        data: byMarket,
        meta: latestMeta ?? nowMeta(now),
        notes: c.messages(),
      };
    },
    now,
    (d) => INDEX_MARKET_IDS.every((m) => (d[m] ?? []).length === 0),
  );

  /* -------- Fear & Greed -------- */
  const fng = await section(
    'fng',
    `${ns}:fng`,
    async () => {
      const c = new ValidationCollector();
      const scores: FngScore[] = [];
      let meta: Meta = nowMeta(now);
      for (const m of MARKET_IDS) {
        const input = await adapter.getFngInput(m, ctx);
        const sourceList = Object.values(input.sources)[0] ?? [];
        meta = {
          asOf: now.toISOString(),
          fetchedAt: now.toISOString(),
          freshness: scenario === 'stale' ? 'stale' : 'delayed',
          sources: sourceList,
        };
        if (!input.dates.length || Object.keys(input.metrics).length === 0) {
          scores.push(emptyScore(m, meta, '구성 지표 데이터를 받지 못했습니다.'));
          continue;
        }
        const { latest } = computeFng(input, {
          historyDays: HOME_HISTORY_DAYS,
          meta,
          computedAt: now.toISOString(),
        });
        // 점수 범위 재검증 — 범위를 벗어나면 보정하지 않고 산출 불가로 처리
        if (latest.score !== null && score100(latest.score, `fng.${m}.score`, c) === null) {
          latest.score = null;
          latest.stage = null;
          latest.unavailableReason = '산출된 점수가 허용 범위를 벗어나 표시하지 않습니다.';
        }
        scores.push(latest);
      }
      return { data: scores, meta, notes: c.messages() };
    },
    now,
    /*
     * 카드가 서 있어도 **점수가 하나도 없으면 빈 섹션**이다.
     * 예전에는 배열 길이만 봤더니, 제공사가 전부 막혀 두 카드가 다 '산출 불가' 인데도
     * 섹션 배지는 초록불(ok)이었다. 카드가 산출 불가라고 말하는 위에서 배지가
     * 정상이라고 말하면 둘 중 하나는 거짓말이다.
     */
    (d) => d.length === 0 || d.every((f) => f.score === null),
  );

  /* -------- 투자자 수급 -------- */
  const flows = await section(
    'flows',
    `${ns}:flows`,
    async () => {
      const f = await adapter.getFlows(ctx);
      return { data: f, meta: f.meta };
    },
    now,
    (d) => d.foreign === null && d.institution === null && d.individual === null,
  );

  /* -------- 거시 지표 -------- */
  const macro = await section(
    'macro',
    `${ns}:macro`,
    async () => {
      const list = await adapter.getMacro(ctx);
      return { data: list, meta: list[0]?.meta ?? nowMeta(now) };
    },
    now,
    (d) => d.length === 0,
  );

  /* -------- 생활 속 경제 이야기 -------- */
  const basics = await section(
    'basics',
    `${ns}:basics`,
    async () => {
      const list = await adapter.getBasics(ctx);
      return { data: list, meta: list[0]?.meta ?? nowMeta(now) };
    },
    now,
    (d) => d.length === 0,
  );

  /* -------- 예측시장 -------- */
  /* 계속 바뀌는 값이라 TTL 이 짧다. 여기서 실패해도 다른 섹션은 그대로 나온다. */
  const prediction = await section(
    'prediction',
    `${ns}:prediction`,
    async () => {
      const d = await adapter.getPrediction(ctx);
      return { data: d, meta: d.meta };
    },
    now,
    (d) => d.markets.length === 0,
  );

  /* -------- 캘린더 -------- */
  const calendar = await section(
    'calendar',
    `${ns}:calendar`,
    async () => {
      const list = await adapter.getCalendar(ctx);
      return { data: list, meta: nowMeta(now, list[0] ? [list[0].source] : []) };
    },
    now,
    (d) => d.length === 0,
  );

  /* -------- 국면 전광판 -------- */
  /* 20년 분포를 다시 만드는 계산이라 TTL 이 길다. 실패해도 다른 섹션은 그대로 나온다. */
  const regime = await section(
    'regime',
    `${ns}:regime`,
    async () => {
      const { series, sources } = await adapter.getRegimeSeries(ctx);
      const digest = buildRegimeDigest(series, sources, now);
      return { data: digest, meta: regimeMeta(digest, now) };
    },
    now,
    (d) => d.board.score === null && d.history.length === 0,
  );

  /* -------- 뉴스 -------- */
  const news = await section(
    'news',
    `${ns}:news`,
    async () => {
      const list = await adapter.getNews(ctx);
      return { data: list, meta: nowMeta(now) };
    },
    now,
    (d) => d.length === 0,
  );

  /* -------- 시장 위험 신호등 -------- */
  const flatQuotes: Quote[] = quotes.data ? INDEX_MARKET_IDS.flatMap((m) => quotes.data?.[m] ?? []) : [];
  const riskData = buildRiskDigest(flatQuotes, macro.data ?? [], now, macro.meta);
  const risk: Section<typeof riskData> = {
    status:
      riskData.availableCount === 0
        ? 'empty'
        : riskData.availableCount < riskData.indicators.length
          ? 'partial'
          : 'ok',
    data: riskData,
    // 위험 지표는 매 요청마다 현재 시세로 다시 계산한다. 원본 데이터의 기준 시각(asOf)은
    // 그대로 물려받되, 수집 시각은 지금으로 둔다 (macro 캐시 나이를 상속하면 stale 오판이 난다).
    meta: { ...macro.meta, fetchedAt: now.toISOString() },
  };

  /* -------- 오늘의 시장 요약 -------- */
  const summaryData = buildSummary(fng.data ?? [], flatQuotes, macro.data ?? [], now);
  const summary: Section<typeof summaryData> = {
    status: summaryData.insufficient ? 'partial' : 'ok',
    data: summaryData,
    meta: nowMeta(now),
  };

  const sections: SnapshotSections = { sessions, fng, quotes, flows, macro, basics, prediction, risk, regime, calendar, news, summary };

  const fetchedTimes = Object.values(sections)
    .map((s) => Date.parse((s as Section<unknown>).meta.fetchedAt))
    .filter((t) => Number.isFinite(t));
  const lastFullUpdate = fetchedTimes.length ? new Date(Math.min(...fetchedTimes)).toISOString() : now.toISOString();

  return {
    mode,
    scenario: mode === 'DEMO' ? scenario : null,
    generatedAt: now.toISOString(),
    lastFullUpdate,
    usdKrw,
    formulaVersion: FORMULA_VERSION,
    sections,
    ...(mode === 'LIVE' && reason ? {} : {}),
  };
}

/* ------------------------------------------------------------------ */

function validateQuote(q: Quote, c: ValidationCollector): Quote {
  const path = `quote.${q.id}`;
  const spark = sanitizeSeries(q.spark, `${path}.spark`, c);
  const priceOk = q.price === null || Number.isFinite(q.price);
  if (!priceOk) c.add(`${path}.price`, '유효하지 않은 가격 — 결측 처리');
  return {
    ...q,
    price: priceOk ? q.price : null,
    change: Number.isFinite(q.change as number) ? q.change : null,
    changePct: Number.isFinite(q.changePct as number) ? q.changePct : null,
    spark,
    ...(priceOk ? {} : { unavailableReason: '유효하지 않은 값이 수신되어 표시하지 않습니다.' }),
  };
}

function emptyScore(market: MarketId, meta: Meta, reason: string): FngScore {
  return {
    market,
    score: null,
    stage: null,
    unavailableReason: reason,
    deltaDay: null,
    deltaWeek: null,
    deltaMonth: null,
    spark: [],
    coverage: 0,
    freshnessScore: 0,
    confidence: 'low',
    confidenceReason: '데이터 충족률 0% — 산출 불가',
    formulaVersion: FORMULA_VERSION,
    computedAt: meta.fetchedAt,
    lookbackDays: 0,
    components: [],
    topPositive: null,
    topNegative: null,
    cycle: {
      market,
      score: null,
      ma20: null,
      slope: null,
      phase: {
        id: 'unknown',
        label: '판단 불가',
        levelLabel: '수준 정보 없음',
        directionLabel: '방향 정보 없음',
        description: '점수를 산출하지 못해 국면을 판단할 수 없습니다.',
      },
      horizons: [],
    },
    meta,
  };
}

function blankSection<T>(now: Date, status: SectionStatus, error?: string): Section<T> {
  return { status, data: null, meta: nowMeta(now), ...(error ? { error } : {}) };
}

function errorSections(now: Date, message: string): SnapshotSections {
  return {
    sessions: blankSection(now, 'error', message),
    fng: blankSection(now, 'error', message),
    quotes: blankSection(now, 'error', message),
    flows: blankSection(now, 'error', message),
    macro: blankSection(now, 'error', message),
    basics: blankSection(now, 'error', message),
    prediction: blankSection(now, 'error', message),
    risk: blankSection(now, 'error', message),
    regime: blankSection(now, 'error', message),
    calendar: blankSection(now, 'error', message),
    news: blankSection(now, 'error', message),
    summary: blankSection(now, 'error', message),
  };
}

function loadingSections(now: Date): SnapshotSections {
  return {
    sessions: { status: 'ok', data: getAllSessions(now), meta: nowMeta(now) },
    fng: blankSection(now, 'loading'),
    quotes: blankSection(now, 'loading'),
    flows: blankSection(now, 'loading'),
    macro: blankSection(now, 'loading'),
    basics: blankSection(now, 'loading'),
    prediction: blankSection(now, 'loading'),
    risk: blankSection(now, 'loading'),
    regime: blankSection(now, 'loading'),
    calendar: blankSection(now, 'loading'),
    news: blankSection(now, 'loading'),
    summary: blankSection(now, 'loading'),
  };
}

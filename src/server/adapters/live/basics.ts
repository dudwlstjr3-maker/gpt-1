/**
 * 생활 경제 지수 실데이터 — 세계은행 + 이코노미스트.
 *
 * 열한 개 가운데 무료로 닿는 일곱 개만 만든다 (2026-11-26 가계부채 비율 · 합계출산율 추가).
 *   · 합계출산율   세계은행 (키 불필요)
 *   · 가계부채 비율 IMF 세계부채 데이터베이스 — FRED 가 다시 싣는 계열. FRED 키가 있을 때만
 * 못 닿는 것을 DEMO 로만 보여 주면 기대만 만들고, 값을 지어내면 거짓말이 된다.
 *   · 엥겔계수   통계청 가계동향조사 — 공개 API 가 없다
 *   · PIR        기관마다 정의가 달라 한 숫자로 못 모은다
 *   · OECD 경기선행지수 · 소비자심리지수  OECD SDMX · 한국은행 ECOS 연결이 필요하다
 */

import type { BasicComparison, DataSource, EconomyBasic, SeriesPoint } from '@/types';
import {
  BIGMAC_COUNTRIES,
  BIGMAC_SOURCE,
  fetchBigMac,
  type BigMacConfig,
} from './providers/bigmac';
import {
  WB_COUNTRIES,
  WORLDBANK_SOURCE,
  fetchIndicator,
  latestOf,
  previousOf,
  type WorldBankConfig,
} from './providers/worldbank';
import { fetchSeries, type FredConfig, type FredSeriesKey } from './providers/fred';

const WB: DataSource = { ...WORLDBANK_SOURCE };
const BM: DataSource = { ...BIGMAC_SOURCE };
/** 가계부채 비율 — IMF 가 집계하고 FRED 가 다시 싣는다. 출처는 집계한 곳을 앞에 쓴다. */
const IMF_VIA_FRED: DataSource = {
  name: '국제통화기금(IMF) · FRED 경유',
  url: 'https://fred.stlouisfed.org/series/HDTGPDKRA163N',
  delayMinutes: 0,
  terms: 'IMF 세계부채 데이터베이스. 연 1회 갱신되며 나라마다 최신 연도가 다를 수 있습니다.',
};

function meta(asOf: number | null, fetchedAt: string, source: DataSource) {
  return {
    asOf: asOf ? new Date(asOf).toISOString() : fetchedAt,
    fetchedAt,
    freshness: 'live' as const,
    sources: [source],
  };
}

function yearLabel(t: number | null): string {
  return t ? `${new Date(t).getUTCFullYear()}년` : '기준 시점 없음';
}

export interface BasicsDeps {
  wb: WorldBankConfig;
  bigmac: BigMacConfig;
  /** 가계부채 비율용. 키가 없으면 null — 그 지표만 빠지고 나머지는 그대로 나온다 */
  fred: FredConfig | null;
  now: Date;
}

export async function buildLiveBasics(deps: BasicsDeps): Promise<EconomyBasic[]> {
  const { wb, bigmac, fred, now } = deps;
  const fetchedAt = now.toISOString();
  const out: EconomyBasic[] = [];

  const soft = async <T>(run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch {
      return null;
    }
  };

  /* ---------------- 세계은행 ---------------- */
  const [gdp, gini, infl, unemp, ppp, fx, tfr] = await Promise.all([
    soft(() => fetchIndicator(wb, 'per_capita_gdp', 25)),
    soft(() => fetchIndicator(wb, 'gini', 25)),
    soft(() => fetchIndicator(wb, 'inflation', 25)),
    soft(() => fetchIndicator(wb, 'unemployment', 25)),
    soft(() => fetchIndicator(wb, 'ppp', 25)),
    soft(() => fetchIndicator(wb, 'fx', 25)),
    soft(() => fetchIndicator(wb, 'fertility', 25)),
  ]);

  /* 가계부채 비율 — 나라마다 FRED 계열이 따로라 네 번 받는다. 못 받은 나라는 빈 칸으로 둔다. */
  const HH_DEBT: Record<string, FredSeriesKey> = { KR: 'hh_debt_kr', CN: 'hh_debt_cn', JP: 'hh_debt_jp', US: 'hh_debt_us' };
  const hhDebt = fred
    ? await (async () => {
        const rows = await Promise.all(
          WB_COUNTRIES.map(async (c) => [c.code, (await soft(() => fetchSeries(fred, HH_DEBT[c.code], { start: '2000-01-01' }))) ?? []] as const),
        );
        return new Map<string, SeriesPoint[]>(rows.map(([code, pts]) => [code, [...pts]]));
      })()
    : null;

  /** 네 나라 비교값을 만든다. 한국이 대표값이 된다. */
  const build = (
    id: string,
    /** 이름을 풀어 쓴 쉬운 말 — 이름 아래 작게 붙는다 */
    plainName: string,
    /** 이 지표의 이름 — 카드 제목 자리에 크게 선다 */
    name: string,
    data: Map<string, SeriesPoint[]> | null,
    opts: {
      precision: number;
      suffix: string;
      transform?: (v: number) => number;
      reading: (kr: number, year: string) => string;
      caution?: string;
      comparisonNote?: string;
      sameScale?: boolean;
      /** 세계은행이 아닌 곳에서 받은 값이면 그 출처 */
      source?: DataSource;
      asOfNote?: string;
    },
  ): EconomyBasic | null => {
    if (!data) return null;
    const tf = opts.transform ?? ((v: number) => v);
    const kr = data.get('KR') ?? [];
    const last = latestOf(kr);
    if (!last) return null;

    const comparisons: BasicComparison[] = WB_COUNTRIES.map((c) => {
      const p = latestOf(data.get(c.code));
      return {
        label: c.label,
        value: p ? tf(p.v) : null,
        precision: opts.precision,
        suffix: opts.suffix,
        // 한국이 이 화면의 기준점이다. 굵게 그려지고 막대도 강조색을 받는다.
        ...(c.code === 'KR' ? { primary: true } : {}),
      };
    });

    /*
     * 세계은행은 나라마다 마지막 발표 연도가 다르다. 한국은 2024년인데 중국은
     * 2021년인 식이다. 그걸 말하지 않고 네 숫자를 나란히 놓으면 읽는 사람은
     * 같은 해라고 믿는다 — 비교표에서 가장 조용하게 틀리는 방식이다.
     */
    const stamps = WB_COUNTRIES.map((c) => {
      const p = latestOf(data.get(c.code));
      return { label: c.label, year: p ? new Date(p.t).getUTCFullYear() : null };
    });
    const distinct = new Set(stamps.map((x) => x.year));
    const yearNote =
      distinct.size > 1
        ? `기준 연도가 나라마다 다릅니다 — ${stamps
            .map((x) => `${x.label} ${x.year ?? '없음'}`)
            .join(' · ')}.`
        : undefined;
    const comparisonNote = [yearNote, opts.comparisonNote].filter(Boolean).join(' ') || undefined;

    const prev = previousOf(kr);
    return {
      id,
      name,
      plainName,
      value: tf(last.v),
      previous: prev ? tf(prev.v) : null,
      precision: opts.precision,
      suffix: opts.suffix,
      reading: opts.reading(tf(last.v), yearLabel(last.t)),
      comparisons,
      ...(comparisonNote ? { comparisonNote } : {}),
      ...(opts.sameScale === false ? { sameScale: false } : {}),
      history: kr.map((p) => ({ t: p.t, v: tf(p.v) })),
      historyByCountry: WB_COUNTRIES.map((c) => ({
        label: c.label,
        points: (data.get(c.code) ?? []).map((p) => ({ t: p.t, v: tf(p.v) })),
      })),
      asOfLabel: `${yearLabel(last.t)} 기준 · ${opts.asOfNote ?? '연 1회 발표'}`,
      official: true,
      ...(opts.caution ? { officialNote: opts.caution } : {}),
      meta: meta(last.t, fetchedAt, opts.source ?? WB),
    } satisfies EconomyBasic;
  };

  const gdpItem = build('per_capita_gdp', '국민 한 사람 몫의 생산', '1인당 GDP · GDP per capita', gdp, {
    precision: 0,
    suffix: '달러',
    reading: (v, y) => `${y} 한국은 1인당 약 ${Math.round(v).toLocaleString('ko-KR')}달러입니다. 나라가 만든 가치를 인구로 나눈 값이라 내 통장에 들어오는 돈은 아닙니다.`,
  });
  if (gdpItem) out.push(gdpItem);

  const giniItem = build('gini', '소득이 얼마나 고르게 나뉘는지', '지니계수 · Gini coefficient', gini, {
    precision: 3,
    suffix: '',
    transform: (v) => v / 100, // 세계은행은 0~100 으로 준다
    reading: (v, y) => `${y} 한국은 ${v.toFixed(3)} 입니다. 0 이면 모두가 똑같이 벌고 1 이면 한 사람이 전부 가져갑니다.`,
    caution: '나라마다 조사 방식과 조사 연도가 달라 소수점 둘째 자리 차이로 순위를 매기는 것은 뜻이 없습니다.',
  });
  if (giniItem) out.push(giniItem);

  /* 미저리 지수 = 물가상승률 + 실업률. 두 계열을 같은 해끼리 더한다. */
  if (infl && unemp) {
    const sumByCountry = new Map<string, SeriesPoint[]>();
    for (const c of WB_COUNTRIES) {
      const a = new Map((infl.get(c.code) ?? []).map((p) => [p.t, p.v]));
      const b = new Map((unemp.get(c.code) ?? []).map((p) => [p.t, p.v]));
      const merged: SeriesPoint[] = [];
      for (const [t, v] of a) {
        const u = b.get(t);
        if (u !== undefined) merged.push({ t, v: v + u });
      }
      merged.sort((x, y) => x.t - y.t);
      sumByCountry.set(c.code, merged);
    }
    const krLast = latestOf(sumByCountry.get('KR'));
    if (krLast) {
      const krInfl = (infl.get('KR') ?? []).find((p) => p.t === krLast.t)?.v ?? null;
      const krUn = (unemp.get('KR') ?? []).find((p) => p.t === krLast.t)?.v ?? null;
      const item = build('misery', '물가와 실업을 더한 살림 고통 지수', '미저리 지수 · Misery Index', sumByCountry, {
        precision: 1,
        suffix: '',
        reading: (v, y) =>
          krInfl !== null && krUn !== null
            ? `${y} 한국은 물가상승률 ${krInfl.toFixed(1)}% 와 실업률 ${krUn.toFixed(1)}% 를 더해 ${v.toFixed(1)} 입니다. 절대 기준이 있는 숫자가 아니라 예년이나 다른 나라와 견줄 때 씁니다.`
            : `${y} 한국은 ${v.toFixed(1)} 입니다. 물가상승률과 실업률을 더한 값입니다.`,
        caution: '성격이 다른 두 비율을 가중치 없이 더한 값입니다. 물가 1%p 와 실업률 1%p 가 똑같이 아프지는 않습니다.',
      });
      if (item) out.push(item);
    }
  }

  /* 가계부채 비율 · 합계출산율 (2026-11-26 추가) — 묶음 순서대로 미저리 지수 다음 */
  const debtItem = build('household_debt', '가계가 진 빚이 경제 규모의 몇 %', '가계부채 비율 · Household debt to GDP', hhDebt, {
    precision: 1,
    suffix: '%',
    reading: (v, y) => `${y} 한국은 GDP 의 ${v.toFixed(1)}% 입니다. 나라가 1년 동안 만든 가치의 ${Math.round(v)}% 만큼을 가계가 빚지고 있다는 뜻입니다.`,
    caution: '나라 전체 평균이라 빚이 누구에게 몰려 있는지는 보여주지 않습니다. 한국은 전세보증금이 빚으로 잡히지 않습니다.',
    comparisonNote: '네 나라 모두 그 나라 GDP 를 100% 로 놓은 비율이라 같은 잣대입니다.',
    source: IMF_VIA_FRED,
    asOfNote: '연 1회 · IMF 집계',
  });
  if (debtItem) out.push(debtItem);

  const tfrItem = build('fertility', '여성 한 명이 평생 낳을 아이 수', '합계출산율 · Total fertility rate', tfr, {
    precision: 2,
    suffix: '명',
    reading: (v, y) =>
      v < 1
        ? `${y} 한국은 ${v.toFixed(2)}명입니다. 인구가 유지되려면 약 2.1명이 필요한데, 1명 아래라 한 세대마다 아이 세대가 부모 세대의 절반 아래로 줄어드는 수준입니다.`
        : `${y} 한국은 ${v.toFixed(2)}명입니다. 인구가 유지되려면 약 2.1명이 필요합니다.`,
    caution: '그해의 나이별 출산율로 계산한 가상의 숫자입니다. 한 해의 반등을 흐름이 바뀌었다고 단정할 수 없습니다.',
  });
  if (tfrItem) out.push(tfrItem);

  /* 구매력평가 환율 괴리 = (PPP 환율 / 시장 환율 - 1) × 100 */
  if (ppp && fx) {
    const gapByCountry = new Map<string, SeriesPoint[]>();
    for (const c of WB_COUNTRIES) {
      const a = new Map((ppp.get(c.code) ?? []).map((p) => [p.t, p.v]));
      const b = new Map((fx.get(c.code) ?? []).map((p) => [p.t, p.v]));
      const merged: SeriesPoint[] = [];
      for (const [t, pv] of a) {
        const mv = b.get(t);
        if (mv !== undefined && mv !== 0) merged.push({ t, v: (pv / mv - 1) * 100 });
      }
      merged.sort((x, y) => x.t - y.t);
      gapByCountry.set(c.code, merged);
    }
    const item = build('ppp_gap', '물가로 따진 환율과 실제 환율의 차이', '구매력평가(PPP) 환율 괴리 · PPP exchange rate gap', gapByCountry, {
      precision: 1,
      suffix: '%',
      reading: (v, y) =>
        v < 0
          ? `${y} 한국 원화는 물가로 계산한 적정 환율보다 ${Math.abs(v).toFixed(1)}% 싸게 거래되고 있습니다.`
          : `${y} 한국 원화는 물가로 계산한 적정 환율보다 ${v.toFixed(1)}% 비싸게 거래되고 있습니다.`,
      caution: 'PPP 는 "언젠가 이쯤 갈 것"이라는 예측이 아닙니다. 수십 년째 벌어져 있는 나라도 많습니다.',
      comparisonNote: '달러를 기준(0%)으로 놓은 값입니다. 마이너스면 그만큼 싸다는 뜻입니다.',
    });
    if (item) out.push(item);
  }

  /* ---------------- 이코노미스트 빅맥지수 ---------------- */
  const bm = await soft(() => fetchBigMac(bigmac));
  if (bm) {
    const kr = bm.byCountry.get('KOR');
    const krHist = bm.historyByCountry.get('KOR') ?? [];
    if (kr && kr.vsUsdPct !== null) {
      const asOf = Date.parse(`${kr.date}T00:00:00Z`);
      out.push({
        id: 'bigmac',
        name: '빅맥지수 · Big Mac Index',
        plainName: '햄버거 값으로 따져 본 원화의 값어치',
        value: kr.vsUsdPct,
        previous: krHist.length > 1 ? krHist[krHist.length - 2].v : null,
        precision: 1,
        suffix: '%',
        reading:
          `한국 빅맥은 ${kr.localPrice?.toLocaleString('ko-KR')}원, 달러로 바꾸면 ${kr.dollarPrice?.toFixed(2)}달러입니다. ` +
          `미국 값과 견주면 원화가 ${Math.abs(kr.vsUsdPct).toFixed(1)}% ${kr.vsUsdPct < 0 ? '싸게' : '비싸게'} 거래되고 있다는 뜻입니다.`,
        comparisons: BIGMAC_COUNTRIES.map((c) => {
          const row = bm.byCountry.get(c.iso);
          return {
            label: c.label,
            value: row?.vsUsdPct ?? null,
            precision: 1,
            suffix: '%',
            ...(c.iso === 'KOR' ? { primary: true } : {}),
          };
        }),
        comparisonNote:
          '네 숫자 모두 달러를 기준(0%)으로 놓고 각 통화가 몇 % 어긋나 있는지입니다. 마이너스면 그만큼 싸다는 뜻입니다.',
        history: krHist,
        historyByCountry: BIGMAC_COUNTRIES.map((c) => ({
          label: c.label,
          points: bm.historyByCountry.get(c.iso) ?? [],
        })),
        asOfLabel: `${kr.date.slice(0, 7).replace('-', '년 ')}월 발표 · 연 2회`,
        official: true,
        officialNote:
          '재미로 보라고 만든 지수입니다. 임대료·인건비·세금이 나라마다 달라 원래 싼 나라가 있습니다.',
        meta: meta(asOf, fetchedAt, BM),
      });
    }
  }

  return out;
}

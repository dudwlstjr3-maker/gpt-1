/**
 * 시장 위험 신호등.
 *
 * 세 시장을 관통하는 핵심 위험 게이지 7개만 골라, 현재 값이 어느 구간에 있는지와
 * 그것이 무슨 뜻인지를 한 화면에서 읽을 수 있게 만든다.
 *
 * 설계 원칙
 *  - 새 데이터 소스를 추가하지 않는다. 이미 수집한 시세·거시 지표에서 파생한다.
 *  - 구간(band) 기준은 코드에 명시해 두고 화면에도 그대로 보여준다. 숨은 규칙을 두지 않는다.
 *  - 값이 없으면 0 이 아니라 "산출 불가"로 두고 사유를 남긴다.
 *  - 해석 문구는 실제 값이 속한 구간에서만 나온다. 없는 근거로 원인을 만들지 않는다.
 */

import { clamp, round } from '@/lib/stats';
import { buildRiskHeadline } from '@/lib/riskHeadline';
import type {
  MacroIndicator,
  MarketId,
  Meta,
  Quote,
  RiskBand,
  RiskDigest,
  RiskIndicator,
  RiskLevel,
  SeriesPoint,
  Unit,
} from '@/types';

interface RiskDef {
  id: string;
  name: string;
  shortName: string;
  scope: MarketId | 'global';
  /** 값을 어디서 가져올지 */
  source: { kind: 'quote'; id: string } | { kind: 'macro'; id: string };
  unit: Unit;
  precision: number;
  suffix: string;
  direction: 'higher_is_riskier' | 'lower_is_riskier';
  scaleMin: number;
  scaleMax: number;
  bands: RiskBand[];
  why: string;
  /** 이 지표가 오르면 시장에서 무슨 일이 벌어지는가 (초보자용) */
  whenUp: string;
  /** 내리면 무슨 일이 벌어지는가 */
  whenDown: string;
  /** 구간별 해석 문구 */
  readings: Record<RiskLevel, string>;
}

const band = (level: RiskLevel, from: number | null, to: number | null, label: string): RiskBand => ({
  level,
  from,
  to,
  label,
});

/* ------------------------------------------------------------------ */
/* 신호등 지표 정의                                                             */
/* ------------------------------------------------------------------ */

export const RISK_SEVEN: RiskDef[] = [
  {
    id: 'vix',
    name: '미국 공포지수 VIX',
    shortName: 'VIX',
    scope: 'us',
    source: { kind: 'quote', id: 'vix' },
    unit: 'point',
    precision: 2,
    suffix: '',
    direction: 'higher_is_riskier',
    scaleMin: 10,
    scaleMax: 40,
    bands: [
      band('calm', null, 15, '15 미만'),
      band('normal', 15, 20, '15~20'),
      band('watch', 20, 28, '20~28'),
      band('alert', 28, null, '28 이상'),
    ],
    why: 'S&P 500 옵션 가격에서 뽑아낸 향후 30일 예상 변동성입니다. 시장이 앞으로 얼마나 흔들릴 것으로 보는지를 나타냅니다.',
    whenUp: '앞으로 크게 흔들릴 거라 보는 사람이 늘었다는 뜻입니다. 보험(풋옵션)을 사려는 수요가 몰릴 때 오릅니다. 주가가 급하게 빠지는 날 같이 뜁니다.',
    whenDown: '큰 사건이 없을 거라고 보는 쪽이 많다는 뜻입니다. 대체로 주가가 완만하게 오르는 구간에서 낮게 유지됩니다. 다만 너무 낮으면 방심 신호로 보는 시각도 있습니다.',
    readings: {
      calm: '변동성 기대가 낮은 구간입니다. 과거 이 구간에서는 주가 흐름이 비교적 완만했습니다.',
      normal: '장기 평균 부근입니다. 특별한 변동성 신호는 나타나지 않았습니다.',
      watch: '평균을 웃도는 구간입니다. 헤지 수요가 늘어난 상태로 볼 수 있습니다.',
      alert: '급등 구간입니다. 과거 이 수준에서는 지수 낙폭이 커지는 경우가 많았습니다.',
    },
  },
  {
    id: 'vkospi',
    name: '한국 공포지수 VKOSPI',
    shortName: 'VKOSPI',
    scope: 'kr',
    source: { kind: 'quote', id: 'vkospi' },
    unit: 'point',
    precision: 2,
    suffix: '',
    direction: 'higher_is_riskier',
    scaleMin: 10,
    scaleMax: 35,
    bands: [
      band('calm', null, 15, '15 미만'),
      band('normal', 15, 19, '15~19'),
      band('watch', 19, 25, '19~25'),
      band('alert', 25, null, '25 이상'),
    ],
    why: 'KOSPI200 옵션에서 계산한 한국판 변동성지수입니다. 국내 증시의 불안 정도를 봅니다.',
    whenUp: '국내 증시가 앞으로 크게 출렁일 거라 보는 사람이 늘었다는 뜻입니다. 코스피가 급락하는 날 같이 뜁니다.',
    whenDown: '국내 시장이 잠잠할 거라 보는 쪽이 많다는 뜻입니다. 외국인 자금이 안정적으로 들어올 때 낮게 유지되는 편입니다.',
    readings: {
      calm: '국내 변동성 기대가 낮은 구간입니다.',
      normal: '평상시 범위 안에 있습니다.',
      watch: '평균을 웃돌고 있습니다. 파생 수급에 따른 등락이 커질 수 있는 구간입니다.',
      alert: '급등 구간입니다. 지수 하락과 함께 나타나는 경우가 많습니다.',
    },
  },
  {
    id: 'hy_oas',
    name: '하이일드 신용스프레드 (정크본드)',
    shortName: '정크본드 스프레드',
    scope: 'us',
    source: { kind: 'macro', id: 'hy_oas' },
    unit: 'percent',
    precision: 2,
    suffix: '%p',
    direction: 'higher_is_riskier',
    scaleMin: 2.5,
    scaleMax: 7,
    bands: [
      band('calm', null, 3.0, '3.0%p 미만'),
      band('normal', 3.0, 3.8, '3.0~3.8%p'),
      band('watch', 3.8, 4.5, '3.8~4.5%p'),
      band('alert', 4.5, null, '4.5%p 이상'),
    ],
    why: '신용등급이 낮은 기업(정크본드)이 국채보다 얼마나 높은 금리를 물어야 하는지입니다. 벌어질수록 기업 자금 조달이 어려워졌다는 뜻입니다.',
    whenUp: '신용등급 낮은 기업이 돈을 빌리기 어려워졌다는 뜻입니다. 부도 걱정이 커질 때 벌어집니다. 주식보다 먼저 움직이는 경우가 있어 눈여겨봅니다.',
    whenDown: '위험한 기업에도 돈이 잘 돌고 있다는 뜻입니다. 투자자들이 위험을 감수할 의향이 있는 상태입니다.',
    readings: {
      calm: '기업 신용 여건이 넉넉한 구간입니다. 위험자산 선호가 강한 상태로 읽힙니다.',
      normal: '장기 평균 부근입니다. 신용 시장에서 특별한 경고는 나오지 않았습니다.',
      watch: '스프레드가 벌어지는 중입니다. 주식보다 신용 시장이 먼저 반응하는 경우가 있습니다.',
      alert: '크게 확대된 구간입니다. 과거 신용 경색 국면에서 나타난 수준입니다.',
    },
  },
  {
    id: 'us_spread_10_2',
    name: '미국 장단기 금리차 (10년-2년)',
    shortName: '장단기 금리차',
    scope: 'us',
    source: { kind: 'quote', id: 'us_spread_10_2' },
    unit: 'bp',
    precision: 1,
    suffix: 'bp',
    direction: 'lower_is_riskier',
    scaleMin: -80,
    scaleMax: 160,
    bands: [
      band('alert', null, 0, '0bp 미만 (역전)'),
      band('watch', 0, 20, '0~20bp'),
      band('normal', 20, 100, '20~100bp'),
      band('calm', 100, null, '100bp 이상'),
    ],
    why: '10년물 금리에서 2년물 금리를 뺀 값입니다. 장기금리가 단기금리보다 낮아지는 역전은 과거 경기침체에 앞서 나타난 신호였습니다.',
    whenUp: '장기금리가 단기금리보다 높아진 정상 상태로 돌아가는 중입니다. 보통 경기가 나아질 거라 보거나 금리 인하 기대가 있을 때 벌어집니다.',
    whenDown: '장기금리가 단기금리보다 낮은 \'역전\'입니다. 은행이 돈을 빌려주기 어려워지고, 과거 경기침체에 앞서 나타난 적이 많아 경고로 읽습니다.',
    readings: {
      calm: '정상적인 우상향 곡선입니다. 장기 성장 기대가 살아 있는 형태입니다.',
      normal: '정상 범위입니다. 곡선이 완만하게 우상향하고 있습니다.',
      watch: '역전 해소 직후이거나 역전 직전인 좁은 구간입니다. 방향을 지켜볼 구간입니다.',
      alert: '장단기 금리가 역전된 상태입니다. 과거 침체 국면에 앞서 나타난 형태입니다.',
    },
  },
  {
    id: 'ust10',
    name: '미국 국채 10년물 금리',
    shortName: '미국 10년물',
    scope: 'global',
    source: { kind: 'quote', id: 'ust10' },
    unit: 'percent',
    precision: 3,
    suffix: '%',
    direction: 'higher_is_riskier',
    scaleMin: 2.5,
    scaleMax: 6,
    bands: [
      band('calm', null, 3.5, '3.5% 미만'),
      band('normal', 3.5, 4.5, '3.5~4.5%'),
      band('watch', 4.5, 5.0, '4.5~5.0%'),
      band('alert', 5.0, null, '5.0% 이상'),
    ],
    why: '전 세계 자산 가격을 매길 때 기준이 되는 금리입니다. 이 금리가 오르면 주식·부동산의 밸류에이션 부담이 커집니다.',
    whenUp: '안전한 국채만 사도 이자를 더 받는다는 뜻이라, 주식·부동산이 상대적으로 덜 매력적으로 보입니다. 대출 금리도 따라 오릅니다.',
    whenDown: '국채 이자가 줄어 위험자산으로 돈이 옮겨가기 쉬워집니다. 다만 경기 침체 걱정으로 돈이 국채로 몰려서 내려가는 경우도 있어, 왜 내렸는지를 같이 봐야 합니다.',
    readings: {
      calm: '금리 부담이 크지 않은 구간입니다.',
      normal: '최근 몇 년의 통상 범위 안에 있습니다.',
      watch: '높은 편입니다. 성장주 밸류에이션에 부담이 되는 구간입니다.',
      alert: '급등 구간입니다. 과거 이 수준에서는 주식·채권이 함께 흔들린 사례가 있었습니다.',
    },
  },
  {
    id: 'usdkrw',
    name: 'USD/KRW 환율',
    shortName: '원/달러',
    scope: 'kr',
    source: { kind: 'quote', id: 'usdkrw' },
    unit: 'point',
    precision: 2,
    suffix: '원',
    direction: 'higher_is_riskier',
    scaleMin: 1200,
    scaleMax: 1500,
    bands: [
      band('calm', null, 1300, '1,300원 미만'),
      band('normal', 1300, 1380, '1,300~1,380원'),
      band('watch', 1380, 1420, '1,380~1,420원'),
      band('alert', 1420, null, '1,420원 이상'),
    ],
    why: '원화가 약해지면 외국인 자금이 빠져나가기 쉽고 수입물가도 함께 오릅니다. 한국 시장에서는 심리와 직결되는 지표입니다.',
    whenUp: '원화가 약해졌다는 뜻입니다. 수입 물가가 오르고, 외국인 투자자는 환차손 탓에 한국 주식을 팔기 쉬워집니다.',
    whenDown: '원화가 강해졌다는 뜻입니다. 수입 물가 부담이 줄고 외국인 자금이 들어오기 좋은 환경이 됩니다.',
    readings: {
      calm: '원화가 견조한 구간입니다. 외국인 수급에 우호적인 환경으로 읽힙니다.',
      normal: '최근 등락 범위 안에 있습니다.',
      watch: '원화 약세 압력이 있는 구간입니다.',
      alert: '원화 약세가 심화된 구간입니다. 외국인 순매도와 함께 나타나는 경우가 있습니다.',
    },
  },
  {
    id: 'funding',
    name: '크립토 선물 펀딩비',
    shortName: '펀딩비',
    scope: 'crypto',
    source: { kind: 'quote', id: 'funding' },
    unit: 'percent',
    precision: 4,
    suffix: '%',
    direction: 'higher_is_riskier',
    scaleMin: -0.03,
    scaleMax: 0.06,
    bands: [
      band('watch', null, 0, '0% 미만 (숏 우위)'),
      band('calm', 0, 0.01, '0~0.01%'),
      band('normal', 0.01, 0.025, '0.01~0.025%'),
      band('alert', 0.025, null, '0.025% 이상'),
    ],
    why: '무기한 선물에서 롱 포지션이 숏에게 지불하는 수수료입니다. 지나치게 높으면 레버리지가 한쪽으로 쏠렸다는 뜻이라 청산이 연쇄될 위험이 커집니다.',
    whenUp: '가격 상승에 베팅한 사람(롱)이 훨씬 많아 수수료를 물어가며 버티는 상태입니다. 한쪽으로 쏠릴수록 조금만 빠져도 강제 청산이 줄줄이 터질 수 있습니다.',
    whenDown: '하락에 베팅한 사람(숏)이 더 많다는 뜻입니다. 반대로 가격이 조금만 올라도 숏이 청산되며 급등이 나오기도 합니다.',
    readings: {
      calm: '롱·숏이 비교적 균형을 이룬 구간입니다.',
      normal: '롱이 약간 우위이지만 통상 범위입니다.',
      watch: '펀딩비가 음수입니다. 숏이 우위인 상태로, 급반등 시 숏 청산이 나올 수 있는 구간입니다.',
      alert: '롱 쏠림이 강한 구간입니다. 하락 시 연쇄 청산 위험이 커집니다.',
    },
  },
];

/* ------------------------------------------------------------------ */
/* 산출                                                                 */
/* ------------------------------------------------------------------ */

function levelOf(def: RiskDef, value: number): RiskLevel {
  for (const b of def.bands) {
    const okFrom = b.from === null || value >= b.from;
    const okTo = b.to === null || value < b.to;
    if (okFrom && okTo) return b.level;
  }
  return 'normal';
}

/** 스케일 위에서 값의 위치(0~100). 밴드 바의 마커 위치로 쓴다. */
function positionOf(def: RiskDef, value: number): number {
  const span = def.scaleMax - def.scaleMin;
  if (span <= 0) return 50;
  return clamp(round(((value - def.scaleMin) / span) * 100, 2), 0, 100);
}

export function buildRiskDigest(
  quotes: Quote[],
  macro: MacroIndicator[],
  now: Date,
  fallbackMeta: Meta,
): RiskDigest {
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const macroById = new Map(macro.map((m) => [m.id, m]));

  const indicators: RiskIndicator[] = RISK_SEVEN.map((def) => {
    let value: number | null = null;
    let previous: number | null = null;
    let change: number | null = null;
    let changePct: number | null = null;
    let spark: SeriesPoint[] = [];
    let meta = fallbackMeta;
    let unavailableReason: string | undefined;

    if (def.source.kind === 'quote') {
      const q = quoteById.get(def.source.id);
      if (!q) {
        unavailableReason = '해당 시세를 받지 못했습니다.';
      } else {
        meta = q.meta;
        value = q.price;
        change = q.change;
        changePct = q.changePct;
        previous = q.price !== null && q.change !== null ? round(q.price - q.change, 6) : null;
        spark = q.spark;
        if (value === null) unavailableReason = q.unavailableReason ?? '값을 받지 못했습니다.';
      }
    } else {
      const m = macroById.get(def.source.id);
      if (!m) {
        unavailableReason = '해당 지표를 받지 못했습니다.';
      } else {
        meta = m.meta;
        value = m.value;
        previous = m.previous;
        change = m.value !== null && m.previous !== null ? round(m.value - m.previous, 6) : null;
        changePct =
          m.value !== null && m.previous !== null && m.previous !== 0
            ? round(((m.value - m.previous) / Math.abs(m.previous)) * 100, 2)
            : null;
        spark = m.spark ?? [];
        if (value === null) unavailableReason = '최신 관측치가 없습니다.';
      }
    }

    const level: RiskLevel = value === null ? 'normal' : levelOf(def, value);

    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      scope: def.scope,
      value,
      previous,
      change,
      changePct,
      unit: def.unit,
      precision: def.precision,
      suffix: def.suffix,
      direction: def.direction,
      level,
      position: value === null ? null : positionOf(def, value),
      bands: def.bands,
      scaleMin: def.scaleMin,
      scaleMax: def.scaleMax,
      why: def.why,
      whenUp: def.whenUp,
      whenDown: def.whenDown,
      reading: value === null ? '값이 없어 해석할 수 없습니다.' : def.readings[level],
      spark,
      ...(unavailableReason ? { unavailableReason } : {}),
      meta,
    };
  });

  const available = indicators.filter((i) => i.value !== null);
  const alertCount = available.filter((i) => i.level === 'alert').length;
  const watchCount = available.filter((i) => i.level === 'watch' || i.level === 'alert').length;

  // 문장 규칙은 화면(고른 시장만 요약)과 공유한다
  const headline = buildRiskHeadline(indicators);

  return {
    indicators,
    alertCount,
    watchCount,
    availableCount: available.length,
    headline,
    generatedAt: now.toISOString(),
  };
}

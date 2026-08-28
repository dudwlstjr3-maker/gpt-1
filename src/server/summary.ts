/**
 * "오늘의 시장 요약" — 규칙 기반 생성기.
 *
 * 원칙
 *  - 최대 3줄.
 *  - 실제 수치에 근거한 사실(fact)과 해석(interpretation)을 구분해 표시한다.
 *  - 근거가 부족하면 원인을 지어내지 않고 "변화 원인을 판단할 데이터가 부족합니다"를 반환한다.
 *  - 투자 추천·매매 지시·수익 보장 표현을 쓰지 않는다.
 */

import { formatNumber, formatScore, formatSigned } from '@/lib/format';
import type { FngScore, MacroIndicator, MarketSummary, Quote, SummaryLine } from '@/types';
import { MARKET_LABEL } from '@/types';

const INSUFFICIENT_TEXT = '변화 원인을 판단할 데이터가 부족합니다.';

export function buildSummary(
  fng: FngScore[],
  quotes: Quote[],
  macro: MacroIndicator[],
  now: Date,
): MarketSummary {
  const lines: SummaryLine[] = [];

  /* ---------- 1줄: 세 시장 심리 (사실) ---------- */
  const scored = fng.filter((f) => f.score !== null);
  if (scored.length > 0) {
    const parts = scored.map((f) => {
      const delta = f.deltaDay === null ? '' : ` (전일 ${formatSigned(f.deltaDay, 1)})`;
      return `${MARKET_LABEL[f.market]} ${formatScore(f.score)}점 ${f.stage?.label ?? ''}${delta}`;
    });
    const unavailable = fng.filter((f) => f.score === null).map((f) => MARKET_LABEL[f.market]);
    const tail = unavailable.length ? ` · ${unavailable.join('·')}는 산출 불가` : '';
    lines.push({
      kind: 'fact',
      // 같은 화면 위쪽의 머리와 아래쪽 고지가 이미 "자체 산출" 이라고 말한다.
      // 이 줄의 일은 세 숫자를 늘어놓는 것이다.
      text: `심리 점수: ${parts.join(' · ')}${tail}.`,
      evidence: scored.map((f) => `fng:${f.market}`),
    });
  }

  /* ---------- 2줄: 대표 가격 움직임 (사실) ---------- */
  const pick = (id: string) => quotes.find((q) => q.id === id && q.changePct !== null);
  const headline = ['spx', 'kospi', 'btc'].map(pick).filter((q): q is Quote => Boolean(q));
  const risk = ['vix', 'usdkrw'].map(pick).filter((q): q is Quote => Boolean(q));

  if (headline.length > 0) {
    const priceText = headline
      .map((q) => `${q.name} ${formatSigned(q.changePct, 2)}%`)
      .join(' · ');
    const riskText = risk.length
      ? ` / 위험 지표 ${risk.map((q) => `${q.name} ${formatNumber(q.price, q.precision)} (${formatSigned(q.changePct, 2)}%)`).join(' · ')}`
      : '';
    lines.push({
      kind: 'fact',
      text: `${priceText}${riskText}.`,
      evidence: [...headline, ...risk].map((q) => `quote:${q.id}`),
    });
  }

  /* ---------- 3줄: 심리 변화의 주된 기여 요인 (해석) ---------- */
  const movers = scored
    .filter((f) => f.deltaDay !== null && Math.abs(f.deltaDay) >= 0.5)
    .sort((a, b) => Math.abs(b.deltaDay as number) - Math.abs(a.deltaDay as number));

  const lead = movers[0];
  if (lead) {
    const driver = (lead.deltaDay as number) > 0 ? lead.topPositive : lead.topNegative;
    if (driver) {
      const dir = (lead.deltaDay as number) > 0 ? '상승' : '하락';
      lines.push({
        kind: 'interpretation',
        // 문장 끝에 "이는 …한 해석입니다" 를 붙이지 않는다. 줄 앞의 '해석' 배지가
        // 이미 그렇게 말하고 있고, 근거(구성요소 기여도)는 문장 안에 이미 있다.
        text: `${MARKET_LABEL[lead.market]} 점수 ${dir}(${formatSigned(lead.deltaDay, 1)}점)에는 '${driver.label}' 구성요소가 가장 크게 기여했습니다(${formatSigned(driver.contribution, 2)}점).`,
        evidence: [`fng:${lead.market}:${driver.componentId}`],
      });
    }
  }

  /* ---------- 3줄이 안 되면 위험 지표 상태로 보완 (사실) ---------- */
  if (lines.length < 3) {
    const alerts = macro.filter((m) => m.riskLevel === 'alert' && m.value !== null);
    if (alerts.length > 0) {
      lines.push({
        kind: 'fact',
        text: `주의 단계 위험 지표: ${alerts
          .slice(0, 3)
          .map((m) => `${m.name} ${formatNumber(m.value, m.precision)}`)
          .join(' · ')}.`,
        evidence: alerts.slice(0, 3).map((m) => `macro:${m.id}`),
      });
    }
  }

  /* ---------- 근거 부족 판정 ---------- */
  if (lines.length === 0) {
    return {
      lines: [{ kind: 'insufficient', text: INSUFFICIENT_TEXT, evidence: [] }],
      generatedAt: now.toISOString(),
      insufficient: true,
    };
  }

  // 심리 변화의 원인을 설명할 근거가 없으면, 원인을 만들어내지 않고 명시한다.
  // 같은 말을 두 번 하지 않는다 — 왜 부족한지만 적고, 부족하다는 사실은 배지가 진다.
  if (!lines.some((l) => l.kind === 'interpretation')) {
    lines.push({
      kind: 'insufficient',
      text: '심리 변화 폭이 작거나 기여도 데이터가 충분하지 않아 원인을 짚지 않았습니다.',
      evidence: [],
    });
  }

  return {
    lines: lines.slice(0, 3),
    generatedAt: now.toISOString(),
    insufficient: false,
  };
}

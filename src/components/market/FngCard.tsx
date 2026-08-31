'use client';

/**
 * Fear & Greed 카드.
 * 0~100 게이지 · 단계 · 전일/1주/1개월 변화 · 30일 추이 · 신뢰도 · 산출 시각 ·
 * 최대 상승/하락 요인까지 한 장에 담되, 상세는 눌러서 보게 한다.
 */

import Link from 'next/link';
import { Badge, ModeBadge } from '@/components/ui/Badge';
import { Gauge } from '@/components/charts/Gauge';
import { ScoreSparkline } from '@/components/charts/Sparkline';
import { formatKstTime, formatSigned, NO_VALUE } from '@/lib/format';
import { confidenceGlyph, marketColor } from '@/lib/scale';
import { useChangeColor } from './useChangeColor';
import { CyclePhaseBadge } from './FngCycleView';
import { CONFIDENCE_LABEL, MARKET_LABEL, type DataMode, type FngScore } from '@/types';

function DeltaChip({ label, value }: { label: string; value: number | null }) {
  const c = useChangeColor();
  return (
    <div className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-1.5">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="tnum flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: c.color(value) }}>
        <span aria-hidden="true">{c.glyph(value)}</span>
        {value === null ? NO_VALUE : formatSigned(value, 1)}
        <span className="sr-only">{c.label(value)}</span>
      </span>
    </div>
  );
}

/**
 * 점수를 밀어 올린·끌어내린 구성요소 한 줄.
 * 없으면 "판단할 데이터가 부족합니다" 를 적는 대신 줄을 그리지 않는다.
 * 없다는 말을 굳이 읽게 할 이유가 없고, 카드 셋이 나란히 서면 그 줄만 세 번 보였다.
 */
function DriverRow({ kind, label, detail }: { kind: 'up' | 'down'; label: string | null; detail: string | null }) {
  const c = useChangeColor();
  const color = c.color(kind === 'up' ? 1 : -1);
  if (!label) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span aria-hidden="true" className="text-[10px] font-bold" style={{ color }}>
        {kind === 'up' ? '▲' : '▼'}
      </span>
      <p className="min-w-0 flex-1 text-[11px] leading-tight break-keep text-fg">
        <span className="text-muted">{kind === 'up' ? '상승 ' : '하락 '}</span>
        {label}
      </p>
      {detail ? <span className="tnum shrink-0 text-[10px] text-subtle">{detail}</span> : null}
    </div>
  );
}

export function FngCard({
  score,
  mode,
  /** 이 카드 하나만 서 있는가. 홈처럼 머리 아래 셋이 나란히 설 때는 false. */
  standalone = true,
}: {
  score: FngScore;
  mode: DataMode;
  standalone?: boolean;
}) {
  const unavailable = score.score === null;

  return (
    <article
      className="card flex h-full flex-col p-3.5"
      aria-labelledby={`fng-${score.market}-title`}
    >
      {/* 제목 줄에는 데이터 모드만 둔다. 국면·신뢰도 배지까지 오른쪽에 쌓으면
          왼쪽 글자 아래로 배지 하나가 혼자 떨어져 머리 부분이 들쭉날쭉해진다. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`fng-${score.market}-title`} className="flex items-center gap-1.5 text-sm font-bold text-fg-strong">
            {/* 시장 색. 캘린더의 점과 같은 색이라 화면을 옮겨도 같은 시장으로 읽힌다.
                뜻은 옆의 글자가 지고, 색은 훑기를 도울 뿐이다. */}
            <span
              aria-hidden="true"
              className="block h-2 w-2 shrink-0 rounded-full"
              style={{ background: marketColor(score.market) }}
            />
            {MARKET_LABEL[score.market]}
            {/* 홈처럼 "시장별 투자심리" 머리 아래 셋이 나란히 설 때는 카드마다 되풀이하지 않는다.
                시장 화면에서는 이 카드 하나뿐이라 무엇을 재는 값인지 카드가 직접 말해야 한다. */}
            {standalone ? ' 투자심리' : null}
          </h3>
          {standalone ? (
            <p className="mt-0.5 text-[10px] text-subtle">자체 산출 지수 · {score.formulaVersion}</p>
          ) : null}
        </div>
        <ModeBadge mode={mode} size="xs" />
      </div>

      {/* 신뢰도는 높을 때 말하지 않는다. 늘 붙어 있으면 배지가 아니라 장식이 된다.
          문제가 있을 때만 뜨게 해 두면 그때 눈에 걸린다. */}
      <div className="mt-1.5 mb-2 flex flex-wrap items-center gap-1">
        <CyclePhaseBadge cycle={score.cycle} />
        {score.confidence !== 'high' ? (
          <Badge tone={score.confidence === 'medium' ? 'neutral' : 'warn'} size="xs" title={score.confidenceReason}>
            <span aria-hidden="true">{confidenceGlyph(score.confidence)}</span>
            신뢰도 {CONFIDENCE_LABEL[score.confidence]}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col items-center">
        <Gauge score={score.score} size={168} />
      </div>

      {unavailable ? (
        <p
          className="mt-1 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed break-keep"
          style={{ background: 'color-mix(in srgb, var(--warn) 12%, transparent)', color: 'var(--warn)' }}
          role="status"
        >
          {score.unavailableReason ?? '데이터가 부족해 점수를 산출할 수 없습니다.'}
        </p>
      ) : (
        /* 1주·1개월은 심리 상세의 '기간별 심리 위치' 가 더 잘 보여준다.
           홈 카드에는 어제와 견준 값 하나만 둔다. */
        <DeltaChip label="어제보다" value={score.deltaDay} />
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">최근 30일</span>
        <ScoreSparkline
          points={score.spark}
          width={132}
          height={30}
          ariaLabel={`${MARKET_LABEL[score.market]} 최근 30일 점수 추이`}
        />
      </div>

      <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
        <DriverRow
          kind="up"
          label={score.topPositive?.label ?? null}
          detail={score.topPositive ? `${formatSigned(score.topPositive.contribution, 2)}점 기여` : null}
        />
        <DriverRow
          kind="down"
          label={score.topNegative?.label ?? null}
          detail={score.topNegative ? `${formatSigned(score.topNegative.contribution, 2)}점 기여` : null}
        />
      </div>

      {/* 갈 수 있는 곳을 감추지 않는다. 시장 전체를 보러 가는 길과
          이 점수를 뜯어보는 길은 다른 화면이므로 버튼도 둘로 나눠 둔다. */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border pt-2">
        <Link
          href={`/market/${score.market}`}
          className="flex-1 rounded-md bg-accent px-2 py-1.5 text-center text-[11px] font-semibold text-accent-fg hover:opacity-90"
        >
          {MARKET_LABEL[score.market]} 시장 →
        </Link>
        <Link
          href={`/fng/${score.market}`}
          className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-[11px] font-semibold text-fg hover:bg-surface-3"
        >
          심리 상세 →
        </Link>
      </div>
      {/* 갱신 시각은 상태바가 늘 들고 있다. 여기서는 충족률이 온전하지 않을 때만 말한다 —
          100% 라고 매번 적어 두면 정작 90% 로 떨어진 날을 놓친다. */}
      {score.coverage < 0.999 ? (
        <p className="mt-1.5 text-[10px] text-subtle">
          산출 {formatKstTime(score.computedAt)} · 충족률 {Math.round(score.coverage * 100)}%
        </p>
      ) : null}
    </article>
  );
}

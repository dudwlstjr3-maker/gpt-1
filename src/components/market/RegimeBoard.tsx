'use client';

/**
 * 국면 전광판 — 지금이 지난 20년 중 어디쯤인지 한 장으로.
 *
 * 이 화면이 하지 않는 일
 *   매수·매도라고 말하지 않는다. 규칙이라서만이 아니라 **자료가 그 말을 받쳐 주지
 *   않아서**다. 26년 표본에서 극단적 공포는 네 번뿐이었고 그중 두 번은 12개월 뒤에도
 *   손실이었다. 그래서 전광판은 판정 대신 사실 세 가지를 보여 준다 —
 *   지금 점수, 얼마 만인지, 그리고 예전에 이랬을 때 무슨 일이 있었는지.
 *
 * 색만으로 뜻을 전하지 않는다: 구간마다 글리프(▼▼ ▼ · = △ ▲ ▲▲)와 이름이 함께 간다.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { ChartModal, ExpandTrigger } from '@/components/charts/ChartModal';
import { InteractiveChart, type ChartSeries } from '@/components/charts/InteractiveChart';
import { SectionGate, SkeletonCard } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import type { RegimeBand, RegimeBoard as Board, RegimeDigest } from '@/types';

/** 밴드 → 색. 양쪽 극단이 같은 색인 건 의도한 것이고, 방향은 글리프가 말한다. */
export const BAND_COLOR: Record<string, string> = {
  extreme_fear: 'var(--tl-red)',
  fear: 'var(--tl-orange)',
  caution: 'var(--tl-yellow)',
  middle: 'var(--muted-fg)',
  calm: 'var(--tl-lime)',
  hot: 'var(--tl-orange)',
  extreme_hot: 'var(--tl-red)',
};

export function bandColor(band: RegimeBand | null): string {
  return band ? (BAND_COLOR[band.id] ?? 'var(--muted-fg)') : 'var(--muted-fg)';
}

/** 0~100 눈금 위에 오늘 위치를 찍는 띠 */
function ScaleStrip({ score, band }: { score: number; band: RegimeBand | null }) {
  const x = Math.min(100, Math.max(0, score));
  const color = bandColor(band);
  return (
    <div className="mt-3">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
        {/* 구간 경계 — 눈금이 있어야 "지금 8점" 이 어디쯤인지 읽힌다 */}
        {[10, 25, 45, 55, 75, 90].map((b) => (
          <span key={b} className="absolute top-0 h-full w-px" style={{ left: `${b}%`, background: 'var(--border-strong)' }} />
        ))}
        <span
          className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${x}%`, background: color, boxShadow: '0 0 0 2px var(--surface)' }}
        />
      </div>
      <div className="tnum mt-1 flex justify-between text-[10.5px] text-subtle">
        <span>0 공포</span>
        <span>50</span>
        <span>과열 100</span>
      </div>
    </div>
  );
}

/**
 * 20년 점수 곡선(작은 것).
 *
 * 홈 카드 안이라 44px 밖에 안 되므로 조작 버튼을 넣지 않는다. 대신 **누르면 큰 창**이
 * 열리고 거기서 끌기·확대·축소가 다 된다. 손톱만 한 그림에 버튼을 넣는 것보다
 * 그림을 통째로 누르게 하는 편이 손가락에도 맞는다.
 */
function HistorySpark({ history, band }: { history: { t: number; score: number }[]; band: RegimeBand | null }) {
  const [big, setBig] = useState(false);
  if (history.length < 8) return null;
  const W = 300;
  const H = 44;
  const t0 = history[0].t;
  const t1 = history[history.length - 1].t;
  const span = Math.max(1, t1 - t0);
  // 끝점의 동그라미가 오른쪽에서 잘리지 않게 양쪽으로 3px 씩 물려 둔다
  const PAD = 3;
  const pt = (h: { t: number; score: number }) => [
    PAD + ((h.t - t0) / span) * (W - PAD * 2),
    PAD + (H - PAD * 2) - (Math.min(100, Math.max(0, h.score)) / 100) * (H - PAD * 2),
  ];
  const d = history.map((h, i) => `${i === 0 ? 'M' : 'L'}${pt(h)[0].toFixed(1)},${pt(h)[1].toFixed(1)}`).join(' ');
  const last = pt(history[history.length - 1]);
  const years = Math.round((t1 - t0) / (365.25 * 86_400_000));

  const bigSeries: ChartSeries[] = [
    {
      id: 'regime',
      name: '국면 점수',
      points: history.map((h) => ({ t: h.t, v: h.score })),
      color: 'var(--accent)',
      axis: 'left',
      precision: 1,
      fixed0to100: true,
      area: true,
    },
  ];

  return (
    <div className="mt-3">
      <ExpandTrigger label={`최근 ${years}년 국면 점수`} onClick={() => setBig(true)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" role="img" aria-label={`최근 ${years}년 국면 점수 곡선`}>
        {/* 25 / 75 기준선 — 곡선만 있으면 높낮이를 읽을 수 없다 */}
        {[25, 75].map((v) => (
          <line
            key={v}
            x1="0"
            x2={W}
            y1={PAD + (H - PAD * 2) - (v / 100) * (H - PAD * 2)}
            y2={PAD + (H - PAD * 2) - (v / 100) * (H - PAD * 2)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}
        <path d={d} fill="none" stroke="var(--muted-fg)" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="2.8" fill={bandColor(band)} />
      </svg>
      </ExpandTrigger>
      <p className="tnum mt-0.5 text-[10.5px] text-subtle">최근 {years}년 · 점선은 25점과 75점 · 누르면 크게 볼 수 있습니다</p>
      <ChartModal
        open={big}
        onClose={() => setBig(false)}
        title={`국면 점수 ${years}년 추이`}
        subtitle="끌어서 이동 · 휠이나 두 손가락으로 확대·축소 · 두 번 누르면 전체로"
      >
        <InteractiveChart series={bigSeries} height={340} label={`국면 점수 ${years}년 추이`} expandable={false} />
      </ChartModal>
    </div>
  );
}

/** 무엇이 이 점수를 만들었는지 */
function AxisRows({ board }: { board: Board }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {board.axes.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <span className="w-[42px] shrink-0 text-[12.5px] whitespace-nowrap text-muted" title={a.label}>
            {a.short}
          </span>
          <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
            {a.percentile !== null && (
              <span
                className="absolute top-0 left-0 h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(2, a.percentile))}%`, background: 'var(--muted-fg)' }}
              />
            )}
          </span>
          <span className="tnum w-[52px] shrink-0 text-right text-[12.5px] font-semibold text-fg">
            {a.percentile === null ? <span className="text-subtle">산출 불가</span> : `${a.percentile.toFixed(0)}점`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 전광판 본체 — 홈과 전용 화면이 같이 쓴다 */
export function RegimeBoardBody({ digest, compact = false }: { digest: RegimeDigest; compact?: boolean }) {
  const board = digest.board;
  const band = board.band;

  if (board.score === null) {
    return (
      <div className="card p-3.5">
        <div className="flex items-center gap-2">
          <Badge tone="warn" size="xs">
            <span aria-hidden="true">?</span>산출 불가
          </Badge>
          <span className="text-[13px] font-semibold text-fg-strong">국면 점수를 낼 수 없습니다</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed break-keep text-muted">{board.unavailableReason}</p>
        <AxisRows board={board} />
      </div>
    );
  }

  const missing = board.axes.filter((a) => a.percentile === null);

  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-[13px]" style={{ color: bandColor(band) }}>
              {band?.glyph}
            </span>
            <span className="text-[13px] font-bold" style={{ color: bandColor(band) }}>
              {band?.label}
            </span>
          </div>
          {/* 희소성은 1년 이상일 때만 크게 쓴다. 매달 "3개월 만" 이 뜨면 소음이 된다 */}
          {board.rarity?.notable && board.rarity.headline ? (
            <p className="mt-1 text-[19px] leading-tight font-bold break-keep text-fg-strong">{board.rarity.headline}</p>
          ) : (
            <p className="mt-1 text-[19px] leading-tight font-bold break-keep text-fg-strong">
              지난 {board.lookbackYears}년 기준 {board.score.toFixed(0)}점
            </p>
          )}
          {board.rarity?.text && <p className="tnum mt-1 text-[12.5px] break-keep text-muted">{board.rarity.text}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[30px] leading-none font-bold" style={{ color: bandColor(band) }}>
            {board.score.toFixed(0)}
          </p>
          <p className="text-[10.5px] text-subtle">/ 100</p>
        </div>
      </div>

      <ScaleStrip score={board.score} band={band} />
      {!compact && <HistorySpark history={digest.history} band={band} />}
      <AxisRows board={board} />

      {missing.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
          {missing.map((m) => `${m.label} 제외 — ${m.reason ?? '자료 없음'}`).join(' · ')} · 남은 축의 가중치{' '}
          {Math.round(board.coverage * 100)}% 로 계산했습니다.
        </p>
      )}

      {/* 이 문장은 접거나 아래로 밀지 않는다. 전광판에서 제일 중요한 줄이다. */}
      <p className="mt-2.5 border-t border-border pt-2 text-[11.5px] leading-relaxed break-keep text-subtle">
        지금이 역사적으로 어디쯤인지만 보여 줍니다. 사거나 팔라는 신호가 아닙니다 — 지난 26년 자료에서 점수가 낮았다고
        해서 그 뒤 12개월이 좋았던 것은 아니었습니다.{' '}
        <Link href="/regime" className="font-semibold text-accent hover:underline">
          검증 결과 보기 →
        </Link>
      </p>
    </div>
  );
}

/** 홈에 얹는 카드 */
export function RegimeBoardCard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.regime ?? null;

  return (
    <section aria-labelledby="regime-title" className="mt-5 px-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="regime-title" className="text-base font-bold text-fg-strong">
          국면 전광판
        </h2>
        <Link href="/regime" className="shrink-0 text-[12.5px] font-semibold text-accent hover:underline">
          자세히 →
        </Link>
      </div>
      <SectionGate section={section} onRetry={refresh} loading={<SkeletonCard height={120} lines={3} />}>
        {(digest) => <RegimeBoardBody digest={digest} />}
      </SectionGate>
    </section>
  );
}

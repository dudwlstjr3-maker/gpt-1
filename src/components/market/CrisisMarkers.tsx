'use client';

/**
 * 과거 위기 시점의 심리 점수.
 *
 * 사건의 날짜와 이름은 실제로 있었던 일이고, 옆에 붙는 점수는 이 앱의 자체 산식이
 * 그 시점 데이터로 계산한 값이다. 공식 지수를 가져온 것이 아니며 DEMO 에서는
 * 원본 데이터 자체가 합성이다. 그 차이를 카드 안에 그대로 적는다.
 *
 * 목록의 번호는 차트 위 세로선의 번호와 짝을 이룬다.
 */

import { Notice } from '@/components/ui/States';
import { formatKstDate, formatNumber, NO_VALUE } from '@/lib/format';
import { scoreColor, scoreFill, stageOf } from '@/lib/scale';
import { MARKET_EVENT_CATEGORY_LABEL, type EventMarker, type FngEvents } from '@/types';

/** 번호 원 — 차트 배지와 같은 모양 */
export function MarkerIndex({ n, color, active }: { n: number; color: string; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{
        background: color,
        color: 'var(--bg)',
        boxShadow: active ? `0 0 0 2px color-mix(in srgb, ${color} 45%, transparent)` : 'none',
      }}
    >
      {n}
    </span>
  );
}

function Row({
  marker,
  index,
  active,
  onSelect,
}: {
  marker: EventMarker;
  index: number;
  active: boolean;
  onSelect: (t: number | null) => void;
}) {
  const color = scoreFill(marker.score);
  const textColor = scoreColor(marker.score);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(active ? null : marker.t)}
        aria-pressed={active}
        className="w-full rounded-lg border px-2.5 py-2 text-left transition-colors"
        style={{
          borderColor: active ? `color-mix(in srgb, ${textColor} 45%, var(--border))` : 'var(--border)',
          background: active ? `color-mix(in srgb, ${textColor} 8%, var(--surface))` : 'var(--surface)',
        }}
      >
        <div className="flex items-start gap-2">
          <MarkerIndex n={index} color={color} active={active} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-tight font-semibold break-keep text-fg">{marker.label}</p>
            <p className="tnum mt-0.5 text-[10px] text-subtle">
              {formatKstDate(marker.t)}
              <span className="ml-1.5">{MARKET_EVENT_CATEGORY_LABEL[marker.category]}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tnum text-[16px] leading-none font-bold" style={{ color: textColor }}>
              {marker.score === null ? NO_VALUE : formatNumber(marker.score, 1)}
            </p>
            <p className="mt-1 text-[10px] font-semibold" style={{ color: textColor }}>
              {marker.stageLabel ?? '산출 불가'}
            </p>
          </div>
        </div>
        {active ? (
          <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] leading-relaxed break-keep text-muted">
            {marker.note}
            {marker.unavailableReason ? ` ${marker.unavailableReason}` : ''}
          </p>
        ) : null}
      </button>
    </li>
  );
}

export function CrisisMarkers({
  events,
  selected,
  onSelect,
  currentScore,
}: {
  events: FngEvents;
  selected: number | null;
  onSelect: (t: number | null) => void;
  currentScore: number | null;
}) {
  if (events.markers.length === 0) {
    return (
      <div className="card p-3.5">
        <h3 className="text-sm font-bold text-fg-strong">과거 위기 때의 점수</h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed break-keep text-muted">
          이 시장에서 표시할 사건이 히스토리 범위 안에 없습니다.
          {events.outOfRange > 0 ? ` 범위를 벗어난 사건 ${events.outOfRange}건은 표시하지 않았습니다.` : ''}
        </p>
      </div>
    );
  }

  const scored = events.markers.filter((m) => m.score !== null);
  const lowest = scored.length > 0 ? scored.reduce((a, b) => ((a.score as number) <= (b.score as number) ? a : b)) : null;
  const currentStage = stageOf(currentScore);

  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-fg-strong">과거 위기 때의 점수</h3>
        <span className="tnum text-[10px] text-subtle">{events.markers.length}건</span>
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed break-keep text-muted">
        누르면 그 시점을 차트에서 강조하고 무슨 일이 있었는지 보여 줍니다. 번호는 차트 위 세로선과 같습니다.
      </p>

      {/* 지금과 견주기 — 숫자만으로는 감이 오지 않으므로 한 줄로 풀어 준다 */}
      {lowest && currentScore !== null ? (
        <p className="mb-2.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[11.5px] leading-relaxed break-keep text-fg">
          표시된 사건 중 가장 낮았던 때는 <strong style={{ color: scoreColor(lowest.score) }}>{lowest.label}</strong> 의{' '}
          <strong className="tnum" style={{ color: scoreColor(lowest.score) }}>
            {formatNumber(lowest.score, 1)}점
          </strong>
          입니다. 지금은{' '}
          <strong className="tnum" style={{ color: scoreColor(currentScore) }}>
            {formatNumber(currentScore, 1)}점
          </strong>
          {currentStage ? ` (${currentStage.label})` : ''} 입니다.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {events.markers.map((m, i) => (
          <Row
            key={m.id}
            marker={m}
            index={i + 1}
            active={selected !== null && selected === m.t}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {/* 표 대안 */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted hover:text-fg">표로 보기</summary>
        <div className="scroll-x mt-2 rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">과거 위기 시점의 자체 산출 심리 점수</caption>
            <thead>
              <tr>
                <th scope="col">시점</th>
                <th scope="col">사건</th>
                <th scope="col">점수</th>
                <th scope="col">단계</th>
              </tr>
            </thead>
            <tbody>
              {events.markers.map((m) => (
                <tr key={m.id}>
                  <td className="tnum">{formatKstDate(m.t)}</td>
                  <th scope="row" className="font-normal break-keep">
                    {m.label}
                  </th>
                  <td className="tnum">{m.score === null ? NO_VALUE : formatNumber(m.score, 1)}</td>
                  <td>{m.stageLabel ?? NO_VALUE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {events.outOfRange > 0 ? (
        <p className="mt-2 text-[10px] break-keep text-subtle">
          히스토리 범위보다 앞선 사건 {events.outOfRange}건은 점수를 산출할 수 없어 표시하지 않았습니다.
        </p>
      ) : null}

      <div className="mt-2.5">
        <Notice tone="warn">
          {events.caveat} 과거에 이랬다는 기록일 뿐입니다.
        </Notice>
      </div>
    </div>
  );
}

'use client';

/** 점수 변화 기여도 — 0을 기준으로 좌우로 뻗는 막대. 표 대안을 함께 제공한다. */

import { useState } from 'react';
import { formatSigned, NO_VALUE } from '@/lib/format';
import { useChangeColor } from '@/components/market/useChangeColor';

export interface ContributionItem {
  id: string;
  label: string;
  /** 점수 기여도(점) */
  value: number | null;
  /** 부가 설명 */
  detail?: string;
}

export function ContributionBars({ items, caption }: { items: ContributionItem[]; caption: string }) {
  const c = useChangeColor();
  const [showTable, setShowTable] = useState(false);
  const valued = items.filter((i) => i.value !== null);
  const max = Math.max(0.01, ...valued.map((i) => Math.abs(i.value as number)));

  if (valued.length === 0) {
    return <p className="text-xs text-muted">기여도를 계산할 데이터가 없습니다.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-muted">전일 대비 점수 변화 기여도 (점)</p>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted hover:text-fg"
        >
          {showTable ? '그래프로 보기' : '표로 보기'}
        </button>
      </div>

      {showTable ? (
        <div className="scroll-x rounded-lg border border-border">
          <table className="data-table">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col">구성요소</th>
                <th scope="col">기여도(점)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <th scope="row" className="font-normal">
                    {i.label}
                  </th>
                  <td className="tnum">{i.value === null ? NO_VALUE : formatSigned(i.value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => {
            const v = i.value;
            const pct = v === null ? 0 : (Math.abs(v) / max) * 50;
            const positive = (v ?? 0) > 0;
            return (
              <li key={i.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-fg">{i.label}</span>
                  <span
                    className="tnum shrink-0 text-[11px] font-semibold"
                    style={{ color: c.color(v) }}
                  >
                    {v === null ? '결측' : formatSigned(v, 2)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
                  <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--border-strong)' }} />
                  {v !== null ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: c.color(v),
                        left: positive ? '50%' : `${50 - pct}%`,
                        width: `${pct}%`,
                      }}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

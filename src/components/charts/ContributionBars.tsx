'use client';

/**
 * 점수 변화 기여도 — 0을 기준으로 좌우로 뻗는 막대. 표 대안을 함께 제공한다.
 *
 * 숫자는 **몫(%)** 을 크게, 점수(점)를 작게 (2026-11-25).
 * "+0.72" "+2.06" 같은 점수만 있을 때는 무엇의 0.72 인지 읽히지 않았다(사용자: "0.## 이라는 숫자를 보고 이해를 못하겠네").
 * 몫 = 오늘 움직인 크기 가운데 그 지표가 맡은 비율. 오른 쪽(▲)과 내린 쪽(▼)을 합쳐 100% — 계산은 lib/contribution.mjs.
 * 방향은 색만이 아니라 ▲▼ 기호로도 말한다.
 */

import { useState } from 'react';
import { formatSigned, NO_VALUE } from '@/lib/format';
import { contributionShares } from '@/lib/contribution.mjs';
import { useChangeColor } from '@/components/market/useChangeColor';

export interface ContributionItem {
  id: string;
  label: string;
  /** 점수 기여도(점) */
  value: number | null;
  /** 부가 설명 */
  detail?: string;
}

const GLYPH = { 1: '▲', [-1]: '▼', 0: '' } as const;

export function ContributionBars({ items, caption }: { items: ContributionItem[]; caption: string }) {
  const c = useChangeColor();
  const [showTable, setShowTable] = useState(false);
  const valued = items.filter((i) => i.value !== null);
  const max = Math.max(0.01, ...valued.map((i) => Math.abs(i.value as number)));
  const shares = contributionShares(items.map((i) => i.value));
  const netDir = shares.net > 0 ? 1 : shares.net < 0 ? -1 : 0;

  if (valued.length === 0) {
    return <p className="text-xs text-muted">기여도를 계산할 데이터가 없습니다.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-fg">
          {shares.moved ? (
            <>
              오늘{' '}
              <b className="tnum" style={{ color: c.color(shares.net) }}>
                {GLYPH[netDir]} {formatSigned(shares.net, 1)}점
              </b>{' '}
              — 지표별로 나누면
            </>
          ) : (
            '오늘은 움직인 지표가 없어요'
          )}
        </p>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="shrink-0 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[12.5px] font-semibold text-muted hover:text-fg"
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
                <th scope="col">몫</th>
                <th scope="col">점수 변화(점)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, k) => (
                <tr key={i.id}>
                  <th scope="row" className="font-normal">
                    {i.label}
                  </th>
                  <td className="tnum">{GLYPH[shares.rows[k].dir]} {shares.rows[k].text}</td>
                  <td className="tnum">{i.value === null ? NO_VALUE : formatSigned(i.value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((i, k) => {
            const v = i.value;
            const row = shares.rows[k];
            const pct = v === null ? 0 : (Math.abs(v) / max) * 50;
            const positive = (v ?? 0) > 0;
            return (
              <li key={i.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] text-fg">{i.label}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="tnum text-[14px] font-bold" style={{ color: c.color(v) }}>
                      {v === null ? '결측' : `${GLYPH[row.dir]} ${row.text}`.trim()}
                    </span>
                    {v !== null ? (
                      <span className="tnum text-[11.5px] text-subtle">{formatSigned(v, 1)}점</span>
                    ) : null}
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
      <p className="mt-2 text-[11.5px] leading-relaxed text-subtle break-keep">
        %는 오늘 움직인 크기 가운데 그 지표가 맡은 몫입니다. 올린 쪽(▲)과 내린 쪽(▼)을 합쳐 100%.
        옆의 '점'은 100점 만점 점수가 그 지표 때문에 움직인 만큼입니다.
      </p>
    </div>
  );
}

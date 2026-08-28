'use client';

/**
 * 생활 속 경제 이야기 — 시세가 아니라 "형편"을 재는 숫자들.
 *
 * 뉴스에 나오는 1인당 GDP·빅맥지수 같은 말이 무슨 뜻인지 편하게 읽어 보는 화면이다.
 * 투자심리 점수의 구성요소가 아니고, 매매 판단에 쓰라고 둔 화면도 아니다.
 * 그래서 시장 화면과 섞지 않고 따로 뒀다.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatNumber, formatRelative, NO_VALUE } from '@/lib/format';
import { basicGuideFor, BASIC_GROUPS } from '@/lib/economyBasics';
import type { BasicComparison, EconomyBasic } from '@/types';

/** 값 + 단위. 값이 없으면 임의로 채우지 않고 그대로 비운다. */
function show(value: number | null, precision: number, suffix: string): string {
  if (value === null) return NO_VALUE;
  return `${formatNumber(value, precision)}${suffix}`;
}

const TREND_GLYPH = { up: '▲', down: '▼', flat: '―' } as const;
const TREND_LABEL = { up: '올랐습니다', down: '내렸습니다', flat: '그대로입니다' } as const;

function trendOf(value: number | null, previous: number | null): keyof typeof TREND_GLYPH | null {
  if (value === null || previous === null) return null;
  if (value > previous) return 'up';
  if (value < previous) return 'down';
  return 'flat';
}

/* ------------------------------------------------------------------ */
/* 비교 표시                                                            */
/* ------------------------------------------------------------------ */

/**
 * 단위가 모두 같을 때만 막대로 그린다.
 * "원"과 "달러"와 "%"를 한 축에 올리면 길이가 아무 뜻도 갖지 못하기 때문이다.
 * 막대를 그리지 못하는 경우에도 숫자는 그대로 보여준다.
 */
function Comparisons({
  items,
  note,
  sameScale = true,
}: {
  items: BasicComparison[];
  note?: string;
  sameScale?: boolean;
}) {
  const values = items.map((c) => c.value).filter((v): v is number => v !== null);
  const sameUnit = items.length > 1 && items.every((c) => c.suffix === items[0].suffix);

  // 부호가 한쪽으로 몰려 있으면 크기로 길이를 잰다.
  // 저평가율처럼 전부 음수인 값도 "얼마나 벗어났나"를 길이로 보여줄 수 있다.
  // 부호가 섞이면 길이가 무엇을 뜻하는지 알 수 없으므로 그리지 않는다.
  const oneSided = values.length > 0 && (values.every((v) => v >= 0) || values.every((v) => v <= 0));
  const mags = values.map(Math.abs);
  const magMax = mags.length ? Math.max(...mags) : 0;
  const magMin = mags.length ? Math.min(...mags) : 0;

  // 값들이 서로 비슷하면 막대 길이가 전부 같아 보여 오히려 차이를 감춘다.
  const spread = magMax > 0 ? magMin / magMax : 1;
  const bars = sameScale && sameUnit && oneSided && magMax > 0 && spread <= 0.7;

  return (
    <dl className="mt-2 space-y-1.5">
      {items.map((c) => (
        <div key={c.label} className="grid grid-cols-[68px_1fr_auto] items-center gap-2">
          <dt className={`truncate text-[11px] ${c.primary ? 'font-semibold text-fg' : 'text-muted'}`}>{c.label}</dt>
          <dd className="min-w-0">
            {bars ? (
              <span className="block h-2 rounded-full bg-surface-3" aria-hidden="true">
                <span
                  className="block h-2 rounded-full"
                  style={{
                    width: c.value === null ? 0 : `${Math.max(2, (Math.abs(c.value) / magMax) * 100)}%`,
                    background: c.primary ? 'var(--accent)' : 'color-mix(in srgb, var(--muted-fg) 45%, transparent)',
                  }}
                />
              </span>
            ) : null}
          </dd>
          <dd
            className={`tnum shrink-0 text-right text-[12px] ${c.primary ? 'font-bold text-fg-strong' : 'text-muted'}`}
          >
            {show(c.value, c.precision, c.suffix)}
          </dd>
        </div>
      ))}
      {/* 나라끼리 그대로 견주면 안 되는 지표는 그 이유를 표 바로 밑에 적는다.
          숫자를 나란히 놓는 순간 사람은 비교부터 하기 때문에, 경고가 표 아래에 있어야 한다. */}
      {note ? (
        <p className="mt-1.5 border-t border-border pt-1.5 text-[10px] leading-relaxed break-keep text-subtle">
          <span aria-hidden="true">※ </span>
          {note}
        </p>
      ) : null}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* 해설                                                                */
/* ------------------------------------------------------------------ */

function GuidePanel({ id, open, onToggle }: { id: string; open: boolean; onToggle: () => void }) {
  const g = basicGuideFor(id);
  if (!g) return null;

  const rows: { glyph: string; label: string; text: string }[] = [
    ...(g.baseline ? [{ glyph: '=', label: '기준', text: g.baseline }] : []),
    { glyph: '?', label: '어떻게 읽나요', text: g.howToRead },
    { glyph: '▲', label: '오르면', text: g.whenUp },
    { glyph: '▼', label: '내리면', text: g.whenDown },
    { glyph: '!', label: '조심할 점', text: g.caution },
    { glyph: '↔', label: '시장 이야기와의 연결', text: g.marketLink },
  ];

  return (
    <div className="mt-2.5 border-t border-border pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-[11px] font-semibold text-accent hover:underline"
      >
        {open ? '설명 접기 ▴' : '이게 무슨 숫자인가요? ▾'}
      </button>

      {open ? (
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="text-[11.5px] leading-relaxed break-keep text-fg">{g.plain}</p>
          <dl className="mt-2 space-y-1.5 border-t border-border pt-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-1.5">
                {/* 화살표는 값의 방향일 뿐이라 등락 색을 쓰지 않는다 */}
                <span aria-hidden="true" className="mt-px w-3 shrink-0 text-center text-[10px] text-muted">
                  {r.glyph}
                </span>
                <dt className="sr-only">{r.label}</dt>
                <dd className="min-w-0 text-[11px] leading-relaxed break-keep text-muted">
                  <span className="font-semibold text-fg">{r.label} · </span>
                  {r.text}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BasicCard({ item }: { item: EconomyBasic }) {
  const [open, setOpen] = useState(false);
  const g = basicGuideFor(item.id);
  const t = trendOf(item.value, item.previous);

  return (
    <li className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-fg-strong">{item.name}</h3>
          <p className="mt-0.5 text-[10px] text-subtle">{item.englishName}</p>
        </div>
        <Badge tone={item.official ? 'neutral' : 'warn'} size="xs">
          <span aria-hidden="true">{item.official ? '◎' : '△'}</span>
          {item.official ? '공식 통계' : '비공식 개념'}
        </Badge>
      </div>

      {g ? <p className="mt-1.5 text-[11.5px] leading-relaxed break-keep text-muted">{g.headline}</p> : null}

      <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border pt-2.5">
        <p className="tnum text-[26px] leading-none font-bold text-fg-strong">
          {show(item.value, item.precision, item.suffix)}
        </p>
        <p className="tnum shrink-0 text-right text-[10.5px] text-muted">
          {t ? (
            <>
              <span aria-hidden="true">{TREND_GLYPH[t]}</span>
              <span className="sr-only">직전보다 {TREND_LABEL[t]}.</span>{' '}
            </>
          ) : null}
          직전 {show(item.previous, item.precision, item.suffix)}
        </p>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed break-keep text-fg">{item.reading}</p>

      {item.officialNote ? (
        <p className="mt-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[10.5px] leading-relaxed break-keep text-subtle">
          <span aria-hidden="true">△ </span>
          {item.officialNote}
        </p>
      ) : null}

      <Comparisons items={item.comparisons} note={item.comparisonNote} sameScale={item.sameScale} />

      <GuidePanel id={item.id} open={open} onToggle={() => setOpen((v) => !v)} />

      <p className="mt-2 border-t border-border pt-2 text-[10px] text-subtle">
        {item.asOfLabel} · 기준 {formatRelative(item.meta.asOf)} · 출처 {item.meta.sources[0]?.name ?? '알 수 없음'}
      </p>
    </li>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 묶음별로 나눈다.
 *
 * 열 개가 넘으면 한 줄로 늘어놓는 것만으로는 읽히지 않는다.
 * 묶음에 없는 지표는 버리지 않고 마지막에 "그 밖의 지표"로 모아 둔다 —
 * 어댑터가 새 항목을 내려보내도 화면에서 조용히 사라지지 않게 하기 위해서다.
 */
function groupList(list: EconomyBasic[]): { id: string; label: string; note: string; items: EconomyBasic[] }[] {
  const byId = new Map(list.map((b) => [b.id, b]));
  const used = new Set<string>();

  const groups = BASIC_GROUPS.map((g) => {
    const items = g.ids
      .map((id) => {
        const found = byId.get(id);
        if (found) used.add(id);
        return found;
      })
      .filter((b): b is EconomyBasic => b !== undefined);
    return { id: g.id, label: g.label, note: g.note, items };
  }).filter((g) => g.items.length > 0);

  const rest = list.filter((b) => !used.has(b.id));
  if (rest.length > 0) {
    groups.push({ id: 'rest', label: '그 밖의 지표', note: '', items: rest });
  }
  return groups;
}

export default function BasicsPage() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.basics ?? null;

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-fg-strong">생활 속 경제 이야기</h1>
          <p className="mt-0.5 text-[11px] break-keep text-muted">
            시세가 아니라 살림살이의 크기를 재는 숫자들입니다. 지표마다 <strong>한국·중국·일본·미국</strong> 네 나라를
            나란히 놓았으니, 우리 형편이 어느 쯤인지 편하게 견줘 보세요.
          </p>
        </div>
        <Link href="/indicators" className="shrink-0 text-[11px] font-semibold text-accent hover:underline">
          시장 지표 →
        </Link>
      </div>

      <div className="mt-3 px-3">
        <Notice tone="neutral">
          여기 숫자는 <strong>투자심리 점수의 구성요소가 아닙니다.</strong> 대부분 1년에 한두 번 바뀌는 값이라 그날의
          시장을 설명하지 못합니다. 나라끼리 형편을 견줘 보거나, 기사에 나온 용어의 뜻을 확인하는 용도로 보세요.
          <strong>전부 통계기관이 발표하는 공식 지표</strong>만 담았습니다 — 발표 기관이 없는 개념은 넣지 않습니다.
        </Notice>
      </div>

      <div className="mt-3 px-3">
        <SectionGate
          section={section}
          onRetry={refresh}
          loading={
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} height={60} lines={3} />
              ))}
            </div>
          }
          empty={<EmptyState title="표시할 지표가 없습니다" />}
        >
          {(list) =>
            list.length === 0 ? (
              <EmptyState title="표시할 지표가 없습니다" />
            ) : (
              <div className="space-y-5">
                {groupList(list).map((g) => (
                  <section key={g.id} aria-labelledby={`basics-${g.id}`}>
                    <div className="mb-1.5">
                      <h2 id={`basics-${g.id}`} className="text-[12px] font-bold text-muted">
                        {g.label}
                        <span className="tnum ml-1.5 font-normal text-subtle">{g.items.length}</span>
                      </h2>
                      {g.note ? (
                        <p className="mt-0.5 text-[10.5px] leading-relaxed break-keep text-subtle">{g.note}</p>
                      ) : null}
                    </div>
                    <ul className="space-y-2.5">
                      {g.items.map((item) => (
                        <BasicCard key={item.id} item={item} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          }
        </SectionGate>
      </div>

      <p className="mt-4 px-3 text-[10.5px] leading-relaxed break-keep text-subtle">
        네 나라 값은 발표 기관과 기준 연도가 서로 다를 수 있습니다. 같은 지표라도 어떤 환율(시장 환율 / 구매력평가
        환율)로 환산했는지에 따라 순위가 뒤집히므로, 숫자 하나로 우열을 단정하지 마세요. 그대로 견주면 안 되는
        지표에는 비교표 아래에 <span aria-hidden="true">※</span> 로 이유를 적어 두었습니다.
      </p>
    </div>
  );
}

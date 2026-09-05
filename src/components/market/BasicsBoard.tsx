'use client';

/**
 * 생활 속 경제 이야기 판 — 시세가 아니라 "형편"을 재는 숫자들.
 *
 * 뉴스에 나오는 1인당 GDP·빅맥지수 같은 말이 무슨 뜻인지 편하게 읽어 보는 판이다.
 * 투자심리 점수의 구성요소가 아니고, 매매 판단에 쓰라고 둔 것도 아니다.
 *
 * '생활' 탭의 본문이다 (/basics). 제목은 화면 쪽에서 그린다.
 */

import { useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatNumber, formatRelative, NO_VALUE } from '@/lib/format';
import { basicGuideFor, BASIC_GROUPS } from '@/lib/economyBasics';
import { BasicTrend, type TrendSeries } from '@/components/charts/BasicTrend';
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
          <dt className={`truncate text-[12.5px] ${c.primary ? 'font-semibold text-fg' : 'text-muted'}`}>{c.label}</dt>
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
            className={`tnum shrink-0 text-right text-[13px] ${c.primary ? 'font-bold text-fg-strong' : 'text-muted'}`}
          >
            {show(c.value, c.precision, c.suffix)}
          </dd>
        </div>
      ))}
      {/* 나라끼리 그대로 견주면 안 되는 지표는 그 이유를 표 바로 밑에 적는다.
          숫자를 나란히 놓는 순간 사람은 비교부터 하기 때문에, 경고가 표 아래에 있어야 한다. */}
      {note ? (
        <p className="mt-1.5 border-t border-border pt-1.5 text-[11.5px] leading-relaxed break-keep text-subtle">
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

function GuidePanel({
  id,
  open,
  onToggle,
  caution,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  /** 제공사가 준 주의 문구. 카드 본문에서 접어 이리로 옮겼다. */
  caution?: string;
}) {
  const g = basicGuideFor(id);
  if (!g) return null;

  const rows: { glyph: string; label: string; text: string }[] = [
    { glyph: 'ⓘ', label: '이게 뭔가요', text: g.headline },
    ...(g.baseline ? [{ glyph: '=', label: '기준', text: g.baseline }] : []),
    { glyph: '?', label: '어떻게 읽나요', text: g.howToRead },
    { glyph: '▲', label: '오르면', text: g.whenUp },
    { glyph: '▼', label: '내리면', text: g.whenDown },
    { glyph: '!', label: '조심할 점', text: caution ? `${caution} ${g.caution}` : g.caution },
    { glyph: '↔', label: '시장 이야기와의 연결', text: g.marketLink },
  ];

  return (
    <div className="mt-2.5 border-t border-border pt-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-[12.5px] font-semibold text-accent hover:underline"
      >
        {open ? '설명 접기 ▴' : '이게 무슨 숫자인가요? ▾'}
      </button>

      {open ? (
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="text-[12.5px] leading-relaxed break-keep text-fg">{g.plain}</p>
          <dl className="mt-2 space-y-1.5 border-t border-border pt-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-1.5">
                {/* 화살표는 값의 방향일 뿐이라 등락 색을 쓰지 않는다 */}
                <span aria-hidden="true" className="mt-px w-3 shrink-0 text-center text-[11.5px] text-muted">
                  {r.glyph}
                </span>
                <dt className="sr-only">{r.label}</dt>
                <dd className="min-w-0 text-[12.5px] leading-relaxed break-keep text-muted">
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
  const t = trendOf(item.value, item.previous);

  // 나라별 선이 있으면 그대로, 없으면 한국 선 하나만
  const trend: TrendSeries[] =
    item.historyByCountry && item.historyByCountry.length > 0
      ? item.historyByCountry
      : item.history && item.history.length > 1
        ? [{ label: '한국', points: item.history }]
        : [];

  return (
    <li className="card flex flex-col p-3">
      {/*
       * 이름과 값을 같은 줄에 둔다.
       *
       * 예전에는 이름 줄 밑에 큰 숫자를 한 줄 더 뒀는데, 숫자 오른쪽이 통째로 비어
       * 카드 한 장이 550px 을 넘겼다. 아홉 장이면 세로로 화면 여섯 개 분량이라
       * 훑을 수가 없다. 이름과 값은 어차피 같이 읽는 짝이라 한 줄에 둬도 무리가 없다.
       */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] leading-snug font-bold break-keep text-fg-strong">{item.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
            <span className="min-w-0 truncate">{item.englishName}</span>
            <Badge tone={item.official ? 'neutral' : 'warn'} size="2xs">
              <span aria-hidden="true">{item.official ? '◎' : '△'}</span>
              {item.official ? '공식 통계' : '비공식 개념'}
            </Badge>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[22px] leading-none font-bold text-fg-strong">
            {show(item.value, item.precision, item.suffix)}
          </p>
          <p className="tnum mt-1 text-[11.5px] text-muted">
            {t ? (
              <>
                <span aria-hidden="true">{TREND_GLYPH[t]}</span>
                <span className="sr-only">직전보다 {TREND_LABEL[t]}.</span>{' '}
              </>
            ) : null}
            직전 {show(item.previous, item.precision, item.suffix)}
          </p>
        </div>
      </div>

      {/*
       * 지나온 선은 카드 폭을 그대로 쓴다.
       * 이 화면의 값은 1년에 한두 번만 바뀌어서, 숫자 하나만 보면 그게 높은 건지
       * 낮은 건지 알 수가 없다. 선이 그 물음을 대신 답한다. 숫자 옆에 끼워 두었을
       * 때는 230px 밖에 안 되어 눈금 글씨가 뭉갰는데, 이제 두 배 가까이 넓다.
       *
       * 값을 못 받아 선을 못 그리는 날에도 블록은 같은 크기로 남는다 —
       * 그 처리는 BasicTrend 가 한다.
       */}
      <div className="mt-2 border-t border-border pt-2">
        <BasicTrend series={trend} precision={item.precision} suffix={item.suffix} label={item.name} />
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed break-keep text-fg">{item.reading}</p>

      <Comparisons items={item.comparisons} note={item.comparisonNote} sameScale={item.sameScale} />

      {/*
       * 개념 설명 · 조심할 점은 접어 둔다.
       * 아홉 장이 나란히 서면 카드마다 서너 문단이라 훑을 수가 없었다.
       * 숫자를 보러 온 사람은 숫자만 보고, 궁금해진 사람만 펼친다.
       */}
      <GuidePanel id={item.id} open={open} onToggle={() => setOpen((v) => !v)} caution={item.officialNote} />

      <p className="mt-2 border-t border-border pt-2 text-[11.5px] text-subtle">
        {item.asOfLabel} · 출처 {item.meta.sources[0]?.name ?? '알 수 없음'}
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

export function BasicsBoard() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.basics ?? null;

  return (
    <>
      <div className="px-3">
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
              <div className="space-y-4">
                {groupList(list).map((g) => (
                  <section key={g.id} aria-labelledby={`basics-${g.id}`}>
                    <div className="mb-1.5">
                      <h2 id={`basics-${g.id}`} className="text-[13px] font-bold text-muted">
                        {g.label}
                        <span className="tnum ml-1.5 font-normal text-subtle">{g.items.length}</span>
                      </h2>
                      {g.note ? (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed break-keep text-subtle">{g.note}</p>
                      ) : null}
                    </div>
                    {/*
                     * 넓은 화면에서는 두 칸으로 세운다.
                     * 한 줄로만 세우면 카드 하나가 950px 을 차지하면서 그 안에 글자는
                     * 350자뿐이라, 폭은 남아돌고 세로로는 4,700px 을 굴러야 했다.
                     * 세 칸은 넣지 않는다 — 카드가 310px 밑으로 내려가면 이름과 값이
                     * 한 줄에 못 서고 그래프 눈금이 뭉갠다.
                     */}
                    <ul className="grid gap-2.5 md:grid-cols-2">
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

      <p className="mt-4 px-3 text-[11.5px] leading-relaxed break-keep text-subtle">
        네 나라 값은 발표 기관과 기준 연도가 서로 다를 수 있습니다. 같은 지표라도 어떤 환율(시장 환율 / 구매력평가
        환율)로 환산했는지에 따라 순위가 뒤집히므로, 숫자 하나로 우열을 단정하지 마세요. 그대로 견주면 안 되는
        지표에는 비교표 아래에 <span aria-hidden="true">※</span> 로 이유를 적어 두었습니다.
      </p>
    </>
  );
}

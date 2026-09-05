'use client';

/**
 * 예측시장에서 화제인 질문 — 홈의 별도 칸.
 *
 * 시세도 아니고 확률도 아니다. "사람들이 이 결과에 얼마를 걸고 있는가"라는
 * 가격일 뿐이라, 그 사실을 카드 안에 계속 적어 둔다.
 * 값이 계속 바뀌므로 갱신 시각을 항상 함께 보여 준다.
 *
 * 색으로 유불리를 말하지 않는다. 여기 막대는 어느 쪽이 비싼지를 보여줄 뿐이라
 * 등락색(빨강·파랑)도, 신호등색도 쓰지 않는다.
 */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard, EmptyState, Notice } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatCompactEn, formatKstTime, formatKstYmd, formatNumber, formatSigned, NO_VALUE } from '@/lib/format';
import type { PredictionMarket } from '@/types';

/** 마감까지 남은 날. 이미 지났으면 null */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = Math.ceil((t - Date.now()) / 86400_000);
  return d >= 0 ? d : null;
}

function OutcomeBar({ market }: { market: PredictionMarket }) {
  const priced = market.outcomes.filter((o) => o.price !== null);
  if (priced.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1.5">
      {priced.map((o, i) => {
        const name = o.labelKo ?? o.label;
        const top = i === 0;
        return (
          <li key={`${o.label}-${i}`} className="grid grid-cols-[52px_1fr_auto] items-center gap-2">
            <span className={`truncate text-[12.5px] ${top ? 'font-semibold text-fg' : 'text-muted'}`}>{name}</span>
            <span className="block h-2 rounded-full bg-surface-3" aria-hidden="true">
              <span
                className="block h-2 rounded-full"
                style={{
                  width: `${Math.max(2, o.price!)}%`,
                  background: top ? 'var(--accent)' : 'color-mix(in srgb, var(--muted-fg) 45%, transparent)',
                }}
              />
            </span>
            <span className={`tnum shrink-0 text-right text-[13px] ${top ? 'font-bold text-fg-strong' : 'text-muted'}`}>
              {formatNumber(o.price, 0)}¢
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MarketCard({ market }: { market: PredictionMarket }) {
  const top = market.outcomes.find((o) => o.price !== null) ?? null;
  const left = daysLeft(market.closesAt);
  const title = market.questionKo ?? market.question;

  return (
    <li className="card p-3">
      <p className="text-[13px] leading-relaxed font-semibold break-keep text-fg">{title || NO_VALUE}</p>

      {/* 원문 그대로 보여줄 때는 그 사실을 적는다. 뉴스 섹션과 같은 규칙이다. */}
      {market.questionKo === null && market.question ? (
        <p className="mt-0.5 text-[11.5px] text-subtle">원문 그대로 표시 (번역하지 않음)</p>
      ) : market.questionOrigin === 'derived' ? (
        <p className="mt-0.5 text-[11.5px] text-subtle">
          원문 “{market.question}” · 한국어는 이 앱이 옮긴 것입니다
        </p>
      ) : null}

      {market.unavailableReason ? (
        <p className="mt-2 text-[12.5px] break-keep" style={{ color: 'var(--warn)' }}>
          <span aria-hidden="true">△ </span>
          {market.unavailableReason}
        </p>
      ) : (
        <>
          <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border pt-2.5">
            <div className="min-w-0">
              <p className="tnum text-[24px] leading-none font-bold text-fg-strong">
                {top?.price === null || top === null ? NO_VALUE : `${formatNumber(top.price, 0)}¢`}
              </p>
              <p className="mt-1 text-[11.5px] break-keep text-muted">
                ‘{top?.labelKo ?? top?.label ?? '—'}’ 쪽에 매겨진 값 (1달러 = 100¢)
              </p>
            </div>
            <p className="shrink-0 text-right text-[12.5px] text-muted">
              <span className="block text-[10.5px] text-subtle">같은 쪽 24시간</span>
              <span className="tnum">
                {market.changeDay === null ? NO_VALUE : `${formatSigned(market.changeDay, 1)}¢`}
              </span>
            </p>
          </div>

          <OutcomeBar market={market} />
        </>
      )}

      <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-[11.5px] text-subtle">
        <span className="tnum">
          24시간 거래 {market.volume24h === null ? NO_VALUE : `$${formatCompactEn(market.volume24h, 1)}`}
        </span>
        <span>
          마감 {market.closesAt ? formatKstYmd(market.closesAt) : NO_VALUE}
          {left !== null ? ` (${left}일 남음)` : ''}
        </span>
        {market.url ? (
          <a
            href={market.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent hover:underline"
          >
            원문 보기 ↗
          </a>
        ) : (
          <span>DEMO 샘플이라 원문 링크가 없습니다</span>
        )}
      </p>
    </li>
  );
}

export function PredictionSection() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.prediction ?? null;

  return (
    <section aria-labelledby="prediction-title" className="mt-5 px-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="prediction-title" className="text-base font-bold text-fg-strong">
          예측시장에서 화제인 질문
        </h2>
        <span className="shrink-0 text-[11.5px] text-subtle">계속 바뀝니다</span>
      </div>

      <SectionGate
        section={section}
        onRetry={refresh}
        loading={
          <div className="space-y-2">
            <SkeletonCard height={50} lines={2} />
            <SkeletonCard height={50} lines={2} />
          </div>
        }
        empty={<EmptyState title="가져온 질문이 없습니다" />}
      >
        {(digest) => (
          <>
            <div className="mb-2 flex items-center gap-1.5">
              <Badge tone="neutral" size="xs">
                <span aria-hidden="true">◈</span>
                {digest.venue}
              </Badge>
              <span className="tnum text-[11.5px] text-subtle">{formatKstTime(digest.meta.fetchedAt)} 기준</span>
            </div>

            {digest.markets.length === 0 ? (
              <EmptyState title="가져온 질문이 없습니다" />
            ) : (
              <ul className="space-y-2">
                {digest.markets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </ul>
            )}

            <div className="mt-2">
              <Notice tone="neutral">
                <strong>여기 숫자는 확률이 아니라 가격입니다.</strong> 68¢ 는 “그 일이 일어난다”에 사람들이 1달러 중
                68센트를 내고 있다는 뜻일 뿐, 실제로 그렇게 될 확률이 68%라는 보장이 아닙니다. 소수의 큰 주문이나
                거래가 적은 질문에서는 값이 크게 튑니다.
              </Notice>
            </div>
            <div className="mt-2">
              <Notice tone="warn">
                예측시장은 투자상품이 아니며 이 앱은 거래를 중개하지 않습니다. 국내에서는 이용이 제한될 수 있으니
                참여 전에 직접 확인하세요. 이 칸은 화제가 되는 질문을 보여줄 뿐 참여를 권하지 않습니다.
              </Notice>
            </div>
          </>
        )}
      </SectionGate>
    </section>
  );
}

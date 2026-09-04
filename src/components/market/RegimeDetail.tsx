'use client';

/**
 * 국면 전광판 — 전용 화면.
 *
 * 여기서 제일 중요한 건 위쪽 점수가 아니라 아래쪽 **검증 결과**다.
 * "20년 만의 공포" 라는 문장을 띄우는 화면이라면, 예전에 그 문장이 떴을 때
 * 실제로 무슨 일이 있었는지도 같은 화면에서 보여 줘야 한다.
 * 그래서 좋았던 경우와 나빴던 경우를 둘 다 숫자로 싣는다.
 */

import { useData } from '@/components/providers/DataProvider';
import { SectionGate, SkeletonCard } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { RegimeBoardBody, bandColor } from '@/components/market/RegimeBoard';
import { bandFor } from '@/lib/regimeRules.mjs';
import {
  EVIDENCE_BUCKETS,
  EVIDENCE_FINDINGS,
  EVIDENCE_LIMITS,
  EVIDENCE_SAMPLE,
  EVIDENCE_SOURCES,
  EXTREME_FEAR_EPISODES,
  FEAR_EPISODES,
  HOT_EPISODES,
  LIVE_VS_BACKTEST,
} from '@/lib/regimeEvidence.mjs';
import type { EvidenceEpisode } from '@/lib/regimeEvidence.d.mts';
import type { RegimeDigest } from '@/types';

/* ------------------------------ 20년 곡선 ------------------------------ */

function BigChart({ history }: { history: { t: number; score: number }[] }) {
  if (history.length < 8) {
    return <p className="card p-3.5 text-[12px] text-muted">곡선을 그릴 만큼 자료가 쌓이지 않았습니다.</p>;
  }
  const W = 320;
  const H = 130;
  const L = 22;
  const B = 16;
  const t0 = history[0].t;
  const t1 = history[history.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => L + ((t - t0) / span) * (W - L - 4);
  const y = (s: number) => (H - B) - (Math.min(100, Math.max(0, s)) / 100) * (H - B - 6);

  const d = history.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(h.t).toFixed(1)},${y(h.score).toFixed(1)}`).join(' ');
  const last = history[history.length - 1];

  // 연도 눈금 — 5년 간격이면 320px 에서도 겹치지 않는다
  const years: number[] = [];
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  for (let yr = Math.ceil(y0 / 5) * 5; yr <= y1; yr += 5) years.push(yr);

  return (
    <div className="card p-3.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="국면 점수 20년 곡선">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray={v === 50 ? '0' : '3 3'} />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize="7.5" fill="var(--subtle-fg)">
              {v}
            </text>
          </g>
        ))}
        {years.map((yr) => {
          const t = Date.UTC(yr, 0, 1);
          if (t < t0 || t > t1) return null;
          return (
            <text key={yr} x={x(t)} y={H - 4} textAnchor="middle" fontSize="7.5" fill="var(--subtle-fg)">
              {String(yr).slice(2)}
            </text>
          );
        })}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx={x(last.t)} cy={y(last.score)} r="3" fill={bandColor(bandFor(last.score))} />
      </svg>
      <p className="mt-1 text-[10.5px] leading-relaxed break-keep text-subtle">
        매 시점의 분포를 그 시점까지의 자료로만 만들어 계산했습니다. 곡선의 왼쪽 끝은 20년치가 다 쌓이기 전이라 더 짧은
        기간과 비교한 값입니다.
      </p>
    </div>
  );
}

/* ------------------------------ 검증 결과 ------------------------------ */

const sign = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

function BucketTable() {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[420px] text-[11px]">
        <thead>
          <tr className="border-b border-border text-left text-subtle">
            <th className="px-3 py-2 font-semibold">점수 구간</th>
            <th className="px-2 py-2 text-right font-semibold">국면 수</th>
            <th className="px-2 py-2 text-right font-semibold">12개월 뒤 평균</th>
            <th className="px-2 py-2 text-right font-semibold">플러스 비율</th>
            <th className="px-3 py-2 text-right font-semibold">그 사이 최대 낙폭</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {EVIDENCE_BUCKETS.map((b) => (
            <tr key={b.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 whitespace-nowrap text-fg">
                <span className="text-subtle">
                  {b.from}–{b.to === 101 ? 100 : b.to}
                </span>{' '}
                {b.label}
              </td>
              <td className="px-2 py-2 text-right text-muted">{b.episodes}</td>
              <td
                className="px-2 py-2 text-right font-semibold"
                style={{ color: b.sample === 0 ? 'var(--subtle-fg)' : b.fwd12Mean! >= 0 ? 'var(--ok)' : 'var(--danger)' }}
              >
                {b.sample === 0 ? '표본 없음' : `${sign(b.fwd12Mean!)}%`}
              </td>
              <td className="px-2 py-2 text-right text-muted">{b.sample === 0 ? '—' : `${b.positiveShare}%`}</td>
              <td className="px-3 py-2 text-right text-muted">{b.sample === 0 ? '—' : `${b.deepestDip!.toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EpisodeTable({ title, note, episodes }: { title: string; note: string; episodes: EvidenceEpisode[] }) {
  return (
    <div className="mt-3">
      <h3 className="text-[12.5px] font-bold text-fg-strong">{title}</h3>
      <p className="mt-0.5 mb-1.5 text-[11px] leading-relaxed break-keep text-muted">{note}</p>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[420px] text-[11px]">
          <thead>
            <tr className="border-b border-border text-left text-subtle">
              <th className="px-3 py-2 font-semibold">국면</th>
              <th className="px-2 py-2 text-right font-semibold">최저 점수</th>
              <th className="px-2 py-2 text-right font-semibold">그 뒤 12개월</th>
              <th className="px-3 py-2 text-right font-semibold">그 사이 최대 낙폭</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {episodes.map((e) => (
              <tr key={e.from} className="border-b border-border last:border-0">
                {/* 끝 달을 '01-04' 로 줄이면 1월 4일처럼 읽힌다. 통째로 쓴다. */}
                <td className="px-3 py-2 whitespace-nowrap text-fg">
                  {e.from}
                  {e.to !== e.from ? ` ~ ${e.to}` : ''}
                </td>
                <td className="px-2 py-2 text-right text-muted">{e.troughScore.toFixed(1)}</td>
                <td
                  className="px-2 py-2 text-right font-semibold"
                  style={{ color: e.fwd12 === null ? 'var(--subtle-fg)' : e.fwd12 >= 0 ? 'var(--ok)' : 'var(--danger)' }}
                >
                  {e.fwd12 === null ? '진행 중' : `${sign(e.fwd12)}%`}
                </td>
                <td className="px-3 py-2 text-right text-muted">
                  {e.deepestDip === null ? '—' : `${e.deepestDip.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- 화면 -------------------------------- */

export function RegimeDetail() {
  const { snapshot, refresh } = useData();
  const section = snapshot?.sections.regime ?? null;

  return (
    <div className="space-y-5">
      <section className="px-3">
        <SectionGate section={section} onRetry={refresh} loading={<SkeletonCard height={150} lines={4} />}>
          {(digest: RegimeDigest) => (
            <>
              <RegimeBoardBody digest={digest} compact />
              <div className="mt-3">
                <BigChart history={digest.history} />
              </div>
              <ul className="mt-3 space-y-1">
                {digest.board.axes.map((a) => (
                  <li key={a.id} className="card flex items-start gap-2 p-2.5">
                    <span className="w-[74px] shrink-0 text-[11.5px] font-semibold text-fg-strong">{a.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="tnum text-[11.5px] text-fg">
                        {a.value === null ? '값 없음' : `${a.value.toFixed(a.precision)}${a.unit}`}
                        {a.percentile !== null && (
                          <span className="text-muted">
                            {' '}
                            · 최근 {a.years}년 중 {a.percentile.toFixed(0)}점
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed break-keep text-subtle">
                        {a.reason ? a.reason : a.hint}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionGate>
      </section>

      {/* ---------------- 검증 ---------------- */}
      <section aria-labelledby="regime-evidence" className="px-3">
        <div className="mb-2 flex items-center gap-2">
          <h2 id="regime-evidence" className="text-base font-bold text-fg-strong">
            이게 주가 흐름과 맞나
          </h2>
          <Badge tone="accent" size="xs">
            <span aria-hidden="true">▪</span>검증
          </Badge>
        </div>
        <p className="mb-3 text-[11.5px] leading-relaxed break-keep text-muted">
          {EVIDENCE_SAMPLE.from}부터 {EVIDENCE_SAMPLE.to}까지 {EVIDENCE_SAMPLE.months}개월을 같은 산식으로 다시 계산해,
          점수가 나온 달마다 S&amp;P 500 의 이후 12개월을 붙여 봤습니다. 결론부터 적으면{' '}
          <strong className="text-fg-strong">&quot;공포면 사고 과열이면 판다&quot;는 이 자료에서 성립하지 않습니다.</strong>
        </p>

        <BucketTable />

        <ul className="mt-3 space-y-2">
          {EVIDENCE_FINDINGS.map((f) => (
            <li key={f.id} className="card p-3">
              <p className="text-[12.5px] font-bold text-fg-strong">{f.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-muted">{f.body}</p>
            </li>
          ))}
        </ul>

        <EpisodeTable
          title="극단적 공포 국면 — 26년에 네 번"
          note="점수가 10 아래로 내려간 국면 전부입니다. 네 번 중 두 번은 12개월 뒤에도 손실이었습니다."
          episodes={EXTREME_FEAR_EPISODES}
        />
        <EpisodeTable
          title="공포 국면 — 성적이 가장 나빴던 구간"
          note="10~25점 구간입니다. 2008년 3월이 여기 있었고 12개월 뒤 -42.5% 였습니다."
          episodes={FEAR_EPISODES}
        />
        <EpisodeTable
          title="과열 국면 — 대체로 더 올랐다"
          note="75점 이상 국면입니다. 11번 중 8번은 12개월 뒤 플러스였습니다."
          episodes={HOT_EPISODES}
        />
      </section>

      {/* ---------------- 한계 ---------------- */}
      <section aria-labelledby="regime-limits" className="px-3">
        <h2 id="regime-limits" className="mb-2 text-base font-bold text-fg-strong">
          이 검증이 못 하는 것
        </h2>
        <ul className="card space-y-2 p-3.5">
          {EVIDENCE_LIMITS.map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-[11.5px] leading-relaxed break-keep text-muted">
              <span aria-hidden="true" className="mt-[3px] shrink-0 text-subtle">
                ▪
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- 출처 ---------------- */}
      <section aria-labelledby="regime-sources" className="px-3 pb-2">
        <h2 id="regime-sources" className="mb-2 text-base font-bold text-fg-strong">
          검증에 쓴 자료
        </h2>
        <ul className="card space-y-2.5 p-3.5">
          {EVIDENCE_SOURCES.map((s) => (
            <li key={s.id}>
              <p className="text-[11.5px] font-semibold text-fg">{s.label}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed break-keep text-subtle">
                {s.origin} · {s.via}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10.5px] leading-relaxed break-keep text-subtle">{LIVE_VS_BACKTEST}</p>
      </section>
    </div>
  );
}

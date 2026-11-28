'use client';

/**
 * 종목 차트 (2026-11-27) — 종목을 찾아 운영자 기법(4시간봉 RSI · 다이버전스, 슈퍼트렌드는 후순위)과
 * 이동평균 · 추세선(1년선) · OBV 를 한 화면에서 본다. 처음 이름은 '참고' 였다가 같은 날 '차트' 로 바꿨다.
 *
 * 마크업과 CSS(src/app/ta.css)는 미리보기(template.html viewRef)와 같다.
 * 계산은 src/lib/ta.mjs, 그림 · 기법 카드 · 표 · 검색 추천은 src/lib/taChart.mjs — 미리보기도 같은 파일을 쓴다.
 * 매수 · 매도 지시를 하지 않는다(AGENTS.md 1절). 기법은 '조건 충족' 으로만 적는다.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useData } from '@/components/providers/DataProvider';
import { ModeBadge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/States';
import { changeColor } from '@/lib/scale';
import { taAssets, TA_DEFAULT_ASSET } from '@/lib/taAssets';
import {
  taModel, taBoard, taReadout, taParseCode, taBarUnit, taLastChange, taSearch,
  TA_RANGES, TA_DEFAULT_RANGE, TA_DEFAULT_TF, TA_TEXT, TA_PROFILES, TA_PROFILE_TEXT, TA_DEFAULT_PROFILE,
  taWindow, taZoom, taPan,
  type TaProfile,
} from '@/lib/ta.mjs';
import {
  taChartHtml, taIndexAt, taCrossSvg, taBoardHtml, taSuggestHtml, taQuickHtml, taPrice, taAxisDate, taStamp,
} from '@/lib/taChart.mjs';
import type { TaBarsResult, TaTf } from '@/types';

interface Sel {
  a: string | null;
  code: string | null;
}

/** 자주 보는 종목 — 검색 없이 한 번에 */
const QUICK = ['spx', 'ndx', 'kospi', 'tsla', 'nvda', 'samsung'];

function readQuery(): { sel: Sel; tf: TaTf; range: string | null; profile: TaProfile } {
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get('tf');
  const tf: TaTf = t === '1d' || t === '4h' ? t : TA_DEFAULT_TF;
  const code = sp.get('code');
  const parsed = code ? taParseCode(code) : null;
  const a = sp.get('a');
  const ok = a && taAssets().some((x) => x.id === a);
  return {
    sel: parsed ? { a: null, code: parsed.code } : { a: ok ? a : TA_DEFAULT_ASSET, code: null },
    tf,
    range: sp.get('r'),
    profile: (TA_PROFILES as string[]).includes(sp.get('p') ?? '') ? (sp.get('p') as TaProfile) : TA_DEFAULT_PROFILE,
  };
}

export default function ChartPage() {
  const { settings } = useSettings();
  const { snapshot } = useData();
  const [sel, setSel] = useState<Sel | null>(null);
  const [tf, setTf] = useState<TaTf>(TA_DEFAULT_TF);
  const [range, setRange] = useState<string>(TA_DEFAULT_RANGE[TA_DEFAULT_TF]);
  // 기법 성향 — 방어적(둘 다 + 슈퍼트렌드 확인) · 공격적(하나만 닿아도). 2026-11-28
  const [profile, setProfile] = useState<TaProfile>(TA_DEFAULT_PROFILE);
  const [data, setData] = useState<TaBarsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  // 확대 · 이동 (2026-11-28) — null 이면 고른 구간(1개월 · 3개월 …)을 최근 봉까지
  const [zoom, setZoom] = useState<{ span: number; offset: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x0: number; w0: ReturnType<typeof taWindow>; moved: boolean } | null>(null);

  const list = useMemo(() => taAssets().map((x) => ({ id: x.id, name: x.name, code: x.symbol })), []);
  const quick = useMemo(() => QUICK.map((id) => list.find((x) => x.id === id)).filter((x): x is (typeof list)[number] => !!x), [list]);

  // 주소의 ?a= · ?code= · ?tf= · ?r= 로 시작한다 — 다른 화면에서 바로 열 수 있게
  useEffect(() => {
    const r = readQuery();
    setSel(r.sel);
    setTf(r.tf);
    setRange(r.range && TA_RANGES[r.tf].some(([k]) => k === r.range) ? r.range : TA_DEFAULT_RANGE[r.tf]);
    setProfile(r.profile);
  }, []);

  useEffect(() => {
    if (!sel) return;
    const qs = new URLSearchParams();
    if (sel.a) qs.set('a', sel.a);
    if (sel.code) qs.set('code', sel.code);
    qs.set('tf', tf);
    qs.set('r', range);
    qs.set('p', profile);
    window.history.replaceState(null, '', `/chart?${qs.toString()}`);
  }, [sel, tf, range, profile]);

  useEffect(() => {
    if (!sel) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setCursor(null);
    setZoom(null);
    const p = sel.a ? `a=${encodeURIComponent(sel.a)}` : `code=${encodeURIComponent(sel.code ?? '')}`;
    fetch(`/api/ta?${p}&tf=${tf}`, { signal: ctl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `불러오지 못했습니다 (HTTP ${res.status})`);
        setData(body as TaBarsResult);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoading(false);
      });
    return () => ctl.abort();
  }, [sel, tf]);

  // 그림 폭 = 담는 칸 폭. 늘이거나 줄이지 않아야 글자가 12px 그대로 보인다
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [data]);

  const model = useMemo(
    () =>
      data
        ? taModel({ tf: data.tf, bars: data.bars, daily: data.daily, gmtoffset: data.gmtoffset, market: data.market, mood: data.mood ?? null })
        : null,
    [data],
  );

  const view = useMemo(() => {
    if (!model || !data || model.n === 0) return null;
    const want = TA_RANGES[data.tf].find(([k]) => k === range)?.[2] ?? TA_RANGES[data.tf][1][2];
    const win = taWindow(model.n, zoom?.span ?? want, zoom?.offset ?? 0);
    const { from, to } = win;
    const price = taPrice(data.precision);
    const board = taBoard(model, undefined, profile);
    const chart = width
      ? taChartHtml(model, {
          from,
          to,
          width,
          price,
          mark: board.mark,
          signals: board.signals,
          profileText: TA_PROFILE_TEXT[profile],
          date: taAxisDate(data.tf, to - from + 1, data.market),
          title: `${data.name} ${taBarUnit(data.tf)}`,
        })
      : null;
    return {
      from,
      to,
      win,
      price,
      chart,
      board,
      stamp: taStamp(data.tf, data.market),
      // innerHTML 로 넣는 글은 한 번 만든 객체를 그대로 쓴다. 렌더마다 새 객체를 주면 React 가 그림을 통째로 다시 넣어
      // 누른 봉의 숫자 상자(그림 안 '.ta-crossg')가 지워진다(실제로 겪었다).
      chartInner: chart ? { __html: chart.html } : undefined,
      boardInner: { __html: taBoardHtml(board) },
    };
  }, [model, data, range, width, profile, zoom]);
  const viewRef = useRef(view);
  viewRef.current = view;

  // 누른 봉의 숫자 — 세로선 · 숫자 상자 · 오른쪽 축 꼬리표를 그림 안 '.ta-crossg' 에 넣는다(taCrossSvg)
  const moveCross = useCallback(
    (i: number | null) => {
      const g = boxRef.current?.querySelector<SVGGElement>('.ta-crossg');
      if (!g || !view?.chart || !model) return;
      g.innerHTML = i === null ? '' : taCrossSvg(model, view.chart.layout, i, { price: view.price, stamp: view.stamp });
      setCursor(i);
    },
    [view, model],
  );

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const svg = boxRef.current?.querySelector('svg');
    if (!svg || !view?.chart) return null;
    const rect = svg.getBoundingClientRect();
    return taIndexAt(view.chart.layout, ((e.clientX - rect.left) * view.chart.layout.W) / rect.width);
  };
  // 옆으로 끌면 이동(2026-11-28), 끌지 않고 떼면 그 봉의 숫자. 손가락으로 같은 봉을 한 번 더 누르면 숫자 상자를 닫는다.
  // 마우스는 올리면 보이고 차트 밖으로 나가면 닫힌다
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!view || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x0: e.clientX, w0: view.win, moved: false };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    const i = indexAt(e);
    if (i === null) return;
    moveCross(e.pointerType !== 'mouse' && i === cursor ? null : i);
  };
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && !drag.current) moveCross(null);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId && model && view?.chart) {
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (d.moved) {
        const svg = boxRef.current?.querySelector('svg');
        const px = svg ? (svg.getBoundingClientRect().width / view.chart.layout.W) * view.chart.layout.step : 0;
        if (px > 0) {
          const w = taPan(model.n, d.w0, Math.round(dx / px));
          setZoom({ span: w.span, offset: w.offset });
        }
        return;
      }
    }
    if (e.pointerType !== 'mouse') return;
    const i = indexAt(e);
    if (i !== null && i !== cursor) moveCross(i);
  };
  const zoomBy = (factor: number, anchor = 1) => {
    const v = viewRef.current;
    if (!v || !model) return;
    const w = taZoom(model.n, v.win, factor, anchor);
    setZoom({ span: w.span, offset: w.offset });
  };
  // 휠로 확대 · 축소 — 차트 위에서만, 마우스가 가리킨 봉이 그 자리에 머문다
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const svg = el.querySelector('svg');
      if (!v?.chart || !svg || !model) return;
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const { L, step, W } = v.chart.layout;
      const anchor = Math.max(0, Math.min(1, (((e.clientX - rect.left) * W) / rect.width - L) / (v.win.span * step)));
      zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, delta * (e.deltaMode === 1 ? 16 : 1) * 0.003))), anchor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, model]);

  // 그림을 다시 그리면(폭 · 구간이 바뀌면) 짚어 둔 봉의 숫자를 다시 얹는다
  useEffect(() => {
    if (cursor === null || !view?.chart) return;
    if (cursor >= view.from && cursor <= view.to) moveCross(cursor);
    else setCursor(null);
    // 그림이 바뀔 때만 — cursor 가 바뀔 때마다 돌면 moveCross 와 서로 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!view) return;
    const cur = cursor ?? view.to;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveCross(Math.max(view.from, cur - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveCross(Math.min(view.to, cur + 1)); }
    else if (e.key === 'Escape') moveCross(null);
  };

  // 찾기 — 목록에서 맞는 것, 목록에 없으면 코드로
  const hits = taSearch(q, list);
  const parsed = taParseCode(q);
  const codeOpt = parsed && !hits.some((h) => h.code.toUpperCase() === parsed.code) ? parsed.code : null;

  const pick = (s: Sel) => {
    setSel(s);
    setQ('');
    setSearchError(null);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (hits[0]) pick({ a: hits[0].id, code: null });
    else if (codeOpt) pick({ a: null, code: codeOpt });
    else setSearchError('찾는 종목이 없습니다. 미국은 TSLA, 한국은 005930 처럼 코드로도 찾을 수 있습니다.');
  };
  const onPickClick = (e: MouseEvent<HTMLDivElement>) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.taPick) pick({ a: b.dataset.taPick, code: null });
    else if (b.dataset.taCode) pick({ a: null, code: b.dataset.taCode });
  };

  const pickTf = (next: TaTf) => {
    setTf(next);
    setRange(TA_DEFAULT_RANGE[next]);
  };

  const up = changeColor('up', settings.colorMode);
  const down = changeColor('down', settings.colorMode);

  // 같은 시장의 쫄탐지수 — 없으면(한국은 내지 않는다) 미국 것을 이유와 함께
  const fngList = snapshot?.sections.fng?.data ?? [];
  const market = data?.market ?? 'us';
  const own = fngList.find((f) => f.market === market && f.score !== null);
  const usFng = fngList.find((f) => f.market === 'us' && f.score !== null);
  const mood = own ?? usFng ?? null;

  const change = model ? taLastChange(model) : null;
  const shown = cursor ?? view?.to ?? null;
  const unit = data ? taBarUnit(data.tf) : '';

  return (
    <div className="ta" style={{ ['--ta-up' as string]: up, ['--ta-down' as string]: down }}>
      <div>
        <div className="ta-head">
          <h1>{TA_TEXT.title}</h1>
          {data ? <ModeBadge mode={data.mode} size="xs" /> : null}
        </div>
        <p className="ta-lede">{TA_TEXT.lede}</p>
      </div>

      <div className="ta-pick" onClick={onPickClick}>
        <form className="ta-search" onSubmit={onSearch} role="search" aria-label="종목 찾기">
          <label className="sr-only" htmlFor="ta-q">종목 이름 · 초성 · 코드</label>
          <input
            id="ta-q"
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSearchError(null); }}
            placeholder="종목 찾기 (테슬라, ㅌㅅㄹ, TSLA, 005930)"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
          />
          <button type="submit">찾기</button>
        </form>
        {q.trim() ? <div id="ta-sug" dangerouslySetInnerHTML={{ __html: taSuggestHtml(hits, codeOpt) }} /> : null}
        {searchError ? <p className="ta-err" role="alert">{searchError}</p> : null}
        <div dangerouslySetInnerHTML={{ __html: taQuickHtml(quick, sel?.a ?? null) }} />
        <div className="ta-row">
          <div className="ta-seg" role="group" aria-label="봉 단위">
            {(['4h', '1d'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tf === k} onClick={() => pickTf(k)}>
                {taBarUnit(k)}
              </button>
            ))}
          </div>
          <p className="ta-hint">{TA_TEXT.searchHint}</p>
        </div>
      </div>

      {error ? (
        <p className="ta-err" role="alert">{error}</p>
      ) : !data || !model || !view ? (
        <SkeletonCard height={420} lines={3} />
      ) : (
        <>
          <div>
            <div className="ta-title">
              <b>{data.name}</b>
              <span className="ta-code-tag">{data.code} · {unit}{loading ? ' · 불러오는 중' : ''}</span>
              <span className="ta-last">{view.price(model.c[model.n - 1])}</span>
              {change ? (
                <span className="ta-chg" style={{ color: change.abs > 0 ? up : change.abs < 0 ? down : 'var(--flat-fg)' }}>
                  {change.abs > 0 ? '▲' : change.abs < 0 ? '▼' : '–'} {Math.abs(change.pct).toFixed(2)}% <small>{change.label}</small>
                </span>
              ) : null}
            </div>
            <p className="ta-src">
              {data.mode === 'DEMO'
                ? 'DEMO — 지어낸 값입니다. 실제 시세가 아닙니다.'
                : `출처 ${data.source.name} · ${data.source.delayMinutes ?? '?'}분 지연 · 개인적·비상업적 범위에서 씁니다`}
            </p>
          </div>

          {mood ? (
            <Link className="ta-mood" href={`/fng/${mood.market}`}>
              <span>
                {mood.market === 'us' ? '미국' : '한국'} 쫄탐지수 <b>{Math.round(mood.score as number)}</b> · {mood.stage?.label ?? ''}
                {!own && market === 'kr' ? <small> 한국 쫄탐지수는 내지 않아 미국 것을 봅니다</small> : null}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          <section className="ta-sec" aria-labelledby="ta-now-title">
            <h2 id="ta-now-title">
              지금 상태 <small>마지막 {unit} 기준</small>
            </h2>
            <div className="ta-row">
              <div className="ta-seg" role="group" aria-label="기법 성향">
                {TA_PROFILES.map((k) => (
                  <button key={k} type="button" aria-pressed={profile === k} onClick={() => setProfile(k)}>
                    {TA_PROFILE_TEXT[k]}
                  </button>
                ))}
              </div>
              <p className="ta-hint">{TA_TEXT.profileHint}</p>
            </div>
            {data.moodNote ? <p className="ta-note" role="status">{data.moodNote}</p> : null}
            <div dangerouslySetInnerHTML={view.boardInner} />
            <details className="ta-howto">
              <summary>{TA_TEXT.techTitle} — 보는 순서</summary>
              <ol>
                {TA_TEXT.techSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
            <p className="ta-note">{TA_TEXT.techNote}</p>
          </section>

          <section className="ta-sec" aria-labelledby="ta-chart-title">
            <h2 id="ta-chart-title">
              차트 <small>{unit} · 봉 {view.to - view.from + 1}개</small>
            </h2>
            <div className="ta-ranges" role="group" aria-label="보이는 구간">
              {TA_RANGES[data.tf].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={zoom === null && range === k} onClick={() => { setRange(k); setZoom(null); moveCross(null); }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ta-pan">
              <button type="button" aria-label="차트 축소" onClick={() => zoomBy(1.25)}>−</button>
              <button type="button" aria-label="차트 확대" onClick={() => zoomBy(0.8)}>＋</button>
              <small>{TA_TEXT.panHint}</small>
            </div>
            <p className="ta-read" aria-live="polite">
              {shown !== null ? `${view.stamp(model.t[shown])} · ${taReadout(model, shown, view.price)}` : ''}
            </p>
            <div
              ref={boxRef}
              className="ta-chart"
              tabIndex={0}
              aria-label="차트 — 눌러서 봉을 짚습니다. 왼쪽 · 오른쪽 화살표로 옮깁니다."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { drag.current = null; }}
              onPointerLeave={onPointerLeave}
              onKeyDown={onKey}
              dangerouslySetInnerHTML={view.chartInner}
            />
            <div className="ta-pan">
              <label htmlFor="ta-position">시간 이동</label>
              <input
                id="ta-position"
                type="range"
                min={0}
                max={view.win.maxOffset}
                step={1}
                value={view.win.maxOffset - view.win.offset}
                disabled={view.win.maxOffset === 0}
                aria-valuetext={`${view.stamp(model.t[view.from])}부터`}
                onChange={(e) => setZoom({ span: view.win.span, offset: view.win.maxOffset - Number(e.target.value) })}
              />
              <button type="button" onClick={() => setZoom({ span: view.win.span, offset: 0 })} disabled={view.win.offset === 0}>
                최근 봉
              </button>
            </div>
            <p className="ta-note">{TA_TEXT.markNote}</p>
          </section>

          <details className="ta-fold">
            <summary>산출 방법</summary>
            <dl>
              {TA_TEXT.methods.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="ta-note">{TA_TEXT.notIncluded}</p>
          </details>
        </>
      )}
    </div>
  );
}

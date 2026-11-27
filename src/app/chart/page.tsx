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
  taModel, taSummary, taReadout, taParseCode, taBarUnit, taLastChange, techEvents, techNow, taSearch,
  TA_RANGES, TA_DEFAULT_RANGE, TA_DEFAULT_TF, TA_TEXT,
} from '@/lib/ta.mjs';
import {
  taChartHtml, taIndexAt, taXOf, taSummaryHtml, taTechHtml, taSuggestHtml, taQuickHtml, taPrice, taAxisDate, taStamp,
} from '@/lib/taChart.mjs';
import type { TaBarsResult, TaTf } from '@/types';

interface Sel {
  a: string | null;
  code: string | null;
}

/** 자주 보는 종목 — 검색 없이 한 번에 */
const QUICK = ['spx', 'ndx', 'kospi', 'tsla', 'nvda', 'samsung'];

function readQuery(): { sel: Sel; tf: TaTf; range: string | null } {
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
  };
}

export default function ChartPage() {
  const { settings } = useSettings();
  const { snapshot } = useData();
  const [sel, setSel] = useState<Sel | null>(null);
  const [tf, setTf] = useState<TaTf>(TA_DEFAULT_TF);
  const [range, setRange] = useState<string>(TA_DEFAULT_RANGE[TA_DEFAULT_TF]);
  const [data, setData] = useState<TaBarsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const list = useMemo(() => taAssets().map((x) => ({ id: x.id, name: x.name, code: x.symbol })), []);
  const quick = useMemo(() => QUICK.map((id) => list.find((x) => x.id === id)).filter((x): x is (typeof list)[number] => !!x), [list]);

  // 주소의 ?a= · ?code= · ?tf= · ?r= 로 시작한다 — 다른 화면에서 바로 열 수 있게
  useEffect(() => {
    const r = readQuery();
    setSel(r.sel);
    setTf(r.tf);
    setRange(r.range && TA_RANGES[r.tf].some(([k]) => k === r.range) ? r.range : TA_DEFAULT_RANGE[r.tf]);
  }, []);

  useEffect(() => {
    if (!sel) return;
    const qs = new URLSearchParams();
    if (sel.a) qs.set('a', sel.a);
    if (sel.code) qs.set('code', sel.code);
    qs.set('tf', tf);
    qs.set('r', range);
    window.history.replaceState(null, '', `/chart?${qs.toString()}`);
  }, [sel, tf, range]);

  useEffect(() => {
    if (!sel) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setCursor(null);
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
    () => (data ? taModel({ tf: data.tf, bars: data.bars, daily: data.daily, gmtoffset: data.gmtoffset }) : null),
    [data],
  );

  const view = useMemo(() => {
    if (!model || !data || model.n === 0) return null;
    const want = TA_RANGES[data.tf].find(([k]) => k === range)?.[2] ?? TA_RANGES[data.tf][1][2];
    const to = model.n - 1;
    const from = Math.max(0, to - want + 1);
    const price = taPrice(data.precision);
    const tech = techEvents(model);
    const chart = width
      ? taChartHtml(model, {
          from,
          to,
          width,
          price,
          tech,
          date: taAxisDate(data.tf, to - from + 1, data.market),
          title: `${data.name} ${taBarUnit(data.tf)}`,
        })
      : null;
    // 기법 카드에 RSI · 다이버전스가 있으니 아래 표에는 나머지 지표만
    const rows = taSummary(model).filter((r) => r.key !== 'rsi' && r.key !== 'div');
    return { from, to, price, chart, rows, now: techNow(model), stamp: taStamp(data.tf, data.market) };
  }, [model, data, range, width]);

  const moveCross = useCallback(
    (i: number | null) => {
      const line = boxRef.current?.querySelector<SVGLineElement>('.ta-cross');
      if (!line || !view?.chart) return;
      if (i === null) {
        line.setAttribute('visibility', 'hidden');
      } else {
        const x = String(Math.round(taXOf(view.chart.layout, i) * 10) / 10);
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.setAttribute('visibility', 'visible');
      }
      setCursor(i);
    },
    [view],
  );

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const svg = boxRef.current?.querySelector('svg');
    if (!svg || !view?.chart) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * view.chart.layout.W) / rect.width;
    moveCross(taIndexAt(view.chart.layout, px));
  };

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

          <section className="ta-sec" aria-labelledby="ta-tech-title">
            <h2 id="ta-tech-title">
              {TA_TEXT.techTitle} <small>마지막 {unit} 기준</small>
            </h2>
            <div dangerouslySetInnerHTML={{ __html: taTechHtml(view.now) }} />
            <details className="ta-howto">
              <summary>보는 순서</summary>
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
                <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); moveCross(null); }}>
                  {label}
                </button>
              ))}
            </div>
            <p className="ta-read" aria-live="polite">
              {shown !== null ? `${view.stamp(model.t[shown])} · ${taReadout(model, shown, view.price)}` : ''}
            </p>
            <div
              ref={boxRef}
              className="ta-chart"
              tabIndex={0}
              aria-label="차트 — 눌러서 봉을 짚습니다. 왼쪽 · 오른쪽 화살표로 옮깁니다."
              onPointerDown={onPointer}
              onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') onPointer(e); }}
              onKeyDown={onKey}
              dangerouslySetInnerHTML={view.chart ? { __html: view.chart.html } : undefined}
            />
            <p className="ta-note">{TA_TEXT.markNote}</p>
          </section>

          <section className="ta-sec" aria-labelledby="ta-sum-title">
            <h2 id="ta-sum-title">
              다른 지표 <small>마지막 {unit} 기준</small>
            </h2>
            <div dangerouslySetInnerHTML={{ __html: taSummaryHtml(view.rows, null) }} />
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

'use client';

/**
 * 참고 차트 (2026-11-27) — 쫄탐지수와 RSI · 슈퍼트렌드 · OBV · 이동평균 · 추세선(1년선)을 한 화면에.
 *
 * 마크업과 CSS(src/app/ta.css)는 미리보기(template.html viewRef)와 같다.
 * 계산은 src/lib/ta.mjs, 그림 · 표는 src/lib/taChart.mjs — 미리보기도 같은 파일을 쓴다.
 * 매수 · 매도 지시를 하지 않는다(AGENTS.md 1절). 그림의 표시는 '상승 전환 ▲ / 하락 전환 ▼' — 지표가 바뀐 사실뿐.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useData } from '@/components/providers/DataProvider';
import { ModeBadge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/States';
import { changeColor } from '@/lib/scale';
import { taAssets, TA_DEFAULT_ASSET } from '@/lib/taAssets';
import {
  taModel, taSummary, taTally, taTallyText, taReadout, taParseCode, taBarUnit, taLastChange,
  TA_RANGES, TA_DEFAULT_RANGE, TA_TEXT,
} from '@/lib/ta.mjs';
import { taChartHtml, taIndexAt, taXOf, taSummaryHtml, taPrice, taAxisDate, taStamp } from '@/lib/taChart.mjs';
import type { TaBarsResult, TaTf } from '@/types';

interface Sel {
  a: string | null;
  code: string | null;
}

const GROUPS: [string, (m: string, k: string) => boolean][] = [
  ['미국 지수', (m, k) => m === 'us' && k === 'index'],
  ['미국 종목', (m, k) => m === 'us' && k === 'equity'],
  ['한국 지수', (m, k) => m === 'kr' && k === 'index'],
  ['한국 종목', (m, k) => m === 'kr' && k === 'equity'],
];

function readQuery(): { sel: Sel; tf: TaTf; range: string | null } {
  const sp = new URLSearchParams(window.location.search);
  const tf: TaTf = sp.get('tf') === '4h' ? '4h' : '1d';
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

export default function RefPage() {
  const { settings } = useSettings();
  const { snapshot } = useData();
  const [sel, setSel] = useState<Sel | null>(null);
  const [tf, setTf] = useState<TaTf>('1d');
  const [range, setRange] = useState<string>(TA_DEFAULT_RANGE['1d']);
  const [data, setData] = useState<TaBarsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 주소의 ?a= · ?code= · ?tf= · ?r= 로 시작한다 — 다른 화면에서 바로 열 수 있게
  useEffect(() => {
    const q = readQuery();
    setSel(q.sel);
    setTf(q.tf);
    setRange(q.range && TA_RANGES[q.tf].some(([k]) => k === q.range) ? q.range : TA_DEFAULT_RANGE[q.tf]);
  }, []);

  useEffect(() => {
    if (!sel) return;
    const qs = new URLSearchParams();
    if (sel.a) qs.set('a', sel.a);
    if (sel.code) qs.set('code', sel.code);
    qs.set('tf', tf);
    qs.set('r', range);
    window.history.replaceState(null, '', `/ref?${qs.toString()}`);
  }, [sel, tf, range]);

  useEffect(() => {
    if (!sel) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setCursor(null);
    const q = sel.a ? `a=${encodeURIComponent(sel.a)}` : `code=${encodeURIComponent(sel.code ?? '')}`;
    fetch(`/api/ta?${q}&tf=${tf}`, { signal: ctl.signal })
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
    const chart = width
      ? taChartHtml(model, {
          from,
          to,
          width,
          price,
          date: taAxisDate(data.tf, to - from + 1, data.market),
          title: `${data.name} ${taBarUnit(data.tf)}`,
        })
      : null;
    const rows = taSummary(model);
    return { from, to, price, chart, rows, tally: taTallyText(taTally(rows)), stamp: taStamp(data.tf, data.market) };
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

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    const p = taParseCode(codeText);
    if (!p) {
      setCodeError('코드 모양이 아닙니다. 미국은 TSLA, 한국은 005930 처럼 적어 주세요.');
      return;
    }
    setCodeError(null);
    setSel({ a: null, code: p.code });
  };

  const pickTf = (next: TaTf) => {
    setTf(next);
    setRange(TA_DEFAULT_RANGE[next]);
  };

  const up = changeColor('up', settings.colorMode);
  const down = changeColor('down', settings.colorMode);
  const assets = taAssets();

  // 같은 시장의 쫄탐지수 — 없으면(한국은 내지 않는다) 미국 것을 이유와 함께
  const fngList = snapshot?.sections.fng?.data ?? [];
  const market = data?.market ?? 'us';
  const own = fngList.find((f) => f.market === market && f.score !== null);
  const usFng = fngList.find((f) => f.market === 'us' && f.score !== null);
  const mood = own ?? usFng ?? null;

  const change = model ? taLastChange(model) : null;
  const shown = cursor ?? view?.to ?? null;

  return (
    <div className="ta" style={{ ['--ta-up' as string]: up, ['--ta-down' as string]: down }}>
      <div>
        <div className="ta-head">
          <h1>{TA_TEXT.title}</h1>
          {data ? <ModeBadge mode={data.mode} size="xs" /> : null}
        </div>
        <p className="ta-lede">{TA_TEXT.lede}</p>
      </div>

      <div className="ta-pick">
        <div className="ta-row">
          <label className="sr-only" htmlFor="ta-asset">볼 항목</label>
          <select
            id="ta-asset"
            className="ta-select"
            value={sel?.a ?? (sel?.code ? `code:${sel.code}` : '')}
            onChange={(e) => {
              const v = e.target.value;
              if (!v.startsWith('code:')) setSel({ a: v, code: null });
            }}
          >
            {sel?.code ? <option value={`code:${sel.code}`}>코드 {sel.code}</option> : null}
            {GROUPS.map(([label, test]) => (
              <optgroup key={label} label={label}>
                {assets.filter((x) => test(x.market, x.kind)).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="ta-seg" role="group" aria-label="봉 단위">
            {(['1d', '4h'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tf === k} onClick={() => pickTf(k)}>
                {taBarUnit(k)}
              </button>
            ))}
          </div>
        </div>
        <form className="ta-code" onSubmit={onCode} role="search" aria-label="종목 코드로 찾기">
          <label className="sr-only" htmlFor="ta-code">종목 코드</label>
          <input
            id="ta-code"
            value={codeText}
            onChange={(e) => setCodeText(e.target.value)}
            placeholder="코드 (TSLA, 005930)"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
          />
          <button type="submit">찾기</button>
        </form>
        <p className="ta-hint">{TA_TEXT.codeHint}</p>
        {codeError ? <p className="ta-err" role="alert">{codeError}</p> : null}
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
              <span className="ta-code-tag">{data.code} · {taBarUnit(data.tf)}{loading ? ' · 불러오는 중' : ''}</span>
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

          <section className="ta-sec" aria-labelledby="ta-chart-title">
            <h2 id="ta-chart-title">
              차트 <small>{taBarUnit(data.tf)} · 봉 {view.to - view.from + 1}개</small>
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
              지금 상태 <small>마지막 {taBarUnit(data.tf)} 기준</small>
            </h2>
            <div dangerouslySetInnerHTML={{ __html: taSummaryHtml(view.rows, view.tally) }} />
            <p className="ta-note">{TA_TEXT.tallyNote}</p>
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

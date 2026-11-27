/**
 * DEMO 종목 차트의 봉 (2026-11-27).
 *
 * DEMO 세계(world.ts)에는 종가만 있다. 시가 · 고가 · 저가 · 거래량은 종가에 맞춰 여기서 짓는다 —
 * 날짜마다 씨앗을 따로 둬서 같은 날은 늘 같은 봉이 나온다. 실데이터 경로에서는 쓰지 않는다.
 * 화면은 DEMO 배지를 단다(AGENTS.md 3절).
 */

import { gaussianFrom, hashSeed, mulberry32 } from '@/lib/rng';
import { zonedToUtc } from '@/lib/plazaRules.mjs';
import type { TaBarPoint } from '@/types';

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;

/** 하루 평균 움직임(로그 수익률 절댓값 평균) */
function typicalMove(closes: number[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      sum += Math.abs(Math.log(closes[i] / closes[i - 1]));
      n += 1;
    }
  }
  return n ? sum / n : 0.01;
}

/** 종가 → 일봉. 시가는 전날 종가 근처, 고가 · 저가는 몸통 바깥, 거래량은 움직임이 클수록 크게 */
export function demoDailyBars(id: string, dates: number[], closes: number[], precision: number): TaBarPoint[] {
  const vol = typicalMove(closes);
  const base = 2e6 * (1 + (hashSeed(`vol:${id}`) % 40));
  return closes.map((c, i) => {
    const g = gaussianFrom(mulberry32(hashSeed(`ta:${id}:${dates[i]}`)));
    const prev = i ? closes[i - 1] : c;
    const o = prev * (1 + g() * vol * 0.25);
    const h = Math.max(o, c) * (1 + Math.abs(g()) * vol * 0.5);
    const l = Math.min(o, c) * (1 - Math.abs(g()) * vol * 0.5);
    const move = i && vol ? Math.abs(Math.log(c / prev)) / vol : 1;
    const v = Math.round(base * (0.6 + 0.4 * move) * Math.exp(g() * 0.25));
    return { t: dates[i], o: round(o, precision), h: round(h, precision), l: round(l, precision), c, v };
  });
}

/**
 * 일봉 → 4시간봉 두 개 (미국 9:30 · 13:30 동부, 한국 9:00 · 13:00 서울).
 * 하루의 고가 · 저가는 두 봉 중 하나가 꼭 닿는다. 거래량은 오전이 조금 크다.
 */
export function demoFourHourBars(id: string, daily: TaBarPoint[], market: 'us' | 'kr', precision: number): TaBarPoint[] {
  const tz = market === 'us' ? 'America/New_York' : 'Asia/Seoul';
  const [h1, m1, h2, m2] = market === 'us' ? [9, 30, 13, 30] : [9, 0, 13, 0];
  const out: TaBarPoint[] = [];
  for (const d of daily) {
    const rand = mulberry32(hashSeed(`ta4:${id}:${d.t}`));
    const key = new Date(d.t).toISOString().slice(0, 10);
    const span = d.h - d.l;
    const mid = Math.min(d.h, Math.max(d.l, d.o + (d.c - d.o) * rand() + (rand() - 0.5) * span * 0.4));
    const hiFirst = rand() < 0.5;
    const loFirst = rand() < 0.5;
    const a = { o: d.o, c: mid };
    const b = { o: mid, c: d.c };
    const part = (p: { o: number; c: number }, hasHi: boolean, hasLo: boolean) => ({
      h: hasHi ? d.h : Math.max(p.o, p.c) + (d.h - Math.max(p.o, p.c)) * rand() * 0.6,
      l: hasLo ? d.l : Math.min(p.o, p.c) - (Math.min(p.o, p.c) - d.l) * rand() * 0.6,
    });
    const pa = part(a, hiFirst, loFirst);
    const pb = part(b, !hiFirst, !loFirst);
    const v1 = d.v === null ? null : Math.round(d.v * (0.55 + rand() * 0.1));
    const v2 = d.v === null || v1 === null ? null : d.v - v1;
    out.push({ t: zonedToUtc(key, h1, m1, tz), o: a.o, h: round(pa.h, precision), l: round(pa.l, precision), c: round(a.c, precision), v: v1 });
    out.push({ t: zonedToUtc(key, h2, m2, tz), o: round(b.o, precision), h: round(pb.h, precision), l: round(pb.l, precision), c: b.c, v: v2 });
  }
  return out;
}

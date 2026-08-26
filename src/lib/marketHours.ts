/**
 * 미국·한국 거래 세션 판정. 크립토는 24시간 거래로 별도 취급한다.
 *
 * 휴장일은 아래 정적 표를 사용한다. 실서비스에서는 거래소 캘린더 API
 * (예: NYSE calendar, KRX 휴장일 안내)로 교체할 것.  →  HOLIDAYS 상수만 갈아끼우면 된다.
 */

import type { MarketId, MarketSession, SessionPhase } from '@/types';

const US_TZ = 'America/New_York';
const KR_TZ = 'Asia/Seoul';

/** YYYY-MM-DD → 휴장 사유 */
export const US_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신년',
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Presidents' Day",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': '독립기념일 대체휴장',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas',
  '2027-01-01': '신년',
  '2027-01-18': 'Martin Luther King Jr. Day',
  '2027-02-15': "Presidents' Day",
  '2027-03-26': 'Good Friday',
  '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth 대체휴장',
  '2027-07-05': '독립기념일 대체휴장',
  '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving',
  '2027-12-24': 'Christmas 대체휴장',
};

export const KR_HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설 연휴',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-01': '근로자의 날',
  '2026-05-05': '어린이날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '지방선거일',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2026-12-31': '연말 휴장',
  '2027-01-01': '신정',
  '2027-02-05': '설 연휴',
  '2027-02-08': '설 연휴',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-08-16': '광복절 대체공휴일',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-04': '개천절 대체공휴일',
  '2027-10-11': '한글날 대체공휴일',
  '2027-12-27': '성탄절 대체공휴일',
  '2027-12-31': '연말 휴장',
};

interface TzParts {
  dateKey: string;
  weekday: number; // 0=일 … 6=토
  secondsOfDay: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

export function tzParts(date: Date, tz: string): TzParts {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    secondsOfDay: hour * 3600 + minute * 60 + second,
  };
}

interface Boundary {
  /** 하루 중 시작 초 */
  from: number;
  phase: SessionPhase;
  label: string;
}

const HH = (h: number, m = 0) => h * 3600 + m * 60;

/** 미국 정규장: 09:30–16:00 ET, 프리 04:00–09:30, 애프터 16:00–20:00 */
const US_BOUNDARIES: Boundary[] = [
  { from: HH(0), phase: 'closed', label: '장전 시작까지' },
  { from: HH(4), phase: 'pre', label: '정규장 시작까지' },
  { from: HH(9, 30), phase: 'regular', label: '정규장 종료까지' },
  { from: HH(16), phase: 'post', label: '시간외 종료까지' },
  { from: HH(20), phase: 'closed', label: '다음 장전까지' },
];

/** 한국 정규장: 09:00–15:30 KST, 장전 08:30–09:00, 시간외 15:40–18:00 */
const KR_BOUNDARIES: Boundary[] = [
  { from: HH(0), phase: 'closed', label: '장전 시작까지' },
  { from: HH(8, 30), phase: 'pre', label: '정규장 시작까지' },
  { from: HH(9), phase: 'regular', label: '정규장 종료까지' },
  { from: HH(15, 30), phase: 'post', label: '시간외 종료까지' },
  { from: HH(18), phase: 'closed', label: '다음 장전까지' },
];

function isTradingDay(dateKey: string, weekday: number, holidays: Record<string, string>): boolean {
  if (weekday === 0 || weekday === 6) return false;
  return !(dateKey in holidays);
}

function addDaysKey(dateKey: string, days: number): { key: string; weekday: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(base);
  const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
  return { key, weekday: dt.getUTCDay() };
}

function resolve(
  now: Date,
  tz: string,
  boundaries: Boundary[],
  holidays: Record<string, string>,
  market: MarketId,
): MarketSession {
  const p = tzParts(now, tz);
  const tradingToday = isTradingDay(p.dateKey, p.weekday, holidays);

  if (!tradingToday) {
    const holidayName = holidays[p.dateKey];
    // 다음 거래일의 장전 시작까지 남은 시간
    let cursor = { key: p.dateKey, weekday: p.weekday };
    let daysAhead = 0;
    for (let i = 1; i <= 10; i += 1) {
      cursor = addDaysKey(p.dateKey, i);
      if (isTradingDay(cursor.key, cursor.weekday, holidays)) {
        daysAhead = i;
        break;
      }
    }
    const openAt = boundaries[1].from;
    const msToNext =
      daysAhead > 0 ? ((86400 - p.secondsOfDay) + (daysAhead - 1) * 86400 + openAt) * 1000 : null;
    return {
      market,
      phase: holidayName ? 'holiday' : 'closed',
      msToNext,
      nextLabel: '다음 장전까지',
      ...(holidayName ? { holidayName } : {}),
    };
  }

  let current = boundaries[0];
  let next: Boundary | null = null;
  for (let i = 0; i < boundaries.length; i += 1) {
    if (p.secondsOfDay >= boundaries[i].from) {
      current = boundaries[i];
      next = boundaries[i + 1] ?? null;
    }
  }

  if (next) {
    return {
      market,
      phase: current.phase,
      msToNext: (next.from - p.secondsOfDay) * 1000,
      nextLabel: current.label,
    };
  }

  // 오늘 남은 경계가 없다 → 다음 거래일 장전
  let cursor = { key: p.dateKey, weekday: p.weekday };
  let daysAhead = 1;
  for (let i = 1; i <= 10; i += 1) {
    cursor = addDaysKey(p.dateKey, i);
    if (isTradingDay(cursor.key, cursor.weekday, holidays)) {
      daysAhead = i;
      break;
    }
  }
  const openAt = boundaries[1].from;
  return {
    market,
    phase: 'closed',
    msToNext: ((86400 - p.secondsOfDay) + (daysAhead - 1) * 86400 + openAt) * 1000,
    nextLabel: '다음 장전까지',
  };
}

export function getSession(market: MarketId, now: Date = new Date()): MarketSession {
  if (market === 'crypto') {
    return { market, phase: 'always', msToNext: null, nextLabel: null };
  }
  if (market === 'us') return resolve(now, US_TZ, US_BOUNDARIES, US_HOLIDAYS, 'us');
  return resolve(now, KR_TZ, KR_BOUNDARIES, KR_HOLIDAYS, 'kr');
}

export function getAllSessions(now: Date = new Date()): MarketSession[] {
  return [getSession('us', now), getSession('kr', now), getSession('crypto', now)];
}

/** 세션 배지에 쓸 짧은 보조 문구 */
export function sessionHint(s: MarketSession): string {
  if (s.phase === 'always') return '24시간 거래';
  if (s.phase === 'holiday') return s.holidayName ? `휴장 · ${s.holidayName}` : '휴장';
  if (s.msToNext === null || s.nextLabel === null) return '';
  const min = Math.round(s.msToNext / 60000);
  if (min < 60) return `${s.nextLabel} ${min}분`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${s.nextLabel} ${h}시간 ${min % 60}분`;
  return `${s.nextLabel} ${Math.round(h / 24)}일`;
}

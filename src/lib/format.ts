/**
 * 숫자·통화·시간 표기 통일 규칙.
 * 화면 어디서든 같은 값이 같은 모양으로 보이도록 여기 함수만 사용한다.
 */

import type { Unit } from '@/types';

export const KST_TZ = 'Asia/Seoul';

/* ------------------------------ 숫자 ------------------------------ */

const nfCache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: min, maximumFractionDigits: max });
    nfCache.set(key, f);
  }
  return f;
}

/** 값 없음을 나타내는 통일 표기. 0 과 절대 혼동되지 않아야 한다. */
export const NO_VALUE = '—';

export function formatNumber(v: number | null | undefined, precision = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  return nf(precision, precision).format(v);
}

/** 부호를 항상 표기 (0 은 부호 없음). */
export function formatSigned(v: number | null | undefined, precision = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  const s = nf(precision, precision).format(Math.abs(v));
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return s;
}

export function formatPercent(v: number | null | undefined, precision = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  return `${formatSigned(v, precision)}%`;
}

/**
 * 0~100 심리 점수 표기.
 * 소수점이 있으면 한 자리까지 보여준다. 39.5 를 "40"으로 반올림해 버리면
 * 화면의 단계명(공포)과 숫자(40 = 중립 시작점)가 어긋나 보이기 때문이다.
 */
export function formatScore(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  return formatNumber(v, Number.isInteger(v) ? 0 : 1);
}

/** 부호 없는 퍼센트 (예: 신뢰도, 가중치). */
export function formatPercentPlain(v: number | null | undefined, precision = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  return `${nf(precision, precision).format(v)}%`;
}

/** 한국식 큰 수 표기 (조/억/만). */
export function formatKoreanCompact(v: number | null | undefined, precision = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${nf(precision, precision).format(abs / 1e12)}조`;
  if (abs >= 1e8) return `${sign}${nf(precision, precision).format(abs / 1e8)}억`;
  if (abs >= 1e4) return `${sign}${nf(0, 0).format(Math.round(abs / 1e4))}만`;
  return `${sign}${nf(0, 0).format(abs)}`;
}

/** 영어권 큰 수 표기 (T/B/M/K). */
export function formatCompactEn(v: number | null | undefined, precision = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${nf(precision, precision).format(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}${nf(precision, precision).format(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${nf(precision, precision).format(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${nf(precision, precision).format(abs / 1e3)}K`;
  return `${sign}${nf(precision, precision).format(abs)}`;
}

export type DisplayCurrency = 'KRW' | 'USD';

export interface ValueFormatOptions {
  unit: Unit;
  precision: number;
  /** 원래 통화 */
  currency: 'KRW' | 'USD' | null;
  /** 사용자가 선택한 표시 통화 */
  display: DisplayCurrency;
  /** 환율 (USD 1 당 KRW) */
  usdKrw: number | null;
  compact?: boolean;
}

/**
 * 가격 1개를 화면 표기 문자열로 변환한다.
 * 통화 환산은 currency 가 명시된 항목에만 적용한다.
 * (지수·퍼센트·bp 는 통화 개념이 없으므로 환산하지 않는다.)
 */
export function formatValue(v: number | null | undefined, o: ValueFormatOptions): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;

  switch (o.unit) {
    case 'percent':
      return `${formatNumber(v, o.precision)}%`;
    case 'bp':
      return `${formatNumber(v, o.precision)}bp`;
    case 'ratio':
      return formatNumber(v, o.precision);
    case 'count':
      return formatNumber(v, o.precision);
    case 'usd_bn':
      return `$${formatCompactEn(v * 1e9, 2)}`;
    case 'krw_bn':
      return `${formatKoreanCompact(v * 1e9, 1)}원`;
    case 'point':
      return formatNumber(v, o.precision);
    case 'currency':
    default:
      break;
  }

  const converted = convertCurrency(v, o.currency, o.display, o.usdKrw);
  if (converted === null) return NO_VALUE;

  const targetCurrency = o.currency ? o.display : null;
  if (targetCurrency === 'KRW') {
    const p = converted >= 1000 ? 0 : o.precision;
    return o.compact && converted >= 1e8
      ? `${formatKoreanCompact(converted)}원`
      : `${formatNumber(converted, p)}원`;
  }
  if (targetCurrency === 'USD') {
    const p = converted >= 1000 ? 2 : Math.max(o.precision, 2);
    return o.compact && converted >= 1e6 ? `$${formatCompactEn(converted)}` : `$${formatNumber(converted, p)}`;
  }
  return formatNumber(converted, o.precision);
}

export function convertCurrency(
  v: number | null,
  from: 'KRW' | 'USD' | null,
  to: DisplayCurrency,
  usdKrw: number | null,
): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (from === null) return v;
  if (from === to) return v;
  if (usdKrw === null || !Number.isFinite(usdKrw) || usdKrw <= 0) return null;
  if (from === 'USD' && to === 'KRW') return v * usdKrw;
  if (from === 'KRW' && to === 'USD') return v / usdKrw;
  return v;
}

/** 등락액 표기 (통화 기호 없이 부호 + 숫자). */
export function formatChange(v: number | null | undefined, o: ValueFormatOptions): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
  const converted = o.unit === 'currency' ? convertCurrency(v, o.currency, o.display, o.usdKrw) : v;
  if (converted === null) return NO_VALUE;
  const p = o.unit === 'currency' && o.display === 'KRW' && Math.abs(converted) >= 1000 ? 0 : o.precision;
  const suffix = o.unit === 'percent' ? '%p' : o.unit === 'bp' ? 'bp' : '';
  return `${formatSigned(converted, p)}${suffix}`;
}

/* ------------------------------ 시간 ------------------------------ */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('ko-KR', { timeZone: KST_TZ, ...opts });
    dtfCache.set(key, f);
  }
  return f;
}

export function formatKstTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function formatKstTimeSec(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return dtf({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
}

export function formatKstDate(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return dtf({ month: '2-digit', day: '2-digit' }).format(d).replace(/\.$/, '');
}

export function formatKstDateTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return `${formatKstDate(d)} ${formatKstTime(d)}`;
}

export function formatKstFull(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return `${dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)} ${formatKstTime(d)} KST`;
}

/** "3분 전" 같은 상대 시각. */
export function formatRelative(iso: string | number | Date | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return NO_VALUE;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NO_VALUE;
  const diff = now - t;
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const suffix = past ? '전' : '후';
  if (abs < 45_000) return past ? '방금' : '곧';
  const min = Math.round(abs / 60_000);
  if (min < 60) return `${min}분 ${suffix}`;
  const hour = Math.round(abs / 3_600_000);
  if (hour < 24) return `${hour}시간 ${suffix}`;
  const day = Math.round(abs / 86_400_000);
  if (day < 30) return `${day}일 ${suffix}`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}개월 ${suffix}`;
  return `${Math.round(month / 12)}년 ${suffix}`;
}

/** 남은 시간 카운트다운 (D-1 14:20 형태). */
export function formatCountdown(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return NO_VALUE;
  if (ms <= 0) return '발표됨';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}일 ${h}시간 후`;
  if (h > 0) return `${h}시간 ${m}분 후`;
  return `${m}분 후`;
}

/** KST 기준 YYYY-MM-DD */
export function kstDateKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 접근성용 텍스트: "+1.24퍼센트 상승" */
export function describeChange(changePct: number | null | undefined): string {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) return '등락 정보 없음';
  if (changePct > 0) return `${formatNumber(Math.abs(changePct), 2)}퍼센트 상승`;
  if (changePct < 0) return `${formatNumber(Math.abs(changePct), 2)}퍼센트 하락`;
  return '보합';
}

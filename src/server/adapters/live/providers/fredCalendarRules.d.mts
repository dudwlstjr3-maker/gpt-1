/** fredCalendarRules.mjs 의 타입. 순수 로직은 .mjs 에 있고 여기서 모양만 알려준다. */

import type { CalendarEvent, DataSource, EventCategory, EventImportance } from '@/types';

export interface ReleaseRule {
  /** FRED release id. 이름이 아니라 이 숫자로 맞춘다. */
  releaseId: number;
  id: string;
  /** 확인 당시의 FRED 표기. 대조용이고 화면에는 쓰지 않는다. */
  name: string;
  title: string;
  category: EventCategory;
  importance: EventImportance;
}

export declare const RELEASE_RULES: ReleaseRule[];
export declare const FOMC_RELEASE_ID_NOT_A_SCHEDULE: number;
export declare const FOMC_SOURCE_URL: string;
export declare const FOMC_VERIFIED_ON: string;
export declare const FOMC_COVERED_THROUGH: string;
export declare const FOMC_DECISION_DAYS: string[];

export declare function textOrNull(v: unknown): string | null;
export declare function kstDateIso(date: unknown): string | null;
export declare function kstDateKey(ms: number): string;
export declare function ruleFor(releaseId: unknown): ReleaseRule | null;
export declare function normalizeReleaseDate(row: unknown, source: DataSource): CalendarEvent | null;
export declare function normalizeReleaseDates(rows: unknown, source: DataSource): CalendarEvent[];
export declare function fomcEvents(fromKey: string, toKey: string, source: DataSource): CalendarEvent[];
export declare function mergeEvents(...lists: (CalendarEvent[] | null | undefined)[]): CalendarEvent[];

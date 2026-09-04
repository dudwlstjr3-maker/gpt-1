/** fredCalendarRules.mjs 의 타입. 순수 로직은 .mjs 에 있고 여기서 모양만 알려준다. */

import type { CalendarEvent, DataSource, EventCategory, EventImportance } from '@/types';

export interface ReleaseRule {
  id: string;
  match: RegExp;
  title: string;
  category: EventCategory;
  importance: EventImportance;
}

export declare const RELEASE_RULES: ReleaseRule[];

export declare function textOrNull(v: unknown): string | null;
export declare function kstDateIso(date: unknown): string | null;
export declare function kstDateKey(ms: number): string;
export declare function ruleFor(releaseName: unknown): ReleaseRule | null;
export declare function normalizeReleaseDate(row: unknown, source: DataSource): CalendarEvent | null;
export declare function normalizeReleaseDates(rows: unknown, source: DataSource): CalendarEvent[];

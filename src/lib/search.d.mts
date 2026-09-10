export interface SearchEntry {
  id: string;
  /** 어느 갈래인가 — 화면에서 무리 짓는 데 쓴다 */
  kind: 'quote' | 'index' | 'risk' | 'basic' | 'term' | 'screen';
  name: string;
  symbol?: string;
  /** 이름 아래 작게 붙는 말 (원래 이름 · 갈래 등) */
  sub?: string;
  href: string;
}

export function initials(text: string): string;
export function normalize(text: string): string;
export function isInitialQuery(query: string): boolean;
export function score(entry: SearchEntry, query: string): number;
export function searchEntries(entries: SearchEntry[], query: string, limit?: number): SearchEntry[];

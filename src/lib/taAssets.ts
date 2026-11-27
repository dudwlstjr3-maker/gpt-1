/**
 * 참고 차트에서 고를 수 있는 목록 (2026-11-27) — 카탈로그의 미국 · 한국 지수와 종목.
 * 변동성 · 금리 · 환율 · 원자재는 봉으로 보는 대상이 아니라 뺐다. 목록에 없는 종목은 코드로 찾는다(taParseCode).
 */

import { CATALOG, CATALOG_BY_ID, type CatalogItem } from '@/lib/catalog';

export const TA_DEFAULT_ASSET = 'spx';

export function isTaAsset(item: CatalogItem | undefined): item is CatalogItem {
  return !!item && (item.market === 'us' || item.market === 'kr') && (item.kind === 'index' || item.kind === 'equity');
}

export function taAssets(): CatalogItem[] {
  const rank = (c: CatalogItem) => (c.market === 'us' ? 0 : 1) * 100 + (c.kind === 'index' ? 0 : 50) + c.order;
  return CATALOG.filter(isTaAsset).sort((a, b) => rank(a) - rank(b));
}

export function taAsset(id: string | null | undefined): CatalogItem | null {
  const item = id ? CATALOG_BY_ID.get(id) : undefined;
  return isTaAsset(item) ? item : null;
}

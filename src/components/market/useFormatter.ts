'use client';

/** 설정(통화·색상 모드)과 환율을 반영한 표기 헬퍼. 화면 전체가 이 훅을 통해 숫자를 그린다. */

import { useMemo } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useData } from '@/components/providers/DataProvider';
import { formatChange, formatPercent, formatValue, type ValueFormatOptions } from '@/lib/format';
import { changeColor, directionOf, DIRECTION_GLYPH, DIRECTION_LABEL, type Direction } from '@/lib/scale';
import type { Quote } from '@/types';

export function useFormatter() {
  const { settings } = useSettings();
  const { snapshot } = useData();
  const usdKrw = snapshot?.usdKrw ?? null;

  return useMemo(() => {
    const opts = (q: Pick<Quote, 'unit' | 'precision' | 'currency'>, compact = false): ValueFormatOptions => ({
      unit: q.unit,
      precision: q.precision,
      currency: q.currency,
      display: settings.currency,
      usdKrw,
      compact,
    });

    return {
      usdKrw,
      currency: settings.currency,
      colorMode: settings.colorMode,
      price(q: Quote, compact = false): string {
        return formatValue(q.price, opts(q, compact));
      },
      change(q: Quote): string {
        return formatChange(q.change, opts(q));
      },
      changePct(q: Quote): string {
        return formatPercent(q.changePct, 2);
      },
      direction(q: Quote): Direction {
        return directionOf(q.changePct ?? q.change);
      },
      color(dir: Direction): string {
        return changeColor(dir, settings.colorMode);
      },
      glyph(dir: Direction): string {
        return DIRECTION_GLYPH[dir];
      },
      /** 스크린리더용 등락 설명 */
      srChange(q: Quote): string {
        const dir = directionOf(q.changePct ?? q.change);
        if (dir === 'none') return '등락 정보 없음';
        return `${DIRECTION_LABEL[dir]} ${formatPercent(q.changePct, 2)}`;
      },
      /** 환산이 불가능한 경우(환율 없음) 알림 */
      conversionUnavailable(q: Quote): boolean {
        return q.currency !== null && q.currency !== settings.currency && usdKrw === null;
      },
    };
  }, [settings.currency, settings.colorMode, usdKrw]);
}

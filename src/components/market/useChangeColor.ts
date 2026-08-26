'use client';

/**
 * "증가/감소"를 나타내는 모든 표시에 사용자의 등락 색상 설정을 적용한다.
 *
 * 구분:
 *  - 게이지·단계 색상 = Fear→Greed 고정 척도 (사용자 설정과 무관)
 *  - 점수 변화·기여도·수급 증감 = 방향 표시이므로 한국식/글로벌식 설정을 따른다
 * 색상만으로 의미를 전달하지 않도록 항상 ▲▼ 기호와 부호를 함께 쓴다.
 */

import { useCallback } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { changeColor, directionOf, DIRECTION_GLYPH, DIRECTION_LABEL, type Direction } from '@/lib/scale';

export function useChangeColor() {
  const { settings } = useSettings();

  const color = useCallback(
    (v: number | null | undefined) => changeColor(directionOf(v), settings.colorMode),
    [settings.colorMode],
  );

  const glyph = useCallback((v: number | null | undefined) => DIRECTION_GLYPH[directionOf(v)], []);
  const label = useCallback((v: number | null | undefined) => DIRECTION_LABEL[directionOf(v)], []);
  const direction = useCallback((v: number | null | undefined): Direction => directionOf(v), []);

  return { color, glyph, label, direction, mode: settings.colorMode };
}

'use client';

import { useData } from '@/components/providers/DataProvider';
import { DISCLAIMER_TEXT, SELF_CALCULATED_NOTE } from '@/components/market/constants';
import { ModeBadge } from './Badge';

/** 모든 화면 하단 고지. 투자 추천·매매 지시·수익 보장 표현을 쓰지 않는다. */
export function Disclaimer() {
  const { snapshot } = useData();
  return (
    <footer className="mt-8 border-t border-border px-3 py-5">
      <div className="flex flex-wrap items-center gap-2">
        {snapshot ? <ModeBadge mode={snapshot.mode} size="xs" /> : null}
        {snapshot?.mode === 'DEMO' ? (
          <span className="text-[10px]" style={{ color: 'var(--warn)' }}>
            표시된 모든 수치는 고정 샘플 데이터이며 실제 시세가 아닙니다.
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] font-semibold text-fg">{DISCLAIMER_TEXT}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed break-keep text-subtle">
        {SELF_CALCULATED_NOTE} 지수·시세는 제공사 사정에 따라 지연될 수 있으며, 표시된 기준 시각을 확인하고 이용해 주세요.
        과거 수치가 미래 결과를 보장하지 않습니다.
        {snapshot ? ` 산식 버전 ${snapshot.formulaVersion}.` : ''}
      </p>
    </footer>
  );
}

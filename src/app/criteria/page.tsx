'use client';

/**
 * 내 기준 — 사용자가 정한 조건이 지금 맞는지 확인하는 화면.
 *
 * 탭으로 세우지 않은 이유: 하단 탭이 이미 320px 에서 일곱 칸이라 여덟 칸은 넘친다.
 * 대신 홈 아래쪽 탭과 더보기에서 들어간다. 매일 열어 보는 화면이 아니라
 * 한 번 정해 두고 가끔 확인하는 쪽에 가깝다.
 */

import { CriteriaBoard } from '@/components/market/CriteriaBoard';

export default function CriteriaPage() {
  return (
    <div className="pt-2 pb-4">
      <header className="px-3 pt-1">
        <h1 className="text-lg font-bold text-fg-strong">내 기준</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed break-keep text-muted">
          무엇을 볼지 직접 정해 두면, 지금 그 조건이 맞는지 한 자리에서 확인할 수 있습니다.
        </p>
      </header>

      <div className="mt-3">
        <CriteriaBoard />
      </div>
    </div>
  );
}

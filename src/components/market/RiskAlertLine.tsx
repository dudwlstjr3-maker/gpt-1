'use client';

/**
 * 홈의 위험 경고 한 줄.
 *
 * 왜 카드 여섯 장을 뺐나
 *   홈에 '시장 위험 신호등' 이 여섯 장 서 있었다. 그런데 그 블록은 제대로
 *   읽히려면 "빨간불은 '위험하니 팔아라' 가 아니라 '이 지표가 평소보다 크게
 *   벗어나 있다' 는 뜻" 이라는 설명 문단을 함께 읽어야 한다. 설명을 읽어야
 *   읽히는 것은 10초 안에 훑는 화면에 맞지 않는다.
 *
 *   여섯 중 둘(공포지수·위험한 회사 이자)은 이미 심리 점수 안에 구성요소로
 *   들어가 있기도 하다 — 홈에서 점수로 한 번, 신호등으로 또 한 번 본 셈이다.
 *   나머지 넷(금리차·국채 금리·환율·펀딩비)은 점수에 안 들어가지만, 그건
 *   '경제지표' 탭이 맡는 이야기다.
 *
 * 그럼 놓치지 않나
 *   빨간불이 켜진 날에는 이 줄이 홈에 뜬다. 평소에는 아무것도 그리지 않는다.
 *   늘 있는 것은 배경이 되어 안 보이지만, 없다가 생기는 것은 눈에 걸린다.
 */

import Link from 'next/link';
import { useData } from '@/components/providers/DataProvider';
import { subject } from '@/lib/particle.mjs';

export function RiskAlertLine() {
  const { snapshot } = useData();
  const digest = snapshot?.sections.risk?.data ?? null;
  if (!digest || digest.alertCount === 0) return null;

  const names = digest.indicators
    .filter((i) => i.level === 'alert')
    .slice(0, 2)
    .map((i) => i.name);

  return (
    <Link
      href="/indicators"
      className="mt-3 flex items-baseline gap-2 px-3 text-[13px] leading-relaxed break-keep"
      style={{ color: 'var(--warn)' }}
    >
      <span aria-hidden="true" className="shrink-0">
        ▲
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">빨간불 {digest.alertCount}개</span> — {names.join(' · ')}
        {digest.alertCount > names.length ? ' 등이' : subject(names.join(' · '))} 평소 범위를 벗어났습니다.{' '}
        <span className="font-semibold underline underline-offset-2">경제지표에서 보기</span>
      </span>
    </Link>
  );
}

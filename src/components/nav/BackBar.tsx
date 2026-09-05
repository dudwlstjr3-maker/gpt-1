'use client';

/**
 * 돌아갈 길.
 *
 * 왜 필요한가
 *   하단 탭에 없는 화면(국면 전광판·내 기준·지수·생활·경제지표·캘린더)에 들어가면
 *   나가는 길이 브라우저 뒤로가기뿐이었다. 홈 하나에 나가는 링크가 서른 개인데
 *   돌아오는 길이 화면에 없으니, 몇 번 누르고 나면 여기가 어디인지 모르게 된다.
 *
 * 어떻게 동작하나
 *   앱 안에서 눌러 들어왔으면 **눌렀던 자리로** 돌려보낸다(뒤로가기). 그게 사용자가
 *   기대하는 자리다. 주소를 직접 열었거나 새 탭이라 돌아갈 데가 없으면 fallback 으로
 *   보낸다 — 그때 뒤로가기를 부르면 앱 밖으로 나가 버린다.
 *
 *   "돌아갈 데가 있는가" 는 history.length 로 짐작하지 않는다. 그 값은 같은 탭에서
 *   앞서 본 다른 사이트까지 세기 때문에 앱 밖으로 나가는 뒤로가기를 못 거른다.
 *   대신 우리가 눌러 들어왔다는 사실을 sessionStorage 에 남겨 두고 그것만 믿는다.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** 앱 안에서 이동했다는 표시. Navigation 과 각 링크가 아니라 여기서만 읽고 쓴다. */
const KEY = 'mm3.nav.internal';

/** 앱 안 링크를 눌렀을 때 호출한다 (레이아웃이 경로 변화를 보고 대신 남긴다). */
export function markInternalNav() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* 시크릿 모드 등에서 막히면 그냥 fallback 으로 간다 */
  }
}

export function BackBar({
  /** 돌아갈 데가 없을 때 보낼 곳 */
  fallback = '/',
  fallbackLabel = '홈',
}: {
  fallback?: string;
  fallbackLabel?: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    try {
      setCanGoBack(sessionStorage.getItem(KEY) === '1');
    } catch {
      setCanGoBack(false);
    }
  }, []);

  const label = canGoBack ? '이전 화면' : fallbackLabel;

  return (
    <div className="px-3 pt-2">
      <button
        type="button"
        onClick={() => (canGoBack ? router.back() : router.push(fallback))}
        className="-ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
      >
        <span aria-hidden="true" className="text-[14px] leading-none">
          ‹
        </span>
        {label}
      </button>
    </div>
  );
}

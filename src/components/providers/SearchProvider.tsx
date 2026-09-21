'use client';

/**
 * 찾기 창을 여는 길만 아래로 내려보낸다.
 *
 * 창 자체는 껍데기(AppShell)가 들고 있다 — 어느 화면에서든 Ctrl+K 로 열려야
 * 하고, 창은 문서 맨 위에 하나만 있어야 하기 때문이다. 화면 안쪽에서 여는 단추
 * (상단 돋보기)는 이 통로로 그 하나를 부른다.
 */

import { createContext, useContext, type ReactNode } from 'react';

const Ctx = createContext<(() => void) | null>(null);

export function SearchProvider({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return <Ctx.Provider value={onOpen}>{children}</Ctx.Provider>;
}

/** 찾기 창을 여는 길. 껍데기 밖에서 부르면 아무 일도 하지 않는다. */
export function useOpenSearch(): () => void {
  return useContext(Ctx) ?? (() => {});
}

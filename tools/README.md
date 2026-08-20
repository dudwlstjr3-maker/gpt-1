# 검증 하네스

이 앱은 단일 HTML이라 테스트 러너가 따로 없다. 수정 후에는 **반드시 두 층 다** 돌린다.

```
node tools/check-logic.js          # 1층 — 로직
node tools/check-ui.mjs            # 2층 — 화면
node tools/check-ui.mjs --shots    # 화면 + 스크린샷(tools/_shots/)
```

두 명령 모두 문제가 있으면 종료 코드 1로 끝난다.

## 1층 — 로직 (`check-logic.js`)

`index.html` 안의 인라인 `<script>` 를 뽑아 Node `vm` 에서 실행하고 함수를 직접 부른다.
브라우저가 필요 없어 1초 안에 끝난다.

- `dom-stub.js` — 최상위 초기화 코드가 죽지 않을 만큼의 DOM·localStorage 스텁.
  렌더링을 흉내내려는 게 아니라 순수 계산 함수를 꺼내오는 게 목적이다. `Math.random` 은 시드 고정.
- `load-app.js` — 스크립트 추출 + vm 실행. 최상위 `const` 는 sandbox 전역으로 안 올라오므로
  선언 이름을 긁어 직접 `eval` 로 내보내는 에필로그를 붙인다. 결과는 `.app` 에 담긴다.

검증 항목: 포커 수식 4개(참조 구현 대조 + 소스 문자열 대조), 핸드 평가기, 승률,
`analyze` 통합, 토너먼트 프리셋·레벨·상금 배분, 성향 진단 60문항·7축, 드릴 260핸드, 저장소.

## 2층 — 화면 (`check-ui.mjs`)

폴더를 포트 8777 정적 서버로 띄우고 실제 Chromium 으로 7탭 × 3폭(1440·1024·390)을 돈다.

- 노출 텍스트의 `undefined` / `NaN` / `null` / `[object Object]`
- 콘솔 오류·경고, 페이지 예외
- 가로 넘침 (문서 전체 + 개별 요소. 스스로 `overflow-x` 를 갖는 컨테이너는 제외)
- 대비비 (WCAG AA — 본문 4.5:1, 큰 글씨 3:1)

컨테이너에 미리 깔린 `/opt/pw-browsers/chromium` 을 쓴다. `npx playwright install` 은 하지 않는다.

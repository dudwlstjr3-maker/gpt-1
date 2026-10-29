# AGENTS.md — Market Mood 3 공통 작업 규칙

이 저장소에서 일하는 모든 AI 에이전트(Claude · Codex · ChatGPT 등)가 작업 전에 읽는다.
새로 정한 규칙은 없다. `README.md` · `.env.example` · `tools/review/01-검토-요청.md` 에 이미 적힌 것을 모았고, 어긋나면 그 원문이 기준이다.

## 1. 지키는 규칙

### 투자 조언이 아니다
- 매수·매도 지시, 투자 추천, 수익 보장, "저평가/고평가" 같은 말을 쓰지 않는다. 화면은 "무슨 일이 벌어지고 있다" 까지만 말한다. `npm run verify` 가 매매를 권하는 말을 검사한다.
- Fear & Greed 점수는 공개·라이선스 데이터로 직접 계산한 **자체 산출 지수**다. 외부 지수(CNN 등)의 값을 가져오거나 베끼지 않는다. 산식을 바꾸면 `FORMULA_VERSION` 을 올린다.

### 데이터
- **DEMO 와 LIVE 는 절대 섞지 않는다.** 모드는 스냅샷 단위로 하나다. LIVE 에서 못 받은 섹션을 DEMO 값으로 메우지 않는다.
- 없는 값을 0 으로 채우거나 지어내지 않는다. `null` 과 사유(`unavailableReason`)로 비운다. 점수는 확보 가중치가 70% 이상일 때만 내고, 못 넘으면 "산출 불가" 로 둔다.
- 제공사 약관·재배포 조건·지연 조건을 지킨다. 실시간 재배포가 금지되면 지연 데이터를 쓰고 지연 시간(`delayMinutes`)을 표기한다. "실시간" 이라고 적지 않는다.
- Yahoo 시세는 개인적·비상업적 범위에서만 쓰고 값을 재배포하지 않는다. 뉴스 본문 재배포가 금지되면 헤드라인·링크만 쓴다.
- 외부 호출은 `fetchJson()` (`src/server/http.ts`) 을 거친다.

### 키
- API 키는 서버에서만 읽는다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 브라우저는 외부 API 를 직접 부르지 않고 `/api/*` 를 거친다.
- 키는 `.env.local` 에만 둔다 (`cp .env.example .env.local`). `.env.local` 은 커밋하지 않는다.
- `/api/health` 같은 응답에 키 값을 넣지 않는다.

### 코드와 파일
- 새 npm 의존성을 넣지 않는다.
- 색만으로 뜻을 전하지 않는다. 기호(▲▼)와 글자를 함께 둔다.
- 화면을 고치면 `src/` · `tools/preview/template.html` · `scripts/verify.mjs` 세 곳을 같이 고친다.
- `docs/` 는 GitHub Pages 로 공개되는 폴더다. `docs/index.html` 은 `npm run preview` 결과를 내보낸 것이라 고칠 때마다가 아니라 **내보낼 때만** 갱신한다.

## 2. 작업 흐름

1. 최신 `main` 에서 브랜치를 만든다.
2. `npm test` (단위 테스트) 와 `npm run typecheck` 를 통과시킨다.
3. 화면·서버 동작을 바꿨으면 `npm run build && npm start` 로 띄우고 `npm run verify` 로 확인한다 (README 7장).
4. PR 을 연다. PR 마다 GitHub Actions(`.github/workflows/test.yml`)가 키 없이 DEMO 모드로 같은 검사를 돌린다.

- `main` 에 직접 push 하지 않는다.
- 병합은 사용자가 한다.

## 3. 보고 형식

결과 → 검증 → 가정 → 남은 문제.

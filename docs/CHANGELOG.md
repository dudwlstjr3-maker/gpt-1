# 변경 기록

새 항목을 위에 쌓는다. 날짜는 KST.

## 2026-10-28 — 개발 환경을 정리한다

사람마다, 에이전트마다 검사 돌리는 방법이 달라서 생기는 낭비를 없앴다.

- **`npm test` 를 만들었다.** `node --test scripts/*.test.mjs` (137 항목).
  그동안 명령이 없어서 매번 손으로 적어야 했다.
  `npm run verify` 와는 끝까지 별개로 둔다 — `verify` 는 `:3000` 에 뜬 서버가 필요하고
  `npm test` 는 서버 없이 어디서나 돌아야 하기 때문이다.
- **CI 를 붙였다.** `.github/workflows/ci.yml` — PR 과 main 푸시에서
  `npm ci` → `typecheck` → `test` → `build` 를 Node 22 로 돌린다.
  `verify` 는 서버가 필요해서 CI 에서 빼고, 각자 기계에서 돌린다 (이유는 워크플로 주석에).
- **`AGENTS.md` 를 만들었다.** 코드와 README 에 흩어져 있던 standing rule 을 한곳에 모았다 —
  투자 추천 금지, 하단 고지, 키는 서버 환경변수로만, LIVE/DEMO 분리, 결측 0 보정 금지와
  70% 문턱, 외부 지수 복제 금지, 색만으로 뜻 전하지 않기, 세 곳 규칙, 검증 순서, 브랜치 규칙.
  새로 만든 규칙은 없다.
- **`CLAUDE.md` 를 만들었다.** 규칙은 `AGENTS.md` 를 가리키게만 하고,
  Claude Code 에서만 걸리는 것들(verify 전에 개발 서버를 다른 프로세스로 띄우기 등)만 적었다.
- `.gitignore` 는 확인만 했다. `node_modules/`, `*.log`, `.env*` 가 이미 다 들어 있어
  고칠 것이 없었다.

앱 동작은 바뀐 것이 없다.

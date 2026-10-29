# 변경 기록

## 2026-10-29

- `npm test` 를 추가했다. `scripts/*.test.mjs` 순수 로직 단위 테스트를 `node --test` 로 한 번에 돌린다 (`scripts/run-tests.mjs`). Windows · Node 20.9 에서도 같은 명령으로 돈다.
- GitHub Actions(`.github/workflows/test.yml`)를 추가했다. PR 과 main push 마다 `npm test` · `npm run typecheck` 를 돌리고, DEMO 서버를 빌드해 띄운 뒤 `npm run verify` 를 돌린다. 키를 쓰지 않는다.
- 모든 AI 에이전트가 따르는 작업 규칙 `AGENTS.md` 와 Claude 용 안내 `CLAUDE.md` 를 추가했다. 1절은 README · `.env.example` · `tools/review/01-검토-요청.md` 에 이미 적힌 규칙을 모은 것이고, 2·3절의 작업 흐름과 보고 형식은 2026-10-29 사용자 지시로 정했다.
- 앱 화면 · 데이터 · 산식은 바뀌지 않았다.

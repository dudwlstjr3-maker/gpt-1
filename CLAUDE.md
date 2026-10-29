# CLAUDE.md

**규칙은 [AGENTS.md](./AGENTS.md) 한곳에 있다.** 작업 전에 그것을 읽는다.
여기에는 규칙을 다시 적지 않는다 — 두 벌로 두면 반드시 어긋난다.

아래는 Claude Code 로 일할 때만 해당되는 것들이다.

## `npm run verify` 는 서버를 먼저 띄워야 한다

`verify` 는 `:3000` 에 떠 있는 서버에 실제로 요청을 보낸다. 서버를 띄우지 않고 돌리면
코드가 멀쩡해도 연결 실패로 끝난다. 그러니 **다른 프로세스에서** 먼저 띄운다.

```bash
npm run dev          # 백그라운드로 돌려 두고, :3000 이 응답할 때까지 기다린다
npm run verify       # 그다음
```

`npm run dev` 를 포그라운드로 잡으면 그 자리에서 멈춘 채 다음 명령으로 못 넘어간다.
백그라운드로 돌리고, `/api/health` 가 200 을 줄 때까지 기다린 뒤 verify 를 돌린다.
끝나면 그 프로세스를 정리한다.

키가 없으면 DEMO 모드로 뜬다 (`/api/health` 가 그렇게 알려 준다). 그 상태가 정상이고,
바깥 제공사를 부르지 않으므로 verify 를 돌리기에 오히려 알맞다.

`npm test` 는 서버가 필요 없다. 서버를 띄울 수 없는 상황이면 `typecheck` → `test` → `build`
까지는 그대로 돌려 두고, `verify` 를 돌리지 못했다는 사실을 보고에 적는다.
**돌리지 않은 검사를 통과했다고 적지 않는다. 세어 보지 않은 숫자를 적지 않는다.**

## 세 곳 규칙을 잊기 쉽다

화면을 고칠 때 `src/` 만 고치고 끝내는 실수가 가장 흔하다.
`tools/preview/template.html` 과 `scripts/verify.mjs` 까지 세 곳이다 (AGENTS.md 4절).

하단 고지 문구를 찾을 때 `src/app/layout.tsx` 로 잘못 가기 쉽다. 그 파일의 것은
검색엔진용 `metadata.description` 이고 화면에 그려지지 않는다.
실제 문구는 `src/components/market/constants.ts` 의 `DISCLAIMER_TEXT` 다 (AGENTS.md 1절).

## 통째로 읽지 않는 파일

큰 파일은 전부 읽지 말고 grep 이나 범위 읽기로 필요한 부분만 꺼낸다.
(바이트는 2026-10-29 기준)

| 파일 | 크기 |
|---|---|
| `docs/index.html` | 2,123,794B (~2.0MiB) — 빌드 산출물, 손으로 고칠 것이 아니다 |
| `tools/preview/template.html` | 339,299B (~331KiB) — 고쳐야 하는 파일인데 가장 크다 |
| `scripts/verify.mjs` | 217,310B (~212KiB) |
| `README.md` | 93,366B (~91KiB) |

`template.html` 과 `verify.mjs` 는 세 곳 규칙 때문에 실제로 **고쳐야** 하는 파일이다.
읽지 않고 고칠 수는 없으니, 고칠 항목을 grep 으로 찾아 그 줄 주변만 열고 들어간다.

## 보고

커밋·푸시는 사용자가 요청할 때만 한다. main 에 직접 푸시하지 않고, 강제 푸시하지 않는다.
돌린 명령의 결과는 실제 출력 그대로 전한다.

# 5분 시작 가이드

구매해 주셔서 감사합니다. 이 문서만 따라 하면 5분 안에 화면이 뜹니다.
자세한 설명은 저장소 루트의 `README.md` (1,000줄) 에 전부 있습니다.

---

## 1. 실행 (2분)

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

**API 키가 하나도 없어도 바로 뜹니다.** 키가 없으면 `DEMO` 모드로 동작하며,
고정된 샘플 데이터로 모든 화면·모든 상태를 확인할 수 있습니다.
화면 곳곳에 `DEMO` 배지가 표시되므로 실데이터와 헷갈릴 일이 없습니다.

---

## 2. 실데이터 연결 (3분)

무료 키 **하나만** 발급받으면 대부분이 실데이터로 바뀝니다.

```bash
cp .env.example .env.local
```

`.env.local` 에서 두 줄만 고칩니다.

```env
MARKET_MOOD_MODE=live
MACRO_API_KEY=여기에_FRED_키
```

FRED 키는 무료이고 즉시 발급됩니다 → https://fred.stlouisfed.org/docs/api/api_key.html

> **`auto` 가 아니라 `live` 입니다.** `auto` 는 필수 키 네 개
> (`US_MARKET_API_KEY`·`KR_MARKET_API_KEY`·`CRYPTO_API_KEY`·`MACRO_API_KEY`)가
> **모두** 있을 때만 LIVE 로 넘어갑니다(`src/server/config.ts`). 그런데 이 중
> 셋은 실제로는 키가 필요 없는 제공사(Stooq·CoinGecko)이거나 아직 미연결
> (한국 수급)입니다. 그래서 FRED 키만 넣고 `auto` 로 두면 DEMO 에 머뭅니다.
> 지금은 `live` 로 쓰시고, 키가 필요 없는 제공사를 필수 목록에서 빼고 싶으면
> `resolveMode()` 의 `missing` 판정에서 해당 줄을 지우면 됩니다.

이걸로 VIX · 하이일드 스프레드 · 장단기 금리차 · 원달러 · CPI · 경제 캘린더가
살아납니다. 나머지는 **키가 아예 필요 없습니다**:

| 데이터 | 제공사 | 키 |
| --- | --- | --- |
| 크립토 시세·도미넌스 | CoinGecko | 불필요 (있으면 한도 상승) |
| 펀딩비·미결제약정 | Binance 공개 API | 불필요 |
| 미국·한국 지수 시세 | Stooq | 불필요 |
| 옵션 통계 | Cboe | 불필요 |
| 생활 경제 지수 | World Bank · Big Mac | 불필요 |

연결이 실제로 되는지 확인:

```bash
npm run check:live
```

제공사마다 실제로 호출해 보고 성공/실패를 표로 보여줍니다.

---

## 3. 배포

Vercel 이 가장 빠릅니다. 저장소를 연결하고 환경변수 `MACRO_API_KEY` 만
넣으면 끝입니다. 별도 설정 파일이 필요 없습니다.

```bash
npm run build   # 로컬에서 먼저 확인
npm start
```

---

## 4. 자주 고치는 곳

| 하고 싶은 것 | 파일 |
| --- | --- |
| 심리 점수 구성요소·가중치 변경 | `src/server/fng/definitions.ts` |
| 위험 신호등 구간 기준 변경 | `src/server/risk.ts` |
| 종목·지수 목록 추가/삭제 | `src/lib/catalog.ts` |
| 데이터 제공사 교체 | `src/server/adapters/live/index.ts` |
| 색·간격·타이포 | `src/app/globals.css` |
| 앱 이름·설명·아이콘 | `src/app/layout.tsx`, `scripts/generate-icons.mjs` |

각 파일이 무엇을 하는지는 README 3장·4장·5장에 근거까지 적혀 있습니다.

---

## 5. 검증 스크립트

```bash
npm run typecheck    # 타입 검사
npm run verify       # 실행 중인 서버 상대로 검증 기준 자동 확인
node scripts/criteria.test.mjs        # 내 기준 판정 로직 테스트
node scripts/fred-calendar.test.mjs   # 캘린더 매칭 로직 테스트
```

---

## 6. 라이선스 요약

- 구매자 본인의 프로젝트에 **개수 제한 없이** 사용 가능, 상업적 사용 포함
- 만든 서비스로 수익을 내는 것 자유
- **소스코드 자체를 재판매·재배포하는 것만 금지**

전문은 `LICENSE` 파일에 있습니다.

---

## 7. 문의

`npm install && npm run build` 가 실패하면 구매 채널로 알려 주세요.
문서대로 실행되지 않는 경우 7일 이내 전액 환불합니다.

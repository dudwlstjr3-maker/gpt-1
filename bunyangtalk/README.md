# 분양톡 (MVP)

분양업계 종사자(상담사·팀장·본부장·대행사)를 위한 구인구직과 익명 커뮤니티 웹 서비스입니다.
기획 검토, 화면 구성, DB 설계, 개발 계획은 [`docs/PLAN.md`](docs/PLAN.md)에 있습니다.

## 실제로 동작하는 기능과 시연용 구분
| 구분 | 내용 |
|---|---|
| 실제 동작 | 회원가입·로그인(세션), 기업 인증 신청·승인, 공고 등록·심사·검색·수정·마감, 관심 저장, 연락처 보기(문의 집계), 실시간 익명 채팅(SSE), 1:1 대화, 신고·차단·제재, 익명 게시판, 광고 주문·서버 결제 검증·자동 노출·만료·환불, 노출·클릭 집계, 관리자 콘솔, 감사 로그, 보존 정책 스크립트 |
| 시연용 | `scripts/seed.mjs`로 넣는 회원·기업·현장·공고·대화(모두 가상, 이메일은 example.com). 결제는 `PAYMENT_PROVIDER=mock`이라 돈이 오가지 않는다. 화면 상단 띠(`DEMO_MODE=1`)로 표시 |
| 미구현 | 실결제 연동, 본인인증, 파일 업로드, 알림 발송, 비밀번호 재설정 등 (`docs/PLAN.md` 5장) |

## 로컬 실행
필요: Node 20.9+, PostgreSQL 14+

```bash
npm install
cp .env.example .env.local      # DATABASE_URL 수정
npm run db:reset                # 스키마 + 시연 데이터 (개발 DB 전용)
npm run dev                     # http://localhost:3100
```

시연 계정은 모두 비밀번호 `demo1234`를 씁니다. 로컬 시연 DB에만 있는 값입니다.

| 계정 | 역할 |
|---|---|
| admin@example.com | 최고 관리자 |
| ops@example.com | 운영 관리자 |
| recruiter1@example.com, recruiter2@example.com | 인증 구인자 (기업 관리자) |
| pending@example.com | 기업 인증 심사 중 |
| s1@example.com ~ s5@example.com | 일반 회원·구직자 |

## 테스트
```bash
npm run build && scripts/serve-local.sh   # 다른 터미널에서 서버 실행 (3100)
npm run db:reset
npm run test:api        # API 통합 테스트 12개 (권한, 익명성, 도배 방지, 결제 중복 방지 등)
node tests/e2e.mjs      # 브라우저 2개로 실시간 채팅 + 모바일/PC 화면 캡처 (Playwright 필요)
```

## 운영 배포 시 주의
- 채팅이 SSE 장기 연결을 쓰므로 **상시 실행 Node 서버**에 배포합니다(`output: standalone`). 서버리스 함수에서는 연결이 잘립니다.
- `scripts/retention.mjs`를 매일 실행합니다(보존 기간이 지난 데이터 삭제).
- 운영 DB에는 `db:seed`, `db:reset`을 실행하지 않습니다(스크립트가 `NODE_ENV=production`에서 거부).

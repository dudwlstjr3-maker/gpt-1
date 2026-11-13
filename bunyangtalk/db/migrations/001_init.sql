-- 분양톡 초기 스키마 (PostgreSQL 16)
-- 원칙
--  * 모든 쓰기는 서버(API)를 거친다. 클라이언트가 DB에 직접 접근하지 않는다.
--    (Supabase를 DB로 쓸 경우 public 스키마의 anon/authenticated 접근을 막는다 — docs/PLAN.md 6장)
--  * 실명·이메일·user_id는 다른 회원에게 내려가지 않는다. 화면에는 닉네임 스냅샷만 쓴다.
--  * 열거형은 enum 대신 text + CHECK (값 추가 시 마이그레이션이 단순)

CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────── 기준 데이터
CREATE TABLE regions (
  code  text PRIMARY KEY,
  name  text NOT NULL,
  sort  int  NOT NULL
);

-- ───────────────────────── 회원
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','withdrawn')),
  phone_verified_at timestamptz,             -- 본인인증(다중계정 방지) 연동 후 사용
  terms_agreed_at   timestamptz NOT NULL,
  privacy_agreed_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz,
  withdrawn_at      timestamptz
);

-- 운영 권한만 별도 테이블. 구직자/인증 구인자/기업 관리자는 프로필·기업 소속에서 파생한다.
CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('partner','operator','super_admin')),
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname            citext NOT NULL UNIQUE,   -- 사칭 방지: 대소문자 무시 유일
  nickname_changed_at timestamptz,
  job_seeking_status  text NOT NULL DEFAULT 'not_seeking' CHECK (job_seeking_status IN ('seeking','open','not_seeking')),
  preferred_region    text REFERENCES regions(code),
  preferred_rank      text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 닉네임 변경 이력 (운영 내부용, 사칭·악용 추적)
CREATE TABLE nickname_history (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname   citext NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nickname_history_user_idx ON nickname_history(user_id, changed_at DESC);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,              -- 쿠키 토큰의 SHA-256. 원문은 저장하지 않는다
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          inet,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- 로그인 시도 기록: 무차별 대입 차단 + 접속기록 보관(3개월)
CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  email      citext NOT NULL,
  ip         inet,
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts(email, created_at DESC);
CREATE INDEX login_attempts_created_idx ON login_attempts(created_at);

-- ───────────────────────── 기업·인증
CREATE TABLE companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  business_number     text NOT NULL UNIQUE CHECK (business_number ~ '^[0-9]{10}$'),
  representative      text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  reject_reason       text,
  verified_at         timestamptz,
  verified_by         uuid REFERENCES users(id),
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_status_idx ON companies(verification_status, created_at);

CREATE TABLE company_members (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),  -- owner = 기업 관리자
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX company_members_user_idx ON company_members(user_id);

-- 인증 자료(사업자등록증명원 등). 파일 본문은 스토리지, 여기엔 경로와 파기 예정일만
CREATE TABLE company_verification_docs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type     text NOT NULL CHECK (doc_type IN ('business_registration','employment_proof','etc')),
  storage_path text NOT NULL,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  purge_after  timestamptz                  -- 심사 완료 후 30일
);

-- ───────────────────────── 분양현장
CREATE TABLE sites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  region_code   text NOT NULL REFERENCES regions(code),
  address       text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  property_type text NOT NULL CHECK (property_type IN ('apartment','officetel','commercial','knowledge_center','lodging','townhouse','etc')),
  developer     text,                        -- 시행사
  builder       text,                        -- 시공사
  status        text NOT NULL DEFAULT 'recruiting' CHECK (status IN ('upcoming','recruiting','selling','closed')),
  description   text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_region_idx ON sites(region_code, status);
CREATE INDEX sites_created_idx ON sites(created_at DESC);

CREATE TABLE saved_sites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, site_id)
);

-- ───────────────────────── 구인공고
CREATE TABLE job_posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  author_id          uuid NOT NULL REFERENCES users(id),
  site_id            uuid NOT NULL REFERENCES sites(id),
  region_code        text NOT NULL REFERENCES regions(code),   -- 현장 지역 비정규화(검색 인덱스용)
  title              text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 80),
  ranks              text[] NOT NULL CHECK (cardinality(ranks) > 0),
  headcount          int CHECK (headcount BETWEEN 1 AND 999),
  rt_basis           text NOT NULL CHECK (rt_basis IN ('per_contract','per_unit','percent','negotiable')),
  rt_amount          int CHECK (rt_amount >= 0),               -- 원 (건당·호실당)
  rt_percent         numeric(5,2) CHECK (rt_percent >= 0),      -- 분양가 대비 %
  rt_note            text,
  daily_pay          int NOT NULL DEFAULT 0 CHECK (daily_pay >= 0),  -- 일비(원)
  daily_pay_condition text,
  settlement_schedule text,
  start_date         date,
  deadline           date,
  contract_type      text NOT NULL CHECK (contract_type IN ('commission','employment','etc')),
  benefits           text[] NOT NULL DEFAULT '{}',
  contact_name       text NOT NULL,
  contact_phone      text NOT NULL,
  description        text NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected','closed')),
  reject_reason      text,
  published_at       timestamptz,
  closed_at          timestamptz,
  view_count         int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_posts_list_idx     ON job_posts(status, published_at DESC);
CREATE INDEX job_posts_region_idx   ON job_posts(status, region_code, published_at DESC);
CREATE INDEX job_posts_deadline_idx ON job_posts(status, deadline);
CREATE INDEX job_posts_ranks_idx    ON job_posts USING gin(ranks);
CREATE INDEX job_posts_site_idx     ON job_posts(site_id);
CREATE INDEX job_posts_company_idx  ON job_posts(company_id, created_at DESC);

CREATE TABLE job_post_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id  uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  sort         int NOT NULL DEFAULT 0
);

-- 공고 수정 이력 (수정 직전 스냅샷)
CREATE TABLE job_post_revisions (
  id          bigserial PRIMARY KEY,
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  editor_id   uuid NOT NULL REFERENCES users(id),
  snapshot    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_post_revisions_idx ON job_post_revisions(job_post_id, created_at DESC);

CREATE TABLE saved_jobs (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_post_id)
);

-- 공고 조회·문의 이벤트 (원본 13개월 보관 후 집계만 유지)
CREATE TABLE job_events (
  id          bigserial PRIMARY KEY,
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('view','contact_click')),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_idx ON job_events(job_post_id, event_type, created_at);
CREATE INDEX job_events_created_idx ON job_events(created_at);

-- ───────────────────────── 채팅
CREATE TABLE chat_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('national','region','site','dm')),
  name        text NOT NULL,
  region_code text REFERENCES regions(code),
  site_id     uuid REFERENCES sites(id) ON DELETE CASCADE,
  is_active   boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'region' OR region_code IS NOT NULL),
  CHECK (type <> 'site'   OR site_id IS NOT NULL)
);
CREATE UNIQUE INDEX chat_rooms_region_uq ON chat_rooms(region_code) WHERE type = 'region';
CREATE UNIQUE INDEX chat_rooms_site_uq   ON chat_rooms(site_id)     WHERE type = 'site';
CREATE UNIQUE INDEX chat_rooms_national_uq ON chat_rooms(type)      WHERE type = 'national';

CREATE TABLE chat_room_members (
  room_id      uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_read_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX chat_room_members_user_idx ON chat_room_members(user_id);

-- 1:1 익명 채팅 관계 (user_a < user_b 로 정규화해 중복 방 방지)
CREATE TABLE dm_pairs (
  room_id uuid PRIMARY KEY REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_a  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE TABLE chat_messages (
  id              bigserial PRIMARY KEY,
  room_id         uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_nickname text NOT NULL,                     -- 표시용 스냅샷
  body            text,                              -- 삭제 시 NULL
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES users(id),
  CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 500)
);
CREATE INDEX chat_messages_room_idx   ON chat_messages(room_id, id DESC);
CREATE INDEX chat_messages_sender_idx ON chat_messages(sender_id, created_at DESC);
CREATE INDEX chat_messages_created_idx ON chat_messages(created_at);

-- 접속 인원 (SSE 연결 단위, 하트비트 45초 이내만 유효)
CREATE TABLE chat_presence (
  room_id   uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  conn_id   text NOT NULL,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, conn_id)
);
CREATE INDEX chat_presence_seen_idx ON chat_presence(room_id, last_seen);

-- ───────────────────────── 익명 게시판
CREATE TABLE board_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_nickname text NOT NULL,
  category        text NOT NULL CHECK (category IN ('free','site','qna','settle')),
  site_id         uuid REFERENCES sites(id) ON DELETE SET NULL,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 100),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 5000),
  like_count      int NOT NULL DEFAULT 0,
  comment_count   int NOT NULL DEFAULT 0,
  view_count      int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_posts_list_idx ON board_posts(status, created_at DESC);
CREATE INDEX board_posts_cat_idx  ON board_posts(status, category, created_at DESC);
CREATE INDEX board_posts_site_idx ON board_posts(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX board_posts_author_idx ON board_posts(author_id, created_at DESC);

CREATE TABLE board_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_nickname text NOT NULL,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  status          text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_comments_post_idx ON board_comments(post_id, created_at);
CREATE INDEX board_comments_author_idx ON board_comments(author_id, created_at DESC);

CREATE TABLE board_likes (
  post_id    uuid NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ───────────────────────── 신고·차단·제재
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('chat_message','board_post','board_comment','job_post')),
  target_id   text NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,   -- 신고 대상 작성자 (운영자만 조회)
  reason      text NOT NULL CHECK (reason IN ('spam','abuse','false_job','rights','obscene','other')),
  detail      text CHECK (detail IS NULL OR char_length(detail) <= 1000),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  handled_by  uuid REFERENCES users(id),
  handled_at  timestamptz,
  action_note text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX reports_status_idx ON reports(status, created_at);
CREATE INDEX reports_target_idx ON reports(target_type, target_id);

CREATE TABLE user_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- 화면에서는 이 id로만 차단 해제
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_nickname text NOT NULL,                          -- 차단 당시 닉네임 (차단 목록 표시용)
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id),
  UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE user_sanctions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('chat_mute','post_ban','warn')),
  reason     text NOT NULL,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sanctions_user_idx ON user_sanctions(user_id, type, ends_at);

-- ───────────────────────── 공지
CREATE TABLE notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  body       text NOT NULL,
  is_pinned  boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── 광고·결제
CREATE TABLE ad_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('premium_job','vip_job','main_banner','partner')),
  duration_days int  NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  price         int  NOT NULL CHECK (price >= 0),          -- 원, 부가세 포함
  is_active     boolean NOT NULL DEFAULT true,
  description   text,
  sort          int NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE banners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  title      text NOT NULL,
  image_path text,
  link_url   text CHECK (link_url IS NULL OR link_url ~ '^https://'),
  placement  text NOT NULL DEFAULT 'home_top' CHECK (placement IN ('home_top','home_middle','jobs_list')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ad_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no    text NOT NULL UNIQUE,                  -- 결제사로 넘기는 주문번호
  buyer_id    uuid NOT NULL REFERENCES users(id),
  company_id  uuid NOT NULL REFERENCES companies(id),
  product_id  uuid NOT NULL REFERENCES ad_products(id),
  job_post_id uuid REFERENCES job_posts(id),
  banner_id   uuid REFERENCES banners(id),
  product_snapshot jsonb NOT NULL,                   -- 주문 시점 상품명·가격·기간
  amount      int NOT NULL CHECK (amount >= 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded','failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX ad_orders_company_idx ON ad_orders(company_id, created_at DESC);
CREATE INDEX ad_orders_status_idx  ON ad_orders(status, created_at DESC);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES ad_orders(id),
  provider      text NOT NULL,
  payment_key   text NOT NULL,
  amount        int  NOT NULL,
  status        text NOT NULL CHECK (status IN ('approved','cancelled')),
  raw           jsonb,
  approved_at   timestamptz NOT NULL,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, payment_key)
);
-- 주문 하나에 승인 결제는 하나만 (중복 결제·중복 활성화 방지의 DB 차원 보증)
CREATE UNIQUE INDEX payments_one_approved_per_order ON payments(order_id) WHERE status = 'approved';
CREATE INDEX payments_approved_idx ON payments(approved_at);

CREATE TABLE ad_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL UNIQUE REFERENCES ad_orders(id),
  product_type text NOT NULL CHECK (product_type IN ('premium_job','vip_job','main_banner','partner')),
  job_post_id  uuid REFERENCES job_posts(id),
  banner_id    uuid REFERENCES banners(id),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
-- 노출 판정: status='active' AND now() BETWEEN starts_at AND ends_at  → 만료는 별도 배치 없이 자동
CREATE INDEX ad_campaigns_live_idx ON ad_campaigns(product_type, status, ends_at);
CREATE INDEX ad_campaigns_job_idx  ON ad_campaigns(job_post_id) WHERE job_post_id IS NOT NULL;

CREATE TABLE ad_events (
  id          bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('impression','click')),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_events_idx ON ad_events(campaign_id, event_type, created_at);

-- ───────────────────────── 알림·수신 동의
CREATE TABLE notification_settings (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  job_alerts           boolean NOT NULL DEFAULT true,
  chat_alerts          boolean NOT NULL DEFAULT true,
  marketing_opt_in     boolean NOT NULL DEFAULT false,
  marketing_opt_in_at  timestamptz,           -- 정보통신망법: 광고성 정보 수신 동의 일시 기록
  marketing_opt_out_at timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

-- ───────────────────────── 관리자 감사 로그 (추가만 가능)
CREATE TABLE admin_audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid NOT NULL REFERENCES users(id),
  action      text NOT NULL,
  target_type text,
  target_id   text,
  detail      jsonb,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX admin_audit_logs_actor_idx   ON admin_audit_logs(actor_id, created_at DESC);

CREATE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only';
END $$;
CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

-- ───────────────────────── 기준 데이터 입력
INSERT INTO regions(code, name, sort) VALUES
 ('seoul','서울',1),('gyeonggi','경기',2),('incheon','인천',3),('busan','부산',4),('daegu','대구',5),
 ('gwangju','광주',6),('daejeon','대전',7),('ulsan','울산',8),('sejong','세종',9),('gangwon','강원',10),
 ('chungbuk','충북',11),('chungnam','충남',12),('jeonbuk','전북',13),('jeonnam','전남',14),
 ('gyeongbuk','경북',15),('gyeongnam','경남',16),('jeju','제주',17);

INSERT INTO chat_rooms(type, name, sort) VALUES ('national', '전국 자유채팅', 0);
INSERT INTO chat_rooms(type, name, region_code, sort, is_active)
SELECT 'region', name || ' 채팅', code, sort, code IN ('seoul','gyeonggi','incheon','busan')
FROM regions;

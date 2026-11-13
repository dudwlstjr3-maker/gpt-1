-- 직급 배지 (선택·자기 신고). 기본값 NULL = 표시 안 함 → 기존 익명성 범위 유지
ALTER TABLE profiles ADD COLUMN badge_rank text CHECK (badge_rank IN ('counselor','team_leader','director','newbie'));
-- 작성 시점 스냅샷 (닉네임과 같은 방식: 클라이언트는 작성자 계정을 모른 채 표시만 한다)
ALTER TABLE chat_messages  ADD COLUMN sender_badge text;
ALTER TABLE board_posts    ADD COLUMN author_badge text;
ALTER TABLE board_comments ADD COLUMN author_badge text;

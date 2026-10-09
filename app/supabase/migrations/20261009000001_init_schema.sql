-- 테이블 스키마: 회원, 알림 설정, 기기 토큰, 음식 아이콘, 음식, 분석 결과, 알림

-- 회원 프로필 (auth.users와 1:1)
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text,
  profile_image_url text,
  provider          text not null check (provider in ('kakao', 'google', 'email')),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz -- 탈퇴(소프트 삭제)
);

-- 알림 설정 (회원당 1행)
create table public.notification_settings (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  enabled     boolean not null default true,
  days_before int[] not null default '{3,1,0}', -- 소비기한 며칠 전에 알릴지
  notify_time time not null default '09:00',    -- 알림 시각 (KST)
  check (cardinality(days_before) > 0 and array_position(days_before, null) is null and 0 <= all (days_before))
);

-- FCM 기기 토큰 (여러 기기 지원)
create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  fcm_token    text not null unique,
  platform     text not null check (platform in ('android', 'ios')),
  last_seen_at timestamptz not null default now()
);
create index device_tokens_user_id_idx on public.device_tokens (user_id);

-- 귀여운 음식 아이콘 카탈로그
create table public.food_icons (
  id                      uuid primary key default gen_random_uuid(),
  key                     text not null unique, -- 예: apple, milk
  name_ko                 text not null,
  category                text not null,        -- 과일 | 채소 | 육류 | 유제품 등
  image_url               text not null,
  default_shelf_life_days int check (default_shelf_life_days > 0) -- 기한 추정 실패 시 기본값
);

-- 회원이 등록한 음식
create table public.food_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  icon_id       uuid references public.food_icons (id) on delete set null,
  name          text not null,
  photo_path    text,        -- Storage(food-photos) 원본 사진 경로
  expiry_date   date,        -- 분석 실패 시 null, 이후 수동 입력
  expiry_source text check (expiry_source in ('ocr', 'ai_estimate', 'manual')),
  storage_type  text not null default 'fridge' check (storage_type in ('fridge', 'freezer')),
  shelf_no      int check (shelf_no >= 0), -- 냉장고 선반 번호
  slot_no       int check (slot_no >= 0),  -- 선반 내 위치
  status        text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz  -- 소비/폐기 처리 시각
);
create index food_items_user_status_expiry_idx on public.food_items (user_id, status, expiry_date);
-- 같은 칸에 활성 음식이 둘 이상 놓이지 않게 한다
create unique index food_items_active_slot_uidx
  on public.food_items (user_id, storage_type, shelf_no, slot_no)
  where status = 'active' and shelf_no is not null and slot_no is not null;

-- AI 분석 결과 (음식당 1행, 서버에서만 기록)
create table public.food_analyses (
  id           uuid primary key default gen_random_uuid(),
  food_item_id uuid not null unique references public.food_items (id) on delete cascade,
  model        text not null,
  raw_result   jsonb,
  confidence   numeric check (confidence between 0 and 1),
  created_at   timestamptz not null default now()
);

-- 알림 예약/이력 (트리거와 서버에서만 기록)
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  food_item_id uuid not null references public.food_items (id) on delete cascade,
  days_before  int not null check (days_before >= 0),
  scheduled_at timestamptz not null,
  sent_at      timestamptz,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  unique (food_item_id, days_before) -- 같은 알림 중복 발송 방지
);
create index notifications_due_idx on public.notifications (scheduled_at) where status = 'pending';
create index notifications_user_id_idx on public.notifications (user_id);

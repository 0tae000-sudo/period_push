-- AI 분석 흐름 변경
--  - food_analyses를 독립 테이블로 바꾼다 (분석은 음식 저장 전에 일어나므로). food_items가 analysis_id로 참조한다.
--  - 냉장고 칸 위치(shelf_no, slot_no)를 삭제한다. 앱이 목록을 정렬해서 자동 배치한다.
--  - food_icons에 AI 생성 아이콘을 담을 수 있게 한다.

-- ───── food_analyses ─────
-- 이 테이블은 서버(Edge Function)만 기록하며 아직 데이터가 없다.
-- 기존 정책이 food_item_id를 참조하므로 컬럼보다 먼저 지운다.
drop policy "food_analyses_select_own" on public.food_analyses;
alter table public.food_analyses drop column food_item_id;

alter table public.food_analyses
  add column user_id        uuid not null references public.profiles (id) on delete cascade,
  add column photo_path     text not null,
  add column status         text not null check (status in ('success', 'no_food', 'multiple_foods', 'failed')),
  add column prompt_version text;

create index food_analyses_user_created_idx on public.food_analyses (user_id, created_at desc);

create policy "food_analyses_select_own" on public.food_analyses
  for select to authenticated using (user_id = auth.uid());

-- ───── food_items ─────
drop index public.food_items_active_slot_uidx;
alter table public.food_items
  drop column shelf_no,
  drop column slot_no,
  add column analysis_id uuid references public.food_analyses (id) on delete set null;

-- 하나의 분석 결과로 음식을 두 번 저장하지 못한다
create unique index food_items_analysis_id_uidx on public.food_items (analysis_id) where analysis_id is not null;

-- analysis_id는 본인의 분석 기록만 연결할 수 있다
drop policy "food_items_all_own" on public.food_items;
create policy "food_items_all_own" on public.food_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      analysis_id is null
      or exists (
        select 1 from public.food_analyses fa
        where fa.id = food_items.analysis_id and fa.user_id = auth.uid()
      )
    )
  );

-- ───── food_icons ─────
alter table public.food_icons
  alter column image_url drop not null, -- 생성 중에는 이미지가 없다 (앱은 카테고리 기본 아이콘을 보여준다)
  add column source     text not null default 'preset' check (source in ('preset', 'generated')),
  add column status     text not null default 'ready' check (status in ('ready', 'generating', 'failed')),
  add column created_at timestamptz not null default now(),
  add constraint food_icons_ready_has_image check (status <> 'ready' or image_url is not null);

-- AI가 생성한 아이콘 이미지 버킷 (공개 읽기, 쓰기는 서버만)
insert into storage.buckets (id, name, public)
values ('food-icons', 'food-icons', true)
on conflict (id) do nothing;

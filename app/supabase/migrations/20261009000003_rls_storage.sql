-- RLS 정책과 사진 Storage 버킷

alter table public.profiles              enable row level security;
alter table public.notification_settings enable row level security;
alter table public.device_tokens         enable row level security;
alter table public.food_icons            enable row level security;
alter table public.food_items            enable row level security;
alter table public.food_analyses         enable row level security;
alter table public.notifications         enable row level security;

-- profiles: 본인 행만 조회/수정 (생성은 가입 트리거가 담당, 탈퇴는 deleted_at 업데이트)
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- notification_settings: 본인 행만 조회/수정 (생성은 가입 트리거가 담당)
create policy "notification_settings_select_own" on public.notification_settings
  for select to authenticated using (user_id = auth.uid());
create policy "notification_settings_update_own" on public.notification_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- device_tokens: 본인 토큰 전체 권한
create policy "device_tokens_all_own" on public.device_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- food_icons: 로그인한 회원은 읽기만 (쓰기는 마이그레이션/대시보드)
create policy "food_icons_select_authenticated" on public.food_icons
  for select to authenticated using (true);

-- food_items: 본인 음식 전체 권한
create policy "food_items_all_own" on public.food_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- food_analyses: 본인 음식의 분석 결과만 읽기 (기록은 서버/Edge Function)
create policy "food_analyses_select_own" on public.food_analyses
  for select to authenticated
  using (exists (
    select 1 from public.food_items fi
    where fi.id = food_analyses.food_item_id and fi.user_id = auth.uid()
  ));

-- notifications: 본인 알림만 읽기 (기록은 트리거/서버)
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- 음식 사진 버킷: 비공개, 경로의 첫 폴더가 회원 id (예: {user_id}/{파일명})
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false)
on conflict (id) do nothing;

create policy "food_photos_all_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

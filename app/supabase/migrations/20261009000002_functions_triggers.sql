-- 가입 시 프로필/알림 설정 자동 생성, 음식 변경 시 알림 자동 예약

-- 가입 시 profiles, notification_settings 행 생성
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  v_provider := case new.raw_app_meta_data ->> 'provider'
    when 'kakao' then 'kakao'
    when 'google' then 'google'
    else 'email'
  end;

  insert into public.profiles (id, nickname, profile_image_url, provider)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'nickname',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_provider
  );

  insert into public.notification_settings (user_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 음식 1개의 알림을 다시 계산한다.
-- 대기(pending) 알림을 지우고, 활성 음식이면 설정(days_before, notify_time)대로 다시 예약한다.
-- 이미 지난 시각의 알림은 만들지 않는다.
create function public.schedule_food_notifications(p_food_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     public.food_items%rowtype;
  v_settings public.notification_settings%rowtype;
  v_days     int;
  v_at       timestamptz;
begin
  select * into v_item from public.food_items where id = p_food_item_id;
  if not found then
    return;
  end if;

  -- 소비/폐기 처리된 음식은 남은 알림을 건너뜀 처리
  if v_item.status <> 'active' then
    update public.notifications
       set status = 'skipped'
     where food_item_id = v_item.id and status = 'pending';
    return;
  end if;

  delete from public.notifications
   where food_item_id = v_item.id and status = 'pending';

  if v_item.expiry_date is null then
    return;
  end if;

  select * into v_settings from public.notification_settings where user_id = v_item.user_id;
  if not found or not v_settings.enabled then
    return;
  end if;

  foreach v_days in array v_settings.days_before loop
    v_at := ((v_item.expiry_date - v_days)::timestamp + v_settings.notify_time) at time zone 'Asia/Seoul';
    if v_at > now() then
      insert into public.notifications (user_id, food_item_id, days_before, scheduled_at)
      values (v_item.user_id, v_item.id, v_days, v_at)
      on conflict (food_item_id, days_before) do nothing;
    end if;
  end loop;
end;
$$;

-- 음식이 등록/수정되면 알림 재예약
create function public.on_food_item_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.schedule_food_notifications(new.id);
  return null;
end;
$$;

create trigger food_items_schedule_notifications
  after insert or update of expiry_date, status on public.food_items
  for each row execute function public.on_food_item_changed();

-- 알림 설정이 바뀌면 활성 음식 전체의 알림 재예약
create function public.on_notification_settings_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.food_items where user_id = new.user_id and status = 'active'
  loop
    perform public.schedule_food_notifications(v_id);
  end loop;
  return null;
end;
$$;

create trigger notification_settings_reschedule
  after update of enabled, days_before, notify_time on public.notification_settings
  for each row execute function public.on_notification_settings_changed();

-- 앱(클라이언트)에서 직접 호출하지 못하게 막는다. 트리거는 그대로 동작한다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.schedule_food_notifications(uuid) from public, anon, authenticated;
revoke execute on function public.on_food_item_changed() from public, anon, authenticated;
revoke execute on function public.on_notification_settings_changed() from public, anon, authenticated;

-- User: Base44 kept custom fields on the auth user itself. Here they live in
-- public.profile, one row per auth.users row, created by trigger.
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  email text,
  full_name text,
  role text not null default 'user',
  disabled boolean not null default false,
  is_verified boolean not null default false,
  "language" text default 'pt',
  "background_url" text,
  "logo_url" text,
  "primary_color" text default '#84cc16',
  "secondary_color" text default '#10b981',
  "navbar_primary_color" text default '#84cc16',
  "navbar_secondary_color" text default '#10b981',
  "submenu_primary_color" text default '#6366f1',
  "submenu_secondary_color" text default '#a855f7',
  "device_mode" text default 'desktop'
);
create trigger profile_updated_date before update on public.profile
  for each row execute function public.set_updated_date();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile (id, email, full_name, is_verified)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile.is_verified in step with email confirmation.
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profile set is_verified = true where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_confirmed after update on auth.users
  for each row execute function public.handle_user_confirmed();

-- Row-level security.
-- The Base44 app was effectively public: projection screens render with no
-- login. Signed-in users (church staff) get full access; anonymous gets read
-- access to content plus the four writes the unattended screens perform.
-- Tighten this (per-device tokens) before exposing the project widely.
alter table public.alert_message enable row level security;
create policy "alert_message: staff full access" on public.alert_message
  for all to authenticated using (true) with check (true);
create policy "alert_message: public read" on public.alert_message
  for select to anon using (true);
alter table public.banner_template enable row level security;
create policy "banner_template: staff full access" on public.banner_template
  for all to authenticated using (true) with check (true);
create policy "banner_template: public read" on public.banner_template
  for select to anon using (true);
alter table public.bible_material enable row level security;
create policy "bible_material: staff full access" on public.bible_material
  for all to authenticated using (true) with check (true);
create policy "bible_material: public read" on public.bible_material
  for select to anon using (true);
alter table public.bible_note enable row level security;
create policy "bible_note: staff full access" on public.bible_note
  for all to authenticated using (true) with check (true);
create policy "bible_note: public read" on public.bible_note
  for select to anon using (true);
alter table public.bible_passage enable row level security;
create policy "bible_passage: staff full access" on public.bible_passage
  for all to authenticated using (true) with check (true);
create policy "bible_passage: public read" on public.bible_passage
  for select to anon using (true);
alter table public.bible_projection_sync enable row level security;
create policy "bible_projection_sync: staff full access" on public.bible_projection_sync
  for all to authenticated using (true) with check (true);
create policy "bible_projection_sync: public read" on public.bible_projection_sync
  for select to anon using (true);
alter table public.bible_school_class enable row level security;
create policy "bible_school_class: staff full access" on public.bible_school_class
  for all to authenticated using (true) with check (true);
create policy "bible_school_class: public read" on public.bible_school_class
  for select to anon using (true);
alter table public.bible_verse enable row level security;
create policy "bible_verse: staff full access" on public.bible_verse
  for all to authenticated using (true) with check (true);
create policy "bible_verse: public read" on public.bible_verse
  for select to anon using (true);
alter table public.chat_message enable row level security;
create policy "chat_message: staff full access" on public.chat_message
  for all to authenticated using (true) with check (true);
create policy "chat_message: public read" on public.chat_message
  for select to anon using (true);
alter table public.communication_video enable row level security;
create policy "communication_video: staff full access" on public.communication_video
  for all to authenticated using (true) with check (true);
create policy "communication_video: public read" on public.communication_video
  for select to anon using (true);
alter table public.live_session enable row level security;
create policy "live_session: staff full access" on public.live_session
  for all to authenticated using (true) with check (true);
create policy "live_session: public read" on public.live_session
  for select to anon using (true);
alter table public.lyric_sync enable row level security;
create policy "lyric_sync: staff full access" on public.lyric_sync
  for all to authenticated using (true) with check (true);
create policy "lyric_sync: public read" on public.lyric_sync
  for select to anon using (true);
alter table public.media enable row level security;
create policy "media: staff full access" on public.media
  for all to authenticated using (true) with check (true);
create policy "media: public read" on public.media
  for select to anon using (true);
alter table public.playlist enable row level security;
create policy "playlist: staff full access" on public.playlist
  for all to authenticated using (true) with check (true);
create policy "playlist: public read" on public.playlist
  for select to anon using (true);
alter table public.poll enable row level security;
create policy "poll: staff full access" on public.poll
  for all to authenticated using (true) with check (true);
create policy "poll: public read" on public.poll
  for select to anon using (true);
alter table public.projection_device enable row level security;
create policy "projection_device: staff full access" on public.projection_device
  for all to authenticated using (true) with check (true);
create policy "projection_device: public read" on public.projection_device
  for select to anon using (true);
alter table public.projection_scene enable row level security;
create policy "projection_scene: staff full access" on public.projection_scene
  for all to authenticated using (true) with check (true);
create policy "projection_scene: public read" on public.projection_scene
  for select to anon using (true);
alter table public.projection_state enable row level security;
create policy "projection_state: staff full access" on public.projection_state
  for all to authenticated using (true) with check (true);
create policy "projection_state: public read" on public.projection_state
  for select to anon using (true);
alter table public.projection_theme enable row level security;
create policy "projection_theme: staff full access" on public.projection_theme
  for all to authenticated using (true) with check (true);
create policy "projection_theme: public read" on public.projection_theme
  for select to anon using (true);
alter table public.quiz enable row level security;
create policy "quiz: staff full access" on public.quiz
  for all to authenticated using (true) with check (true);
create policy "quiz: public read" on public.quiz
  for select to anon using (true);
alter table public.raffle enable row level security;
create policy "raffle: staff full access" on public.raffle
  for all to authenticated using (true) with check (true);
create policy "raffle: public read" on public.raffle
  for select to anon using (true);
alter table public.service enable row level security;
create policy "service: staff full access" on public.service
  for all to authenticated using (true) with check (true);
create policy "service: public read" on public.service
  for select to anon using (true);
alter table public.service_item enable row level security;
create policy "service_item: staff full access" on public.service_item
  for all to authenticated using (true) with check (true);
create policy "service_item: public read" on public.service_item
  for select to anon using (true);
alter table public.service_template enable row level security;
create policy "service_template: staff full access" on public.service_template
  for all to authenticated using (true) with check (true);
create policy "service_template: public read" on public.service_template
  for select to anon using (true);
alter table public.song enable row level security;
create policy "song: staff full access" on public.song
  for all to authenticated using (true) with check (true);
create policy "song: public read" on public.song
  for select to anon using (true);
alter table public.song_history enable row level security;
create policy "song_history: staff full access" on public.song_history
  for all to authenticated using (true) with check (true);
create policy "song_history: public read" on public.song_history
  for select to anon using (true);
alter table public.video_control enable row level security;
create policy "video_control: staff full access" on public.video_control
  for all to authenticated using (true) with check (true);
create policy "video_control: public read" on public.video_control
  for select to anon using (true);
alter table public.video_sync enable row level security;
create policy "video_sync: staff full access" on public.video_sync
  for all to authenticated using (true) with check (true);
create policy "video_sync: public read" on public.video_sync
  for select to anon using (true);
alter table public.volunteer_schedule enable row level security;
create policy "volunteer_schedule: staff full access" on public.volunteer_schedule
  for all to authenticated using (true) with check (true);
create policy "volunteer_schedule: public read" on public.volunteer_schedule
  for select to anon using (true);
alter table public.worship_team enable row level security;
create policy "worship_team: staff full access" on public.worship_team
  for all to authenticated using (true) with check (true);
create policy "worship_team: public read" on public.worship_team
  for select to anon using (true);

-- Anonymous writes performed by unattended screens:
--   DeviceView / useDeviceHeartbeat        -> projection_device.update (is_online, last_seen)
--   VideoProjection / TabletVideoReceiver  -> video_sync.update
--   LatencyIndicator                       -> live_session.update
--   WorshipChat                            -> chat_message.create
create policy "projection_device: screen heartbeat" on public.projection_device
  for update to anon using (true) with check (true);
create policy "video_sync: screen ack" on public.video_sync
  for update to anon using (true) with check (true);
create policy "live_session: latency ping" on public.live_session
  for update to anon using (true) with check (true);
create policy "chat_message: public post" on public.chat_message
  for insert to anon with check (true);

alter table public.profile enable row level security;
create policy "profile: read own" on public.profile
  for select to authenticated using (auth.uid() = id);
create policy "profile: update own" on public.profile
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);


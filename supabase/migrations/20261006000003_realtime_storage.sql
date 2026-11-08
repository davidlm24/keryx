-- Realtime. Every table is published (Base44 allowed subscribe() on any
-- entity). The tables the app actually subscribes to get REPLICA IDENTITY FULL
-- so UPDATE/DELETE events carry whole rows; the callbacks render event.data.
alter publication supabase_realtime add table public.alert_message;
alter publication supabase_realtime add table public.banner_template;
alter publication supabase_realtime add table public.bible_material;
alter publication supabase_realtime add table public.bible_note;
alter publication supabase_realtime add table public.bible_passage;
alter publication supabase_realtime add table public.bible_projection_sync;
alter publication supabase_realtime add table public.bible_school_class;
alter publication supabase_realtime add table public.bible_verse;
alter publication supabase_realtime add table public.chat_message;
alter publication supabase_realtime add table public.communication_video;
alter publication supabase_realtime add table public.live_session;
alter publication supabase_realtime add table public.lyric_sync;
alter publication supabase_realtime add table public.media;
alter publication supabase_realtime add table public.playlist;
alter publication supabase_realtime add table public.poll;
alter publication supabase_realtime add table public.projection_device;
alter publication supabase_realtime add table public.projection_scene;
alter publication supabase_realtime add table public.projection_state;
alter publication supabase_realtime add table public.projection_theme;
alter publication supabase_realtime add table public.quiz;
alter publication supabase_realtime add table public.raffle;
alter publication supabase_realtime add table public.service;
alter publication supabase_realtime add table public.service_item;
alter publication supabase_realtime add table public.service_template;
alter publication supabase_realtime add table public.song;
alter publication supabase_realtime add table public.song_history;
alter publication supabase_realtime add table public.video_control;
alter publication supabase_realtime add table public.video_sync;
alter publication supabase_realtime add table public.volunteer_schedule;
alter publication supabase_realtime add table public.worship_team;
alter table public.alert_message replica identity full;
alter table public.live_session replica identity full;
alter table public.video_sync replica identity full;
alter table public.video_control replica identity full;
alter table public.projection_device replica identity full;
alter table public.bible_projection_sync replica identity full;
alter table public.chat_message replica identity full;
alter table public.lyric_sync replica identity full;

-- Storage: one public bucket behind UploadFile().
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
create policy "media: public read" on storage.objects
  for select to public using (bucket_id = 'media');
create policy "media: staff upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'media');
create policy "media: staff update" on storage.objects
  for update to authenticated using (bucket_id = 'media');
create policy "media: staff delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media');

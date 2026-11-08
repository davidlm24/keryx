-- KERYX initial schema, generated from base44/entities/*.jsonc.
-- One table per Base44 entity. Column names are the entity field names
-- verbatim (quoted, so camelCase survives) because the pages reference them
-- directly. Base44's system columns (id, created_date, updated_date,
-- created_by, created_by_id) are kept for the same reason: pages sort on them.
-- ids are text, not uuid: Base44 ids are 24-hex strings and the app
-- cross-references them as plain strings, so imported rows keep their ids.

create extension if not exists pgcrypto;

create or replace function public.set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date := now();
  return new;
end $$;

-- AlertMessage
create table public.alert_message (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "message" text not null,
  "type" text default 'alert',
  "status" text default 'active',
  "timestamp" double precision not null
);
create trigger alert_message_updated_date before update on public.alert_message
  for each row execute function public.set_updated_date();

-- BannerTemplate
create table public.banner_template (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "category" text not null default 'opening',
  "title" text,
  "subtitle" text,
  "phrases" jsonb,
  "event_date" text,
  "event_time" text,
  "location" text,
  "description" text,
  "countdown_duration" double precision default 60,
  "background_type" text default 'celestial',
  "background_id" text,
  "custom_image" text,
  "background_speed" double precision default 1,
  "background_intensity" double precision default 0.5,
  "background_overlay" double precision default 0.3,
  "animation" text default 'fade_in',
  "animation_speed" double precision default 1,
  "phrase_duration" double precision default 3,
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "font_family" text default 'sans',
  "font_size" text default 'xlarge',
  "text_weight" text default 'bold',
  "text_letter_spacing" double precision default 0,
  "text_line_height" double precision default 1.2,
  "text_align_h" text default 'center',
  "text_align_v" text default 'middle',
  "text_effect" text default 'shadow',
  "text_effect_color" text,
  "text_transform" text default 'none',
  "text_padding" double precision default 8,
  "audio_url" text,
  "audio_volume" double precision default 0.7,
  "audio_fade_in" boolean default false,
  "audio_fade_out" boolean default false,
  "audio_loop" boolean default true
);
create trigger banner_template_updated_date before update on public.banner_template
  for each row execute function public.set_updated_date();

-- BibleMaterial
create table public.bible_material (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "type" text not null default 'slides',
  "class_id" text,
  "class_name" text,
  "age_group" text default 'all',
  "subject" text,
  "slides" jsonb,
  "quiz_question" text,
  "quiz_options" jsonb,
  "quiz_correct" double precision,
  "quiz_questions" jsonb,
  "video_url" text,
  "image_url" text,
  "description" text,
  "text_color" text default '#ffffff',
  "background_image" text,
  "background_color" text default '#0f172a'
);
create trigger bible_material_updated_date before update on public.bible_material
  for each row execute function public.set_updated_date();

-- BibleNote
create table public.bible_note (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "reference" text not null,
  "book" text,
  "chapter" double precision,
  "verse" double precision,
  "verse_text" text,
  "note_type" text not null default 'note',
  "note_text" text,
  "highlight_color" text default '#fbbf24'
);
create trigger bible_note_updated_date before update on public.bible_note
  for each row execute function public.set_updated_date();

-- BiblePassage
create table public.bible_passage (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "reference" text not null,
  "book" text,
  "chapter" double precision,
  "verses" text,
  "text" text not null,
  "slides" jsonb,
  "version" text default 'NVI',
  "font_size" text default 'large',
  "font_family" text default 'sans',
  "text_effect" text default 'shadow',
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "background_image" text
);
create trigger bible_passage_updated_date before update on public.bible_passage
  for each row execute function public.set_updated_date();

-- BibleProjectionSync
create table public.bible_projection_sync (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "channel" text not null,
  "action" text default 'project',
  "content_type" text default 'slides',
  "title" text,
  "slides" jsonb,
  "slide_index" double precision default 0,
  "quiz_question" text,
  "quiz_options" jsonb,
  "quiz_correct" double precision,
  "quiz_questions" jsonb,
  "quiz_index" double precision default 0,
  "quiz_reveal" boolean default false,
  "media_url" text,
  "background_image" text,
  "background_color" text default '#0f172a',
  "text_color" text default '#ffffff',
  "font_size" text default 'large',
  "font_family" text default 'sans',
  "text_effect" text default 'shadow',
  "overlays" jsonb,
  "timestamp" double precision not null
);
create trigger bible_projection_sync_updated_date before update on public.bible_projection_sync
  for each row execute function public.set_updated_date();

-- BibleSchoolClass
create table public.bible_school_class (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "age_group" text not null default 'children',
  "teacher_name" text,
  "assistant_name" text,
  "room" text,
  "students" jsonb,
  "meeting_time" text,
  "curriculum" text,
  "notes" text
);
create trigger bible_school_class_updated_date before update on public.bible_school_class
  for each row execute function public.set_updated_date();

-- BibleVerse
create table public.bible_verse (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "version" text not null default 'ARA',
  "testament" text,
  "book" text not null,
  "chapter" double precision not null,
  "verse" double precision not null,
  "text" text not null
);
create trigger bible_verse_updated_date before update on public.bible_verse
  for each row execute function public.set_updated_date();

-- ChatMessage
create table public.chat_message (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "sender_name" text not null,
  "message" text,
  "channel" text default 'worship',
  "file_url" text,
  "file_type" text,
  "file_name" text
);
create trigger chat_message_updated_date before update on public.chat_message
  for each row execute function public.set_updated_date();

-- CommunicationVideo
create table public.communication_video (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "type" text not null,
  "duration" double precision not null,
  "text" text,
  "subtext" text,
  "background_image" text,
  "background_video" text,
  "background_color" text,
  "background_audio" text,
  "files" jsonb,
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "font_size" text default 'large',
  "font_family" text default 'sans',
  "text_effect" text default 'shadow',
  "text_position_h" text default 'center',
  "text_position_v" text default 'middle',
  "show_logo" boolean default true,
  "logo_position" text default 'top-left',
  "sound_alert" boolean default false
);
create trigger communication_video_updated_date before update on public.communication_video
  for each row execute function public.set_updated_date();

-- LiveSession
create table public.live_session (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "serviceId" text,
  "status" text default 'idle',
  "currentItemId" text,
  "currentSlideIndex" double precision default 0,
  "startedAt" double precision,
  "endedAt" double precision,
  "channel" text
);
create trigger live_session_updated_date before update on public.live_session
  for each row execute function public.set_updated_date();

-- LyricSync
create table public.lyric_sync (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "song_title" text,
  "artist" text,
  "slides" jsonb,
  "slide_index" double precision default 0,
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "background_image" text,
  "font_size" text default 'large',
  "font_family" text default 'sans',
  "text_effect" text default 'shadow',
  "overlays" jsonb,
  "status" text default 'active',
  "timestamp" double precision not null
);
create trigger lyric_sync_updated_date before update on public.lyric_sync
  for each row execute function public.set_updated_date();

-- Media
create table public.media (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "type" text not null,
  "file_url" text not null,
  "thumbnail_url" text,
  "duration" double precision,
  "description" text,
  "category" text default 'other'
);
create trigger media_updated_date before update on public.media
  for each row execute function public.set_updated_date();

-- Playlist
create table public.playlist (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "date" date not null,
  "service_type" text default 'Culto de Celebração',
  "songs" jsonb,
  "notes" text,
  "status" text default 'Planejado'
);
create trigger playlist_updated_date before update on public.playlist
  for each row execute function public.set_updated_date();

-- Poll
create table public.poll (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "question" text not null,
  "options" jsonb not null,
  "is_active" boolean default false,
  "is_multi_select" boolean default false
);
create trigger poll_updated_date before update on public.poll
  for each row execute function public.set_updated_date();

-- ProjectionDevice
create table public.projection_device (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "type" text not null default 'projector',
  "role" text default 'lyrics',
  "pairing_code" text,
  "is_online" boolean default false,
  "last_seen" timestamptz,
  "config" jsonb,
  "current_output" jsonb,
  "notes" text
);
create trigger projection_device_updated_date before update on public.projection_device
  for each row execute function public.set_updated_date();

-- ProjectionScene
create table public.projection_scene (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "description" text,
  "items" jsonb,
  "is_active" boolean default false
);
create trigger projection_scene_updated_date before update on public.projection_scene
  for each row execute function public.set_updated_date();

-- ProjectionState
create table public.projection_state (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "active" boolean default false,
  "current_type" text,
  "song_id" text,
  "slide_index" double precision default 0,
  "bible_reference" text,
  "bible_text" text,
  "media_url" text,
  "custom_background" text,
  "operator_name" text,
  "updated_at" timestamptz
);
create trigger projection_state_updated_date before update on public.projection_state
  for each row execute function public.set_updated_date();

-- ProjectionTheme
create table public.projection_theme (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "font_family" text default 'sans',
  "font_size" text default 'large',
  "text_effect" text default 'shadow',
  "background_image" text,
  "elements" jsonb,
  "is_default" boolean default false
);
create trigger projection_theme_updated_date before update on public.projection_theme
  for each row execute function public.set_updated_date();

-- Quiz
create table public.quiz (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "question" text not null,
  "options" jsonb not null,
  "correct_index" double precision not null,
  "bible_reference" text,
  "category" text default 'bible',
  "difficulty" text default 'medium',
  "is_active" boolean default false
);
create trigger quiz_updated_date before update on public.quiz
  for each row execute function public.set_updated_date();

-- Raffle
create table public.raffle (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "participants" jsonb not null,
  "winner" text,
  "runners_up" jsonb,
  "num_winners" double precision default 1,
  "is_active" boolean default false,
  "drawn_at" timestamptz
);
create trigger raffle_updated_date before update on public.raffle
  for each row execute function public.set_updated_date();

-- Service
create table public.service (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "date" date not null,
  "time" text,
  "startTime" text,
  "location" text,
  "organizationId" text,
  "templateId" text,
  "service_type" text default 'culto',
  "event_description" text,
  "worship_team" jsonb,
  "items" jsonb,
  "notes" text,
  "status" text default 'DRAFT'
);
create trigger service_updated_date before update on public.service
  for each row execute function public.set_updated_date();

-- ServiceItem
create table public.service_item (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "serviceId" text not null,
  "order" double precision default 0,
  "type" text not null default 'SONG',
  "title" text not null,
  "contentId" text,
  "duration" double precision,
  "notes" text,
  "sceneId" text,
  "autoAdvance" boolean default false,
  "enabled" boolean default true
);
create trigger service_item_updated_date before update on public.service_item
  for each row execute function public.set_updated_date();

-- ServiceTemplate
create table public.service_template (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "description" text,
  "items" jsonb,
  "isDefault" boolean default false
);
create trigger service_template_updated_date before update on public.service_template
  for each row execute function public.set_updated_date();

-- Song
create table public.song (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "artist" text,
  "lyrics" text not null,
  "duration" double precision,
  "audio_url" text,
  "background_image" text,
  "slides" jsonb,
  "category" text default 'worship',
  "font_size" text default 'large',
  "font_family" text default 'sans',
  "text_effect" text default 'shadow',
  "text_color" text default '#ffffff',
  "text_color_2" text,
  "bpm" double precision,
  "song_key" text,
  "chords" text,
  "musician_notes" text,
  "ccli_number" text,
  "is_favorite" boolean default false,
  "last_played_at" timestamptz,
  "play_count" double precision default 0
);
create trigger song_updated_date before update on public.song
  for each row execute function public.set_updated_date();

-- SongHistory
create table public.song_history (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "song_id" text not null,
  "song_title" text not null,
  "song_artist" text,
  "played_at" timestamptz not null,
  "service_id" text,
  "service_title" text,
  "operator_name" text
);
create trigger song_history_updated_date before update on public.song_history
  for each row execute function public.set_updated_date();

-- VideoControl
create table public.video_control (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "action" text not null,
  "time" double precision,
  "volume" double precision,
  "timestamp" double precision not null
);
create trigger video_control_updated_date before update on public.video_control
  for each row execute function public.set_updated_date();

-- VideoSync
create table public.video_sync (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "video_url" text not null,
  "title" text,
  "timestamp" double precision not null,
  "status" text default 'active'
);
create trigger video_sync_updated_date before update on public.video_sync
  for each row execute function public.set_updated_date();

-- VolunteerSchedule
create table public.volunteer_schedule (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "title" text not null,
  "date" date not null,
  "service_title" text,
  "assignments" jsonb,
  "status" text default 'draft',
  "notes" text
);
create trigger volunteer_schedule_updated_date before update on public.volunteer_schedule
  for each row execute function public.set_updated_date();

-- WorshipTeam
create table public.worship_team (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'email'),
  created_by_id text default auth.uid()::text,
  "name" text not null,
  "phone" text not null,
  "role" text default 'other',
  "email" text,
  "notes" text,
  "active" boolean default true
);
create trigger worship_team_updated_date before update on public.worship_team
  for each row execute function public.set_updated_date();


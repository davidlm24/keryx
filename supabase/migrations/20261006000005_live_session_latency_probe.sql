-- LatencyIndicator writes a send-time here every 10s and times the realtime
-- echo. The write also bumps updated_date, which session cleanup reads as
-- activity.
alter table public.live_session add column "latencyProbe" double precision;

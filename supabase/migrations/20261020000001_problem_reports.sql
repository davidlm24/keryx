-- Relatar um problema (owner 2026-10-20): the reports the desktop app sends
-- through the `relato` Edge Function, which alone writes here (service role).
-- No policies on purpose: with RLS on, the anon and authenticated roles can
-- neither read nor write a report; the owner reads them in the dashboard.
create table public.problem_reports (
  id uuid primary key,                  -- made by the app, so a resend from its queue never duplicates
  code text not null,                   -- R-XXXX, what the dialog shows (shared/support.mjs reportCode)
  received_at timestamptz not null default now(),
  written_at timestamptz,               -- when the operator pressed Enviar (the queue may hold it for days)
  church text,
  version text,
  os text,
  install_id text,                      -- one random id per computer, for the daily limit
  text text not null,
  doing text,
  contact text,
  diag_path text,                       -- the zip in the private bucket `relatos`, when it was included
  status text not null default 'novo' check (status in ('novo', 'visto', 'resolvido'))
);

create index problem_reports_install_recent on public.problem_reports (install_id, received_at desc);

alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;

-- The diagnostic zips: private, no policies (only the service role reaches them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatos', 'relatos', false, 5242880, array['application/zip'])
on conflict (id) do nothing;

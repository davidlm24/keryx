# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui on Supabase.
Read `README.md` first — it covers the stack, how to run it, the backend
wiring, the data model and the known gaps.

## Ground rules

- **UI language is Brazilian Portuguese (pt-BR).** All user-facing strings,
  labels and toasts are pt-BR (tela, salvar, arquivo, excluir, celular,
  cronômetro, usuário) — the church is Brazilian; do not use pt-PT forms
  (ecrã, guardar, ficheiro, eliminar, telemóvel). Do not introduce English UI
  copy. Code identifiers and comments are English.
- **`src/components/ui/` is generated shadcn/ui.** It is excluded from lint and
  from editor type checking. Don't hand-edit it; add components with the
  shadcn CLI (`components.json` is configured) or wrap them instead.
- **The schema lives in `supabase/migrations/`.** A schema change is a new
  migration file, applied to the project and committed. Never alter a table
  from the dashboard without writing the migration down. The JSON Schemas in
  `base44/entities/` are the readable field docs the tables were generated
  from; keep them in step when you add a column.
- **Data access goes through `keryx.entities.*` inside TanStack Query.**
  `keryx` is re-exported from `src/api/keryxClient.js`; the client itself is
  `src/api/client.js`, which keeps the old Base44 SDK surface on supabase-js. Add to that client when a page needs a new
  method; don't call `supabase.from()` from a page.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. Events carry
  the whole row in `data` only for tables with `REPLICA IDENTITY FULL`
  (the eight the app subscribes to); add that when subscribing to a new one.
- **Anonymous users are a normal state, not an error.** TV screens run with no
  login. Anything a screen needs must be readable by `anon` under RLS.

## Commands

```bash
npm run dev         # vite against the project in .env (http://localhost:5173)
npm run lint        # gates on errors only; ~90 warnings are advisory
npm run build
npm run db:migrate  # one-off Base44 data import; needs secrets, see the script
```

Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Base44 tokens) are
the user's to set — in the Supabase dashboard or their shell. Don't ask for
their values and don't write them into tracked files.

## Verifying a change

There are no tests, so the loop is: `npm run lint`, then `npm run build`, then
look at the page. Dev runs against the real project, so a seeded row you add
while testing must be deleted afterwards.

Projection features need two windows to verify: the operator page drives a
second window opened via `src/lib/projectionWindow.js` (same machine,
`postMessage`) or a remote screen via the live-sync tables (network, through
realtime). A change that looks right in one window may not be in the other.

## Watch out for

- **`/Home` is the songs library ("Músicas"), not a dashboard.** `/Services`
  ("Cultos") is the service planner. The songs page groups by artist, so a
  freshly added song shows as an artist entry, not a title.
- **Routes are declared in two places.** `src/pages.config.js` holds the nine
  pages that get the app `Layout`; the rest — including every bare projection
  target — are routed explicitly in `src/App.jsx`. Adding a page means touching
  one or the other deliberately, not both.
- **Public auth routes must stay outside `AuthenticatedApp`.** That component
  redirects to `/login` on auth failure, so a login route nested inside it
  loops.
- `createPageUrl(name)` is just `'/' + name` — page keys and paths are the same
  string, and they are capitalized (`/Bible`, not `/bible`), unlike the
  lowercase public auth routes.
- **Column names are the entity field names verbatim**, including camelCase
  (`"serviceId"`, `"startedAt"`). Quote them in SQL.
- **Ids are text, not uuid.** Imported Base44 rows keep 24-hex ids; new rows
  get a uuid string. Never cast `id` to uuid.

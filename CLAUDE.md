# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui, packaged as an
offline-first Electron desktop app with a local SQLite store; the same UI in a
plain browser runs on Supabase instead. Plan: `docs/desktop-architecture.md`.
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
- **Fields are defined in `base44/entities/*.jsonc`.** Adding or changing a
  field: edit the jsonc, run `npm run db:schema` (regenerates
  `electron/db/schema.json`; the local store adds new columns on next launch),
  and for the web build add a migration in `supabase/migrations/`. `npm test`
  fails if schema.json and the jsonc drift apart.
- **Data access goes through `keryx.entities.*` inside TanStack Query.**
  `src/api/client.js` is a facade over two backends with the same surface:
  `backends/desktop.js` (IPC to `electron/db/store.cjs`) and
  `backends/supabase.js` (web build). A new method goes into both; pages never
  talk to SQLite, IPC or Supabase directly. Query semantics follow Base44 and
  are pinned by `electron/db/store.test.cjs`; change them there first.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. On desktop every
  write reaches every window with the whole row, deletes included.
- **No login on desktop.** `auth.me()` is one local operator profile
  (`entities.User` maps to it whatever id is passed). Don't add features that
  assume accounts; cloud sync is a later phase.
- **Media URLs:** the store keeps `keryx-media://<file>`; pages get
  `http://127.0.0.1:7700/media/<file>` from the adapter. Never write the http
  form into the database by other means, and keep checks like
  `startsWith("http")` working.

## Commands

```bash
npm run desktop:dev    # the desktop app on the Vite dev server (hot reload, F12 devtools)
npm test               # store query semantics + schema drift (node --test)
npm run lint           # gates on errors only; ~90 warnings are advisory
npm run build
npm run desktop:smoke  # build + run the app on a temp data dir + in-app checks
KERYX_SMOKE=1 npm run desktop:dev   # same checks + the renderer adapter end to end
npm run db:schema      # after editing base44/entities/*.jsonc
npm run db:import      # one-off Base44 -> local import; needs the user's token
npm run dev            # web build in a browser, against Supabase
```

The desktop app's real data is in `%APPDATA%\KERYX` — never point a test at
it; smoke runs use a temp `KERYX_DATA_DIR`.

Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Base44 tokens) are
the user's to set — in the Supabase dashboard or their shell. Don't ask for
their values and don't write them into tracked files.

## Verifying a change

The loop is: `npm test`, `npm run lint`, `npm run desktop:smoke` (or
`KERYX_SMOKE=1 npm run desktop:dev` when touching `src/api`), then look at
the page. `KERYX_SCREENSHOT=<file.png>` makes a smoke run save a screenshot.
The page tests cover only the store; UI has no automated tests.

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
- **Unknown fields are dropped on write** (logged once per field in the main
  process), not rejected. Unknown fields in a filter or sort are errors.

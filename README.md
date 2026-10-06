# KERYX

Church worship projection and service planning — song lyrics, Bible passages,
media and announcements driven onto one or more live screens, in the vein of
Holyrics and sPresenter.

The UI is in **Portuguese (pt-PT)**. Entity field descriptions are Portuguese too.

- **Stack:** Vite 6 · React 18 · React Router 6 · TanStack Query 5 · Tailwind 3 · shadcn/ui (Radix) · Framer Motion
- **Backend:** [Supabase](https://supabase.com) — Postgres + RLS, Auth, Storage, Realtime, Edge Functions
- **Size:** ~25k LOC across 26 pages, 31 tables

This started as a Base44 export and was migrated off it; see [How the backend
is wired](#how-the-backend-is-wired) for what that left behind.

---

## Running it

```bash
npm install
cp .env.example .env      # fill in the two VITE_ values
npm run dev               # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server against the Supabase project in `.env` |
| `npm run build` / `npm run preview` | production build to `./dist` and a local server for it |
| `npm run lint` / `npm run lint:fix` | ESLint, errors only; warnings are advisory |
| `npm run db:migrate` | one-off import of the old Base44 data (see below) |

There is no local database: dev runs against the real project. Anonymous
reads are allowed by design (see Security posture), so the app renders with
no login; sign in to create or edit anything.

### Supabase project

- **Project:** `keryx` (ref `rgldwchaozsjkrfycdtr`, eu-west-3 Paris) in org "davidlm24's Org"
- **URL:** `https://rgldwchaozsjkrfycdtr.supabase.co`
- **Schema:** `supabase/migrations/` — already applied to the project. Apply
  new migrations with the Supabase CLI (`supabase db push`) or the dashboard
  SQL editor, and commit the file.
- **Edge Functions:** `supabase/functions/` — already deployed. Redeploy with
  `supabase functions deploy <name>`.

### One-time setup still needed in the Supabase dashboard

These can't be done from code:

1. **Anthropic API key** — Edge Functions > Secrets: `ANTHROPIC_API_KEY`.
   Without it the verse lookup, lyrics import and song search return an error.
   Optional `ANTHROPIC_MODEL` (defaults to `claude-opus-5-5`).
2. **Email OTP on sign-up** — Authentication > Email Templates > *Confirm
   signup*: the body must include `{{ .Token }}`. The Register page asks for
   a 6-digit code, and the default template sends a link instead.
3. **Google / Facebook login** — Authentication > Providers: enable each,
   and add the app's origin(s) under Authentication > URL Configuration >
   Redirect URLs. The buttons are already wired.
4. **Site URL** — Authentication > URL Configuration: set it to where the
   app is served, so password-recovery links land on `/reset-password`.

### Importing the old data

`scripts/migrate-from-base44.mjs` pulls every entity from Base44 and upserts
it with the original ids, so cross-references survive. It needs a Base44
session token and the project's service-role key — both are secrets; see the
comment block at the top of the script and `.env.example`. Run it with
`--dry-run` first. User accounts and uploaded files are **not** migrated
(passwords can't be exported; media keeps pointing at Base44's CDN).

---

## How the backend is wired

The pages were generated against Base44's SDK and import `keryx` from
`src/api/keryxClient.js`, a one-line re-export of **`src/api/client.js`**, which implements the same surface on
`supabase-js`:

| Surface | Backed by |
| --- | --- |
| `entities.<Name>.list / filter / get / create / update / delete / bulkCreate / bulkUpdate` | PostgREST on `public.<snake_case_name>` |
| `entities.<Name>.subscribe(cb)` | Realtime `postgres_changes`, mapped to `{ type: 'create'\|'update'\|'delete', data, id }` |
| `entities.User.*` | `public.profile` (one row per `auth.users` row, created by trigger) |
| `auth.*` (login, register + OTP, OAuth, reset, `me()`) | Supabase Auth; `me()` merges the auth user with its profile row |
| `integrations.Core.UploadFile` | Storage bucket `media` (public read) |
| `integrations.Core.InvokeLLM` | Edge Function `invoke-llm` → Anthropic API with web search/fetch |
| `integrations.Core.SendEmail / SendSMS / GenerateImage / ExtractDataFromUploadedFile` | not implemented; reject with a message (no page uses them) |

Projection windows on the **same machine** do not go through the backend —
`src/lib/projectionWindow.js` holds a single named `window.open` target and
`postMessage`s slides to it. Remote screens (TVs, tablets) go through the
realtime tables.

### Security posture

The original app was effectively public: projection screens run on TVs with
no login. The RLS policies in `supabase/migrations/20261006000002_profile_rls.sql`
reproduce that:

- **Signed-in users** (`authenticated`): full read/write on every content table.
  There is no admin role yet; `profile.role` exists but nothing checks it.
- **Anonymous** (`anon`): read on every content table, plus the four writes
  the unattended screens perform — `projection_device` update (heartbeat),
  `video_sync` update, `live_session` update, `chat_message` insert.
- **Profiles:** a user can read and update only their own row.
- **Edge Functions** require a valid session JWT.

This is the loosest part of the system. Before exposing the project widely,
replace the anonymous writes with per-device tokens and decide whether the
song/service library should really be world-readable.

---

## Layout

```
supabase/
  migrations/           schema, RLS, realtime publication, storage bucket (applied)
  functions/
    invoke-llm/         InvokeLLM on the Anthropic API
    delete-account/     self-service account deletion (needs the service role)
base44/entities/*.jsonc 31 JSON Schemas the tables were generated from; readable field docs
scripts/
  migrate-from-base44.mjs
src/
  api/client.js         the Supabase-backed client (entities / auth / integrations)
  api/keryxClient.js    re-export of the above as `keryx`
  pages/                26 route components
  pages.config.js       the 9 layout-wrapped pages; the rest are routed in App.jsx
  components/
    ui/                 shadcn/ui primitives — generated, not linted, avoid editing
    projection/         operator-side panels: song/lyric/video/theme/device control
    bible/ bible-school/ service/ songs/ media/ communication/ banners/ worship/ layout/
  hooks/                device heartbeat, live-session channel, offline cache, online status
  lib/                  auth context, projection window bridge, query client
  utils/                chord transpose, Bible reflow, song sections, PDF export, YouTube
```

### Routing

Two tiers, both in `src/App.jsx`:

- **Public** (outside the auth gate): `/login`, `/register`, `/forgot-password`,
  `/reset-password`.
- **Everything else** goes through `AuthenticatedApp`, which wraps pages in
  `Layout`. Projection-target pages (`/Projection`, `/BannerProjection`,
  `/StageView`, `/DeviceView`, `/LyricProjection`, `/VideoProjection`,
  `/BibleMaterialProjection`, `/AnnouncementCarousel`) are routed bare,
  without `Layout` — they are meant to fill a second screen.

`createPageUrl(name)` (`src/utils/index.ts`) is just `'/' + name`, so page keys
and URL paths are the same string. Note that **`/Home` is the songs library**
("Músicas"); `/Services` ("Cultos") is the service planner.

### Data model

Tables are the entities in snake_case; columns are the entity fields verbatim
(quoted, so camelCase like `"serviceId"` survives). Every table has `id`
(text — Base44's 24-hex ids were kept), `created_date`, `updated_date`,
`created_by`, `created_by_id`.

| Area | Tables |
| --- | --- |
| Songs | `song`, `song_history`, `playlist`, `worship_team` |
| Services | `service`, `service_item`, `service_template`, `volunteer_schedule` |
| Bible | `bible_verse`, `bible_passage`, `bible_note`, `bible_material`, `bible_school_class` |
| Projection | `projection_state`, `projection_device`, `projection_scene`, `projection_theme`, `banner_template` |
| Live sync | `live_session`, `lyric_sync`, `video_sync`, `video_control`, `bible_projection_sync` |
| Media | `media`, `communication_video` |
| Engagement | `chat_message`, `alert_message`, `poll`, `quiz`, `raffle` |
| Users | `profile` (theme colors, logo, background, device mode, role) |

---

## Known gaps

1. **Dashboard setup above is not done yet** — the LLM features and OAuth
   buttons fail until it is.
2. **Security posture is permissive** (see above).
3. **`ProtectedRoute` is unused.** `src/components/ProtectedRoute.jsx` exists
   but nothing imports it; the gate lives inline in `AuthenticatedApp`.
4. **No tests.** The verification loop is `npm run lint`, `npm run build`,
   then look at the page.
5. **No type layer.** Everything is untyped `.jsx`. `supabase gen types` is
   the way in.
6. **Auth pages are in English** while the rest of the app is Portuguese —
   they came from the Base44 template.
7. **Hardcoded logo URL** at `src/Layout.jsx:8` points at one church's asset
   on Base44's CDN.
8. **~90 advisory lint warnings**, mostly unused locals and
   `react-hooks/exhaustive-deps`.
9. **Four large pages** (`Home`, `Projection`, `Settings`, `Services`, each
   ~750 lines) mix data access, projection control and presentation.

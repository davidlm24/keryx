# KERYX

Church worship projection and service planning — song lyrics, Bible passages,
media and announcements driven onto one or more live screens, in the vein of
Holyrics and sPresenter.

The UI is in **Portuguese (pt-BR)**. Entity field descriptions are Portuguese too.

- **Stack:** Vite 6 · React 18 · React Router 6 · TanStack Query 5 · Tailwind 3 · shadcn/ui (Radix) · Framer Motion
- **Backend:** [Base44](https://base44.com) — hosted entities, auth, file storage, realtime, LLM/email/SMS integrations
- **Size:** ~25.6k LOC across 27 pages, 31 entities

This repo started as a Base44 export. See [Backend coupling](#backend-coupling)
for what that means in practice.

---

## Running it

The app cannot render real data without a Base44 backend: `src/api/base44Client.js`
builds its client from an app id and server URL, and every page reads through
`base44.entities.*`. Three ways to run, in order of usefulness:

```bash
npm install
npx base44 login        # one-time, opens a browser; see below
npm run dev             # app + throwaway LOCAL backend
```

| Command | Backend | Use for |
| --- | --- | --- |
| `npm run dev` | local, throwaway data | day-to-day feature work |
| `npm run dev:remote` | **real production data** | reproducing live bugs — treat as production |
| `npm run dev:ui` | none | pure UI/styling work; every API call 404s |

`npm run dev:ui` is plain `vite` with no app id, so the auth pages and layout
render but all data is empty and the console fills with Base44 404s. That is
expected, not a bug.

### First-time setup

`npx base44 login` and `npx base44 link` are interactive and need your Base44
account, so run them yourself:

```bash
npx base44 login
npx base44 link
```

`link` writes `base44/.app.jsonc` (gitignored) with the app id, which the CLI
then injects for you. The app id appears to be `69388756d10163d1050a1fd7` —
that is the namespace in the hardcoded logo URL in `src/Layout.jsx:8` — but
confirm it from `base44/.app.jsonc` rather than trusting that.

To run plain `vite` against a real backend instead of using the CLI, copy
`.env.example` to `.env` and fill it in.

### Other commands

```bash
npm run build       # production build with the app id injected (base44 build)
npm run build:vite  # plain vite build; warns about the missing app id
npm run preview     # serve ./dist
npm run deploy      # push entities, functions and site to Base44
npm run lint        # errors only; warnings are advisory
npm run lint:fix
```

Useful CLI commands beyond those: `npx base44 entities`, `npx base44 secrets`,
`npx base44 logs`, `npx base44 types` (generates TypeScript types for the
entities — the obvious first step if this codebase ever gains a type layer).

---

## Backend coupling

Worth understanding before planning any work, because it sets the cost of ever
leaving Base44:

- **Entities.** Pages call `base44.entities.<Name>.list/filter/create/update/delete`
  directly inside TanStack Query hooks. There is no repository or service layer;
  `src/api/entities.js` exports only `Query` and `User`.
- **Realtime.** Multi-screen sync relies on `base44.entities.<Name>.subscribe(cb)`
  (socket.io under the hood) in 10+ places — `LiveSession`, `LyricSync`,
  `VideoSync`, `VideoControl`, `ProjectionDevice`, `BibleProjectionSync`,
  `AlertMessage`, `ChatMessage`. This is the hardest part to replace: it is the
  mechanism that makes the operator panel drive remote screens.
- **Auth.** `src/lib/AuthContext.jsx` talks to `/api/apps/public/...` directly
  and the app serves its own `/login`, `/register`, `/forgot-password`,
  `/reset-password` pages against `base44.auth.*` (custom-auth mode).
- **Storage + integrations.** File uploads, `InvokeLLM`, `SendEmail`, `SendSMS`,
  `GenerateImage`, `ExtractDataFromUploadedFile` all come from
  `base44.integrations.Core` (`src/api/integrations.js`).

Replacing Base44 means reimplementing all four, the subscriptions above all.
A thin adapter layer in `src/api/` would be the place to start if that is ever
the plan.

Projection windows on the **same machine** do not go through the backend —
`src/lib/projectionWindow.js` holds a single named `window.open` target and
`postMessage`s slides to it.

---

## Layout

```
base44/
  config.jsonc          app name + build commands
  entities/*.jsonc      31 entity schemas (JSON Schema); source of truth for the data model
src/
  api/                  Base44 client, entity + integration re-exports
  pages/                27 route components
  pages.config.js       the 9 layout-wrapped pages; the rest are routed in App.jsx
  components/
    ui/                 shadcn/ui primitives — generated, not linted, avoid editing
    projection/         operator-side panels: song/lyric/video/theme/device control
    bible/ bible-school/ service/ songs/ media/ communication/ banners/ worship/ layout/
  hooks/                device heartbeat, live-session channel, offline cache, online status
  lib/                  auth context, projection window bridge, query client, VisualEditAgent
  utils/                chord transpose, Bible reflow, song sections, PDF export, YouTube
```

### Routing

Two tiers, both in `src/App.jsx`:

- **Public** (outside the auth gate): `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/oauth-consent`.
- **Everything else** goes through `AuthenticatedApp`, which blocks on auth and
  wraps pages in `Layout`. Projection-target pages (`/Projection`,
  `/BannerProjection`, `/StageView`, `/DeviceView`, `/LyricProjection`,
  `/VideoProjection`, `/BibleMaterialProjection`, `/AnnouncementCarousel`) are
  routed bare, without `Layout` — they are meant to fill a second screen.

`createPageUrl(name)` (`src/utils/index.ts`) is just `'/' + name`, so page keys
and URL paths are the same string. Note that **`/Home` is the songs library**
("Músicas"); `/Services` ("Cultos") is the service planner.

### Data model

Grouped by what they serve (field counts in `base44/entities/`):

| Area | Entities |
| --- | --- |
| Songs | `Song`, `SongHistory`, `Playlist`, `WorshipTeam` |
| Services | `Service`, `ServiceItem`, `ServiceTemplate`, `VolunteerSchedule` |
| Bible | `BibleVerse`, `BiblePassage`, `BibleNote`, `BibleMaterial`, `BibleSchoolClass` |
| Projection | `ProjectionState`, `ProjectionDevice`, `ProjectionScene`, `ProjectionTheme`, `BannerTemplate` |
| Live sync | `LiveSession`, `LyricSync`, `VideoSync`, `VideoControl`, `BibleProjectionSync` |
| Media | `Media`, `CommunicationVideo` |
| Engagement | `ChatMessage`, `AlertMessage`, `Poll`, `Quiz`, `Raffle` |
| Settings | `User` (per-user theme colors, logo, background, device mode) |

`User` carries the app's theming, read through `useThemeColors`.

---

## Known gaps

Things found while getting this running, not yet addressed:

1. **`/oauth-consent` path is a guess.** `src/pages/OAuthConsent.jsx` must be
   served at whatever `consent_path` the app's MCP config specifies on the
   server. That config was not part of the export. Verify before relying on the
   MCP grant flow.
2. **`ProtectedRoute` is unused.** `src/components/ProtectedRoute.jsx` exists but
   nothing imports it; the gate lives inline in `AuthenticatedApp`. Either wire
   it up or delete it.
3. **No tests.** No test runner, no test files.
4. **No type layer.** Everything is untyped `.jsx`; `checkJs` is off because it
   produced ~1000 phantom errors on untyped JSX. `npx base44 types` is the way in.
5. **Hardcoded logo URL** at `src/Layout.jsx:8` points at one church's asset on
   Base44's CDN. Fine for a single tenant, wrong the moment there are two.
6. **91 advisory lint warnings** — mostly unused locals and
   `react-hooks/exhaustive-deps`. `npm run lint` only gates on errors.
7. **Four large pages** (`Home` 785, `Projection` 776, `Settings` 760,
   `Services` 739 lines) mix data access, projection control and presentation.
   First candidates for decomposition.

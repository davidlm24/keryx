# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui on a Base44 backend.
Read `README.md` first — it covers the stack, how to run it, the data model and
the known gaps.

## Ground rules

- **UI language is Portuguese (pt-BR).** All user-facing strings, labels and
  toasts are Portuguese. Match that; do not introduce English UI copy. Code
  identifiers and comments are English.
- **`src/components/ui/` is generated shadcn/ui.** It is excluded from lint and
  from editor type checking. Don't hand-edit it; add components with the
  shadcn CLI (`components.json` is configured) or wrap them instead.
- **`base44/entities/*.jsonc` is the data model's source of truth.** Check an
  entity's schema there before assuming a field exists. Changing one is a
  backend migration — push it with `npx base44 entities` / `npm run deploy`,
  never by editing frontend code alone.
- **Data access goes through `base44.entities.*` inside TanStack Query**, which
  is how every existing page does it. There is no service layer; follow the
  local pattern rather than inventing one mid-feature.
- **Realtime is `base44.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup.

## Commands

```bash
npm run dev         # app + local throwaway backend (needs `npx base44 login` once)
npm run dev:ui      # UI only, no backend; API calls 404 — expected
npm run lint        # gates on errors only; 91 warnings are advisory
npm run build       # base44 build (injects the app id)
```

`npm run dev:remote` runs against **production data**. Don't reach for it
casually, and never to try something out.

`npx base44 login`, `npx base44 link` and `npx base44 whoami` are interactive
and account-bound — ask the user to run them rather than running them yourself.

## Verifying a change

There are no tests, so the loop is: `npm run lint`, then `npm run build`, then
look at the page. `npm run dev:ui` is enough for layout and styling work;
anything touching data or projection sync needs `npm run dev` with the local
backend.

Projection features need two windows to verify: the operator page drives a
second window opened via `src/lib/projectionWindow.js` (same machine,
`postMessage`) or a remote screen via the live-sync entities (network, through
the backend). A change that looks right in one window may not be in the other.

## Watch out for

- **`/Home` is the songs library ("Músicas"), not a dashboard.** `/Services`
  ("Cultos") is the service planner.
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

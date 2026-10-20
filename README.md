# KERYX

Church worship projection and service planning — song lyrics, Bible passages,
media and announcements driven onto one or more live screens, in the vein of
Holyrics and ProPresenter.

The UI is in **Brazilian Portuguese (pt-BR)**. Entity field descriptions are Portuguese too.

- **Stack:** Vite 6 · React 18 · React Router 6 · TanStack Query 5 · Tailwind 3 · shadcn/ui (Radix)
- **App:** Electron 44, data in a local SQLite file (`node:sqlite`), no login, works offline
- **One screen to run a service:** the operator console (`/Console`), on the
  design system in `docs/design-system/`; the outputs (projector, stage,
  video, lyrics, avisos, pastor) render one shared live state
- **Desktop only.** The web build on Supabase was retired (2026-10-08):
  projection apps are programs on the church computer, and tablets and TVs
  join through the computer itself (see Screens on the network). `supabase/`
  is kept, unused, for a future cloud sync or backup.

This started as a Base44 export and was migrated off it. The plan and its
phases are in [docs/desktop-architecture.md](docs/desktop-architecture.md);
how the old pages were folded into the console is in
[docs/migration-inventory.md](docs/migration-inventory.md).

---

## Running it

```bash
npm install
npm run desktop:dev       # the desktop app, hot reload
```

| Command | What it does |
| --- | --- |
| `npm run desktop:dev` | the app (Electron) on the Vite dev server, hot reload; F12 opens devtools |
| `npm run dev` | dev only: the console in a plain browser on sample data (the real store and live engine in a temp folder, `scripts/preview/`); output pages open as tabs from Saídas. Not the app: no monitors, audio meters or Bible downloads. In the Claude app's preview pane it is `keryx-ui` (`.claude/launch.json`): port 5180, or a free one when another worktree already serves 5180 (`autoPort`; the pane says which port and opens it) |
| `npm run desktop:start` | build, then open the app on the built files |
| `npm run build` | production build to `./dist` (what the app and the network screens load) |
| `npm run lint` / `npm run lint:fix` | ESLint, errors only; warnings are advisory |
| `npm test` | unit tests (`node --test`): store query semantics, schema drift, live state, outputs, network server, Bible install and search, console helpers (setlist, avisos, EBD, reports, keys) |
| `npm run desktop:smoke` (`KERYX_SMOKE_FULLSCREEN=1` also opens a real fullscreen output on your primary display for a moment) | build, open the app on a throwaway data folder, run the in-app checks (console, outputs, network screens), exit (0 = OK). `KERYX_SMOKE=1 npm run desktop:dev` runs the same checks plus the renderer adapter end to end |
| `npm run dist` | the Windows installer, `release/KERYX-Setup-<version>.exe` (unsigned; `dist:dir` builds just the unpacked app) |
| `npm run db:schema` | regenerate `electron/db/schema.json` after changing `base44/entities/*.jsonc` |
| `npm run db:import` | one-off import of the Base44 data into the local database (see below) |

If `npm install` did not download the Electron binary
(`node_modules/electron/dist` missing), run `node node_modules/electron/install.js`.

A plain browser on a production build shows only a note that KERYX is the
desktop app.

### Backups, moving data, updates

Configurações › "Backup e atualizações":

- **Backup automático:** a copy of the database on launch and on close, one per
  day, the last 14 kept, in `%APPDATA%\KERYX\backups` or a folder you choose
  (OneDrive, Google Drive and USB folders work, and give you a copy off this
  computer). In a folder you chose, the media files (videos, images, the
  logo) are mirrored too, into `<folder>media`: on launch and with "Fazer
  backup agora", in the background, copying only what is new or changed;
  files deleted in KERYX stay there. The default folder (same disk) gets no
  media copy.
- **Restaurar um backup:** lists the daily backups of the backup folder; pick
  a day and KERYX restarts with the data of that day. Today's data is moved
  to a `before-import-…` folder inside the data folder, never deleted.
  Media files deleted since come back from the backup's media copy.
- **Exportar tudo / Importar:** one zip with the database and all media, to move
  to another computer or keep as a full backup. Importing replaces the current
  data and restarts KERYX; what was replaced stays in a `before-import-…`
  folder inside the data folder until you delete it.
- **Salvar diagnóstico:** a zip with recent logs and system info for support.
- **Atualizações:** from 0.2.1 on, new versions come from the releases repository (see "Releasing" below).
  The bell in the top bar says when one is out; "Atualizar agora" (KERYX menu, under Configurações)
  downloads it with a progress bar and restarts. With "Atualizar automaticamente" on, KERYX downloads
  by itself and, right after opening, installs with the progress popup. It never restarts with
  something on air without asking.

### Releasing a new version

Installed copies update themselves from
[comunidadegerar/keryx-releases](https://github.com/comunidadegerar/keryx-releases),
a public repository that holds only the installers and `latest.yml` (the
code stays in the private repository). `build.publish` in `package.json`
points there. Configurações › Backup e atualizações finds the new version,
downloads it when asked and installs it on the next restart, never on its own
and never mid-service.

```bash
# 0. the batch's one smoke, on master with every merged PR (feature
#    sessions don't run it; tell the user first: ~5 min of windows and a tone)
npm run desktop:smoke
# 1. bump "version" in package.json (and commit), and write
#    docs/release-notes/<version>.md: what changed, in pt-BR, for the operator
#    (docs/release-notes/README.md). It becomes the release text, and KERYX
#    shows it in the update popup and the bell.
# 2. build from a clean copy with its own install (npm ci): electron-builder
#    packs the main process's dependencies from ./node_modules, which a git
#    worktree sharing the main folder's node_modules does not have
npm ci
# 3. build WITHOUT publishing: release/ gets the installer, its .blockmap and
#    latest.yml (with the notes, which the updater shows)
npx vite build
npx electron-builder --win --publish never -c.releaseInfo.releaseNotesFile=docs/release-notes/<version>.md
# 4. upload them as one draft, with a token of the account that owns
#    keryx-releases (GH_TOKEN; never commit it). In Git Bash, from the GitHub
#    CLI; --dry-run first does every check and writes nothing:
GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-upload.cjs <version> --dry-run
GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-upload.cjs <version>
```

**Never `electron-builder --publish always`.** Its GitHub publisher is
created once per artifact, and the installer's and the blockmap's arrive
together, so each one created the release: 0.2.15 and 0.2.16 came out as two
drafts of one tag, the files split between them (and 0.2.11 and 0.2.14, back
when releases were public at once, as `422 Published releases must have a
valid tag`). `scripts/release-upload.cjs` does the upload itself, in order:

- it checks `release/` with the release check's own rules: the installer, its
  `.blockmap` and `latest.yml` are there, `latest.yml` names this version
  and this installer, with its sha512 and size; and the notes:
  `docs/release-notes/<version>.md` exists and `latest.yml` carries them;
- it stops if `keryx-releases` already has `v<version>`, draft or public;
- it creates **one draft** (tag `v<version>`, name `<version>`, the notes as
  its text, as electron-builder did) and uploads one file at a time: the
  installer, the blockmap, `latest.yml` last;
- it ends with `release-check.cjs <version>` on the draft.

On anything wrong before the draft it exits 1 and has sent nothing. A
draft is invisible to the updater (`releaseType: "draft"` stays in
`package.json` too, in case someone publishes with electron-builder by
habit): installed copies keep the version they have until the draft is made
public, by hand, after the check below. Nothing half-published is ever
"Latest". To build an installer without publishing anything, `npm run dist`
(`release/KERYX-Setup-<version>.exe`). `KERYX_RELEASES_REPO=owner/name`
points both scripts at a throwaway repository, to try them without a real
version.

**One releaser at a time.** Before bumping the version, look for a claim on it:

```bash
gh release list --repo comunidadegerar/keryx-releases --limit 3   # latest published
git ls-remote --heads origin 'release/*'                          # a release branch is a claim
gh pr list --search 'release/' --state open                       # so is an open release PR
git worktree list                                                 # a worktree already on release/*
```

The next patch after the latest published release is yours only if none of
those shows it (or a newer one). Push `release/<version>` with the bump
first: that branch on origin is the claim. If it already exists, stop and ask
which session releases.

**After every upload, check the draft, then make it public** (`V` is the
version; `release-upload.cjs` already ran the first line):

```bash
GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-check.cjs $V            # check only
GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-check.cjs $V --publish  # check, then make public
```

`scripts/release-check.cjs` looks for the release (draft or public), needs
the installer, its `.blockmap` and `latest.yml`, reads `latest.yml` (the
version, the file it points to) and downloads the installer to compare its
sha512 and size with the ones `latest.yml` names. Only when all of that
holds does `--publish` make the draft public, as "Latest", and read the
public `latest.yml` back. On any mismatch it exits 1 and publishes nothing.
Run it without `--publish` on a release that is already public to verify it
after the fact.

An upload can still die half-way (the network, GitHub): the script says
which files the draft got. Do not re-run it (it stops at the draft it made
anyway): upload what is missing to the draft
with `gh release upload v$V <file> --repo $R` in this order: the installer,
the blockmap (`--clobber` if it came from another build), and `latest.yml`
last. Rebuilding changes the installer's hash, so after any rebuild
`latest.yml` is written from the installer actually uploaded: `version`,
`files[0].url`, `.sha512` as base64 of the file's sha512, `.size`, `path`,
`sha512`, `releaseNotes`, `releaseDate`. Then run the check again.

The first install (or a copy older than 0.2.1, which has no update setting)
is by hand: copy the installer to the church computer and run it; data in
`%APPDATA%KERYX` is kept. Windows shows "O Windows protegeu o computador" for
the unsigned installer: Mais informações › Executar assim mesmo.

### Screens on the network (tablets, TVs, stage monitor)

Configurações › "Telas na rede": turn it on and open the address shown (or scan
the QR code) in the tablet's or TV's browser, on the same Wi-Fi. Windows asks
once whether KERYX may use the network: allow it on private networks. An
optional PIN keeps other devices on the Wi-Fi out. Screens can only view: the
console is never served to the network, and screens cannot write. Available:
Projeção, Letras, Palco, Vídeo, Avisos, Pastor, Transmissão. The console
lists the screens connected right now in the Saídas popover.

### Bible text

Nothing ships with the app: the publishers' editions are copyrighted, and
even the open ones are downloaded by each church. The Bíblia environment
(or Configurações › Bíblia e músicas) installs NVI, ACF, AA, ARA, ARC, NAA,
NTLH or KJA (NVI/ACF/AA from github.com/thiagobodruk/biblia, the others from
bolls.life), the open editions BLIVRE, NBV, BPM and BLT (New Testament)
from eBible.org, or an edition of the church's own from its file (USFM,
VPL, OSIS, Zefania, MySword or JSON; `electron/bibleFormats.cjs`); after that, reading, word search and comparing
run from the local database with no internet. An edition not installed is
read from bolls.life one chapter at a time (all but NVI and AA). All Bible
text goes through `src/lib/bibleText.js`.

### Fonts (Temas)

Geist ships with the app and is every theme's "Padrão (Geist)"; the seven
other KERYX choices (Serifa, Arial, Georgia…) are the device's own fonts.
A theme can also use **a font of the church**: in the Editor de temas, Fonte
› Trazer › "Do computador…" lists every font installed on the PC, read by
KERYX from the Windows font folders as Holyrics does (no permission to grant) and "Arquivo de fonte…" takes a .ttf/.otf/
.woff2/.woff file. The chosen font is copied into the media library (one
Media row per face, category `font`), so it syncs to the other church
computers and is served to every output window and network screen — the
same letters everywhere, nothing installed on the TVs. KERYX never downloads
fonts from the internet; fonts that come with Windows or were bought keep
their own licence. Configurações › Temas e fundos › Fontes da igreja lists
and deletes them; Verificar says whether each one reached this computer.

### Where the app keeps its data

Everything is in `%APPDATA%\KERYX` (override with `KERYX_DATA_DIR`):
`keryx.db` (SQLite, every entity plus the operator profile), `media/`
(uploaded files) and Chromium's own profile (`localStorage`). Backing up that
folder backs up KERYX. Smoke runs never touch it; they use a temp folder.

### Importing the old data

`npm run db:import` (`scripts/import-base44.mjs`) pulls every entity from
Base44 into the app's `keryx.db`, keeping ids and timestamps so
cross-references survive, plus the Base44 user's branding into the local
profile. It needs `npm i --no-save @base44/sdk` and a Base44 session token
(see the comment at the top of the script and `.env.example`). Close KERYX
first, run with `--dry-run` first. It then downloads the files rows point at
on Base44's CDN into the media folder and repoints the rows (`--no-media` to
skip); any that fail are listed and keep their online URL.

### supabase/ (kept, unused)

The migrations and Edge Functions of the retired web build. The Supabase
project (`keryx`, ref `rgldwchaozsjkrfycdtr`) still exists; nothing in the app
talks to it. A future cloud sync or backup would start from here, with its
sign-in in Configurações and used only for that.

---

## How the backend is wired

Pages import `keryx` from `src/api/keryxClient.js`, a re-export of
**`src/api/client.js`**. That facade keeps the surface Base44's SDK had
(`entities.<Name>.list / filter / get / create / update / delete / bulkCreate /
bulkUpdate / subscribe`, `auth.*`, `integrations.Core.*`) over:

- **Desktop** (`src/api/backends/desktop.js`, when `window.keryxDesktop`
  exists): calls go over IPC (`electron/preload.cjs` → `electron/data-ipc.cjs`)
  to the store in the main process (`electron/db/store.cjs`, SQLite via
  `node:sqlite`). Writes broadcast change events to every window, which is
  what `subscribe()` listens to. `auth.me()` is the single local operator
  profile; there is no login. `UploadFile` copies the file into `media/`
  (`electron/mediaImport.cjs`: a file from the computer by its path, with no
  size cap, once the disk has room; one with no path behind it as bytes, up
  to 256 MB); the database stores `keryx-media://<file>` and the adapter
  hands pages `http://127.0.0.1:7700/media/<file>`. `FileInfo` says which
  media files are on disk. AI features are not part of the app (they reject
  with 501).
- **Network screens** (`src/api/backends/network.js`, a browser that opened a
  screen page from the KERYX computer): the same store read over HTTP and
  the change events over Server-Sent Events (`electron/lan.cjs`), read-only.

Query semantics (filters, sort, paging) follow Base44; they are pinned by
`electron/db/store.test.cjs`.

What every output shows is the **live state** (`shared/live-state.mjs`, held
by `electron/live.cjs`): one document changed by operations
(`src/lib/projection.js`), sent whole to every window and every network
screen after each change.

---

## Layout

```
electron/
  main.cjs              app lifecycle, windows, data folder, loopback server
  preload.cjs           window.keryxDesktop (db, media, live, displays, bible, network, …)
  data-ipc.cjs          IPC between windows and the store; change broadcast
  live.cjs              the live state document
  outputs*.cjs          output windows: placement, tracking, Abrir ao iniciar
  lan.cjs               the network server for tablets and TVs
  server.cjs            serves dist/ and media/ on 127.0.0.1:7700 (with Range)
  smoke.cjs             in-app checks for npm run desktop:smoke
  db/                   store.cjs, schema.json (generated), tests
shared/live-state.mjs   the live state and its operations (main process and console)
base44/entities/*.jsonc the JSON Schemas the tables are generated from; readable field docs
docs/design-system/     tokens, kx- components and icons the console is built on
supabase/               the retired web build's migrations and functions (unused)
src/
  App.jsx               routes: /Console and the output pages
  api/                  the client facade and its backends
  pages/                Console and the output pages (Projection, LyricProjection,
                        StageView, VideoProjection, CommunicationProjection, PastorView)
  components/
    console/            the console: environments, views, popovers, settings/
    screen/             ScreenRenderer, what every output and monitor draws
    projection/         output-side pieces (video player, alerts, media)
    network/            the network screens' start page
    ui/                 shadcn/ui primitives — generated, not linted, avoid editing
  lib/                  console logic (lib/console/*, tested), Bible text and search,
                        projection operations, backgrounds
  hooks/                live state, church logo, aviso sequences, durations
  utils/                song sections, PDF export, YouTube
```

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
| Projection | `projection_state`, `projection_theme` (and, written by nothing any more, `projection_device`, `projection_scene`, `banner_template`) |
| Live sync (old) | `live_session`, `lyric_sync`, `video_sync`, `video_control`, `bible_projection_sync` — kept as user data; the live state replaced them |
| Media | `media`, `communication_video` |
| Engagement | `chat_message`, `alert_message`, `poll`, `quiz`, `raffle` |
| Users | `profile` (the local operator: church name, city, logo) |

---

## Known gaps

0. **`npm audit` leaves findings on purpose** (2026-10-08; fixed what a non-breaking
   update or jsPDF 4 could). Left: **react-router 6** (moderate: open redirect
   through links/`navigate()` with *untrusted* paths, and server rendering;
   KERYX has a few fixed local routes and no SSR, and the fix is React Router 7),
   and the **build-time chains** that never ship in the app: Tailwind 3's
   (`braces`, `micromatch`, `chokidar`, fix = Tailwind 4) and electron-builder's
   (npm "fixes" it by going back to 26.5.0). Revisit with a Tailwind 4 or React
   Router 7 migration. Run `npm audit` after dependency changes.

1. **No type layer.** Everything is untyped `.jsx`.
2. **Advisory lint warnings**, mostly unused locals and
   `react-hooks/exhaustive-deps`.
3. **Tables without a writer** (listed above) are kept until a schema round
   decides; they hold the church's old data.
4. **The smoke's focus and audio-meter checks can only be inconclusive on a
   computer in use** (another program in front, or playing sound): they are
   listed in `console.inconclusive` instead of failing the run (see
   CLAUDE.md). A quiet computer still gives the full answer.

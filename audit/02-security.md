# Keryx audit, pass 2: Security

Repo @ `d12d94d`. This pass is a static review plus `npm audit`. No exploit code was run.

**Threat model:**
- Shared church laptops.
- Content arriving from outside: song files, zip exports, lyrics from the web, Bible JSON, YouTube.
- Guest Wi-Fi shared with the network screens and the phone remote.
- Auto-updates delivered from GitHub.

## Summary
Keryx's Electron baseline is better than most commercial apps:
- **Window settings:** isolation and sandbox are on, Node is off.
- **IPC:** every channel checks the sender's origin, and the store and live operations use allow-lists.
- **Imports:** zip imports are whitelisted, and JSONP is parsed without `eval`.
- **Page rendering:** no unsafe HTML sinks with user content.

**Top 3 risks**
1. With network screens turned on, anyone on the church Wi-Fi can read the whole database, including volunteers' phones and emails and children's class lists (SEC-001).
2. YouTube's script runs inside the privileged app page with no CSP, so it inherits the full desktop bridge (SEC-002).
3. Builds and updates are unsigned, so whoever holds the GitHub release token can push code to every church PC (SEC-003).

## Findings

### SEC-001 — Network screens expose the whole database, including personal data, with no PIN by default
- **Severity:** P2 (was P1; downgraded because CCG's screens use a PIN, see Resolved questions)
- **Effort:** M
- **Confidence:** High
- **Location:** electron/lan.cjs:52, 284–301 (`/api/db`), 400–403 (Server-Sent Events broadcast), 184 (PIN optional), 225 (Host-based origin check), 391 (binds 0.0.0.0)
- **Evidence:**
  - `/api/db` allows `list`, `filter` and `get` on **any** entity. Only the operation is restricted, not the entity.
  - Reachable data includes:
    - `WorshipTeam`: name, **phone**, **email**, notes.
    - `BibleSchoolClass`: teacher, **students**, which can be children's names.
    - `ChatMessage`: sender, message, files.
    - `Raffle`: participants.
    - `VolunteerSchedule`: assignments.
    - `User`: operator preferences.
  - `/api/events` pushes **every** store change to every connected screen, unfiltered.
  - The PIN is optional and empty by default.
  - The Host header is never validated. A web page opened on any phone on the same Wi-Fi can therefore use DNS rebinding to read `/api/db` when no PIN is set, since the origin check compares Origin to the attacker-controlled Host.
- **Live-service impact:**
  - Not a projection risk, but a privacy one.
  - Contact details of volunteers and children's names become readable by anyone on guest Wi-Fi.
  - In Luxembourg, that is a GDPR personal-data exposure.
- **Fix:**
  1. Add an entity allow-list for screens (`SCREEN_ENTITIES`): only what network pages render, such as Song, Service, ServiceItem, ProjectionTheme, ScreenLayout, OutputPref, BackgroundPref, Media, AlertMessage, TimerPreset and BibleVerse. Verify the exact list against the screen pages.
  2. Apply the same allow-list to the store-change broadcast before `res.write`.
  3. Generate a PIN automatically the first time network screens are enabled. It can still be turned off, but behind a warning that names what becomes visible.
  4. Reject requests whose Host is not one of this machine's LAN addresses, its hostname, or `localhost`, with the port. That closes DNS rebinding.
  5. Add `Cache-Control: no-store` to `/api/*`.
- Add tests: `WorshipTeam.list` returns 403, a WorshipTeam change never reaches the event stream, and a foreign Host gets a 421 or 403.

### SEC-002 — YouTube's script runs in the privileged app origin, with no CSP
- **Severity:** P2
- **Effort:** M
- **Confidence:** High on the code path; likelihood is low
- **Location:** src/utils/youtube.js:50–52, src/components/projection/LiveVideo.jsx:191, index.html (no CSP), electron/server.cjs (no CSP header), electron/main.cjs:166 (`isTrustedSender` = origin check)
- **Evidence:**
  - `loadYouTubeApi()` injects `<script src="https://www.youtube.com/iframe_api">` into the output and console pages.
  - That script, and the widget script it loads, runs in the `http://127.0.0.1:7700` main frame.
  - So it passes every `isTrustedSender` check and can call the whole `window.keryxDesktop` bridge: database writes and deletes, `system` operations (export, import, backups, diagnostics), `sync` operations and live control.
  - There is no Content Security Policy anywhere, so any future injection is unconstrained too.
- **Live-service impact:**
  - Normally none.
  - But the trust boundary of a projection PC holding personal data currently includes Google's script delivery, plus anything that ever lands in a page.
  - The cost is one evening of isolation work.
- **Fix:**
  1. Move the YouTube player into a tiny page on a **different origin**, for example `http://localhost:7700/yt.html`. `localhost` and `127.0.0.1` count as different origins, so that page fails `isTrustedSender` and never gets the bridge, because preloads do not run in subframes.
  2. Embed that page as an iframe in the output.
  3. Drive it with `postMessage`, using a closed command set (load, play, pause, seek, volume) and replies for duration and position.
  4. Add a CSP to app pages, either as a meta tag in index.html or a header from server.cjs. A starting point:

     `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-src http://localhost:7700 https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'none'`

  5. Run the smoke test with the CSP enabled, to catch inline scripts and `eval` from dependencies.

### SEC-003 — Unsigned builds and updates
- **Severity:** P3 (was P2; downgraded because Davi is the only one who can push, see Resolved questions)
- **Effort:** M
- **Confidence:** High
- **Location:** package.json `build.win` (no signing settings, no `publisherName`), electron/updater.cjs, scripts/release-upload.cjs:5, 69
- **Evidence:**
  - With no `publisherName`, electron-updater does not verify an update's signature.
  - Integrity rests only on the sha512 in `latest.yml`, which comes from the same GitHub release.
  - Anyone with write access to `comunidadegerar/keryx-releases`, or with the `gh` token used by the release script, can ship code that runs on every church PC at the next update.
  - Installers also trigger SmartScreen's "Windows protected your PC" warning, which trains volunteers to click "Run anyway".
- **Live-service impact:** a compromised release account turns into code running on the projection PCs.
- **Fix:**
  - Short term:
    - Enforce 2FA on the `comunidadegerar` account and org.
    - Use a fine-grained token limited to `keryx-releases` (contents: write), with a short expiry.
    - Never store the token in shell history; the current `$(gh auth token …)` form is fine.
  - Proper fix:
    - Sign builds, with Azure Trusted Signing (cheap; check eligibility for the church or for your agency) or an OV certificate.
    - Configure electron-builder's `win.azureSignOptions` or `signtoolOptions`, and set `publisherName` so electron-updater rejects unsigned or foreign-signed updates.

### SEC-004 — Electron fuses not set
- **Severity:** P3
- **Effort:** S
- **Confidence:** High
- **Location:** package.json `build` (no `electronFuses`)
- **Evidence:**
  - These fuses are left at their defaults: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, ASAR integrity, and `OnlyLoadAppFromAsar`.
  - So `KERYX.exe` can be started as a plain Node runtime, or with an inspector attached, by any local user or malware.
- **Live-service impact:** low. It is a defence-in-depth gap on a shared PC.
- **Fix:** add this to the `build` section in package.json (electron-builder 26):
  `"electronFuses": { "runAsNode": false, "enableNodeOptionsEnvironmentVariable": false, "enableNodeCliInspectArguments": false, "enableEmbeddedAsarIntegrityValidation": true, "onlyLoadAppFromAsar": true }`

  Then run `desktop:smoke` against the packaged build.

### SEC-005 — Browser-side packages ship as runtime dependencies (and flag in audit)
- **Severity:** P3
- **Effort:** S
- **Confidence:** Medium (verify by listing app.asar)
- **Location:** package.json `dependencies`
- **Evidence:**
  - `npm audit --omit=dev` reports 10 issues: 5 high and 5 moderate. They come from tailwindcss, chokidar, micromatch and braces, which are build-time only, and from react-router's open-redirect and constructor-injection advisories.
  - None is exploitable at runtime in Keryx, because the renderer code is pre-bundled by Vite and react-router serves only local routes.
  - But electron-builder packs every production dependency into `app.asar`.
- **Live-service impact:** none directly. The installer is bigger, and real advisories get lost in the audit noise.
- **Fix:**
  - Keep only what main requires (`electron-updater`, `yauzl`, `yazl`) in `dependencies`, and move everything else to `devDependencies`.
  - Update `react-router-dom` to the patched release anyway.
  - Verify with `npx @electron/asar list release/win-unpacked/resources/app.asar | findstr node_modules`, then `npm audit --omit=dev` should be clean.

### SEC-006 — Phone-remote code can be guessed slowly from many addresses
- **Severity:** P3
- **Effort:** S
- **Confidence:** Medium
- **Location:** electron/network.cjs:13 (6-digit code), electron/lan.cjs:85–86, 193–210 (5 attempts per IP, then a 60 s lockout)
- **Evidence:**
  - The lockout is per IP address only.
  - A device using IPv6 privacy addresses can rotate addresses, and there is no global attempt cap.
  - The remote runs over plain HTTP, so its cookie can be sniffed on open Wi-Fi. That is inherent to a LAN web remote, and is mitigated by the existing "Desconectar" button and rotating the code.
- **Live-service impact:** someone on the Wi-Fi could, with effort, black out the screen or skip slides.
- **Fix:**
  - Add a global failure budget, for example 30 failures across all IPs per 10 minutes, after which pairing pauses and a notification appears.
  - Group IPv6 addresses by their /64 prefix when counting attempts.
  - Show the number of connected remotes in the console header while the remote is on.

## What's done well (keep it)
- **Window settings:** every window has `contextIsolation`, `sandbox` and no `nodeIntegration`, and one guard covers all windows and child windows.
- **Navigation:** in-app only, and anything else goes to the system browser (http/https only).
- **IPC:**
  - `isTrustedSender` on every channel.
  - Allow-lists for `system`, `network`, `sync` and `lyrics` operations.
  - `store.call` checks both the entity and the operation, and every column name is checked against the schema and quoted.
- **Preload:**
  - It never exposes `ipcRenderer`.
  - Media import takes file paths only from `webUtils.getPathForFile`, so page code cannot name an arbitrary file.
  - It caps message sizes.
- **Zip import:** strict entry whitelist, size and disk checks, staging before swap, and a database check.
- **Web data:** Bible and lyrics are fetched in main and parsed with `JSON.parse`, not `eval`. Text is rendered through React, and the one `document.write` (printing) escapes everything.
- **Network screens:**
  - A separate server that never serves the operator pages.
  - Read-only data.
  - Constant-time PIN comparison.
  - HttpOnly, SameSite cookies.
  - A custom header against cross-site posts.
  - The remote has a mandatory code and a closed action list, and it runs commands through the console's own rules.
- **Secrets:** the sync code is sealed with `safeStorage`, the PIN and remote code are never sent in `info()`, and there are no secrets in git history (pass 0).
- **Electron version:** 44, which is current and still receiving security patches.

## Resolved questions (answers from Davi)
1. **Network screens join with the PIN or a QR code.**
   - The QR code holds only the address; the PIN is still typed once per device and remembered for a year.
   - So at CCG, DNS rebinding is blocked and only paired devices can read data. SEC-001 drops to P2.
   - Still to fix:
     - Paired screens can read every table and receive every change.
     - New installs start with no PIN.
2. **"Base44 leftovers can be deleted."** This needs care: `WorshipTeam` and `BibleSchoolClass` are **live features**, not leftovers.
   - The volunteer team, with WhatsApp numbers, is in Configurações › Culto (CultoSection.jsx) and ServicePlanner.jsx.
   - Classes are in SchoolView.jsx and MaterialView.jsx.
   - So the personal-data concern in SEC-001 stands. The true leftovers are listed in ARCH-009.
3. **Only Davi can push releases.**
   - SEC-003 drops to P3.
   - It still matters for SmartScreen warnings, and because your GitHub account is now the single key to every church PC: keep 2FA with a hardware key or passkey.

## Open questions for Davi (original)
1. **Network screens at CCG:** are they enabled, with or without a PIN, and on which Wi-Fi (guest or staff)?
2. **Personal data:** do `WorshipTeam` and `BibleSchoolClass` hold real people's data today, or are they leftovers from the Base44 version?
3. **GitHub access:** who besides you can push to `comunidadegerar/keryx-releases`?

## Handoffs to other passes
- **FUNC:** check YouTube playback after SEC-002's iframe isolation (duration, ended event, seek bar via `keryx:meter`).
- **PERF:** SEC-005 should also shrink the installer and the cold-start time on HDDs.
- **TEST:** add a LAN entity allow-list test, an event-stream filter test, a Host-header test, and a smoke run with the CSP enabled.

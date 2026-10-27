# KERYX full audit — 0.2.19

Audited `release/0.2.19` at `14d6dad5c3574daa316f9bbfcd2c82f4ca57615e` (the requested release head). This was a read-only audit; `supabase/`, generated `src/components/ui/`, and `node_modules/` were not audited as application code.

## Summary

Overall health is good for a complex desktop projection app: the live-state core is centralized, strongly validated, and extensively unit-tested; the main/network process has a narrow route and command surface; the sample console worked in the browser preview.

- [P2] Importing a valid-looking ZIP has no entry-count, compressed-size, or expanded-size quota and can exhaust the disk before validation.
- [P2] Bible-install and lyric HTTP requests have no deadline, so an unresponsive upstream can leave those UI operations pending indefinitely.
- [P2] The privileged media-import IPC accepts unbounded bytes and arbitrary readable source paths from any app-origin renderer.
- [P2] Every output and LAN screen eagerly downloads the console, producing one 1.47 MB minified / 477 kB gzip application chunk.
- [P3] The README says 31 entities/schema files; the release has 36.
- [P3] The known Avisos smoke flake is a harness focus limitation, not a demonstrated operator-facing double-click failure.

I would not call this a P0/P1 release blocker: no test, lint, or build failure was found, and I found no LAN write route, traversal through ordinary paths, or live-state validation bypass. I would nevertheless fix the ZIP quota and network timeouts before treating import/download handling as release-ready. The IPC size boundary and route splitting are safe follow-ups if release timing requires a narrower fix set.

## 1–2. Architecture, Electron main process, and security

### [P2] Archive import has no resource quotas beyond its manifest

- Where: `electron/archive.cjs:26`, `electron/archive.cjs:112-140`
- What happens: only the manifest is capped; every allowed `keryx.db` and `media/<name>` stream is written in full to staging.

  ```js
  const MAX_MANIFEST_BYTES = 64 * 1024;
  // …
  manifest = JSON.parse((await readAll(stream, MAX_MANIFEST_BYTES)).toString("utf8"));
  // …
  await pipeline(stream, fs.createWriteStream(path.join(staging, name)));
  ```

- How to reproduce / why it is real: make a ZIP with a valid small `manifest.json`, valid `keryx.db`, and many permitted `media/<safe-name>` entries (or a highly compressible large entry). `ENTRY` accepts each name and `stageImport` neither checks `entry.uncompressedSize`, counts entries, nor maintains a total while piping. Extraction fills `<dataDir>/pending-import` before `checkDatabase`; a full disk can disrupt the app and prevents a useful import error. The live DB is not replaced by this path, which limits the impact.
- Suggested fix: reject a bounded entry count, database size, individual media size, total uncompressed size, and total compressed ZIP size before/while extraction; remove staging on every quota breach. Add hostile-size tests alongside the existing zip-slip tests.
- Confidence: high.

### [P2] Internet-backed Bible installation and lyric search can wait forever

- Where: `electron/bible.cjs:91-101`; `electron/lyrics.cjs:106-116`
- What happens: unlike `fetchOnlineChapter`, both paths call `fetch` without `AbortSignal.timeout` or another deadline.

  ```js
  response = await fetchImpl(sourceUrl(version));
  // …
  res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json,text/javascript,*/*" } });
  ```

- How to reproduce / why it is real: call `installFromSource(store, "NVI", () => new Promise(() => {}))`, or `createLyrics({ fetchImpl: () => new Promise(() => {}) }).search("ab")`. Each returned promise remains pending. In production a TCP connection/upstream that never completes leaves the corresponding dialog operation unresolved rather than returning the existing Portuguese offline error.
- Suggested fix: give both fetches a finite `AbortSignal.timeout` (and normalize `AbortError` to the existing offline/unavailable messages); cover timeout rejection in unit tests.
- Confidence: high.

### [P2] Media-import IPC has no payload or source-file size boundary

- Where: `electron/data-ipc.cjs:46-66`
- What happens: app-origin renderers can ask the main process to copy any readable local path or write arbitrary byte payloads, with no size validation.

  ```js
  if (sourcePath) {
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) throw new Error("não é um arquivo");
      await fs.promises.copyFile(sourcePath, target);
  } else if (bytes) {
      await fs.promises.writeFile(target, Buffer.from(bytes));
  }
  ```

- How to reproduce / why it is real: an app-origin renderer can invoke `keryx:media-import` with a multi-gigabyte file path or an equally large `Uint8Array`; the handler copies/allocates it before returning. Sender-origin validation is present, but this remains an unbounded privileged capability if a renderer is compromised and can also turn an ordinary failed import into disk/memory pressure.
- Suggested fix: define media-size limits by type or available space, stat before copying, check `bytes.byteLength` before `Buffer.from`, and return a 413-style user message. Prefer a dialog-mediated file selection for desktop imports rather than accepting a free-form path when practical.
- Confidence: high.

### What I checked and found fine

- All primary `BrowserWindow` construction uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` (`electron/main.cjs:103-116`); output windows reuse those preferences.
- Navigation and new-window handling keep same-origin app pages internal and send only `http(s)` URLs externally (`electron/main.cjs:129-156`).
- IPC handlers other than the intentionally synchronous config read check the sender against the current app origin; live operations still go through `applyOp`.
- The loopback static server binds to `127.0.0.1`; its normal path resolver rejects lexical traversal. LAN serving exposes only `NETWORK_SCREENS`, read-only DB ops, and a whitelisted remote command set.
- LAN PIN and remote-code comparisons use `timingSafeEqual`, have five-attempt/one-minute throttling, cap SSE clients at 50, and close streams on stop.
- Archive staging uses fixed names and a restrictive entry expression; it does not replace the running database. Backups/import/restore have round-trip and rollback tests.
- Sync uses per-PC append-only files, cursor state, partial-line handling, atomically renamed media copies, and last-write-wins application; the documented duplicate-PDF sync limitation remains accepted.

## 3–6. Data, live state, projection, and console behaviour

### [P2] Outputs pay for the whole console bundle

- Where: `src/App.jsx:18-28`; `vite.config.js:57-72`
- What happens: `App.jsx` statically imports `Console`, every output view, `Janela`, and the remote view. There is no route-level `React.lazy` or Rollup chunk configuration.

  ```js
  import Console from './pages/Console';
  import Janela from './pages/Janela';
  import Projection from './pages/Projection';
  import LyricProjection from './pages/LyricProjection';
  import StageView from './pages/StageView';
  ```

- How to reproduce / why it is real: the production build emitted one `dist/assets/index-DUIi2Y0.js` at **1,467.20 kB** (**477.19 kB gzip**) and Vite emitted its over-500 kB chunk warning. A fresh `/Projection`, `/StageView`, or LAN browser must load that entry before rendering even though it does not need the console/editor/library code. This is especially material for a phone/tablet that reconnects to a church Wi-Fi network.
- Suggested fix: route-split `Console`, `Janela`, and the less common output/editor flows with `React.lazy`/`Suspense`; retain the small renderer/shared live-state path in the initial output chunk. Establish a build-size budget after splitting.
- Confidence: high.

### What I checked and found fine

- `shared/live-state.mjs` is the single validated operation model. It validates operation names/arguments, enforces `WHILE_LOCKED`, clamps live visual values, caps text/slides/loose JSON, persists safely, resets lock on restore, pauses automatic follow after restart, and has broad behavioural tests.
- `content.follow`, reveal activities, presentation slides, sound hush/leaving, exit fades, clear, undo history, and output preferences have focused pure tests. Expired `leaving` records are harmless visually and are dropped on a subsequent operation; they are deliberately not restored after restart.
- The output-view filtering and `SHOW_KINDS` coverage include presentations and the alert bar. The accepted limitations listed in the brief (video sound cut by `content.show`, network Avisos fade, folded No ar, detached-window refusal toast) were confirmed and are not repeated as new findings.
- Subscription effects return the unsubscribe callback in the reviewed entity/live hooks; timers in the follower, exit ghost, backfill hooks, and toast have cleanup paths.
- `Console.jsx` is large (1,415 lines) and `dock.js` is large (847), but both are below the stated 1,500-line component threshold; the volatile rules that were inspected are largely extracted into tested `src/lib/console/*`. This is change-risk debt, not a demonstrated defect.
- In the approved sample browser preview, double-clicking a song put it on air and the Programa showed the title, current slide, and `1/2` position.

## 7. Tests

### [P3] Avisos background smoke flake is a focus-harness weakness, not an application failure

- Where: `electron/smoke.cjs:594-610`, `electron/smoke.cjs:1162-1169`; `src/components/console/Library.jsx:304`
- What happens: the smoke sends synthetic input with `webContents.sendInputEvent` while a different application may be foregrounded. Its own comment says Chromium does not emit focus/blur in that situation; it enables debugger focus emulation as a best effort. The Avisos assertion relies on that synthetic double-click reaching the row.

  ```js
  await dblclick(".kx-row", "BBB aviso fundo");
  result.noticePrefStamped = await waitFor(() => {
      const it = live.get().communication && live.get().communication.item;
      return Boolean(it && it.background_dim === 0.7 && it.background_blur === 6);
  }, 5000);
  ```

- How to reproduce / why it is real: the reported failures correlate with the smoke explicitly marking another foreground app as inconclusive. The application handler is simply `onDoubleClick={onGo && (() => onGo(stageFromPiece(p)))}`; it neither tests window focus nor branches on it. A physical operator double-click necessarily targets/focuses KERYX, so the code does not support the claim that the notice can fail to go on air because another app was foregrounded.
- Suggested fix: make this smoke step deterministic by activating the console before injected pointer input, or test the stamp/send path through its pure stage and live-op boundary. Keep the renderer assertion separate. Do not report this as a product bug.
- Confidence: high.

### What I checked and found fine

- `npm test` ran 677 tests with 677 passes. Store semantics, schema drift, backup/archive round-trips, LAN restrictions, remote arguments, live state, sync convergence, output preferences, media pooling, PDF staging, and console helpers are covered.
- The known `temasSlots` result is still calculated but omitted from smoke's final condition, as accepted in the brief.
- The smoke is intentionally not run: it opens real windows and plays a tone. Its selectors and final predicate were read only.

## 8–10. Documentation, UX, dependencies, and release pipeline

### [P3] README’s entity count is stale

- Where: `README.md:206`, `README.md:274`; `base44/entities/`; `electron/db/schema.json`
- What happens: README says both “all 31 entities” and “31 JSON Schemas,” while this release contains 36 `base44/entities/*.jsonc` files and `schema.entities` has 36 entries.

  ```md
  `keryx.db` (SQLite, all 31 entities plus the operator profile)
  …
  base44/entities/*.jsonc 31 JSON Schemas
  ```

- How to reproduce / why it is real: count `base44/entities/*.jsonc` or `Object.keys(require('./electron/db/schema.json').entities)` at `14d6dad`; both return 36.
- Suggested fix: update both README statements to 36 (or remove the fragile exact count).
- Confidence: high.

### What I checked and found fine

- `npm audit --omit=dev` reports 9 advisories (5 high, 4 moderate), matching the README’s documented Tailwind 3 / React Router 6 supply-chain caveat. The high Tailwind chain is build-time; no new packaged runtime critical advisory was identified. A future major migration remains the right remediation.
- The release package is versioned `0.2.19`, uses a draft GitHub release target, excludes source tests from the declared application file set, and the release note is within the updater text limit.
- The Vite PDF-assets plugin ships the required pdf.js data locally and excludes QuickJS; no CDN/web-font import was found. Geist is bundled and tested.
- The reviewed UI strings are pt-BR, delete paths in the reviewed library use `useConfirm`, and the generated `ui/sidebar.jsx` still imports the missing `@/hooks/use-mobile`, but it is an unused generated component and does not enter the built application.
- `/Editor` and `ScreenLayout` are deliberate compatibility/lazy-migration paths, documented in `CLAUDE.md`; `layout.onairMin` is absent from application code, so neither is a new dead-code finding.

## Not auditable here

- Packaged Electron-only behaviors: output placement, full-screen/on-top behaviour across actual monitors, Windows display-media meters, updater signature/download/install flow, native dialogs, and close-guard focus. Verify on a sacrificial Windows profile with two physical displays and `KERYX_DATA_DIR` set to a disposable folder; do not use the operator profile.
- Church-LAN reachability, Wi-Fi isolation, router client limits, QR links, and real remote-device latency need a private test network with a PIN and at least one phone/TV browser.
- Physical clicker keys and GPU/WebGL fallback need representative devices. The browser preview exercises sample data and routes, not Electron IPC or real outputs.

## Commands run

| Command | Result |
| --- | --- |
| `npm test` | 677 passed, 0 failed, 0 skipped (7.11 s) |
| `npm run lint` | passed; the configured error-only gate produced no output |
| `npm run build` | passed; 2,151 modules transformed; emitted the documented >500 kB chunk warning |
| `npm audit --omit=dev --json` | 9 findings: 5 high, 4 moderate; see documented Tailwind/React Router caveat |
| `npm run dev -- --host 127.0.0.1 --port 5188` | passed; sample-data preview served `/Console` (HTTP 200) and basic song-to-Programa flow was exercised |

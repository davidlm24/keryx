---
description: Keryx audit pass 2 — Electron security hardening and data handling
---
Read `audit/AUDIT_CONTEXT.md` and `audit/00-recon.md` first. Follow all rules. If the finecomb, OWASP or code-review skill/plugin is available, use it and say so.

Optional scope from user: $ARGUMENTS
ID prefix: SEC

Threat model: church laptops shared by many volunteers; content imported from the internet (song files, Bible modules, media, ProPresenter/Holyrics exports); a possible remote-control server on the local network; auto-updates from the internet.

## Check, for every BrowserWindow and webContents
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no `allowRunningInsecureContent`, no `enableRemoteModule`/@electron/remote.
- Preload exposes narrow, purpose-specific functions — never raw `ipcRenderer`, `require`, `fs`, `shell` or generic "invoke any channel" wrappers.
- Every IPC handler validates sender (`event.senderFrame`) and payload; no path traversal in file operations; no handler that executes arbitrary paths/commands.
- Navigation locked: `will-navigate`, `setWindowOpenHandler`, `will-attach-webview` handled; external links opened via `shell.openExternal` only after URL allow-listing (https only).
- Content Security Policy set for all app pages; no `unsafe-eval`; minimal `unsafe-inline`.
- Rendering of user/imported content: lyrics, announcements, song titles, Bible text — any `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, markdown rendering without sanitisation → XSS that becomes code execution if isolation is weak.
- Custom protocols (`protocol.handle`/`registerFileProtocol`) and `file://` usage: can a crafted media path read arbitrary files?
- Importers/parsers (XML, ZIP, .pro, JSON): zip-slip, XXE, unbounded memory on malformed input.
- Remote control / local web server (if any): bound to which interface, authentication, pairing, CORS, CSRF, rate limiting.
- Auto-update: signed builds, HTTPS feed, signature verification, no downgrade.
- Secrets in the repo or bundle (API keys, tokens), including git history (`git log -p` search for common key patterns — read-only).
- Electron fuses (`RunAsNode`, `EnableNodeCliInspectArguments`, ASAR integrity) and whether the Electron version still receives security patches.
- Dependencies: run `npm audit --omit=dev` (ask first) and report only exploitable-in-context issues, not raw counts.

Severity: a path from imported content or the network to code execution or arbitrary file read is P0.

Write `audit/02-security.md`, append rows to `audit/FINDINGS.md`, print the summary and stop. Mask any secret you find (show first 4 chars only).

# KERYX AUDIT — SHARED CONTEXT

Every pass reads this first. It is the shared context block of the owner's
doc "KERYX Design Audit — Prompt Pack"
(https://claude.ai/artifact/KeNQqskDkdZzkGnyYf95po), plus the notes for this
run at the end.

## Product
- App: KERYX, an offline-first Electron desktop app for Windows 10/11
  (local SQLite; no account, no internet needed during a service).
- Purpose: church worship projection. One operator console sends lyrics,
  Bible passages, media, avisos and timers live to several screens: the
  projector, the stage monitor, video screens, and tablets/TVs on the
  church network.
- Primary users: media volunteers of a Brazilian church (the UI is pt-BR
  only). Weekly: 15–60 min preparing during the week, then live services
  of 1.5–3 h, often on a 1366×768 notebook beside a projector, in a dark
  room, keyboard-first and under time pressure.
- Core flows to judge against:
  1. Prepare a culto: Planejar o culto / the Setlist (songs, a Bible
     passage, media, a Seção), edit a song (lines per slide, chords,
     Sincronizar), pick the culto's papel de parede and theme.
  2. Run it live: a click puts an item in the Prévia, Enter or a double
     click sends it to the air; ←/→ move the slide on air, ↑/↓ the
     selection; Esc ends (Desfazer in its toast); Tela preta / Logo /
     Limpar in the Programa's pill; the player (video/audio); the Bíblia
     environment (quick jump "jo 3 16", Ler / Comparar / Buscar); Aviso
     rápido and timers; Travar telas.
  3. Set up the screens and the church: Configurações (Telas e saídas →
     Editor de telas, Temas e fundos, Culto, Sincronização, Backup e
     atualizações), the background library, Ver › Editar disposição.
- Audit goal: a volunteer runs a whole service keyboard-first and never
  hunts for a control while live; nothing broken or ambiguous ever
  reaches the projector; a first-time operator completes flow 1 without
  help.

## Stack
- Electron 44, renderer: React 18 + Vite 6 (JavaScript, no TypeScript)
- Styling: Tailwind 3 + the KERYX design system (tokens and kx- classes
  in docs/design-system/, imported as @ds/…; console styles in
  src/components/console/console.css). shadcn/ui is generated in
  src/components/ui/ (do not audit it).
- Titlebar: custom on Windows (titleBarStyle "hidden" + titleBarOverlay:
  the system's caption buttons over the page, which leaves
  env(titlebar-area-height) to them). Outputs are frameless full-screen
  windows. No application menu.
- Theme: dark only (there is no light theme).
- Code locations: renderer = src/ (console: src/pages/Console.jsx and
  src/components/console/; outputs: src/pages/*.jsx and
  src/components/screen/), main process = electron/ (main.cjs,
  preload.cjs, outputs-manager.cjs), tokens/theme =
  docs/design-system/tokens.css (+ tokens.json), components =
  docs/design-system/components/ and src/components/console/kx.jsx
- Read first: CLAUDE.md (the owner's decisions: it is the spec),
  docs/design-system.md, README.md.
- Run it: npm ci, then npm run dev (the console in a browser on sample
  data; output pages open as tabs from Saídas). Never run
  npm run desktop:smoke or desktop:dev during the audit.
- Screenshots: audit/screens/

## KERYX rules that override the generic checklist
- The UI is Brazilian Portuguese. Judge wording against CLAUDE.md's copy
  rules (Configurações, Excluir always asks first, Tirar, Pôr na prévia /
  Enviar ao ar, Papel de parede…), never English Windows words
  (Settings, Exit, OK) and never pt-PT.
- CLAUDE.md records the owner's decisions. A finding that contradicts one
  goes under "Needs manual check" as a question for the owner, not as a
  defect.
- Live keys follow Holyrics, not Office: ←/→ move what is on air, Enter
  sends the Prévia, Esc ends the projection, B / L / C = Tela preta /
  Logo / Limpar, PageUp/PageDown = a presentation clicker.
- What the audience sees (the outputs) keeps its transitions even with
  reduced motion on; only the console honours it.
- Dark only, by design (dark rooms): no light-theme or "follow the
  Windows theme" findings; check contrast in the dark theme.
- Smallest window 960×600; the target notebook is 1366×768.
- Do not audit src/components/ui/ (generated) or supabase/ (unused).

## Rules for this pass
- AUDIT ONLY. Do not edit, rewrite or refactor any file.
- Do not propose a redesign or a new visual direction.
- This is a Windows desktop app, not a website:
  ignore mobile, touch, responsive breakpoints below 1024px and SEO.
- Judge against Windows desktop conventions, not web or macOS conventions,
  except where the KERYX rules above say otherwise.
- Only report what you can point to (a screen, a file:line, a component).
  No generic advice. If you can't verify something, list it under
  "Needs manual check" instead of guessing.
- Max 25 findings. If there are more, keep the highest severity.

## Severity
- Blocker: stops a core flow, breaks accessibility, or looks broken.
- Major: slows users down, causes errors, or clearly feels non-native.
- Minor: inconsistency or polish; fix when nearby.

## Output format (write to the file named in the pass)
| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
IDs use the pass prefix (CRIT-01, CODE-01, A11Y-01, SYS-01, WIN-01, POL-01).
Sort by severity, then by flow order.
End with: "Needs manual check" (bullets) and
"Top 3 to fix first" (IDs + one line each).

---

## Notes for this run (16/10/2026)
- Code under audit: branch `audit/design-0219`, cut from `release/0.2.19`
  at 0866cb4 (the 0.2.19 release candidate: Rodada F, the audit fixes and
  the sync between computers).
- All passes run at the same time, each in its own session, in this one
  checkout. Each writes ONLY its own `audit/0N-<pass>.md` and, if it
  captures screenshots, new files `audit/screens/<N>-*.jpg` (N = its pass
  number). Do not edit other files, switch branches, commit or push: the
  consolidation commits everything at the end.
- Screenshots already in audit/screens/: 01–10, taken in the browser
  preview at a 1366×768 viewport (saved 800 px wide): the console live,
  Configurações › Telas e saídas / Temas e fundos / Sincronização, the
  song editor, Planejar o culto, Mídia, Escola bíblica, the Projeção and
  Palco outputs idle.
- To see more, use the side-panel preview (preview_start "keryx-ui": npm
  run dev on a free port). It is a browser, not Electron: there is no
  titleBarOverlay and no real output windows on monitors, so window
  chrome, DPI and focus questions go under "Needs manual check". Windows
  150% scaling of a 1920×1080 screen ≈ a 1280×720 viewport; 1366×768 at
  150% is below the app's 960×600 minimum and is not supported.
- The skill named in a pass: use it if your skill list has it; if not,
  apply the pass's checklist yourself and say so at the top of your file.

# Surfaces — a short RFC

KERYX draws on three kinds of surface. They share the tokens' palette and the
pt-BR vocabulary (`README.md`), but not their density, their targets, their
type or what they may do, because they are used by different people, with
different hands, at different distances. A new page belongs to exactly one of
them and follows its column below. This is the contract; `design-system.md`
has the console's components, `CLAUDE.md` the owner's decisions (it wins).

| | Console do operador | Companion de toque | Saída de audiência |
| --- | --- | --- | --- |
| Who, where | The volunteer at the church computer, a dark booth, 90 minutes | The same team on a phone or tablet, standing, one hand | 300 people, a 4-metre wall, a TV, the stage monitor, OBS |
| Pages | `/Console`, `/Janela` | `/Remote` (a home-screen app since G13; a future PWA / APK) | `/Projection`, `/LyricProjection`, `/VideoProjection`, `/CommunicationProjection`, `/StageView`, `/PastorView`, `/StreamView` |
| Density | Dense: 28 px rows (32 in Confortável), 24 px controls in headers | Loose: one thing per row, big gaps, no hover | None: no UI at all |
| Targets | ≥ 24 × 24 px (WCAG 2.2 minimum); the live buttons 32–40 | ≥ 44 × 44 px; the main actions 64–96 | None: nothing to point at |
| Type | The seven `--fs-*` steps, 11–28 px | Its own touch scale, from 13 px (a hint) to 17 px (a main button) and 28 px (a figure); never under 13 px for anything to read, 16 px in a field (no zoom on focus) | `cqw` / `cqmin` of the screen, so a 320 px preview and the 1920 px wall break lines alike; the church's themes and fonts |
| Input | Keyboard first, then the mouse; every action has a key | Touch only; no keys, no hover, no right click | None. The output's own screen keys only on the desktop (←/→, B, L, C, Esc), never a click |
| Colour | `bg-0`…`bg-3`, colour is state | The console's palette and states, at touch size | The theme's; console tokens never reach it |
| Motion | 120 ms state changes, 180 ms folds; reduced motion removes them | The console's, reduced motion respected | The theme's transitions and the fades; **reduced motion is ignored** (the audience sees them) |

## Console do operador

- **Model: prepare, then send.** A click prepares in the Prévia; only a
  deliberate act sends (Enter, a double click, *Enviar ao ar*, a drag onto
  the Programa, ←/→ on what is already on air). Typing never sends.
- **Density and targets.** Dense, quiet, 4 px grid; 24 × 24 px minimum,
  bigger for the live controls (32 px, *Enviar ao ar* 40). The components are
  `bundle.css`'s.
- **Type.** The seven-step scale; 11 px only for telemetry.
- **Permissions.** Everything: the store, the live state, the outputs, the
  settings, the sync. It is the only surface that writes the database through
  its pages, and the only one the controle remoto's commands are run by.
- **Critical actions.** Tela preta (B), Logo (L), Limpar (C) act at once,
  even locked; Esc ends at once and offers Desfazer (8 s, Ctrl+Z); *Encerrar*
  asks first; *Travar telas* refuses anything new on the screens. Deleting
  asks, opening on Cancelar.

## Companion de toque

The phone's page (`/Remote`, `src/pages/RemoteView.jsx`,
`src/components/network/remote/`, styles `remote.css`) and whatever
replaces it (a PWA once HTTPS exists, an APK): **a remote control, never a
second console.**

- **Density and targets.** One column on a phone, a left rail from 600 px;
  tabs at the bottom (58 px), buttons ≥ 44 × 44 px (chips 44, list items 52,
  the main buttons 64–96), 8–12 px apart; nothing depends on hover or a long
  press except the held actions below.
- **One hand.** What is used during the service (Próximo, Anterior, Tela
  preta, the sticky "Enviar ao ar · título") sits in the lower half, within
  the thumb's reach; the safe areas (`env(safe-area-inset-*)`) are kept.
- **Type.** Its own touch scale (today the values in `remote.css`, pinned by
  `tokens.test.mjs`); when it becomes tokens it is a group of `tokens.json`
  of its own (`fs-touch-*`), never the console's 11–14 px. Fields are 16 px so
  the phone does not zoom.
- **What it may do.** Only the closed list of actions in
  `shared/remoteProtocol.json` (`REMOTE_ACTIONS`, version 2): each with its
  kind — **R** reads, **S** puts on air (refused while locked, 423), **T**
  takes off (works locked) — its args schema, its `cap` and its pt-BR label.
  The console runs every command as its own keys would
  (`createRemoteRunner`), one at a time, and says "Celular: …" on the
  console. A section shows only when `state.caps` has its cap.
- **What it may not do.** Write the store or the live state directly; open a
  page of the console; change a setting, a theme, a song or the Setlist's
  order; anything that is not in the list. An unknown action is 400 ("Atualize
  o KERYX no computador").
- **Critical actions.** *Encerrar tudo* and *Destravar* are **held** (1.5 s,
  `HoldButton`), never a tap; Tela preta, Logo, Limpar, Tirar and Travar never
  wait in the queue. A stale link (25 s without a frame) turns the S actions
  off; a lost answer is "Não sei se foi", never retried.
- **Access.** Off by default; its own code (the remote's, never optional,
  apart from the screens' PIN), five wrong codes then a minute out; a phone
  signed in with it reads only `/api/live`, `/media`, the User row and its own
  event stream. Taps past a burst are 429.
- **Plain http today.** The church's network has no certificate, so the page
  is http: no service worker, so no offline start and no real install (the
  G13 manifest gives a home-screen icon only), no Wake Lock (the "Manter a tela
  ligada" loop is a muted video), no clipboard or vibration on most phones.
  **HTTPS would unlock** a true install with an offline shell, the Wake Lock
  API, notifications, and secure-context-only APIs; it needs a certificate the
  phones trust (a local CA installed once, or a name on the internet), which
  is a decision for the owner, not a page change.

## Saída de audiência

What the congregation, the musicians, the pastor and the broadcast see:
the outputs rendered by `ScreenRenderer` (and the Palco's and Pastor's pages,
and Transmissão's lower third for OBS).

- **No UI chrome.** No buttons, menus, cursors, focus rings, tooltips or
  scrollbars. **Never a cursor** (hidden while full screen or waiting); no
  click-to-advance.
- **Sized in container units** (`cqw`, `cqmin`): a still at 320 px and the
  wall at 1920 px are the same picture. Every screen is landscape (16:9); only
  the real Pastor page turns upright on a tablet.
- **Colour.** The church's themes and backgrounds; `screen.css` keeps its own
  colours, and console tokens never leak onto a screen.
  `forced-color-adjust: none` on every output document and renderer: a Windows
  contrast theme never recolours what the audience sees.
- **Motion.** The theme's slide transition, the fades of Esc, Limpar, Tela
  preta and Logo; **`prefers-reduced-motion` is ignored** (the operator's
  computer setting is not the audience's). Still previews cut.
- **Permissions.** Read only: the database and the live state. A network
  screen can open only the pages in `NETWORK_SCREENS`.
- **Critical behaviour.** Nothing covers the projector (an output full screen
  on another monitor stays on top); an output whose monitor leaves waits
  hidden and comes back full screen; the displays stay awake while an output
  is open; Travar telas holds what is shown.

## Open questions

- The Companion's touch scale as tokens (`fs-touch-*`, its radii and
  targets) and `remote.css` written with them.
- HTTPS on the church network (see above): the owner's call.
- Whether a tablet Companion may show the Prévia (read only) beside the
  Programa.

KERYX is the live operator console a Brazilian church volunteer runs for 90 minutes from a dark booth: lyrics, Bible passages, videos and announcements go out to several screens while 300 people watch the result on a 4-meter wall. The system exists so that every screen, module and future feature keeps three things readable at a glance — what is on air, what goes next, whether every output is connected — and makes the wrong action hard and the right one instant. Dark only. Colour means state and nothing else.

## Principles

- **Programa / Prévia discipline.** Nothing reaches the screens by being clicked. A click prepares (`prev`); only `Enviar ao ar`, Enter or the arrow keys change what is on air (`air`). Design every new feature so that this stays true.
- **Colour is state.** `air` red = on air, `prev` green = prepared, `rh` blue = rehearsal (outputs disarmed), `warn` amber = warning or failure. `brand` gold is reserved for the logo mark and the focus ring. Everything else is one of four greys. If a colour is not telling the operator a state, remove it.
- **Dense, small, quiet.** 11px metadata, 12px UI, 13–14px content, nothing larger except `clock` and `countdown`. Bare glyphs, no boxes around icons, no badges, no pills, no inline help. Explanations live in tooltips and empty states.
- **One rhythm.** A 4px grid, 28px rows and controls, 6px gutters between modules, 6px radius on controls, 10px on panels. Hover and state changes take 120ms ease-out; a slide change on a screen is a hard cut.

## Content fundamentals

Write Brazilian Portuguese, never European forms: *tela*, *salvar*, *arquivo*, *excluir*, *cronômetro*, *celular*. Address the operator as *você* only when unavoidable; prefer the imperative (*Enviar ao ar*, *Pôr na prévia*, *Localizar…*). Sentence case everywhere except section headers, which the `section` style sets uppercase. No exclamation marks on the console, no emoji, no jokes while something is on air.

Use these words exactly and never a synonym: **Programa, Prévia, Próximo, Ao vivo, Ensaio, Armar saídas, Enviar ao ar, Pôr na prévia, Ir para o item, Voltar ao anterior, Tela preta, Mostrar logo, Limpar texto, Encerrar, Roteiro, Biblioteca, Letras, Mídia, Avisos, Camadas, Tema, Fundo, Linha do tempo, Saídas, Conectada, Reconectando, Desconectada.**

Captions follow one pattern, middle dots as separators, counts as `2/5`: `PROGRAMA · Firme na rocha · 2/5`, `Saídas · 5 conectadas`, `Próximo: Firme na rocha · Preparar`, `Reconectando… tentativa 2`, `+7 min atrasado`. Times are `19:46`, durations `4:30`, planned-versus-actual `3:10 de 4:00`. Numbers are always tabular (the `sans` family is loaded with `tnum`).

A warning names the thing and the way out in one line: `Arquivo não encontrado · Localizar…`, `Fonte "Bebas Neue" não instalada · usando Geist`. Confirmation dialogs say what stays on air: *"O que está no ar continua no ar: Firme na rocha, slide 2. Depois de armar, Enviar ao ar muda as 5 telas."*

## Colour

Grounds, from the window out: `bg-0` is the window, `bg-1` every module, `bg-2` fields, popovers and hover, `bg-3` pressed or selected. These four greys and the two hairlines (`line`, `line-strong`) are the whole neutral palette; do not add a fifth step. Text is `fg-1` for content and the row in hand, `fg-2` for UI labels and glyphs at rest, `fg-3` for metadata, headers and placeholders. All three pass 4.5:1 on all three surfaces they are allowed on; never set text in `line-strong` or dimmer.

State colours come in four tokens each — the mark (`air`), the text (`air-fg`), the fill (`air-fill`) and the wash (`air-tint`) — and the same for `prev`, `rh` and `warn` (whose only fill is the PiP label; use `on-warn` on it). Marks are frames, bars and dots; text tokens are the lighter variants that read on `bg-1`; fills are rare — the Ao vivo / Ensaio segment of the mode switch, `Enviar ao ar`, `Armar saídas` and nothing else; a tint is a 10% wash behind a row and only ever appears together with its 2px bar on the row's left edge (`bar`). Text on a fill is `on-state`.

Red and green are distinguishable by lightness (4.7:1 and 5.8:1 on `bg-1`, text variants 6.7:1 and 9.4:1) and always carry a word as well: `PROGRAMA`, `PRÉVIA`, `Conectada`, `Reconectando`. Never signal a state with colour alone.

`brand` gold appears in exactly two places: the KERYX mark and the 2px focus ring, which lands solid at 7.9:1 on every surface. Never use it for a button, a selection, a chart or emphasis.

Projected screens are a different world: `screen-bg` black, `screen-fg` white text with the `screen-text` shadow, the church logo in a corner. Console tokens never leak onto a screen and screen styles never appear on the console.

## Typography

One family, `sans` (Geist, Inter as fallback, shipped with the app, never loaded from the internet, with `tnum`). Eight console styles, three screen styles: `meta` 11/16 for the grey line under every title; `section` 11/16 500 uppercase with 0.06em tracking for module headers and monitor captions; `ui` 12/16 and `ui-strong` 12/16 500 for controls; `content` 13/18 for titles in lists; `content-lg` 14/20 for slide and verse text; `clock` 20/24 and `countdown` 28/32 for time only. On the console nothing is larger than 14px except those two. Weight is 400 or 500; 600 exists only on projected lyrics and the cover.

Screens use `display` (the same family at heavier weight): `screen-lyrics`, `screen-verse`, `screen-ref`, sized in container units of the monitor so a preview at 320px wide and the real 1920px screen keep the same proportions.

## Spacing, radii, layout

`space-1` (4px) is the unit; controls and rows are `row` (28px) tall, the top bar `topbar` (36px), gutters between modules `gutter` (6px). Horizontal padding inside a row or control is `space-2`; popovers and menus pad `space-3`; dialogs `space-4`. Radii: `radius-control` on anything you click or type into and on slide rows, `radius-panel` on modules, popovers, dialogs and banners, `radius-round` only on 6px state dots and the seek handle.

The console is a grid of modules. Every module has a 28px header (`section` style, collapse glyph, module actions), can be resized with an invisible splitter (a 1px `line-strong` line on hover, double-click resets), collapsed to its header, or hidden and restored from the *Ver* menu. Layouts are saved per operator; *Restaurar layout* returns the default. At 1366px wide the right-hand modules become a drawer and the rundown moves into the library tabs; nothing ever scrolls sideways.

## States

A highlighted row is a 2px bar on its left edge in the state colour plus the matching 10% tint; the title takes the state's text colour. Selected-but-neutral rows use `bg-3`. Done items take `dim` opacity on the whole row. Disabled controls take `dim` and lose hover. Hover lightens the glyph (`fg-2` → `fg-1`) and adds a `bg-2` background; pressed is `bg-3`. Focus is the `brand` ring, inset so it never grows the control.

Monitors carry state in their 1px frame and caption: `air` on Programa, `prev` on Prévia, `rh` on Programa during Ensaio, `warn` with the amber hatch while an output reconnects. The Programa monitor in Ensaio keeps a small red PiP, `NO AR AGORA`, with the real screen.

The *Alerta rápido* is the one control that bypasses Prévia: its field is captioned *vai direto às telas*, and while an alert is showing it becomes a `kx-alert` line (warn bar, warn tint, elapsed time, *Tirar*); on the screens it is a thin `warn` bar across the top in `on-warn` ink. Tools (Relógio, Cronômetro, Timer, Texto livre) are `kx-tool` ghost buttons that go through Prévia like any item and render on screen as `kx-screen-tool` (a label above a tabular figure at 14% of the screen width). Per-output routing (Letra, Letra + cifra, Playback, Cifra, Avisos) and the transport's *Toca em* are one setting, shown and changed with `kx-route`.

Banners are one 28px line across the grid, tinted, with a 2px top rule in the state colour: blue for `MODO ENSAIO — nada será enviado às saídas`, amber for recovery after a crash. They never stack; recovery wins.

## Iconography

Bare glyphs from the KERYX set (`components/bundle.js`, `window.KERYX.icon(name)`, SVGs under `assets/Icons`): 24-unit grid drawn for 16px, 1.5 stroke, round caps and joins, no fill, no box, border or background around them. A glyph sits at `fg-2` and lightens to `fg-1` on hover; a glyph next to a label that already says the same thing is removed. Shortcuts appear in tooltips (`Tela preta · B`), never printed on buttons.

## Motion

One transition — `duration-fast` with `ease-out` — on background-color, color, border-color and opacity for hover, focus, selection and state changes. Nothing slides, scales or fades in on the console; popovers appear in place. A slide change on a projected screen is a hard cut, on the console and on the wall. `prefers-reduced-motion: reduce` removes the transition.

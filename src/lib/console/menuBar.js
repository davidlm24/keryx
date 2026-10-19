// The menu bar (owner 2026-10-15, Rodada D4, "Menus novos" = A): after the
// logo and KERYX | Bíblia, as in Holyrics and desktop programs — Culto,
// Música, Mídia, Ferramentas. Ver stays the eye beside the bell and Ajuda's
// items live in the logo's menu ("O topo", owner 2026-10-15). There is no
// Telas menu (owner 2026-10-16, Rodada E0): Tela preta, Logo and Limpar are
// the top bar's chip, Saídas and Verificar the logo's menu, Travar telas and
// Telas e saídas the Saídas popover. On a narrow window the bar folds away and
// the top bar's Menu button (Rodada M0) opens the same four menus in one
// popover (`flattenMenus` below: one source, so no item can be lost); the
// logo's menu is the app's (Configurações, Saídas, Verificar tudo, Ajuda).
// Everything here already has a place in the console; the bar puts it one
// click away. Pure: the console passes what it knows (`ctx`) and its actions
// (`ctx.act`), the bar draws the result.
//
// "…" ends a label only when the command asks for more before it acts (a
// file, a link, a text, the marks); one that opens a page has none (design
// audit C-52).
//
// A menu: { id, label, items }. An item: { label, icon?, kbd?, checked?,
// disabled?, title?, onSelect?, sub?: [items], service? } or { sep: true } or
// { head: "text" }.

const sep = { sep: true };
const head = (text) => ({ head: text });
const date = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "");

export const MENU_IDS = ["culto", "musica", "midia", "ferramentas"];

// The source a song's automatic lyrics follow, in words.
const FOLLOW_WORD = { video: "o vídeo", audio: "o playback", clock: "o relógio ao vivo" };

export function buildMenus(ctx) {
    const a = ctx.act || {};
    const call = (name, ...args) => () => a[name]?.(...args);
    const f = ctx.follow || null;
    const services = (ctx.services || []).slice(0, 12);

    const culto = [
        head("Culto de hoje"),
        ...(services.length ? services.map((s) => ({ label: s.title || "Culto", kbd: date(s.date), checked: s.id === ctx.serviceId, service: true, onSelect: call("pickService", s.id) })) : [{ label: "Nenhum culto ainda", disabled: true }]),
        sep,
        { label: "Planejar o culto", icon: "list", onSelect: call("planner", ctx.serviceId) },
        { label: "Novo culto", icon: "plus", onSelect: call("planner", "new") },
        { label: "Modelos de culto", icon: "copy", title: "Configurações › Culto", onSelect: call("settings", "culto") },
        { label: "Exportar a setlist em PDF", icon: "download", disabled: !ctx.serviceId || !ctx.itemsCount, title: ctx.serviceId ? undefined : "Escolha um culto primeiro", onSelect: call("exportPdf") },
    ];

    const letra = f
        ? [
            { label: `Segue ${FOLLOW_WORD[f.source]}`, disabled: true },
            f.source === "clock" && !f.clock
                ? { label: "Iniciar", icon: "play", disabled: ctx.locked, onSelect: call("follow", "start") }
                : f.paused
                    ? { label: "Retomar", icon: "play", disabled: ctx.locked, onSelect: call("follow", "resume") }
                    : { label: "Pausar", icon: "pause", disabled: ctx.locked, onSelect: call("follow", "pause") },
        ]
        : [{ label: "A música no ar não tem tempos marcados", disabled: true }];
    const musica = [
        { label: "Nova música", icon: "plus", onSelect: call("newSong") },
        { label: "Buscar letras na internet…", icon: "search", onSelect: call("lyricsSearch") },
        { label: "Importar uma pasta…", icon: "folder", onSelect: call("importFolder") },
        sep,
        { label: "Sincronizar a música…", icon: "synced", disabled: !ctx.songId, title: ctx.songId ? "A música da Prévia, ou a que está no ar" : "Ponha uma música na Prévia ou no ar", onSelect: call("syncSong", ctx.songId) },
        { label: "Letra automática", icon: "music", sub: letra },
        sep,
        { label: "Temas", icon: "palette", title: "Configurações › Temas e fundos", onSelect: call("settings", "temas") },
    ];

    const midia = [
        { label: "Mídia", icon: "media", onSelect: call("media") },
        { label: "Enviar arquivos…", icon: "folder", onSelect: call("media", "upload") },
        { label: "Link do YouTube…", icon: "youtube", onSelect: call("media", "youtube") },
        { label: "Fundos", icon: "image", title: "Configurações › Temas e fundos", onSelect: call("settings", "fundos") },
        sep,
        { label: ctx.playing ? "Pausar o player" : "Tocar o player", icon: ctx.playing ? "pause" : "play", disabled: !ctx.playerOn, onSelect: call("playerToggle") },
    ];

    const timers = (ctx.timers || []).map((t) => ({ label: t.label, onSelect: call("timer", t.minutes) }));
    const ferramentas = [
        { label: "Avisos", icon: "megaphone", onSelect: call("notices") },
        { label: "Novo aviso", icon: "plus", onSelect: call("newNotice") },
        { label: "Aviso rápido…", icon: "bell", title: "Uma mensagem direto às telas", onSelect: call("quickAlert") },
        { label: "Timers", icon: "clock", sub: timers.length ? timers : [{ label: "Nenhum timer", disabled: true }] },
        sep,
        { label: "Escola bíblica", icon: "book", onSelect: call("school") },
        { label: "Relatórios", icon: "history", onSelect: call("reports") },
    ];

    return [
        { id: "culto", label: "Culto", items: culto },
        { id: "musica", label: "Música", items: musica },
        { id: "midia", label: "Mídia", items: midia },
        { id: "ferramentas", label: "Ferramentas", items: ferramentas },
    ];
}

// The four menus as ONE list for the Menu button's popover (Rodada M0, owner
// 2026-10-19 "empilhado"): each menu a head and its items, a sep between them,
// a `sub` list inline under its parent (the parent becomes a minor head, the
// sub items indented: no side flyout in a narrow popover). The items keep
// their onSelect, disabled, checked and kbd, so the popover acts exactly as
// the bar. The culto's services are capped at `maxServices`; "Todos os
// cultos…" (`onAllServices`) follows when some were left out.
export function flattenMenus(menus, { maxServices = 5, onAllServices } = {}) {
    const out = [];
    menus.forEach((m, i) => {
        if (i) out.push(sep);
        out.push(head(m.label));
        let shown = 0;
        let cut = 0;
        let lastService = -1;
        for (const [n, it] of m.items.entries()) {
            // The Culto menu's own first head ("Culto de hoje") repeats the menu's.
            if (it.head != null && n === 0) continue;
            if (it.service) {
                if (shown >= maxServices) { cut += 1; continue; }
                shown += 1;
                out.push(it);
                lastService = out.length - 1;
            } else if (it.sub) {
                out.push({ head: it.label, minor: true });
                for (const s of it.sub) out.push({ ...s, indent: true });
            } else out.push(it);
        }
        if (cut) out.splice(lastService + 1, 0, { label: "Todos os cultos…", icon: "list", title: "Planejar o culto", onSelect: onAllServices });
    });
    return out;
}

// The song the Música menu's Sincronizar acts on: the one in the Prévia,
// else the one on air. null when neither is a song.
export function songInHand(prev, cur) {
    const fromPrev = typeof prev?.id === "string" && prev.id.startsWith("song:") ? prev.id.slice(5) : null;
    if (fromPrev) return fromPrev;
    const c = cur?.content;
    return c?.kind === "lyrics" && c.ref?.songId ? c.ref.songId : null;
}

// ← / → between open menus, as in a desktop menu bar.
export function nextMenu(id, d) {
    const i = MENU_IDS.indexOf(id);
    if (i < 0) return MENU_IDS[0];
    return MENU_IDS[(i + d + MENU_IDS.length) % MENU_IDS.length];
}

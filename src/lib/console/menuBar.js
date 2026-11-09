// The menu bar (owner 2026-10-15, Rodada D4, "Menus novos" = A): after the
// logo and KERYX | Bíblia, as in Holyrics and desktop programs — Culto,
// Música, Mídia, Ferramentas and, last, Ajuda (owner 2026-10-20, Rodada M0:
// where an operator looks for help; it had lived in the logo's menu since "O
// topo"). Ver stays beside the bell. **Every new feature reviews this bar**
// (owner 2026-11-09, CLAUDE.md): a command the operator may look for gets its
// item in the menu its meaning belongs to — Culto (the culto and its team:
// Pedidos, Chat), Música (songs, their import, the .keryx package, and the
// Bíblia's group), Mídia, Ferramentas (avisos, timers, Escola, Relatórios,
// and Conexões: the phones and the sync), Ajuda (learning, checking,
// support, updates; never a connection or a setting). There is no Telas menu (owner
// 2026-10-16, Rodada E0): Tela preta, Logo and Limpar are the Programa's
// pill, Saídas the logo's menu, Travar telas and Telas e saídas the Saídas
// popover. On a narrow window the bar folds away and
// the top bar's Menu button (Rodada M0) opens the same four menus in one
// popover (`flattenMenus` below: one source, so no item can be lost); the
// logo's menu is the app's (Configurações, Saídas, Sobre, Atualizar agora).
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

import { hasUpdate } from "./updates.js";
import { menuItem as mi } from "./menuLabels.js";

const sep = { sep: true };
const head = (text) => ({ head: text });
const date = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "");

export const MENU_IDS = ["culto", "musica", "midia", "ferramentas", "ajuda"];

// What only the desktop app can do (the preview in a browser cannot).
const DESKTOP_ONLY = "Só no aplicativo do computador";

// The source a song's automatic lyrics follow, in words.
const FOLLOW_WORD = { video: "o vídeo", audio: "o playback", clock: "o relógio ao vivo", time: "o tempo de cada slide" };

// Ferramentas › Conexões' sync item follows the cloud (cloudView's `act`):
// Entrar com Google with no account (or one to enter again), Tentar agora
// after a failure or offline, else Sincronizar agora; off while a pass the
// bar started runs, or when there is nothing it can do (entering in the
// browser, no sync on this computer).
function syncItem(sync, call) {
    const act = sync?.act || null;
    if (act === "signin") return { label: "Entrar com Google", icon: "cloud", title: "A conta Google da igreja: os computadores ficam iguais", onSelect: call("syncSignIn") };
    return {
        label: sync?.running ? "Sincronizando…" : act === "retry" ? "Tentar agora" : "Sincronizar agora", icon: "refresh",
        disabled: !act || Boolean(sync?.running),
        title: act ? "Envia o que mudou aqui e traz o que mudou nos outros computadores" : sync?.signing ? "Termine a entrada no navegador" : "Este computador não sincroniza · veja em Sincronização",
        onSelect: call("syncNow"),
    };
}

export function buildMenus(ctx) {
    const a = ctx.act || {};
    const call = (name, ...args) => () => a[name]?.(...args);
    const f = ctx.follow || null;
    const services = (ctx.services || []).slice(0, 12);

    // What every console shows (owner 2026-10-29, consoleSetlist.js): the
    // shared Setlist, or the culto the church activated — on every computer.
    const activeId = ctx.activeId || "";
    const unread = ctx.teamUnread || {};
    const culto = [
        head("No console · todos os computadores"),
        { label: "Setlist", icon: "list", checked: !activeId, title: "A setlist compartilhada, quando nenhum culto está ativo", onSelect: call("activate", null) },
        ...services.map((s) => ({ label: s.title || "Culto", kbd: date(s.date), checked: s.id === activeId, service: true, title: "Ativar este culto em todos os computadores", onSelect: call("activate", s.id) })),
        ...(activeId ? [{ label: "Encerrar o culto…", icon: "check", title: "Marca o culto como feito e todos voltam à Setlist", onSelect: call("endService") }] : []),
        sep,
        mi("planejar", { onSelect: call("planner", activeId || null) }),
        mi("novoCulto", { onSelect: call("planner", "new") }),
        { label: "Modelos de culto", icon: "copy", title: "Configurações › Culto", onSelect: call("settings", "culto") },
        { label: "Exportar a setlist em PDF", icon: "download", disabled: !ctx.serviceId || !ctx.itemsCount, title: ctx.serviceId ? undefined : "Escolha um culto primeiro", onSelect: call("exportPdf") },
        // The culto's team (owner 2026-11-09, Equipe = A): its tab in the
        // Painel, a gold dot while something came that was not seen there.
        sep,
        { label: "Pedidos da equipe", icon: "user", dot: unread.pedidos ? "pedidos novos" : undefined, title: "Os pedidos de louvor que a equipe manda pelo celular · aba Pedidos do Painel", onSelect: call("teamTab", "pedidos") },
        { label: "Chat da equipe", icon: "chat", dot: unread.chat ? "mensagens novas" : undefined, title: "A conversa com a equipe pelo celular · aba Chat do Painel", onSelect: call("teamTab", "chat") },
    ];

    const letra = f
        ? [
            { label: `Segue ${FOLLOW_WORD[f.source]}`, disabled: true },
            (f.source === "clock" || f.source === "time") && !f.clock
                ? { label: "Iniciar", icon: "play", disabled: ctx.locked, onSelect: call("follow", "start") }
                : f.paused
                    ? { label: "Retomar", icon: "play", disabled: ctx.locked, onSelect: call("follow", "resume") }
                    : { label: "Pausar", icon: "pause", disabled: ctx.locked, onSelect: call("follow", "pause") },
        ]
        : [{ label: "A música no ar não tem tempos marcados", disabled: true }];
    const musica = [
        mi("novaMusica", { onSelect: call("newSong") }),
        { label: "Buscar letras na internet…", icon: "search", onSelect: call("lyricsSearch") },
        // Importing (owner 2026-11-09, Importar = A): the Biblioteca's
        // Letras (+) doors, one click from the bar.
        sep,
        { label: "Importar músicas…", icon: "folder", title: "Arquivos de letra: Holyrics, OpenLyrics, ChordPro, cifra ou texto", onSelect: call("importFiles") },
        { label: "Importar uma pasta…", icon: "folder", onSelect: call("importFolder") },
        mi("abrirPacote", { title: "Um arquivo .keryx de outra igreja ou de outro computador: músicas, temas, avisos e mídias", onSelect: call("openPackage") }),
        sep,
        { label: "Sincronizar a música…", icon: "synced", disabled: !ctx.songId, title: ctx.songId ? "A música da Prévia, ou a que está no ar" : "Ponha uma música na Prévia ou no ar", onSelect: call("syncSong", ctx.songId) },
        { label: "Letra automática", icon: "music", sub: letra },
        sep,
        mi("temasEFundos", { title: "Configurações › Temas e fundos", onSelect: call("settings", "temas") }),
        // The Bíblia (owner 2026-11-09, Bíblia = A): its theme and its
        // editions, as Configurações › Bíblia e músicas keeps them together.
        sep,
        head("Bíblia"),
        { label: "Tema da Bíblia…", icon: "palette", title: "O tema das passagens · a passagem no ar muda na hora", onSelect: call("bibleTheme") },
        { label: "Escolher as Bíblias…", icon: "book", title: "As edições que este computador baixa", onSelect: call("bibleSetup") },
        { label: "Bíblias instaladas", icon: "book", title: "Configurações › Bíblia e músicas", onSelect: call("settings", "biblia") },
    ];

    const midia = [
        { label: "Mídia", icon: "media", onSelect: call("media") },
        mi("doComputador", { title: "Copia arquivos do computador para a Mídia", onSelect: call("media", "upload") }),
        mi("youtube", { onSelect: call("media", "youtube") }),
        mi("fundos", { title: "A biblioteca de fundos: imagens, vídeos, gerados e cores", onSelect: call("backgrounds") }),
        sep,
        { label: ctx.playing ? "Pausar o player" : "Tocar o player", icon: ctx.playing ? "pause" : "play", disabled: !ctx.playerOn, onSelect: call("playerToggle") },
    ];

    const timers = (ctx.timers || []).map((t) => ({ label: t.label, onSelect: call("timer", t.minutes) }));
    const ferramentas = [
        { label: "Avisos", icon: "megaphone", onSelect: call("notices") },
        mi("novoAviso", { onSelect: call("newNotice") }),
        mi("avisoRapido", { title: "Uma mensagem direto às telas", onSelect: call("quickAlert") }),
        mi("timers", { sub: timers.length ? timers : [{ label: "Nenhum timer", disabled: true }] }),
        sep,
        { label: "Escola bíblica", icon: "book", onSelect: call("school") },
        { label: "Relatórios", icon: "history", onSelect: call("reports") },
        // Conexões (owner 2026-11-09, Conexões = A): the phones and the sync
        // between the church's computers. Never Ajuda (learning, support).
        sep,
        head("Conexões"),
        { label: "KERYX no celular", icon: "tablet", title: "O Controle e a Equipe pelo celular: conectar um aparelho, os códigos · Configurações › Telas na rede", onSelect: call("settings", "rede") },
        syncItem(ctx.sync, call),
        { label: "Sincronização", icon: "cloud", title: "Configurações › Sincronização", onSelect: call("settings", "sincronizacao") },
    ];

    // Ajuda (Rodada M0): learning the console, checking it, and what support
    // asks for. Atualizar agora only while an update is due (its version, or
    // the percent while it comes down), else Verificar atualização.
    const u = ctx.update || null;
    const updateItem = hasUpdate(u)
        ? { label: u.status === "downloading" ? "Atualizando…" : "Atualizar agora", icon: "download", kbd: u.status === "downloading" ? `${u.percent}%` : u.version, onSelect: call("updateNow") }
        : { label: "Verificar atualização", icon: "refresh", disabled: !ctx.desktop || u?.status === "disabled" || u?.status === "checking",
            title: !ctx.desktop ? DESKTOP_ONLY : u?.status === "disabled" ? "Indisponível nesta instalação" : "Procura uma versão nova do KERYX", onSelect: call("updateCheck") };
    const ajuda = [
        { label: "Primeiros passos", icon: "steps", title: "O console em sete passos, para quem está começando", onSelect: call("firstSteps") },
        mi("atalhos", { kbd: ctx.helpKey || undefined, onSelect: call("shortcuts") }),
        { label: "Novidades", icon: "star", title: "O que mudou nas últimas versões", onSelect: call("whatsNew") },
        sep,
        { label: "Verificar tudo", icon: "check", title: "Telas, mídias e Bíblias antes do culto", onSelect: call("verify") },
        { label: "Salvar diagnóstico…", icon: "save", disabled: !ctx.desktop, title: ctx.desktop ? "Um .zip com os registros recentes, para enviar a quem dá suporte · sem músicas, mídias nem senhas" : DESKTOP_ONLY, onSelect: call("diagnostics") },
        // Works in the preview too: there it shows the address and the text to copy.
        mi("relatar", { title: "Conte o que aconteceu: o diagnóstico vai para Downloads e o e-mail ao suporte abre pronto", onSelect: call("report") }),
        { label: "Abrir a pasta de dados", icon: "folder", disabled: !ctx.desktop, title: ctx.desktop ? "Onde ficam o banco, as mídias e os registros deste computador" : DESKTOP_ONLY, onSelect: call("dataDir") },
        sep,
        updateItem,
        { label: "Sobre o KERYX", icon: "info", onSelect: call("settings", "sobre") },
    ];

    return [
        { id: "culto", label: "Culto", items: culto },
        { id: "musica", label: "Música", items: musica },
        { id: "midia", label: "Mídia", items: midia },
        { id: "ferramentas", label: "Ferramentas", items: ferramentas },
        { id: "ajuda", label: "Ajuda", items: ajuda },
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
                for (const s of it.sub) out.push({ title: s.label, ...s, indent: true });
            } else if (it.head != null) out.push({ ...it, minor: true }); // a group inside a menu (Bíblia, Conexões): under the menu's own head
            else out.push(it);
        }
        if (cut) out.splice(lastService + 1, 0, mi("planejar", { label: "Todos os cultos…", title: "Planejar o culto", onSelect: onAllServices }));
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

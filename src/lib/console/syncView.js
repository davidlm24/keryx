// Configurações › Sincronização: what the main process's status
// (electron/syncControl.cjs `status`) says, in the section's words. Pure.

// "há 12 s", "há 3 min", "há 2 horas", "ontem", "há 9 dias".
export function ago(iso, nowMs = Date.now()) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, Math.round((nowMs - t) / 1000));
    if (s < 60) return `há ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? "há 1 hora" : `há ${h} horas`;
    const d = Math.round(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
}

// Which part of the section shows: "unavailable" (no desktop: the browser
// preview), "folder" (choose it), "code" (make the church's code or type
// it), "on".
export function syncStep(st) {
    if (!st || st.available === false) return "unavailable";
    if (!st.folder) return "folder";
    if (!st.paired || st.keyLost || st.engine?.state === "mismatch" || st.engine?.state === "removed") return "code";
    return "on";
}

// -> { tone: "ok" | "wait" | "off", label, detail }: the Estado row.
export function syncState(st, nowMs = Date.now()) {
    const e = st?.engine || {};
    if (!st || st.available === false) return { tone: "off", label: "Desligada", detail: "" };
    if (!st.folder) return { tone: "off", label: "Desligada", detail: "" };
    if (st.paused) return { tone: "off", label: "Pausada", detail: "as mudanças deste computador esperam e vão quando ligar de novo" };
    if (st.keyLost) return { tone: "wait", label: "Digite o código da igreja de novo", detail: "a chave guardada não abre neste computador" };
    if (!st.paired) return { tone: "off", label: "Falta o código da igreja", detail: "" };
    switch (e.state) {
        case "ok": return { tone: "ok", label: "Em dia", detail: e.lastPass ? `última passagem ${ago(e.lastPass, nowMs)}` : "" };
        case "offline": return { tone: "wait", label: "Aguardando a pasta", detail: e.error || "a pasta não está disponível" };
        case "mismatch": return { tone: "wait", label: "O código da igreja mudou nesta pasta", detail: "digite o código novo; as mudanças deste computador esperam" };
        case "removed": return { tone: "wait", label: "Este computador foi tirado da sincronização", detail: "digite o código da igreja para voltar; as mudanças deste computador esperam" };
        case "error": return { tone: "wait", label: "Não sincronizou", detail: e.error || "" };
        default: return { tone: "off", label: "Começando…", detail: "" };
    }
}

// -> [{ pc, name, self, tone, detail, tag }]: this computer first, then the
// others as the folder shows them, the ones without the code flagged.
export function computerRows(st, nowMs = Date.now()) {
    if (!st) return [];
    const rows = [{ pc: st.pc, name: st.name || "Este computador", self: true, tone: "ok", detail: st.version ? `este computador · KERYX ${st.version}` : "este computador", tag: "este" }];
    for (const c of st.engine?.computers || []) {
        const bits = [];
        if (c.removed) {
            const by = c.removed.by === st.pc ? "por este computador" : "";
            rows.push({
                pc: c.pc,
                name: c.name || `Computador ${String(c.pc).slice(0, 4).toUpperCase()}`,
                self: false,
                tone: "off",
                detail: ["tirado", ago(c.removed.at, nowMs), by].filter(Boolean).join(" "),
                tag: "tirado",
                removed: true,
            });
            continue;
        }
        if (c.verified === false) {
            bits.push(c.rejected ? `${c.rejected} ${c.rejected === 1 ? "mudança ignorada" : "mudanças ignoradas"}` : "sem o código");
        } else {
            const when = c.lastChange || c.seen;
            if (when) bits.push(`${c.lastChange ? "escreveu" : "visto"} ${ago(when, nowMs)}`);
            if (c.version) bits.push(c.version);
        }
        const old = c.lastChange && nowMs - Date.parse(c.lastChange) > 7 * 86400000;
        rows.push({
            pc: c.pc,
            name: c.name || `Computador ${String(c.pc).slice(0, 4).toUpperCase()}`,
            self: false,
            tone: c.verified === false ? "wait" : old || c.verified == null ? "off" : "ok",
            detail: bits.join(" · "),
            tag: c.verified === false ? "sem o código" : c.verified ? "verificado" : "",
        });
    }
    return rows;
}

// "14 mudanças enviadas · 31 recebidas" since KERYX opened.
export function sinceLine(st) {
    const s = st?.since || {};
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    return `${n(s.sent || 0, "mudança enviada", "mudanças enviadas")} · ${n(s.applied || 0, "recebida", "recebidas")}`;
}

// Whether two answers of the status say the same (useSyncStatus): the poll
// asks every 4 s and the status changes only when a pass runs or an action
// answers, so an answer like the last one keeps the old object and wakes
// nobody. The status is plain data (it comes over IPC); a key order that
// differs counts as a change, which only costs one render.
export function sameSyncStatus(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

// "O que vai e o que fica" (Rodada G7, owner 2026-10-17/19): the two short
// lists the section shows before and while syncing, and the hints about the
// folder. What travels is every synced entity and the files its rows use
// (electron/db/syncScope.cjs, checked by the whole-church test in
// electron/sync.test.cjs); the screens' designs stay until Rodada G10.
export const SYNC_GOES = "Músicas, setlist e cultos, mídia e fundos, avisos, temas, Escola bíblica, o perfil da igreja e os arquivos de tudo isso.";
export const SYNC_STAYS = "As edições da Bíblia instaladas, os desenhos e ajustes das telas, a posição das saídas nos monitores e a disposição do console.";
// Worded so it does not hang on Drive's exact labels (they change between
// versions): mirrored files, or the folder kept offline, both mean the
// videos are on this computer before the service.
export const SYNC_MIRROR_HINT = "No Google Drive para computador, deixe os arquivos espelhados (Preferências › Pastas do Google Drive) ou a pasta do KERYX disponível off-line. Assim os vídeos já estão neste computador antes do culto.";
export const SYNC_SHARED_HINT = "Pasta que outra pessoa compartilhou com você: no site do Drive, em Compartilhados comigo, adicione um atalho dela ao seu Drive; só então ela aparece neste computador.";

// "NVI", "NVI e ACF", "NVI, ACF e AA" — with `article`, "a NVI e a ACF".
export function editionsList(names, article = false) {
    const words = names.map((n) => (article ? `a ${n}` : n));
    return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
}

// The Bible editions the church's other computers have and this one lacks
// (their computer.json, electron/sync.cjs; the text never travels). `here`:
// the editions installed on this computer. -> null when nothing is missing,
// else { elsewhere, missing, line } with the sentence Bíblia e músicas shows
// above its list ("Instalar aqui" downloads the missing ones).
export function biblesMissingHere(st, here) {
    const others = (st?.engine?.computers || []).filter((c) => !c.removed && c.verified !== false && Array.isArray(c.bibles) && c.bibles.length);
    if (!others.length) return null;
    const have = new Set((here || []).map((v) => String(v).toUpperCase()));
    const elsewhere = [...new Set(others.flatMap((c) => c.bibles))].sort();
    const missing = elsewhere.filter((v) => !have.has(v));
    if (!missing.length) return null;
    const where = others.length === 1 ? "no outro computador" : "nos outros computadores";
    const lack = `${missing.length === 1 ? "Falta" : "Faltam"} ${editionsList(missing, true)} aqui.`;
    return { elsewhere, missing, line: `Instaladas ${where}: ${editionsList(elsewhere)}. ${lack}` };
}

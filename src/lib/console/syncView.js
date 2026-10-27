// Configurações › Sincronização: what the main process's status
// (electron/syncControl.cjs `status`) says, in the section's words. Pure.
import { BIBLE_VERSIONS } from "../bibleBooks.js";

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
    // An edition of the church's own (installed from its file, not in the
    // list) never downloads: this computer needs the same file.
    const own = missing.filter((v) => !BIBLE_VERSIONS.some((x) => x.id === v));
    const ask = own.length ? ` ${own.length === 1 ? `A ${own[0]} é uma edição da igreja: instale-a` : `${editionsList(own)} são edições da igreja: instale-as`} com o mesmo arquivo, em Instalar uma edição própria…` : "";
    return { elsewhere, missing, own, line: `Instaladas ${where}: ${editionsList(elsewhere)}. ${lack}${ask}` };
}

// Configurações › Sincronização › Código da igreja, the group's summary while
// it is closed (Rodada H1): how many computers hold the code.
export function syncSummary(st) {
    const n = computerRows(st).filter((r) => !r.removed && r.tag !== "sem o código").length;
    return `${n} ${n === 1 ? "computador com o código" : "computadores com o código"}`;
}
// "O que vai e o que fica", closed: the two lists in a line.
export const SYNC_TRAVEL_SUMMARY = "Músicas, cultos e mídias vão · Bíblias, telas e disposição ficam";

// -- Google Drive direto, PR 3 (the owner's mockup "Sincronização · conta
// Google", 2026-10-26, marks G1–G5 = A) --------------------------------------
//
// The page and the top bar's cloud read the same status. The church's
// account is the way in; the folder is only what a computer that synced by
// it before still uses until someone enters there (G4 = A).

// Whether this computer syncs at all (the Biblioteca's "parece repetida",
// the PDF pages' backfill, the Bíblia's "Falta a NVI aqui").
export function syncsHere(st) {
    return Boolean(st && st.paired && (st.folder || st.store === "drive"));
}

const googleOf = (st) => st?.google || {};
// Google no longer takes the entry kept here: refused, sealed on another
// computer or Windows account, or the engine stopped on it.
const needsEntry = (st) => Boolean(googleOf(st).refused || googleOf(st).keyLost || st?.engine?.state === "auth");

// Which page Sincronização shows: "unavailable" (no desktop), "signing" (the
// browser is open on Google's page), "on" (the account, or its problems),
// "folder" (synced by the folder before: the banner, then the folder's
// rows) or "none" (Entrar com Google).
export function googlePage(st) {
    if (!st || st.available === false) return "unavailable";
    const g = googleOf(st);
    if (g.signingIn) return "signing";
    if (st.store === "drive" && (g.signedIn || needsEntry(st))) return "on";
    if (st.folder && st.store !== "drive") return "folder";
    return "none";
}

// "1,2 GB", "640 MB", "15 GB".
export function bytesLabel(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return "";
    const units = [["GB", 1e9], ["MB", 1e6], ["kB", 1e3]];
    for (const [u, size] of units) {
        if (v >= size) {
            const x = v / size;
            const text = x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(".", ",").replace(",0", "");
            return `${text} ${u}`;
        }
    }
    return `${Math.round(v)} bytes`;
}

// Above this share of the account the page and the cloud say the space is
// almost gone (board 4, C).
export const QUOTA_WARN = 0.9;

// Espaço da conta (G2 = A: always on screen). quota = googleStatus' { used,
// total, mine } (bytes; mine = the KERYX hidden folder): -> null while
// unknown, else the bar's two parts (in %) and the line under it.
export function quotaView(quota) {
    if (!quota || !Number.isFinite(Number(quota.used))) return null;
    const used = Math.max(0, Number(quota.used));
    const mine = Math.min(used, Math.max(0, Number(quota.mine) || 0));
    const total = Number(quota.total);
    if (!Number.isFinite(total) || total <= 0) {
        return { minePct: 0, otherPct: 0, warn: false, line: `O KERYX usa ${bytesLabel(mine)} · a conta não tem limite de espaço` };
    }
    const pct = (n) => Math.min(100, Math.round((n / total) * 1000) / 10);
    const free = Math.max(0, total - used);
    const warn = used / total >= QUOTA_WARN;
    return {
        minePct: pct(mine),
        otherPct: pct(used - mine),
        warn,
        line: `O KERYX usa ${bytesLabel(mine)} · o resto da conta (Gmail, Drive) usa ${bytesLabel(used - mine)} · ${bytesLabel(free)} livres de ${bytesLabel(total)}`,
        warnLine: warn ? `Restam ${bytesLabel(free)} de ${bytesLabel(total)}` : "",
    };
}
export const QUOTA_WARN_TEXT = "Vídeos novos podem parar de chegar aos outros computadores. Libere espaço na conta da igreja (Gmail, Drive) ou apague vídeos que não usa mais na Mídia.";

const changes = (n) => `${n} ${n === 1 ? "mudança" : "mudanças"}`;

// Andamento: -> { tone: "ok" | "wait" | "need" | "off", label, detail }.
// tone "need" = only someone here can fix it (enter again).
export function driveProgress(st, nowMs = Date.now()) {
    const e = st?.engine || {};
    const waiting = Number(st?.waiting) || 0;
    if (needsEntry(st)) return { tone: "need", label: "Parada", detail: `entre de novo com a conta da igreja${waiting ? ` · ${changes(waiting)} esperando` : ""}` };
    switch (e.state) {
        case "ok": {
            const sent = Number(st?.since?.sent) || 0;
            const bits = [e.lastOk || e.lastPass ? `última passagem ${ago(e.lastOk || e.lastPass, nowMs)}` : "", sent ? `${sent} ${sent === 1 ? "mudança enviada" : "mudanças enviadas"} desde que o KERYX abriu` : ""];
            return { tone: "ok", label: "Em dia", detail: bits.filter(Boolean).join(" · ") };
        }
        case "offline": return { tone: "wait", label: "Sem internet", detail: `${waiting ? `${changes(waiting)} esperando · ` : ""}tenta de novo sozinho` };
        case "removed": return { tone: "need", label: "Desconectado", detail: "entre de novo com a conta da igreja para voltar" };
        case "error": return { tone: "wait", label: "Não sincronizou", detail: e.error || "" };
        // Entered, but not yet joined with the account's key (Drive did not
        // answer the join, or the key changed there): the passes try again.
        case "unpaired":
        case "mismatch": return { tone: "wait", label: "Juntando com a conta", detail: "tenta de novo sozinho" };
        default: return { tone: "wait", label: "Começando…", detail: "" };
    }
}
export const OFFLINE_TEXT = "O culto não depende disso: tudo o que já está aqui funciona. Quando a internet voltar, o que mudou vai e vem.";

// A computer that has not synced for this long holds the cleanup of old
// files (electron/sync.cjs: every computer that counts must have read).
export const HOLD_DAYS = 14;

// Dispositivos conectados: this computer first, then the others. -> [{ pc,
// name, self, meta, stale, removed }].
export function deviceRows(st, nowMs = Date.now()) {
    if (!st) return [];
    const rows = [{ pc: st.pc, name: `${st.name || "Este computador"} (este computador)`, self: true, meta: [st.version ? `KERYX ${st.version}` : "", "agora"].filter(Boolean).join(" · "), stale: false, removed: false }];
    for (const c of st.engine?.computers || []) {
        if (c.verified === false) continue;
        const name = c.name || `Computador ${String(c.pc).slice(0, 4).toUpperCase()}`;
        if (c.removed) {
            rows.push({ pc: c.pc, name, self: false, meta: `${["desconectado", ago(c.removed.at, nowMs)].filter(Boolean).join(" ")} · volta quando alguém entrar nele com a conta`, stale: false, removed: true });
            continue;
        }
        const last = Math.max(Date.parse(c.seen || "") || 0, Date.parse(c.lastChange || "") || 0);
        const days = last ? (nowMs - last) / 86400000 : Infinity;
        if (days >= HOLD_DAYS) {
            const since = last ? `há ${Math.floor(days)} dias` : "faz tempo";
            rows.push({ pc: c.pc, name, self: false, meta: `sem sincronizar ${since} · segura a limpeza de arquivos antigos`, stale: true, removed: false });
            continue;
        }
        rows.push({ pc: c.pc, name, self: false, meta: [c.version ? `KERYX ${c.version}` : "", last ? `visto ${ago(new Date(last).toISOString(), nowMs)}` : ""].filter(Boolean).join(" · "), stale: false, removed: false });
    }
    return rows;
}

// What a file arriving is, by its name.
function fileKind(name) {
    const ext = String(name || "").toLowerCase().split(".").pop();
    if (["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext)) return "vídeo";
    if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "áudio";
    if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext)) return "imagem";
    if (ext === "pdf") return "apresentação";
    return "arquivo";
}

// The file coming now (status.arriving = { name, size, got }): its % or null.
export function arrivingPct(st) {
    const a = st?.arriving;
    if (!a || !(Number(a.size) > 0)) return null;
    return Math.max(0, Math.min(100, Math.floor((Number(a.got) / Number(a.size)) * 100)));
}

// The cloud's popover (board 6): -> { tone, label, when, text, act, rows }.
// act: "now" (Sincronizar agora), "retry" (Tentar agora), "signin" (Entrar
// com Google) or null; rows: [[label, value]], only for an account in step.
export function cloudView(st, nowMs = Date.now()) {
    const page = googlePage(st);
    const e = st?.engine || {};
    const waiting = Number(st?.waiting) || 0;
    if (page === "unavailable" || page === "none") return { tone: "off", label: "Sem conta", when: "", text: "Este computador não sincroniza. Entre com a conta Google da igreja para os computadores ficarem iguais.", act: page === "none" ? "signin" : null, rows: [] };
    if (page === "signing") return { tone: "wait", label: "Entrando…", when: "", text: "Termine a entrada no navegador: escolha a conta da igreja e permita o acesso à pasta do KERYX.", act: null, rows: [] };
    if (page === "folder") {
        const old = syncState(st, nowMs);
        return { tone: old.tone === "ok" ? "ok" : old.tone === "wait" ? "wait" : "off", label: old.label, when: "", text: "Pela pasta. A sincronização agora é pela conta Google: até entrar, este computador continua pela pasta.", act: "signin", rows: [] };
    }
    if (needsEntry(st)) return { tone: "need", label: "Entre de novo", when: "", text: "O Google não aceita mais a entrada deste computador. As mudanças daqui esperam.", act: "signin", rows: [] };
    if (e.state === "removed") return { tone: "need", label: "Desconectado", when: "", text: "Alguém desconectou este computador da sincronização. Nada foi apagado aqui. Para voltar, entre de novo com a conta da igreja.", act: "signin", rows: [] };
    if (e.state === "offline") return { tone: "wait", label: "Sem internet", when: "", text: `${waiting ? `${changes(waiting)} esperando. ` : ""}Tudo aqui funciona; ${waiting ? "elas vão" : "o que mudar vai"} quando a internet voltar.`, act: "retry", rows: [] };
    const prog = driveProgress(st, nowMs);
    const others = deviceRows(st, nowMs).filter((r) => !r.self && !r.removed);
    const late = others.filter((r) => r.stale)[0] || null;
    const pct = arrivingPct(st);
    const missing = Number(e.missingMedia) || 0;
    const coming = pct != null
        ? `${missing > 1 ? `${missing} arquivos` : `1 ${fileKind(st.arriving.name)}`} · ${pct} %`
        : missing ? `${missing} ${missing === 1 ? "arquivo" : "arquivos"}` : "nada";
    const rows = [
        ["Conta", googleOf(st).email || "—"],
        ["Internet", "conectado"],
        ["Esperando", waiting ? changes(waiting) : "nada a enviar"],
        ["Chegando", coming],
        ["Computadores", `${others.length + 1}${late ? ` · ${late.name} sem sincronizar` : ""}`],
    ];
    return { tone: prog.tone, label: prog.label, when: e.lastOk || e.lastPass ? ago(e.lastOk || e.lastPass, nowMs) : "", text: e.state === "error" ? prog.detail : "", act: e.state === "error" ? "retry" : "now", rows };
}

// The cloud's dot (G5 = A: always in the bar, grey with no account): green
// in step, amber waiting or without internet, red when someone here must act.
export function cloudTone(st) {
    return cloudView(st).tone;
}

// The problems the page shows above its rows (board 4), in this order:
// "auth" (A), "removed" (D), "account" (E, until É esta mesmo for that
// e-mail), "space" (C). Sem internet (B) is the Andamento row itself.
export function pageProblems(st, quota, keptEmail = "") {
    const out = [];
    if (googlePage(st) !== "on") return out;
    if (needsEntry(st)) out.push("auth");
    else if (st.engine?.state === "removed") out.push("removed");
    const email = String(googleOf(st).email || "");
    if (st.accountNew && email && email.toLowerCase() !== String(keptEmail || "").toLowerCase()) out.push("account");
    if (quotaView(quota)?.warn) out.push("space");
    return out;
}

// G1 = A: a computer that joins with songs merges at once, then one toast
// says how many came and how many went. pending = { at, before, email } kept
// when the entry finished (before = the songs here then). -> null (not yet:
// the first passes are still bringing rows), "drop" (nothing to say, or too
// late) or the sentence.
export const JOIN_WAIT_MS = 3 * 60 * 1000;
export function joinNote(pending, st, songsNow, nowMs = Date.now()) {
    if (!pending) return null;
    const at = Date.parse(pending.at || "");
    if (!Number.isFinite(at) || nowMs - at > 30 * 60 * 1000) return "drop";
    const e = st?.engine || {};
    const passed = e.state === "ok" && Date.parse(e.lastOk || e.lastPass || "") > at;
    const quiet = passed && !(Number(e.received?.applied) > 0);
    if (!quiet && nowMs - at < JOIN_WAIT_MS) return null;
    if (!passed) return null;
    const before = Math.max(0, Number(pending.before) || 0);
    const came = Math.max(0, (Number(songsNow) || 0) - before);
    if (!came && !before) return "drop";
    const n = (v) => `${v} ${v === 1 ? "música" : "músicas"}`;
    if (!came) return `Juntou com a conta da igreja: ${n(before)} ${before === 1 ? "foi" : "foram"} daqui.`;
    if (!before) return `Juntou com a conta da igreja: ${n(came)} ${came === 1 ? "veio" : "vieram"}.`;
    return `Juntou com a conta da igreja: ${n(came)} ${came === 1 ? "veio" : "vieram"} e ${before} ${before === 1 ? "foi" : "foram"} daqui.`;
}

// O que vai e o que fica, the Google page's one line each (board 1).
export const GOOGLE_GOES = "Vão: músicas, cultos, setlists, temas, fundos, mídia, avisos, Escola, pedidos.";
export const GOOGLE_STAYS = "Ficam aqui: as Bíblias instaladas, as telas e saídas, a disposição do console.";
export const GOOGLE_TRAVEL_SUMMARY = "músicas, cultos, mídia vão; Bíblias e telas ficam";

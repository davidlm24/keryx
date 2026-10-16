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
    if (!st.paired || st.keyLost || st.engine?.state === "mismatch") return "code";
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

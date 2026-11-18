// Configurações › Conexões › GERAR in pt-BR (owner 2026-11-18, mockup
// "KERYX · GERAR na mesa", D1–D7 = A), from the status of the main process
// (electron/gerarLink.cjs `status()`): which page to draw, the lines, the
// words of a refused code, the menu's dot. Pure, tested.

// "unconfigured" | "off" | "connecting" | "needs" | "on" | "offline"
export function gerarPage(st) {
    if (!st) return "off";
    if (!st.configured) return "unconfigured";
    if (st.state === "connecting") return "connecting";
    if (!st.device) return "off";
    if (st.state === "needs") return "needs";
    if (st.state === "on") return "on";
    return "offline";
}

// "há 12 s", "há 3 min", "há 2 h", "há 4 dias".
export function agoWords(iso, now = Date.now()) {
    const at = Date.parse(iso || "");
    if (!Number.isFinite(at)) return "";
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 60) return `há ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

// The account line: who this computer is in the GERAR, and when it last
// answered.
export function gerarWho(st, now = Date.now()) {
    const name = st?.device?.name ? `Este computador é “${st.device.name}” no GERAR` : "Este computador está conectado ao GERAR";
    const seen = agoWords(st?.lastSeen, now);
    return seen ? `${name} · último contato ${seen}` : name;
}

// The state beside the name: words and a dot (ok | wait | need | off).
export function gerarBadge(page) {
    switch (page) {
        case "on": return { dot: "ok", words: "conectado" };
        case "offline": return { dot: "wait", words: "sem contato com o GERAR" };
        case "needs": return { dot: "need", words: "precisa de você" };
        case "connecting": return { dot: "wait", words: "conectando…" };
        default: return { dot: "off", words: "não conectado" };
    }
}

// Andamento, until the requests come (the next wave): the heartbeat.
export function gerarProgress(st, now = Date.now()) {
    const page = gerarPage(st);
    const n = Number(st?.pending) || 0;
    const waiting = n ? ` · ${n === 1 ? "1 resposta esperando" : `${n} respostas esperando`} para subir` : "";
    if (page === "offline") return { tone: "wait", line: `Sem contato com o GERAR${waiting || " · o KERYX tenta de novo sozinho"}` };
    const seen = agoWords(st?.lastSeen, now);
    return { tone: n ? "wait" : "ok", line: `${n ? "Subindo" : "Em dia"}${seen ? ` · último contato ${seen}` : ""}${waiting}` };
}

// Why "precisa de você" (the page's text under its title).
export function needsWords(st) {
    const reason = st?.needs?.reason;
    if (reason === "revoked") return "Um administrador desconectou este computador no GERAR. Os pedidos e o chat do GERAR não chegam mais aqui. Peça um código novo e conecte de novo. O que já chegou continua no Painel.";
    return "O GERAR não aceita mais a sessão deste computador. Os pedidos e o chat do GERAR não chegam mais aqui. Peça um código novo a um administrador do GERAR e conecte de novo. O que já chegou continua no Painel.";
}

// A refused Conectar: how the line under the field looks.
export function linkErrorTone(code) {
    return code === "offline" || code === "rate" ? "warn" : "need";
}

// The bar's Ferramentas › Conexões › GERAR: a red dot while it needs you
// (D4 = A), the state in its tooltip.
export function gerarMenuItem(st) {
    const page = gerarPage(st);
    if (page === "unconfigured") return null;
    const needs = page === "needs";
    return {
        dot: needs ? "precisa de você" : undefined,
        dotKind: needs ? "danger" : undefined,
        title: needs
            ? "O GERAR desconectou este computador · Configurações › Conexões"
            : page === "off" ? "Conectar este computador aos pedidos e ao chat dos cultos do GERAR · Configurações › Conexões"
                : "Os pedidos e o chat dos cultos do GERAR · Configurações › Conexões",
    };
}

// The group's one-line summary in the search and the menu.
export function gerarSummary(st) {
    const page = gerarPage(st);
    if (page === "unconfigured") return "não preparado";
    if (page === "off") return "não conectado";
    const name = st?.device?.name;
    const where = name ? `“${name}”` : "conectado";
    if (page === "needs") return `${where} · precisa de você`;
    if (page === "offline") return `${where} · sem contato`;
    return `${where} · ${st.receive ? "recebe os pedidos aqui" : "não recebe aqui"}`;
}

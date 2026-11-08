// The connection of a screen on the church network to the KERYX computer
// (the event stream of electron/lan.cjs), as a phase the page can show:
//   "connecting"   never connected yet (the first attempts)
//   "open"         connected; the screen follows the console
//   "reconnecting" it was connected and lost the link; `attempt` counts tries
// A pure reducer, so the rules are tested without a server
// (connection.test.mjs); src/api/backends/network.js feeds it the stream's
// open/error events.

export const initialConnection = { phase: "connecting", attempt: 0, everOpen: false };

export function nextConnection(state, event) {
    const s = state || initialConnection;
    if (event === "open") return { phase: "open", attempt: 0, everOpen: true };
    if (event === "error") {
        // Each error is one failed try; while it was never open it is still
        // the first connection, afterwards it is a reconnection.
        return { phase: s.everOpen ? "reconnecting" : "connecting", attempt: s.phase === "open" ? 1 : s.attempt + 1, everOpen: s.everOpen };
    }
    return s;
}

// What a screen says about its connection, in pt-BR, or null when there is
// nothing to say (connected). Design-system wording: "Reconectando…
// tentativa 2". After a few failed first tries the hint names the usual cause.
export function connectionText(state) {
    const s = state || initialConnection;
    if (s.phase === "open") return null;
    if (s.phase === "reconnecting") return { title: `Reconectando… tentativa ${Math.max(1, s.attempt)}`, hint: s.attempt >= 3 ? "Confira se o computador do KERYX está ligado e na mesma rede." : "" };
    return { title: "Conectando ao KERYX…", hint: s.attempt >= 3 ? "Confira se o computador do KERYX está ligado e na mesma rede." : "" };
}

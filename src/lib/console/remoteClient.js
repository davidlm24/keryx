// The phone's side of the controle remoto: one command to the KERYX
// computer (POST /api/remote, electron/lan.cjs), its answer in plain words.
// Version 2 of the contract (shared/remoteProtocol.json). A command is sent
// once: never again by itself, whatever happens (a 504 or a lost link means
// the outcome is unknown, and the phone says so). fetchImpl is injectable
// for the tests.
//   -> { ok, status, code, message, result, signedOut, off, closed, unknown, update }
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };

const { limits, messages } = PROTOCOL;
const isRead = (action) => PROTOCOL.actions[action]?.kind === "R";
// How long the phone waits before it says it does not know: the server's own
// wait, plus the Wi-Fi's.
const waitFor = (action) => (limits.slowActions.includes(action) ? limits.slowTimeoutMs : limits.timeoutMs) + 4000;

export async function remoteCall(action, args = {}, fetchImpl = globalThis.fetch) {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), waitFor(action)) : null;
    let res;
    try {
        res = await fetchImpl("/api/remote", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json", "x-keryx": "1" },
            body: JSON.stringify({ v: PROTOCOL.version, action, args }),
            signal: ac?.signal,
        });
    } catch {
        clearTimeout(timer);
        // A read lost is only a read; a command may have reached the console.
        if (isRead(action)) return { ok: false, status: 0, message: "Sem conexão com o computador do KERYX. Confira o Wi-Fi." };
        return { ok: false, status: 0, unknown: true, message: messages.unknownOutcome };
    }
    clearTimeout(timer);
    let body = {};
    try { body = await res.json(); } catch { /* an empty or broken answer */ }
    if (res.ok) return { ok: true, status: res.status, message: body?.data?.message || "", result: body?.data?.result };
    const message = body?.error?.message || "Não foi possível.";
    const code = body?.error?.code;
    const out = { ok: false, status: res.status, message, ...(code ? { code } : {}) };
    if (res.status === 401) return { ...out, signedOut: true, message: "Digite o código do controle remoto de novo." };
    // 404 with no code: the remote itself is off (a 404 with not_found is an item).
    if (res.status === 404 && !code) return { ...out, off: true, message: "O controle remoto foi desligado no computador do KERYX." };
    if (res.status === 503 && message === messages.consoleClosed) return { ...out, closed: true };
    if (res.status === 504) return { ...out, unknown: true, message: messages.unknownOutcome };
    // An action this computer's KERYX does not know: an older version.
    if (res.status === 400 && /desconhecido/i.test(message)) return { ...out, update: true, message: messages.updateApp };
    return out;
}

// How long Encerrar tudo must be held (a touch by accident never ends).
export const HOLD_MS = 1500;
// Destravar as telas, Liberar os toques: held one second.
export const UNLOCK_HOLD_MS = 1000;

// Configurações › Sincronização in the browser preview (dev only): there is
// no main process and never a Google sign-in here, so the sync answers from
// made-up states, one per board of the mockup "Sincronização · conta
// Google" (Drive direto, PR 3). The state is localStorage
// `keryx.preview.sync`; Entrar com Google pretends the browser for a few
// seconds (Cancelar works), Sair goes back to no account. To look at one:
//   localStorage.setItem("keryx.preview.sync", "sem-internet")
// (the page follows at the next poll, every 4 s).

const KEY = "keryx.preview.sync";
export const PREVIEW_SYNC_STATES = ["sem-conta", "entrando", "em-dia", "chegando", "sem-internet", "entre-de-novo", "cheio", "desconectado", "conta-nova", "pasta"];

const GB = 1e9;
let born = Date.now();
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const removed = new Set();

const read = () => {
    try {
        const v = localStorage.getItem(KEY);
        return PREVIEW_SYNC_STATES.includes(v) ? v : "sem-conta";
    } catch {
        return "sem-conta";
    }
};
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private window */ } };

function computers() {
    const list = [
        { pc: "b2", name: "NOTEBOOK-PASTOR", version: "0.2.22", seen: iso(2 * 3600000), lastChange: iso(2 * 3600000), verified: true, rejected: 0, bibles: ["NVI", "ACF"] },
        { pc: "c3", name: "PC-RECEPCAO", version: "0.2.21", seen: iso(41 * 86400000), lastChange: iso(41 * 86400000), verified: true, rejected: 0, bibles: ["NVI"] },
    ];
    return list.map((c) => (removed.has(c.pc) ? { ...c, removed: { at: iso(60000), by: "a1" } } : c));
}

function status(state = read()) {
    const base = { available: true, preview: true, pc: "a1", name: "PC-LOUVOR", version: "0.2.22", paused: false, keyLost: false, canShowCode: false, joinedAt: null, waiting: 0, arriving: null, since: { sent: 12, applied: 31, skipped: 0, failed: 0, rejected: 0, collected: 0 } };
    const google = { signedIn: true, email: "igreja@exemplo.com", refused: false, keyLost: false, signingIn: false, configured: true };
    const ok = { state: "ok", lastPass: new Date(born - 40000).toISOString(), lastOk: new Date(born - 40000).toISOString(), received: { applied: 0 }, missingMedia: 0, computers: computers() };
    const drive = { ...base, store: "drive", folder: null, paired: true, google, engine: ok };
    switch (state) {
        case "entrando": return { ...base, store: "folder", folder: null, paired: false, google: { ...google, signedIn: false, email: null, signingIn: true }, engine: { state: "off" } };
        case "em-dia": return drive;
        case "chegando": return { ...drive, arriving: { name: "batismo-2026.mp4", size: 200e6, got: 128e6 }, engine: { ...ok, missingMedia: 1 } };
        case "sem-internet": return { ...drive, waiting: 7, engine: { ...ok, state: "offline", error: "O Google Drive não respondeu." } };
        case "entre-de-novo": return { ...drive, waiting: 3, google: { ...google, signedIn: false, refused: true }, engine: { ...ok, state: "auth", error: "Entre de novo com a conta da igreja." } };
        case "cheio": return drive;
        case "desconectado": return { ...drive, engine: { ...ok, state: "removed", removed: { at: iso(3600000), by: "b2" } } };
        case "conta-nova": return { ...drive, accountNew: true, google: { ...google, email: "pessoal@gmail.com" }, engine: { ...ok, computers: [] } };
        case "pasta": return { ...base, store: "folder", folder: "G:\\Meu Drive\\KERYX", paired: true, canShowCode: true, google: { ...google, signedIn: false, email: null }, engine: { ...ok, computers: computers() } };
        default: return { ...base, store: "folder", folder: null, paired: false, google: { ...google, signedIn: false, email: null }, engine: { state: "off", folder: null } };
    }
}

function quota(state = read()) {
    if (state === "cheio") return { used: 14 * GB, total: 15 * GB, mine: 3.3 * GB };
    return { used: 6.6 * GB, total: 15 * GB, mine: 1.2 * GB };
}

// Entrar com Google: "entrando" for a few seconds, then the account.
let pending = null;
function signIn() {
    const was = read();
    write("entrando");
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            pending = null;
            born = Date.now() + 2000;
            write("em-dia");
            resolve({ data: { ...status(), google: { ...status().google, quota: quota() } } });
        }, 5000);
        pending = () => {
            clearTimeout(timer);
            pending = null;
            write(was);
            resolve({ error: { message: "Entrada cancelada.", status: 400, code: "canceled" } });
        };
    });
}

export async function previewSyncCall(op, args = {}) {
    switch (op) {
        case "status": return { data: status() };
        case "googleStatus": {
            const st = status();
            return { data: { available: true, ...st.google, quota: st.store === "drive" && st.google.signedIn ? quota() : null } };
        }
        case "googleSignIn": return signIn();
        case "googleCancel":
            if (pending) pending();
            return { data: status() };
        case "googleReopen": return { data: true };
        case "googleSignOut": write("sem-conta"); return { data: { ...status(), revoked: true } };
        case "useDrive": return { data: status() };
        case "now": return { data: status() };
        case "remove": removed.add(String(args.pc)); return { data: status() };
        case "restore": removed.delete(String(args.pc)); return { data: status() };
        case "inspect": return { data: null };
        default: return { error: { message: "Disponível no aplicativo do computador.", status: 501 } };
    }
}

// Configurações › Conexões › GERAR in the browser preview (dev only): there is
// no main process and never a real GERAR here, so the GERAR answers from
// made-up states, one per board of the mockup "KERYX · GERAR na mesa"
// (2026-11-18). The state is localStorage `keryx.preview.gerar`:
//   localStorage.setItem("keryx.preview.gerar", "precisa")
// Conectar takes any code of the right shape ("RECUSA" in it = refused,
// "SEMNET" = no internet), Desconectar goes back to off.

const KEY = "keryx.preview.gerar";
export const PREVIEW_GERAR_STATES = ["sem-conexao", "conectado", "sem-contato", "precisa", "nao-preparado"];

const read = () => {
    try {
        const v = localStorage.getItem(KEY);
        return PREVIEW_GERAR_STATES.includes(v) ? v : "sem-conexao";
    } catch {
        return "sem-conexao";
    }
};
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private window */ } };
let receive = true;
const listeners = new Set();
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

function status(state = read()) {
    const device = { id: "preview-device", name: "PC do som" };
    const base = { configured: true, device: null, receive, linkedAt: null, lastSeen: null, needs: null, error: null, safe: true, preview: true };
    switch (state) {
        case "nao-preparado": return { ...base, configured: false, state: "off" };
        case "conectado": return { ...base, state: "on", device, linkedAt: ago(86400), lastSeen: ago(12) };
        case "sem-contato": return { ...base, state: "offline", device, linkedAt: ago(86400), lastSeen: ago(1800) };
        case "precisa": return { ...base, state: "needs", device, linkedAt: ago(86400), lastSeen: ago(7200), needs: { reason: "revoked", at: ago(600) } };
        default: return { ...base, state: "off" };
    }
}
const told = () => { const s = status(); for (const l of listeners) l(s); };
const fail = (message, status, code) => ({ error: { message, status, code } });

export function previewGerarOnStatus(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export async function previewGerarCall(op, args = {}) {
    switch (op) {
        case "status": return { data: status() };
        case "link": {
            const code = String(args.code || "").toUpperCase().replace(/\s+/g, "");
            await new Promise((r) => setTimeout(r, 900));
            if (code.includes("SEMNET")) return fail("Sem internet agora. O código continua valendo até vencer.", 503, "offline");
            if (code.includes("RECUSA")) return fail("Código inválido ou vencido. Peça outro no GERAR.", 401, "invalid");
            if (!/^[A-Z2-9]{3}-?[A-Z2-9]{3}$/.test(code)) return fail("Digite o código de 6 letras e números que o GERAR mostrou.", 400, "invalid");
            receive = true;
            write("conectado");
            told();
            return { data: status() };
        }
        case "forget": write("sem-conexao"); told(); return { data: status() };
        case "setReceive": receive = Boolean(args.on); told(); return { data: status() };
        case "check": return { data: status() };
        case "push": return { data: { queued: read() === "conectado" } };
        default: return fail(`Operação desconhecida: ${op}.`, 400);
    }
}

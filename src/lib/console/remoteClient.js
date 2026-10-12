// The phone's side of the controle remoto: one command to the KERYX
// computer (POST /api/remote, electron/lan.cjs), its answer in plain words.
// fetchImpl is injectable for the tests.
//   -> { ok, message, result, status, signedOut }
export async function remoteCall(action, args = {}, fetchImpl = globalThis.fetch) {
    let res;
    try {
        res = await fetchImpl("/api/remote", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json", "x-keryx": "1" },
            body: JSON.stringify({ action, args }),
        });
    } catch {
        return { ok: false, status: 0, message: "Sem conexão com o computador do KERYX. Confira o Wi-Fi." };
    }
    let body = {};
    try { body = await res.json(); } catch { /* an empty or broken answer */ }
    if (res.ok) return { ok: true, status: res.status, message: body?.data?.message || "", result: body?.data?.result };
    const message = body?.error?.message || "Não foi possível.";
    if (res.status === 401) return { ok: false, status: 401, signedOut: true, message: "Digite o código do controle remoto de novo." };
    if (res.status === 404) return { ok: false, status: 404, message: body?.error?.status === 404 && /desligado/i.test(message) ? "O controle remoto foi desligado no computador do KERYX." : message };
    return { ok: false, status: res.status, message };
}

// How long Encerrar tudo must be held (a touch by accident never ends).
export const HOLD_MS = 1500;

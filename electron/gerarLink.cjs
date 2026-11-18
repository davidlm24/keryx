// The GERAR on this computer (owner 2026-11-18, "a mesa do culto"; the
// mockup "KERYX · GERAR na mesa", D1–D7 = A; the contract is the GERAR's C7:
// keryx-link, touch_keryx_device, the device's RLS). This first wave is the
// device's session and its state; the requests and the chat come in the next.
//
// The computer is a DEVICE of the GERAR, never a person: an administrator
// makes a one-time code there (it names the computer), this computer trades
// it for a session at the Edge Function keryx-link and keeps only the
// refresh token, sealed with the system's protection (safeStorage, as the
// Google token: googleAuth.cjs); the access token lives in memory.
//
// Everything here goes OUT (fetch); nothing listens. States:
//   off        no session here (never connected, or forgotten)
//   connecting a code is being traded
//   on         the GERAR answered the last touch
//   offline    the GERAR could not be reached (tried again on a backoff)
//   needs      "precisa de você": the GERAR refused the session
//              (invalid_grant) or this device (42501 from touch_keryx_device,
//              an administrator disconnected it there: the refresh may still
//              work, so the 42501 is the sign). NOTHING is tried again until
//              a new code (no loop); the bell says so once (D4 = A).
//
// settings.json "gerar" (this computer's, never synced):
//   { device: { id, name }, refresh: <sealed>, receive, linkedAt, lastSeen,
//     needs: { reason, at } | null, noticed }

const KEY = "gerar";
const BELL = "gerar";
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}-?[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}$/;
// The heartbeat (touch_keryx_device keeps last_seen_at for the GERAR's admin).
const TOUCH_MS = 5 * 60 * 1000;
// Unreachable: tried again on this backoff, never faster.
const RETRY_MS = [15000, 30000, 60000, 120000, 300000];
const TIMEOUT_MS = 20000;
// The access token is renewed this long before it ends.
const EARLY_MS = 60 * 1000;

const fail = (message, status = 400, code = "") => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

// "k7m4qx", " K7M-4QX " → "K7M-4QX"; anything else → null.
function normalizeCode(value) {
    if (typeof value !== "string") return null;
    const code = value.trim().toUpperCase().replace(/\s+/g, "");
    if (!CODE_RE.test(code)) return null;
    const plain = code.replace("-", "");
    return `${plain.slice(0, 3)}-${plain.slice(3)}`;
}

// When a JWT ends (ms), from its own `exp`; 0 when it cannot be read.
function tokenExpiry(token) {
    try {
        const part = String(token).split(".")[1];
        const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        return Number.isFinite(json.exp) ? json.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

// GoTrue's answer to a refresh that will never work again (the session was
// ended, the token used twice, the user removed).
function refusedRefresh(status, body) {
    if (status !== 400 && status !== 401 && status !== 403) return false;
    const code = String((body && (body.error_code || body.code || body.error)) || "");
    return /invalid_grant|refresh_token_not_found|refresh_token_already_used|session_not_found|session_expired|user_not_found|user_banned/.test(code);
}

function createGerarLink({ settings, protect, config, fetchImpl = globalThis.fetch, notify = null, dismiss = null, log = console.warn, now = () => Date.now(), timers = { setTimeout, clearTimeout }, onStatus = null }) {
    const read = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const write = (patch) => {
        const next = { ...read(), ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        settings.set(KEY, Object.keys(next).length ? next : null);
    };

    let state = read().refresh ? (read().needs ? "needs" : "offline") : "off";
    let access = null; // { token, until }
    let refreshing = null;
    let timer = null;
    let tries = 0;
    let lastError = "";
    let stopped = false;

    const told = () => { if (onStatus) try { onStatus(status()); } catch { /* the page asks again */ } };
    const setState = (next, error = "") => {
        const changed = next !== state || error !== lastError;
        state = next;
        lastError = error;
        if (changed) told();
    };

    function status() {
        const c = read();
        return {
            configured: Boolean(config && config.configured),
            state,
            device: c.device || null,
            receive: c.device ? c.receive !== false : true,
            linkedAt: c.linkedAt || null,
            lastSeen: c.lastSeen || null,
            needs: state === "needs" ? (c.needs || { reason: "session" }) : null,
            error: lastError || null,
            safe: Boolean(protect && protect.safe && protect.safe()),
        };
    }

    const schedule = (ms) => {
        if (timer) timers.clearTimeout(timer);
        timer = stopped ? null : timers.setTimeout(() => { timer = null; return beat(); }, ms);
    };
    const stopTimer = () => { if (timer) timers.clearTimeout(timer); timer = null; };

    async function request(url, init) {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const t = ctrl ? timers.setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
        try {
            const res = await fetchImpl(url, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}) });
            let body = null;
            try { body = await res.json(); } catch { /* no body */ }
            return { status: res.status, body };
        } finally {
            if (t) timers.clearTimeout(t);
        }
    }

    // "Precisa de você": the GERAR said no. Kept in settings so a restart
    // does not ask again (no loop); the bell says it once.
    function needs(reason) {
        access = null;
        stopTimer();
        const c = read();
        const first = !c.needs;
        write({ needs: { reason, at: new Date(now()).toISOString() } });
        setState("needs");
        if (first && notify && !c.noticed) {
            notify({
                key: BELL,
                kind: "warn",
                title: "O GERAR desconectou este computador",
                body: "Os pedidos e o chat do GERAR não chegam mais aqui. Veja em Configurações › Conexões.",
                action: "settings:conexoes",
            });
            write({ noticed: true });
        }
    }

    const unreachable = (err) => {
        setState("offline", err ? "unreachable" : "");
        const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)];
        tries += 1;
        schedule(wait);
    };

    // A valid access token, renewing it from the sealed refresh token (one at
    // a time: the GERAR rotates the refresh token, two at once would spend it).
    async function token() {
        if (access && access.until - EARLY_MS > now()) return access.token;
        if (refreshing) return refreshing;
        refreshing = (async () => {
            const c = read();
            const refresh = c.refresh ? protect.open(c.refresh) : null;
            if (!refresh) { needs("session"); throw fail("Sem sessão do GERAR neste computador.", 401, "needs"); }
            let res;
            try {
                res = await request(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
                    method: "POST",
                    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refresh }),
                });
            } catch {
                throw fail("O GERAR não respondeu.", 503, "offline");
            }
            if (res.status === 200 && res.body && res.body.access_token && res.body.refresh_token) {
                write({ refresh: protect.seal(res.body.refresh_token) });
                const until = tokenExpiry(res.body.access_token) || now() + (Number(res.body.expires_in) || 3600) * 1000;
                access = { token: res.body.access_token, until };
                return access.token;
            }
            if (refusedRefresh(res.status, res.body)) { needs("session"); throw fail("O GERAR recusou a sessão deste computador.", 401, "needs"); }
            throw fail("O GERAR não respondeu.", res.status >= 500 ? 503 : res.status || 503, "offline");
        })();
        try {
            return await refreshing;
        } finally {
            refreshing = null;
        }
    }

    // A PostgREST call as the device: `path` under /rest/v1/ (a table with
    // its query, or rpc/<name>), `body` for POST/PATCH, `prefer` its Prefer
    // header. A 401 with an expired JWT renews once. A refusal carries the
    // Postgres code as `pg` (42501, 23505, 40001…).
    async function rest(method, path, { body, prefer } = {}, retried = false) {
        const bearer = await token();
        let res;
        try {
            res = await request(`${config.url}/rest/v1/${path}`, {
                method,
                headers: { apikey: config.anonKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        } catch {
            throw fail("O GERAR não respondeu.", 503, "offline");
        }
        if (res.status >= 200 && res.status < 300) return res.body;
        const code = String((res.body && res.body.code) || "");
        if (res.status === 401 && !retried && /PGRST30[13]|jwt/i.test(`${code} ${res.body && res.body.message}`)) {
            access = null;
            return rest(method, path, { body, prefer }, true);
        }
        const err = fail((res.body && res.body.message) || "O GERAR recusou o pedido.", res.status, code || "http");
        err.pg = code;
        throw err;
    }
    const rpc = (name, args = {}) => rest("POST", `rpc/${name}`, { body: args });

    // touch_keryx_device: the sign of life, and THE test of revocation.
    async function touch() {
        try {
            const seen = await rpc("touch_keryx_device", {});
            tries = 0;
            write({ lastSeen: typeof seen === "string" ? seen : new Date(now()).toISOString() });
            setState("on");
            if (dismiss) dismiss(BELL);
            schedule(TOUCH_MS);
            return true;
        } catch (err) {
            if (err.code === "needs") return false;
            if (err.pg === "42501") { needs("revoked"); return false; }
            if (err.code === "offline" || err.status >= 500) { unreachable(err); return false; }
            log(`[gerar] touch: ${err.status} ${err.pg || ""} ${err.message}`);
            unreachable(err);
            return false;
        }
    }

    function beat() {
        if (stopped) return Promise.resolve(false);
        const c = read();
        if (!c.refresh || c.needs || !config.configured) return Promise.resolve(false);
        return touch();
    }

    const ops = {
        status: () => status(),
        // Trade the GERAR's one-time code for this computer's session.
        async link({ code } = {}) {
            if (!config.configured) throw fail("Este KERYX não foi preparado para o GERAR.", 409, "unconfigured");
            const normalized = normalizeCode(code);
            if (!normalized) throw fail("Digite o código de 6 letras e números que o GERAR mostrou.", 400, "invalid");
            if (!protect.safe()) throw fail("Este computador não protege a sessão do GERAR (sem a proteção do Windows).", 409, "unsafe");
            stopTimer();
            setState("connecting");
            let res;
            try {
                res = await request(config.linkUrl, {
                    method: "POST",
                    headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ code: normalized }),
                });
            } catch {
                restoreAfterFailedLink();
                throw fail("Sem internet agora. O código continua valendo até vencer.", 503, "offline");
            }
            const b = res.body || {};
            if (res.status === 200 && b.ok && b.refresh_token && b.access_token && b.device_id) {
                access = { token: b.access_token, until: tokenExpiry(b.access_token) || now() + 3600 * 1000 };
                const at = new Date(now()).toISOString();
                settings.set(KEY, {
                    device: { id: String(b.device_id), name: String(b.device_name || "") },
                    refresh: protect.seal(b.refresh_token),
                    receive: true, // D5 = A: on when connecting
                    linkedAt: at,
                    lastSeen: at,
                });
                tries = 0;
                if (dismiss) dismiss(BELL);
                setState("on");
                schedule(TOUCH_MS);
                return status();
            }
            restoreAfterFailedLink();
            if (res.status === 429) throw fail("Muitas tentativas. Espere alguns minutos e tente de novo.", 429, "rate");
            if (res.status === 401) throw fail("Código inválido ou vencido. Peça outro no GERAR.", 401, "invalid");
            throw fail("O GERAR não respondeu. Tente de novo em instantes.", 503, "offline");
        },
        // Desconectar…: forgets the session HERE (the GERAR keeps the device
        // until an administrator disconnects it there).
        forget() {
            stopTimer();
            access = null;
            settings.set(KEY, null);
            if (dismiss) dismiss(BELL);
            setState("off");
            return status();
        },
        setReceive({ on } = {}) {
            if (!read().device) throw fail("Conecte este computador ao GERAR primeiro.", 409);
            write({ receive: Boolean(on) });
            told();
            return status();
        },
        // Buscar agora (and the network back): one touch now, whatever the backoff.
        async check() {
            tries = 0;
            await beat();
            return status();
        },
    };

    function restoreAfterFailedLink() {
        const c = read();
        setState(c.refresh ? (c.needs ? "needs" : "offline") : "off");
        if (c.refresh && !c.needs) schedule(RETRY_MS[0]);
    }

    return {
        ops,
        status,
        rpc,
        rest,
        token,
        // A refusal of the GERAR as precisa de você (gerarInbox: a 42501 on a
        // read means this device was disconnected there).
        refused: (reason = "revoked") => needs(reason),
        // At launch, and when the PC wakes or the network comes back.
        start() { stopped = false; return beat(); },
        resume() { tries = 0; return beat(); },
        stop() { stopped = true; stopTimer(); },
    };
}

module.exports = { createGerarLink, normalizeCode, tokenExpiry, refusedRefresh, TOUCH_MS, RETRY_MS };

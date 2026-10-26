// Entering KERYX with the church's Google account (Google Drive direto, PR 2;
// docs/desktop-architecture.md §8b, docs/google-drive-setup.md). Google's flow
// for installed apps: an authorization code with PKCE (S256), the answer
// coming back to a one-off listener on 127.0.0.1, in the system's own browser
// (shell.openExternal) — never a window of KERYX, so the password is typed
// only into Google's page, where the browser shows whose it is.
//
//   1. a random verifier (its SHA-256 goes to Google as the challenge) and a
//      random `state`; a listener on 127.0.0.1 at a free port;
//   2. the browser opens Google's page with the scopes (drive.appdata: only
//      the app's hidden folder; openid email: which account it is);
//   3. the listener takes ONE request and closes: the `state` must be this
//      sign-in's, else nothing is exchanged; it gives up after `signInMs`;
//   4. the code and the verifier become the tokens (Google's token endpoint):
//      the refresh token is sealed (Windows' own protection, sealWith in
//      syncControl.cjs) into settings.json under "google"; the access token
//      (an hour) stays in memory and is refreshed from the sealed one.
//
// settings.json "google": { refresh, email, at } signed in; { email, refused }
// after Google refused the refresh token (revoked from the account, the
// password changed, …): then nothing is asked of Google until someone enters
// again ("Entre de novo com a conta da igreja"), never a retry loop. Sair
// forgets it here first, then revokes it at Google (offline, only the first).
//
// Errors carry a code: "auth" (enter again), "offline" (Google did not
// answer), "config" (the app's client is not set up), "state", "timeout",
// "denied", "canceled", "scope", "unsafe". Pure Node; the browser, the
// settings, the protection and fetch come in, so it runs under node --test.

const http = require("node:http");
const crypto = require("node:crypto");

const KEY = "google";
const SIGN_IN_MS = 5 * 60 * 1000;
const REQUEST_MS = 20 * 1000;
// An access token is refreshed this long before Google says it ends.
const EARLY_MS = 60 * 1000;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const ENTER_AGAIN = "Entre de novo com a conta da igreja.";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fail = (message, code) => Object.assign(new Error(message), { code });
const sameText = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// The account's e-mail from the id_token. It came straight from Google's
// token endpoint over TLS, so its signature needs no checking (Google's
// OpenID guide); the audience is still checked against this client.
function emailOf(idToken, clientId) {
    try {
        const claims = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
        if (claims.aud !== clientId || claims.email_verified === false) return null;
        return typeof claims.email === "string" ? claims.email.slice(0, 200) : null;
    } catch {
        return null;
    }
}

// What the browser shows after the answer: plain words, nothing from the request.
function page(res, ok) {
    const text = ok
        ? "Pronto: a conta da igreja está conectada ao KERYX. Pode fechar esta aba."
        : "Não deu certo. Volte ao KERYX e tente de novo.";
    res.writeHead(ok ? 200 : 400, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        Connection: "close",
    });
    res.end(`<!doctype html><meta charset="utf-8"><title>KERYX</title><body style="font:16px system-ui;margin:3em;color:#222"><p>${text}</p></body>`);
}

// A listener on 127.0.0.1 at a free port that takes one request: the
// answer when `state` is this sign-in's. -> { port, result, cancel }.
function listenOnce(state, ms) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        let settle;
        const result = new Promise((res, rej) => { settle = { res, rej }; });
        let done = false;
        let timer = null;
        const finish = (err, value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            server.close();
            server.closeAllConnections?.();
            if (err) settle.rej(err);
            else settle.res(value);
        };
        server.on("request", (req, res) => {
            if (done) {
                res.writeHead(410, { Connection: "close" }).end();
                return;
            }
            const q = new URL(req.url || "/", "http://127.0.0.1").searchParams;
            let err = null;
            if (req.method !== "GET" || !sameText(q.get("state") || "", state)) err = fail("A resposta não era desta entrada. Tente de novo.", "state");
            else if (q.get("error") === "access_denied") err = fail("A entrada foi cancelada na página do Google.", "denied");
            else if (q.get("error") || !q.get("code")) err = fail("O Google não autorizou a entrada. Tente de novo.", "denied");
            page(res, !err);
            finish(err, err ? null : { code: q.get("code"), scope: q.get("scope") || "" });
        });
        server.on("error", (err) => {
            if (!done) {
                clearTimeout(timer);
                reject(err);
            }
        });
        server.listen(0, "127.0.0.1", () => {
            timer = setTimeout(() => finish(fail("O tempo para entrar acabou. Tente de novo.", "timeout")), ms);
            timer.unref?.();
            resolve({ port: server.address().port, result, cancel: () => finish(fail("Entrada cancelada.", "canceled")) });
        });
    });
}

// settings: { get, set } (settings.json); protect: sealWith(safeStorage);
// openExternal(url): the system's browser. onChange(): told when the
// account here changes (entered, left, refused).
function createGoogleAuth({
    settings, protect, openExternal, fetchImpl = fetch, config = require("./googleConfig.cjs"), now = () => Date.now(),
    log = console.warn, signInMs = SIGN_IN_MS, onChange = null,
}) {
    const saved = () => {
        const g = settings.get(KEY, null);
        return g && typeof g === "object" ? g : {};
    };
    let access = null; // { token, until }
    let refreshing = null;
    let flow = null; // the sign-in waiting for the browser: { cancel }
    const changed = () => {
        try {
            onChange?.();
        } catch { /* a listener's problem */ }
    };
    const clientForm = () => ({ client_id: config.clientId, ...(config.clientSecret ? { client_secret: config.clientSecret } : {}) });

    async function post(url, form) {
        let res;
        try {
            res = await fetchImpl(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                body: new URLSearchParams(form).toString(),
                signal: AbortSignal.timeout(REQUEST_MS),
            });
        } catch {
            throw fail("O Google não respondeu. Confira a internet.", "offline");
        }
        let body = {};
        try {
            body = (await res.json()) || {};
        } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body };
    }

    // A refusal of the token endpoint, as an error (never the token's text).
    function refusal(r) {
        const what = String(r.body.error || r.status);
        log(`[keryx-google] o Google recusou: ${what} ${String(r.body.error_description || "").slice(0, 120)}`);
        if (r.status >= 500 || r.status === 429) return fail("O Google não respondeu. Tente de novo em instantes.", "offline");
        if (what === "invalid_client" || /client_secret/.test(String(r.body.error_description || ""))) {
            return fail("O KERYX ainda não está configurado no Google. Avise quem cuida do KERYX.", "config");
        }
        return fail(ENTER_AGAIN, "auth");
    }

    function status() {
        const s = saved();
        const open = s.refresh ? protect.open(s.refresh) : null;
        return {
            signedIn: Boolean(open),
            email: s.email || null,
            // Google refused the token kept here: enter again.
            refused: Boolean(s.refused),
            // Kept, but sealed on another computer or Windows account.
            keyLost: Boolean(s.refresh) && !open,
            signingIn: Boolean(flow),
            configured: Boolean(config.clientId && config.clientSecret),
        };
    }

    async function signIn() {
        if (protect.safe && !protect.safe()) throw fail("Este computador não tem como guardar a entrada com segurança.", "unsafe");
        // Without the client's secret Google refuses the exchange: said
        // before the browser opens, not after the person entered.
        if (!config.clientId || !config.clientSecret) throw fail("O KERYX ainda não está configurado no Google. Avise quem cuida do KERYX.", "config");
        if (flow) flow.cancel();
        const verifier = b64url(crypto.randomBytes(32));
        const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
        const state = b64url(crypto.randomBytes(16));
        const listening = await listenOnce(state, signInMs);
        const mine = { cancel: listening.cancel };
        flow = mine;
        changed();
        try {
            const redirect = `http://127.0.0.1:${listening.port}`;
            const url = new URL(config.authUrl);
            for (const [k, v] of Object.entries({
                client_id: config.clientId,
                redirect_uri: redirect,
                response_type: "code",
                scope: config.scopes.join(" "),
                code_challenge: challenge,
                code_challenge_method: "S256",
                state,
                // A refresh token every time, and the account chosen on purpose.
                access_type: "offline",
                prompt: "select_account consent",
            })) url.searchParams.set(k, v);
            try {
                await openExternal(url.href);
            } catch {
                listening.cancel();
                throw fail("Não foi possível abrir o navegador.", "canceled");
            }
            const { code } = await listening.result;
            const r = await post(config.tokenUrl, { ...clientForm(), code, code_verifier: verifier, redirect_uri: redirect, grant_type: "authorization_code" });
            if (!r.ok) throw refusal(r);
            const { access_token: token, refresh_token: refresh, expires_in: expires, scope, id_token: idToken } = r.body;
            if (!token || !refresh) throw fail("O Google não devolveu a entrada. Tente de novo.", "auth");
            // Google lets the person untick a permission on its page.
            if (!String(scope || "").split(" ").includes(DRIVE_SCOPE)) {
                await post(config.revokeUrl, { token: refresh }).catch(() => {});
                throw fail("Para sincronizar, deixe marcada a permissão dos dados do KERYX no Google Drive.", "scope");
            }
            const email = emailOf(idToken, config.clientId);
            settings.set(KEY, { refresh: protect.seal(refresh), email, at: new Date(now()).toISOString() });
            access = { token, until: now() + (Number(expires) || 3600) * 1000 };
            return status();
        } finally {
            if (flow === mine) flow = null;
            changed();
        }
    }

    async function refresh() {
        const s = saved();
        if (!s.refresh) throw fail(s.refused ? ENTER_AGAIN : "Entre com a conta da igreja.", "auth");
        const kept = protect.open(s.refresh);
        if (!kept) throw fail(ENTER_AGAIN, "auth");
        const r = await post(config.tokenUrl, { ...clientForm(), refresh_token: kept, grant_type: "refresh_token" });
        if (r.ok && r.body.access_token) {
            access = { token: r.body.access_token, until: now() + (Number(r.body.expires_in) || 3600) * 1000 };
            return access.token;
        }
        if (r.body.error === "invalid_grant") {
            // Dead for good: forgotten, so no pass asks Google again.
            settings.set(KEY, { email: s.email || null, refused: new Date(now()).toISOString() });
            access = null;
            log("[keryx-google] o Google recusou a entrada guardada: é preciso entrar de novo");
            changed();
            throw fail(ENTER_AGAIN, "auth");
        }
        throw refusal(r);
    }

    // The access token for a call to Google (one refresh at a time).
    async function accessToken() {
        if (access && access.until - EARLY_MS > now()) return access.token;
        if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
        return refreshing;
    }

    // Sair: forgotten here at once, then revoked at Google.
    async function signOut() {
        if (flow) flow.cancel();
        const s = saved();
        const kept = s.refresh ? protect.open(s.refresh) : null;
        settings.set(KEY, null);
        access = null;
        changed();
        let revoked = false;
        if (kept) {
            try {
                const r = await post(config.revokeUrl, { token: kept });
                revoked = r.ok || r.body.error === "invalid_token";
            } catch { /* offline: it stays valid at Google until it expires unused */ }
        }
        return { revoked, ...status() };
    }

    return {
        signIn,
        signOut,
        accessToken,
        // After Google refused an access token (401): the next call refreshes.
        invalidate: () => { access = null; },
        status,
        email: () => saved().email || null,
    };
}

module.exports = { createGoogleAuth, emailOf, DRIVE_SCOPE, KEY };

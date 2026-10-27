// node --test electron/googleAuth.test.cjs   (npm test)
// Entering with the church's Google account, with Google faked: the token
// endpoint is a function standing in for fetch, the "browser" opens the
// redirect on the real one-off listener (127.0.0.1) the way Google's page
// sends the person back. Nobody signs in to Google here.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createGoogleAuth, emailOf, DRIVE_SCOPE } = require("./googleAuth.cjs");
const { sealWith } = require("./syncControl.cjs");

const CONFIG = {
    clientId: "cliente-de-teste.apps.googleusercontent.com",
    clientSecret: "segredo-de-teste",
    scopes: [DRIVE_SCOPE, "openid", "email"],
    authUrl: "https://accounts.example/auth",
    tokenUrl: "https://tokens.example/token",
    revokeUrl: "https://tokens.example/revoke",
};

function memorySettings() {
    const data = {};
    return { data, get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
}

const protection = (available = true) => sealWith({
    isEncryptionAvailable: () => available,
    encryptString: (t) => Buffer.from(`sealed|${t}`).reverse(),
    decryptString: (b) => Buffer.from(b).reverse().toString().slice("sealed|".length),
});

const idToken = (claims) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "assinatura"].join(".");

// Google's token and revoke endpoints. `answers`: what the next calls get.
function fakeGoogle({ scope = `${DRIVE_SCOPE} openid https://www.googleapis.com/auth/userinfo.email`, email = "igreja@example.com" } = {}) {
    const calls = [];
    const queue = [];
    let n = 0;
    const g = {
        calls,
        // The verifier must match the challenge the browser carried.
        challenge: null,
        next: (status, body) => queue.push({ status, body }),
        offline: false,
        fetch: async (url, init) => {
            const form = Object.fromEntries(new URLSearchParams(init.body));
            calls.push({ url, form });
            if (g.offline) throw new TypeError("fetch failed");
            const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
            if (queue.length) {
                const { status, body } = queue.shift();
                return reply(status, body);
            }
            if (url === CONFIG.revokeUrl) return reply(200, {});
            if (!form.client_secret) return reply(400, { error: "invalid_request", error_description: "client_secret is missing." });
            if (form.grant_type === "authorization_code") {
                const sha = crypto.createHash("sha256").update(form.code_verifier).digest("base64url");
                if (form.code !== "codigo-bom" || sha !== g.challenge) return reply(400, { error: "invalid_grant" });
                return reply(200, { access_token: "acesso-1", refresh_token: "renovacao-secreta", expires_in: 3600, scope, id_token: idToken({ aud: CONFIG.clientId, email, email_verified: true }) });
            }
            if (form.grant_type === "refresh_token") {
                if (form.refresh_token !== "renovacao-secreta") return reply(400, { error: "invalid_grant" });
                n += 1;
                return reply(200, { access_token: `acesso-novo-${n}`, expires_in: 3600 });
            }
            return reply(400, { error: "unsupported_grant_type" });
        },
    };
    return g;
}

// The system's browser: after Google's page, it opens the redirect with
// what `answer(params)` says (null: the person never comes back).
function browser(google, answer) {
    const seen = { url: null, status: null, redirect: null };
    const open = async (href) => {
        const u = new URL(href);
        seen.url = u;
        seen.redirect = u.searchParams.get("redirect_uri");
        google.challenge = u.searchParams.get("code_challenge");
        const q = answer(u.searchParams);
        if (q == null) return;
        setTimeout(async () => {
            try {
                const res = await fetch(`${seen.redirect}/?${new URLSearchParams(q)}`);
                seen.status = res.status;
                seen.body = await res.text();
            } catch (err) {
                seen.status = err;
            }
        }, 5);
    };
    return { open, seen };
}

const good = (p) => ({ code: "codigo-bom", state: p.get("state"), scope: p.get("scope") });

function auth(opts = {}) {
    const settings = opts.settings || memorySettings();
    const google = opts.google || fakeGoogle();
    let clock = 1_000_000;
    const b = browser(google, opts.answer || good);
    const a = createGoogleAuth({
        settings,
        protect: opts.protect || protection(),
        openExternal: b.open,
        fetchImpl: google.fetch,
        config: { ...CONFIG, ...opts.config },
        now: () => clock,
        log: () => {},
        signInMs: opts.signInMs || 2000,
    });
    return { a, settings, google, seen: b.seen, advance: (ms) => { clock += ms; } };
}

const closed = async (redirect) => {
    await assert.rejects(fetch(`${redirect}/?code=x`), "the listener is closed after its one request");
};

test("entering: PKCE S256 on 127.0.0.1, the code exchanged once, the refresh token sealed, the access token in memory", async () => {
    const { a, settings, google, seen } = auth();
    const st = await a.signIn();
    assert.equal(st.signedIn, true);
    assert.equal(st.email, "igreja@example.com");
    const p = seen.url.searchParams;
    assert.equal(p.get("code_challenge_method"), "S256");
    assert.match(p.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
    assert.match(p.get("state"), /^[A-Za-z0-9_-]{22}$/);
    assert.match(seen.redirect, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(p.get("scope"), CONFIG.scopes.join(" "));
    assert.equal(p.get("access_type"), "offline");
    await new Promise((r) => setTimeout(r, 20)); // the browser reads its page
    assert.equal(seen.status, 200);
    assert.match(seen.body, /Pode fechar esta aba/);
    const exchange = google.calls.find((c) => c.form.grant_type === "authorization_code");
    assert.equal(exchange.form.redirect_uri, seen.redirect, "the same redirect as the browser's");
    assert.equal(exchange.form.client_secret, CONFIG.clientSecret);
    // Kept sealed, never as text.
    assert.ok(!JSON.stringify(settings.data).includes("renovacao-secreta"));
    assert.ok(!JSON.stringify(settings.data).includes("acesso-1"));
    assert.match(settings.data.google.refresh, /^safe:/);
    assert.equal(await a.accessToken(), "acesso-1");
    assert.equal(google.calls.length, 1, "the fresh access token needs no call");
    await closed(seen.redirect);
});

test("the access token is refreshed before it ends, once for many callers", async () => {
    const { a, google, advance } = auth();
    await a.signIn();
    advance(3600 * 1000 - 30 * 1000);
    const [x, y, z] = await Promise.all([a.accessToken(), a.accessToken(), a.accessToken()]);
    assert.deepEqual([x, y, z], ["acesso-novo-1", "acesso-novo-1", "acesso-novo-1"]);
    const refreshes = google.calls.filter((c) => c.form.grant_type === "refresh_token");
    assert.equal(refreshes.length, 1);
    assert.equal(refreshes[0].form.refresh_token, "renovacao-secreta");
    assert.equal(await a.accessToken(), "acesso-novo-1");
    a.invalidate();
    assert.equal(await a.accessToken(), "acesso-novo-2", "after a 401 the next call refreshes");
});

test("a state that is not this sign-in's: a 404, nothing exchanged, and the listener keeps waiting for the real one", async () => {
    const google = fakeGoogle();
    const settings = memorySettings();
    const strays = [];
    let redirect = null;
    const a = createGoogleAuth({
        settings,
        protect: protection(),
        fetchImpl: google.fetch,
        config: CONFIG,
        log: () => {},
        signInMs: 3000,
        // The browser's favicon, a port scan, another program with a made-up
        // state, a second copy of the answer: then Google's real answer.
        openExternal: async (href) => {
            const u = new URL(href);
            redirect = u.searchParams.get("redirect_uri");
            google.challenge = u.searchParams.get("code_challenge");
            const state = u.searchParams.get("state");
            setTimeout(async () => {
                for (const path of ["/favicon.ico", "/", `/?code=codigo-bom&state=outro-estado-qualquer-x`, `/?error=access_denied&state=x`]) {
                    strays.push((await fetch(`${redirect}${path}`)).status);
                }
                strays.push((await fetch(`${redirect}/?code=codigo-bom&state=${state}`)).status);
            }, 5);
        },
    });
    const st = await a.signIn();
    assert.equal(st.signedIn, true);
    for (let i = 0; i < 50 && strays.length < 5; i++) await new Promise((r) => setTimeout(r, 10)); // the browser reads its page
    assert.deepEqual(strays, [404, 404, 404, 404, 200]);
    assert.equal(google.calls.filter((c) => c.form.grant_type === "authorization_code").length, 1, "only the real answer is exchanged");
    await closed(redirect);

    // Only strays, ever: the sign-in ends at its timeout, with nothing exchanged.
    const only = auth({ answer: () => ({ code: "codigo-bom", state: "outro-estado-qualquer-x" }), signInMs: 150 });
    await assert.rejects(only.a.signIn(), { code: "timeout" });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(only.seen.status, 404);
    assert.equal(only.google.calls.length, 0);
    await closed(only.seen.redirect);
});

// A refresh held on its way to Google until release(), answered with `answer`
// (else as the fake answers).
function holding(google) {
    const inner = google.fetch;
    let held = null;
    google.fetch = async (url, init) => {
        const form = Object.fromEntries(new URLSearchParams(init.body));
        if (held && form.grant_type === "refresh_token") {
            const h = held;
            held = null;
            await h.wait;
            if (h.answer) return { ok: false, status: h.answer.status, json: async () => h.answer.body };
        }
        return inner(url, init);
    };
    return (answer = null) => {
        let release;
        held = { wait: new Promise((r) => { release = r; }), answer };
        return () => release();
    };
}

test("a refresh on its way when Sair is clicked never brings the access token back", async () => {
    const google = fakeGoogle();
    const hold = holding(google);
    const { a, advance } = auth({ google });
    await a.signIn();
    advance(2 * 3600 * 1000);
    const release = hold();
    const late = a.accessToken();
    await new Promise((r) => setTimeout(r, 10));
    await a.signOut();
    release();
    await assert.rejects(late, { code: "auth" }, "its answer is of the account that left");
    await assert.rejects(a.accessToken(), { code: "auth" });
    assert.equal(a.status().signedIn, false);
});

test("a refresh refused on its way while someone signs in again does not undo the new sign-in", async () => {
    const google = fakeGoogle();
    const hold = holding(google);
    const { a, settings, advance } = auth({ google });
    await a.signIn();
    advance(2 * 3600 * 1000);
    const release = hold({ status: 400, body: { error: "invalid_grant" } });
    const late = a.accessToken();
    await new Promise((r) => setTimeout(r, 10));
    await a.signIn();
    release();
    assert.equal(await late, "acesso-1", "the caller gets the new sign-in's token");
    assert.equal(a.status().signedIn, true);
    assert.equal(a.status().refused, false);
    assert.match(settings.data.google.refresh, /^safe:/, "the new sign-in's token is kept");
});

test("the person never comes back: the sign-in gives up and the port closes", async () => {
    const { a, seen } = auth({ answer: () => null, signInMs: 60 });
    await assert.rejects(a.signIn(), { code: "timeout" });
    await closed(seen.redirect);
    assert.equal(a.status().signingIn, false);
});

test("Abrir de novo opens the same page again; Cancelar ends the sign-in waiting", async () => {
    const { a, seen, google } = auth({ answer: () => null });
    await assert.rejects(a.reopen(), { code: "canceled" }, "nothing waiting");
    const pending = a.signIn();
    pending.catch(() => {});
    while (!seen.url) await new Promise((r) => setTimeout(r, 2));
    const first = seen.url.href;
    seen.url = null;
    assert.equal(a.status().signingIn, true);
    await a.reopen();
    assert.equal(seen.url.href, first, "the same Google page, the same state and challenge");
    const st = a.cancel();
    await assert.rejects(pending, { code: "canceled" });
    await closed(seen.redirect);
    assert.equal(a.status().signingIn, false);
    assert.equal(st.signedIn, false);
    assert.equal(google.calls.length, 0, "nothing exchanged");
});

test("refused on Google's page, or the code refused at the exchange", async () => {
    const denied = auth({ answer: (p) => ({ error: "access_denied", state: p.get("state") }) });
    await assert.rejects(denied.a.signIn(), { code: "denied" });
    assert.equal(denied.google.calls.length, 0);

    const bad = auth({ answer: (p) => ({ code: "codigo-ruim", state: p.get("state") }) });
    await assert.rejects(bad.a.signIn(), { code: "auth" });
    assert.equal(bad.a.status().signedIn, false);
    assert.equal(bad.settings.data.google, undefined);
});

test("the Drive permission unticked on Google's page: nothing kept, the token revoked", async () => {
    const google = fakeGoogle({ scope: "openid https://www.googleapis.com/auth/userinfo.email" });
    const { a, settings } = auth({ google });
    await assert.rejects(a.signIn(), { code: "scope" });
    assert.equal(settings.data.google, undefined);
    const revoke = google.calls.find((c) => c.url === CONFIG.revokeUrl);
    assert.equal(revoke.form.token, "renovacao-secreta");
});

test("a refresh token Google refuses becomes a clear state, and Google is not asked again", async () => {
    const { a, settings, google, advance } = auth();
    await a.signIn();
    advance(2 * 3600 * 1000);
    google.next(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    await assert.rejects(a.accessToken(), { code: "auth", message: /Entre de novo com a conta da igreja/ });
    const st = a.status();
    assert.equal(st.signedIn, false);
    assert.equal(st.refused, true);
    assert.equal(st.email, "igreja@example.com", "which account it was, for the message");
    assert.equal(settings.data.google.refresh, undefined, "the dead token is forgotten");
    const calls = google.calls.length;
    for (let i = 0; i < 5; i++) await assert.rejects(a.accessToken(), { code: "auth" });
    assert.equal(google.calls.length, calls, "no retry loop");
});

test("Google not answering a refresh is offline, not a sign-out", async () => {
    const { a, google, advance } = auth();
    await a.signIn();
    advance(2 * 3600 * 1000);
    google.offline = true;
    await assert.rejects(a.accessToken(), { code: "offline" });
    google.offline = false;
    google.next(503, { error: "backendError" });
    await assert.rejects(a.accessToken(), { code: "offline" });
    assert.equal(a.status().signedIn, true);
    assert.equal(await a.accessToken(), "acesso-novo-1");
});

test("Sair: forgotten here first, then revoked at Google; offline still forgets", async () => {
    const one = auth();
    await one.a.signIn();
    const out = await one.a.signOut();
    assert.equal(out.revoked, true);
    assert.equal(out.signedIn, false);
    assert.equal(one.settings.data.google, null);
    const revoke = one.google.calls.find((c) => c.url === CONFIG.revokeUrl);
    assert.equal(revoke.form.token, "renovacao-secreta");
    await assert.rejects(one.a.accessToken(), { code: "auth" });

    const two = auth();
    await two.a.signIn();
    two.google.offline = true;
    const off = await two.a.signOut();
    assert.equal(off.revoked, false);
    assert.equal(two.settings.data.google, null);
});

test("no client secret, or no real protection: refused before the browser opens", async () => {
    const noSecret = auth({ config: { clientSecret: null } });
    await assert.rejects(noSecret.a.signIn(), { code: "config" });
    assert.equal(noSecret.seen.url, null);
    assert.equal(noSecret.a.status().configured, false);

    const plain = auth({ protect: protection(false) });
    await assert.rejects(plain.a.signIn(), { code: "unsafe" });
    assert.equal(plain.seen.url, null);
});

test("a sealed token that will not open here (another Windows account) asks to enter again", async () => {
    const settings = memorySettings();
    const first = auth({ settings });
    await first.a.signIn();
    const other = createGoogleAuth({
        settings,
        protect: sealWith({ isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(t), decryptString: () => { throw new Error("outra conta"); } }),
        openExternal: async () => {},
        fetchImpl: first.google.fetch,
        config: CONFIG,
        log: () => {},
    });
    assert.equal(other.status().keyLost, true);
    await assert.rejects(other.accessToken(), { code: "auth" });
});

test("emailOf: only this client's, only a verified address", () => {
    assert.equal(emailOf(idToken({ aud: CONFIG.clientId, email: "a@b.c", email_verified: true }), CONFIG.clientId), "a@b.c");
    assert.equal(emailOf(idToken({ aud: "outro", email: "a@b.c" }), CONFIG.clientId), null);
    assert.equal(emailOf(idToken({ aud: CONFIG.clientId, email: "a@b.c", email_verified: false }), CONFIG.clientId), null);
    assert.equal(emailOf("lixo", CONFIG.clientId), null);
});

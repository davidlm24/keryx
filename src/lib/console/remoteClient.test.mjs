import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteCall } from "./remoteClient.js";

const answer = (status, body) => {
    const f = async (url, init) => {
        f.calls.push({ url, init });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    f.calls = [];
    return f;
};

test("a command goes as version 2 JSON with the custom header, and its answer comes back", async () => {
    const f = answer(200, { data: { message: "Celular: Tela preta ligado." } });
    const r = await remoteCall("black", {}, f);
    assert.deepEqual(r, { ok: true, status: 200, message: "Celular: Tela preta ligado.", result: undefined });
    assert.equal(f.calls[0].url, "/api/remote");
    assert.equal(f.calls[0].init.headers["x-keryx"], "1");
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { v: 2, action: "black", args: {} });
    const st = await remoteCall("state", {}, answer(200, { data: { message: "", result: { items: [] } } }));
    assert.deepEqual(st.result, { items: [] });
});

test("refusals, a lost sign-in, the remote turned off and no Wi-Fi say so in plain words", async () => {
    const locked = await remoteCall("next", {}, answer(423, { error: { message: "Telas travadas", code: "locked" } }));
    assert.equal(locked.message, "Telas travadas");
    assert.equal(locked.code, "locked");
    const out = await remoteCall("next", {}, answer(401, { error: { message: "x" } }));
    assert.equal(out.signedOut, true);
    const off = await remoteCall("next", {}, answer(404, { error: { message: "Controle remoto desligado.", status: 404 } }));
    assert.equal(off.off, true);
    assert.equal(off.message, "O controle remoto foi desligado no computador do KERYX.");
    // A 404 with a code is an item that is gone, not the remote.
    const gone = await remoteCall("sendItem", { itemId: "a" }, answer(404, { error: { message: "Esse item não está mais na setlist.", code: "not_found" } }));
    assert.equal(gone.off, undefined);
    assert.equal(gone.message, "Esse item não está mais na setlist.");
    const offline = await remoteCall("state", {}, async () => { throw new Error("network"); });
    assert.equal(offline.ok, false);
    assert.equal(offline.unknown, undefined);
    assert.match(offline.message, /Wi-Fi/);
    assert.equal((await remoteCall("next", {}, async () => ({ ok: false, status: 500, json: async () => { throw new Error(); } }))).message, "Não foi possível.");
});

test("a 504 or a link lost mid-command is an unknown outcome, never sent again", async () => {
    const slow = answer(504, { error: { message: "O console não respondeu.", status: 504 } });
    const r = await remoteCall("sendNext", {}, slow);
    assert.equal(r.unknown, true);
    assert.equal(r.message, "Não sei se foi — confira a tela");
    assert.equal(slow.calls.length, 1);
    let tries = 0;
    const dropped = await remoteCall("next", {}, async () => { tries += 1; throw new Error("reset"); });
    assert.equal(dropped.unknown, true);
    assert.equal(dropped.message, "Não sei se foi — confira a tela");
    assert.equal(tries, 1);
    // Busy and too many taps are not retried either.
    const busy = answer(503, { error: { message: "O computador está ocupado: tente de novo.", code: "busy" } });
    assert.equal((await remoteCall("next", {}, busy)).closed, undefined);
    assert.equal(busy.calls.length, 1);
    const rate = answer(429, { error: { message: "Muitos toques seguidos: espere um instante.", code: "rate" } });
    assert.equal((await remoteCall("next", {}, rate)).code, "rate");
    assert.equal(rate.calls.length, 1);
});

test("the console closed, and an action an older KERYX does not know", async () => {
    const closed = await remoteCall("next", {}, answer(503, { error: { message: "O console não está aberto no computador.", code: "busy" } }));
    assert.equal(closed.closed, true);
    const old = await remoteCall("library", { tab: "songs" }, answer(400, { error: { message: "Comando desconhecido.", status: 400 } }));
    assert.equal(old.update, true);
    assert.equal(old.message, "Atualize o KERYX no computador");
});

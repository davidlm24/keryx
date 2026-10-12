import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteCall } from "./remoteClient.js";

const answer = (status, body) => async (url, init) => {
    answer.last = { url, init };
    return { ok: status >= 200 && status < 300, status, json: async () => body };
};

test("a command goes as JSON with the custom header, and its answer comes back", async () => {
    const r = await remoteCall("black", {}, answer(200, { data: { message: "Celular: Tela preta ligado." } }));
    assert.deepEqual(r, { ok: true, status: 200, message: "Celular: Tela preta ligado.", result: undefined });
    assert.equal(answer.last.url, "/api/remote");
    assert.equal(answer.last.init.headers["x-keryx"], "1");
    assert.deepEqual(JSON.parse(answer.last.init.body), { action: "black", args: {} });
    const st = await remoteCall("state", {}, answer(200, { data: { message: "", result: { items: [] } } }));
    assert.deepEqual(st.result, { items: [] });
});

test("refusals, a lost sign-in, the remote turned off and no Wi-Fi say so in plain words", async () => {
    assert.equal((await remoteCall("next", {}, answer(423, { error: { message: "Telas travadas" } }))).message, "Telas travadas");
    const out = await remoteCall("next", {}, answer(401, { error: { message: "x" } }));
    assert.equal(out.signedOut, true);
    assert.equal((await remoteCall("next", {}, answer(404, { error: { message: "Controle remoto desligado.", status: 404 } }))).message, "O controle remoto foi desligado no computador do KERYX.");
    const offline = await remoteCall("next", {}, async () => { throw new Error("network"); });
    assert.equal(offline.ok, false);
    assert.match(offline.message, /Wi-Fi/);
    assert.equal((await remoteCall("next", {}, async () => ({ ok: false, status: 500, json: async () => { throw new Error(); } }))).message, "Não foi possível.");
});

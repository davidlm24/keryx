import test from "node:test";
import assert from "node:assert/strict";
import { entryOf, installRendererLog } from "./rendererLog.js";

test("console.error's arguments become one entry with the error's stack", () => {
    const err = new Error("boom");
    const e = entryOf("error", ["Falhou:", err, { a: 1 }]);
    assert.equal(e.msg, 'Falhou: boom {"a":1}');
    assert.match(e.stack, /Error: boom/);
    assert.equal(entryOf("error", ["só texto"]).stack, "");
    assert.equal(entryOf("error", ["x".repeat(5000)]).msg.length, 2048);
});

function fakeWindow(withLog = true) {
    const sent = [];
    const printed = [];
    const handlers = {};
    return {
        sent, printed, handlers,
        keryxDesktop: withLog ? { log: (e) => sent.push(e) } : {},
        console: { error: (...a) => printed.push(a) },
        addEventListener: (k, fn) => { handlers[k] = fn; },
    };
}

test("installed only where the desktop bridge has log (never a network screen or the preview)", () => {
    assert.equal(installRendererLog(fakeWindow(false)), false);
    assert.equal(installRendererLog({ console: {}, addEventListener() {} }), false);
});

test("console.error, window errors and rejected promises are sent; console.error still prints", () => {
    const w = fakeWindow();
    assert.equal(installRendererLog(w), true);
    w.console.error("falhou", 1);
    assert.deepEqual(w.printed, [["falhou", 1]]);
    w.handlers.error({ error: new Error("x") });
    w.handlers.unhandledrejection({ reason: new Error("y") });
    assert.deepEqual(w.sent.map((e) => e.msg), ["falhou 1", "x", "Promessa rejeitada: y"]);
    for (let i = 0; i < 40; i++) w.console.error("e");
    assert.equal(w.sent.length, 20, "20 a minute from the window itself");
    assert.equal(w.printed.length, 41, "the devtools still get every line");
});

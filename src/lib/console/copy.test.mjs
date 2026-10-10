import test from "node:test";
import assert from "node:assert/strict";
import { SEND_LABEL, SEND_TIP, sendTip } from "./copy.js";

test("every send button says the same, with its keys in the tooltip", () => {
    assert.equal(SEND_LABEL, "Enviar ao ar");
    assert.equal(sendTip(false), "Enviar ao ar · Enter (Ctrl+Enter de qualquer lugar)");
    assert.equal(sendTip(false), SEND_TIP);
});

test("locked screens say why, and where to unlock", () => {
    assert.equal(sendTip(true), "Telas travadas · destrave em Saídas");
});

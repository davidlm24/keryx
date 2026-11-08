import { test } from "node:test";
import assert from "node:assert/strict";
import { churchLine, windowTitle } from "./church.js";

test("church line: name and city, either alone, trimmed", () => {
    assert.equal(churchLine("Igreja Gerar", "Campinas"), "Igreja Gerar · Campinas");
    assert.equal(churchLine("  Igreja   Gerar ", ""), "Igreja Gerar");
    assert.equal(churchLine("", "Campinas"), "Campinas");
    assert.equal(churchLine(null, undefined), "");
});

test("window title: the console carries the church, a screen says which it is", () => {
    assert.equal(windowTitle({ name: "Igreja Gerar" }), "Igreja Gerar · KERYX");
    assert.equal(windowTitle({}), "KERYX");
    assert.equal(windowTitle({ name: "Igreja Gerar", screen: "Palco" }), "Palco · Igreja Gerar");
    assert.equal(windowTitle({ name: " ", screen: "Palco" }), "Palco · KERYX");
});

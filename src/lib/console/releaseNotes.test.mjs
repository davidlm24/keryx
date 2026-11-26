import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compareVersions, versionsBetween, parseNotes, inlineParts, notesByVersion, noteImage, imagesByName } from "./releaseNotes.js";

const notes = { "0.2.12": "a", "0.2.13": "b", "0.2.14": "c", "0.2.9": "z" };

test("versions compare by their numbers, not as text", () => {
    assert.equal(compareVersions("0.2.10", "0.2.9"), 1);
    assert.equal(compareVersions("0.2.14", "0.2.14"), 0);
    assert.equal(compareVersions("0.3", "0.2.99"), 1);
});

test("after an update: every version since the one installed before, newest first", () => {
    assert.deepEqual(versionsBetween(notes, { from: "0.2.12", to: "0.2.14" }).map((x) => x.version), ["0.2.14", "0.2.13"]);
    assert.deepEqual(versionsBetween(notes, { from: "0.2.13", to: "0.2.14" }).map((x) => x.version), ["0.2.14"]);
    assert.deepEqual(versionsBetween(notes, { to: "0.2.14" }).map((x) => x.version), ["0.2.14"], "no previous version: this one");
    assert.deepEqual(versionsBetween(notes, { to: "0.2.14", all: true }).map((x) => x.version), ["0.2.14", "0.2.13", "0.2.12", "0.2.9"]);
    assert.deepEqual(versionsBetween(notes, { from: "0.2.14", to: "0.2.15" }), [], "a version without a note: nothing");
});

test("the notes' markdown: titles, items, paragraphs and bold", () => {
    assert.deepEqual(parseNotes("## O que mudou\n\n- **Bíblia:** colunas\nTexto solto"), [
        { type: "h", parts: [{ text: "O que mudou", bold: false }] },
        { type: "li", parts: [{ text: "Bíblia:", bold: true }, { text: " colunas", bold: false }] },
        { type: "p", parts: [{ text: "Texto solto", bold: false }] },
    ]);
    assert.deepEqual(inlineParts("sem negrito"), [{ text: "sem negrito", bold: false }]);
});

test("the shipped notes are found by version (README left out)", () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "release-notes");
    const files = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => [`/docs/release-notes/${f}`, readFileSync(path.join(dir, f), "utf8")]));
    const byVersion = notesByVersion(files);
    assert.ok(!("README" in byVersion));
    assert.ok(byVersion["0.2.14"].includes("0.2.14"));
    for (const md of Object.values(byVersion)) assert.ok(parseNotes(md).length > 0);
});

test("a picture alone on its line (owner 2026-11-26): a block by its file name", () => {
    assert.deepEqual(parseNotes("## Palco\n![As anotações no Palco](img/anotacoes.png)\n- item"), [
        { type: "h", parts: [{ text: "Palco", bold: false }] },
        { type: "img", alt: "As anotações no Palco", src: "anotacoes.png" },
        { type: "li", parts: [{ text: "item", bold: false }] },
    ]);
    assert.equal(noteImage("veja ![x](img/a.png) aqui"), null);
    assert.deepEqual(imagesByName({ "../../../docs/release-notes/img/a.png": "/assets/a-123.png" }), { "a.png": "/assets/a-123.png" });
});

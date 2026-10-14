import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SETTINGS_INDEX, searchSettings, groupHits, countBySection, placeOf } from "./settingsSearch.js";
import { SECTIONS } from "./settings.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "components", "console", "settings");
// Which section each source file draws (a card's rows count for the section
// it opens in).
const FILES = {
    "IgrejaSection.jsx": "igreja",
    "TelasSection.jsx": "telas",
    "OutputPrefCard.jsx": "telas",
    "RedeSection.jsx": "rede",
    "RemoteBlock.jsx": "rede",
    "AparenciaSection.jsx": "aparencia",
    "IdleBlock.jsx": "aparencia",
    "TemasSection.jsx": "temas",
    "BibliaSection.jsx": "biblia",
    "CultoSection.jsx": "culto",
    "ConsoleSection.jsx": "console",
    "DadosSection.jsx": "backup",
    "SobreSection.jsx": "sobre",
};
const labelsIn = (src) => [
    ...[...src.matchAll(/FormRow[^>]*?\sk="([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/CfgKey[^>]*?\sk="([^"]+)"/g)].map((m) => m[1]),
];
const sources = Object.fromEntries(Object.keys(FILES).map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));

test("search index: every row of every section can be found (drift)", () => {
    for (const [file, section] of Object.entries(FILES)) {
        const words = SETTINGS_INDEX.filter((x) => x.section === section).flatMap((x) => [x.label, ...x.keywords]);
        for (const label of labelsIn(sources[file])) {
            assert.ok(words.includes(label), `${file}: "${label}" is not in the search index of ${section}`);
        }
    }
});

test("search index: every jump lands on a row that exists", () => {
    for (const entry of SETTINGS_INDEX) {
        const files = Object.entries(FILES).filter(([, s]) => s === entry.section).map(([f]) => f);
        const found = files.some((f) => labelsIn(sources[f]).includes(entry.target));
        assert.ok(found, `${entry.section} › ${entry.label}: target "${entry.target}" is not a FormRow k or a CfgKey k`);
        assert.ok(SECTIONS.some((s) => s.id === entry.section), entry.section);
    }
});

test("search: accents and case do not matter, every word must match", () => {
    const labels = (q) => searchSettings(q).map((h) => h.label);
    assert.ok(labels("transicao").includes("Todos os temas"), "the transition is the theme's alone (audit 2026-10-14)");
    assert.ok(!labels("transicao").some((l) => l === "Transição entre slides"), "the old Aparência row is gone");
    assert.ok(labels("FUNDO de espera").includes("Fundo padrão"), "the old name still finds it");
    assert.deepEqual(labels("pin"), ["PIN"]);
    assert.deepEqual(labels(""), []);
    assert.deepEqual(labels("x"), [], "one letter is not a search");
    assert.deepEqual(labels("zzzz"), []);
});

test("search: keywords and a card's rows find their place", () => {
    const first = (q) => searchSettings(q)[0];
    assert.equal(first("margens").label, "Ajustes");
    assert.equal(first("margens").section, "telas");
    assert.equal(first("pen drive").label, "Pasta de backup");
    // "exportar" finds the whole export (Backup) and the outputs' file (Telas,
    // first: results follow the sections' order).
    assert.ok(searchSettings("exportar").some((h) => h.label === "Outro computador"));
    assert.equal(first("exportar saídas").label, "Exportar ajustes das saídas");
    assert.equal(first("exportar tudo").label, "Outro computador");
    assert.equal(first("NVI").section, "biblia");
    const tema = searchSettings("tema padrão").find((h) => h.label === "Todos os temas");
    assert.equal(tema.section, "temas", "Temas is a section of its own");
    assert.equal(placeOf(tema), "Temas");
});

test("search: results come in the order of the sections, label hits first", () => {
    const hits = searchSettings("logo");
    const order = SECTIONS.map((s) => s.id);
    const idx = hits.map((h) => order.indexOf(h.section));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
    assert.equal(hits[0].label, "Logo", "Igreja › Logo before rows that only mention it");
    const groups = groupHits(hits);
    assert.equal(groups[0].name, "Igreja");
    assert.equal(groups.reduce((n, g) => n + g.hits.length, 0), hits.length);
    const counts = countBySection(hits);
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), hits.length);
});

test("search: entries built at run time (a theme's name) are searched too", () => {
    const extra = [{ section: "temas", tab: null, label: "Culto jovem", hint: "Tema", keywords: [], target: "Temas" }];
    const hits = searchSettings("jovem", extra);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].target, "Temas");
});

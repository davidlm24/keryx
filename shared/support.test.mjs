import test from "node:test";
import assert from "node:assert/strict";
import { MAIL_MAX, SUPPORT_EMAIL, reportMail } from "./support.mjs";

const base = { text: "A música foi ao ar sem o fundo.", doing: "Mandei da Setlist e apertei Esc.", church: "Igreja de exemplo", version: "0.2.20", os: "Windows 11", file: "keryx-diagnostico-2026-10-20-1432.zip" };

test("the report's subject, body and link", () => {
    const m = reportMail(base);
    assert.equal(m.subject, "KERYX 0.2.20 · problema");
    assert.equal(m.body, [
        "O que aconteceu:\nA música foi ao ar sem o fundo.",
        "O que eu estava fazendo:\nMandei da Setlist e apertei Esc.",
        "Igreja de exemplo · KERYX 0.2.20 · Windows 11\nAnexe o arquivo keryx-diagnostico-2026-10-20-1432.zip (já salvo em Downloads).",
    ].join("\n\n"));
    assert.ok(m.href.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`));
    const url = new URL(m.href);
    assert.equal(url.searchParams.get("subject"), m.subject);
    assert.equal(decodeURIComponent(m.href.split("&body=")[1]), m.body, "encodeURIComponent, so + and & survive");
});

test("what is optional is left out, never written empty", () => {
    const m = reportMail({ text: "Travou", version: "", church: "", os: "", file: "" });
    assert.equal(m.subject, "KERYX · problema");
    assert.equal(m.body, "O que aconteceu:\nTravou\n\nKERYX");
    assert.doesNotMatch(m.body, /estava fazendo|Anexe/);
});

test("a file given with its folder is named alone", () => {
    assert.match(reportMail({ ...base, file: "C:\\Users\\x\\Downloads\\k.zip" }).body, /Anexe o arquivo k\.zip \(/);
});

test("a long report is cut with … and the link stays under the limit, the file line kept", () => {
    const long = "ação & ".repeat(800);
    const m = reportMail({ ...base, text: long, doing: long });
    assert.ok(m.href.length <= MAIL_MAX, `href ${m.href.length}`);
    assert.match(m.body, /…/);
    assert.match(m.body, /Anexe o arquivo keryx-diagnostico-2026-10-20-1432\.zip/);
    assert.match(m.body, /^O que aconteceu:\nação/);
    // Only what they were doing is too long: what happened stays whole.
    const d = reportMail({ ...base, doing: long });
    assert.ok(d.href.length <= MAIL_MAX);
    assert.match(d.body, /O que aconteceu:\nA música foi ao ar sem o fundo\.\n/);
});

test("a short report is never cut", () => {
    assert.doesNotMatch(reportMail(base).body, /…/);
});

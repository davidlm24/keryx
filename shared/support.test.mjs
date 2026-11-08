import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAIL_MAX, SUPPORT_EMAIL, REPORT_URL, reportMail, reportCode, reportOutcome, queueSummary } from "./support.mjs";

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

test("a report's code is the first 20 bits of its id, as the function makes it", () => {
    assert.equal(reportCode("00000000-0000-4000-8000-000000000000"), "R-0000");
    assert.equal(reportCode("fffff000-0000-4000-8000-000000000000"), "R-ZZZZ");
    assert.match(reportCode("3f6c2a10-1b2c-4d3e-8f90-1234567890ab"), /^R-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    assert.equal(reportCode(""), "");
    const fn = fs.readFileSync(new URL("../supabase/functions/relato/index.ts", import.meta.url), "utf8");
    assert.ok(fn.includes('const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"'), "the same alphabet in the function");
    assert.ok(fn.includes('.replace(/-/g, "").slice(0, 5), 16)'), "the same bits in the function");
    assert.ok(REPORT_URL.endsWith("/functions/v1/relato"));
});

test("what the function's answer means for the queue", () => {
    assert.deepEqual(reportOutcome(200, { code: "R-1" }), { status: "sent", code: "R-1" });
    assert.deepEqual(reportOutcome(429, { code: "rate" }), { status: "refused", reason: "rate" });
    assert.deepEqual(reportOutcome(413, null), { status: "refused", reason: "too_big" });
    assert.deepEqual(reportOutcome(400, {}), { status: "refused", reason: "invalid" });
    for (const s of [401, 404, 500, 502, 503, 504, 546]) assert.equal(reportOutcome(s, {}).status, "queued", s);
});

test("the queue's line in Configurações", () => {
    assert.equal(queueSummary([]), "");
    assert.equal(queueSummary([{ refused: null }]), "1 esperando internet");
    assert.equal(queueSummary([{ refused: null }, { refused: null }, { refused: "rate" }]), "2 esperando internet · 1 recusado: mande por e-mail");
    assert.equal(queueSummary([{ refused: "rate" }, { refused: "too_big" }]), "2 recusados: mande por e-mail");
});

test("the e-mail reserve carries the contact and the report's code", () => {
    const m = reportMail({ ...base, contact: "Pr. Marcos · (11) 98765-4321", code: "R-7K2Q" });
    assert.equal(m.subject, "KERYX 0.2.20 · problema R-7K2Q");
    assert.match(m.body, /O que eu estava fazendo:\nMandei da Setlist e apertei Esc\.\n\nContato: Pr\. Marcos · \(11\) 98765-4321\n\nIgreja de exemplo/);
});

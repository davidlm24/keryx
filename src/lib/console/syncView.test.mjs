// node --test src/lib/console/syncView.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { ago, syncStep, syncState, computerRows, sinceLine, sameSyncStatus, biblesMissingHere, editionsList, syncSummary, SYNC_TRAVEL_SUMMARY } from "./syncView.js";
import { syncsHere, googlePage, bytesLabel, quotaView, driveProgress, deviceRows, arrivingPct, cloudView, cloudTone, pageProblems, joinNote, HOLD_DAYS, JOIN_WAIT_MS, GOOGLE_GOES, GOOGLE_STAYS } from "./syncView.js";

const NOW = Date.parse("2026-10-16T20:00:00.000Z");
const minus = (ms) => new Date(NOW - ms).toISOString();
const base = { available: true, folder: "G:\\Meu Drive\\KERYX", paired: true, paused: false, keyLost: false, pc: "me", name: "IGREJA-SOM", version: "0.2.20", since: { sent: 1, applied: 31 }, engine: { state: "ok", lastPass: minus(12000), computers: [] } };

test("ago: seconds, minutes, hours, yesterday, days", () => {
    assert.equal(ago(minus(12000), NOW), "há 12 s");
    assert.equal(ago(minus(3 * 60000), NOW), "há 3 min");
    assert.equal(ago(minus(60 * 60000), NOW), "há 1 hora");
    assert.equal(ago(minus(5 * 3600000), NOW), "há 5 horas");
    assert.equal(ago(minus(30 * 3600000), NOW), "ontem");
    assert.equal(ago(minus(9 * 86400000), NOW), "há 9 dias");
    assert.equal(ago(null, NOW), "");
});

test("the step: the preview, the folder, the code, on", () => {
    assert.equal(syncStep({ available: false }), "unavailable");
    assert.equal(syncStep({ ...base, folder: null }), "folder");
    assert.equal(syncStep({ ...base, paired: false }), "code");
    assert.equal(syncStep({ ...base, keyLost: true }), "code");
    assert.equal(syncStep({ ...base, engine: { state: "mismatch" } }), "code");
    assert.equal(syncStep({ ...base, engine: { state: "removed" } }), "code");
    assert.equal(syncStep(base), "on");
    assert.equal(syncStep({ ...base, paused: true }), "on");
});

test("the Estado row", () => {
    assert.deepEqual(syncState(base, NOW), { tone: "ok", label: "Em dia", detail: "última passagem há 12 s" });
    assert.equal(syncState({ ...base, paused: true }, NOW).label, "Pausada");
    assert.equal(syncState({ ...base, engine: { state: "offline", error: "A pasta de sincronização não está disponível." } }, NOW).tone, "wait");
    assert.match(syncState({ ...base, engine: { state: "mismatch" } }, NOW).label, /código/);
    assert.equal(syncState({ ...base, engine: { state: "off" } }, NOW).label, "Começando…");
    assert.match(syncState({ ...base, keyLost: true }, NOW).label, /de novo/);
    assert.match(syncState({ ...base, engine: { state: "removed" } }, NOW).label, /tirado/);
});

test("the computers: this one first, the others with when they wrote, the ones without the code flagged", () => {
    const st = { ...base, engine: { state: "ok", computers: [
        { pc: "a", name: "NOTEBOOK-PASTOR", version: "0.2.20", lastChange: minus(3 * 60000), verified: true, rejected: 0 },
        { pc: "b", name: "RECEPCAO", version: "0.2.19", lastChange: minus(9 * 86400000), verified: true, rejected: 0 },
        { pc: "c7f0aa", name: null, lastChange: minus(60000), verified: false, rejected: 4 },
        { pc: "d", name: "NOVO", seen: minus(120000), verified: true, rejected: 0 },
        { pc: "e", name: "VELHO", lastChange: minus(86400000 * 40), verified: true, rejected: 0, removed: { at: minus(3600000), by: "me" } },
    ] } };
    const rows = computerRows(st, NOW);
    assert.deepEqual(rows.map((r) => [r.name, r.tone, r.detail, r.tag]), [
        ["IGREJA-SOM", "ok", "este computador · KERYX 0.2.20", "este"],
        ["NOTEBOOK-PASTOR", "ok", "escreveu há 3 min · 0.2.20", "verificado"],
        ["RECEPCAO", "off", "escreveu há 9 dias · 0.2.19", "verificado"],
        ["Computador C7F0", "wait", "4 mudanças ignoradas", "sem o código"],
        ["NOVO", "ok", "visto há 2 min", "verificado"],
        ["VELHO", "off", "tirado há 1 hora por este computador", "tirado"],
    ]);
    assert.equal(sinceLine(st), "1 mudança enviada · 31 recebidas");
});

test("sameSyncStatus: a poll that says nothing new changes nothing", () => {
    // Every poll's answer is a new object from IPC, with the same content between passes.
    const again = JSON.parse(JSON.stringify(base));
    assert.notEqual(again, base);
    assert.equal(sameSyncStatus(base, again), true);
    assert.equal(sameSyncStatus(base, base), true);
    // A computer that does not sync: the same answer every 4 s.
    const off = { available: true, folder: null, paused: false, paired: false, since: { sent: 0 }, engine: { state: "idle" } };
    assert.equal(sameSyncStatus(off, JSON.parse(JSON.stringify(off))), true);
    // A pass ran, a counter moved, paused, the folder chosen: each is new.
    assert.equal(sameSyncStatus(base, { ...base, engine: { ...base.engine, lastPass: minus(1000) } }), false);
    assert.equal(sameSyncStatus(base, { ...base, since: { ...base.since, applied: 32 } }), false);
    assert.equal(sameSyncStatus(base, { ...base, paused: true }), false);
    assert.equal(sameSyncStatus(off, { ...off, folder: "G:\\Meu Drive\\KERYX" }), false);
    // The first answer is never the same as nothing.
    assert.equal(sameSyncStatus(null, base), false);
    assert.equal(sameSyncStatus(base, null), false);
});

test("the Bible editions the other computers have and this one lacks", () => {
    const pc = (id, bibles, extra = {}) => ({ pc: id, name: id, verified: true, bibles, ...extra });
    const st = (computers) => ({ ...base, engine: { ...base.engine, computers } });
    assert.equal(biblesMissingHere(st([]), ["NVI"]), null, "alone in the folder");
    assert.equal(biblesMissingHere(st([pc("b", ["NVI"])]), ["nvi"]), null, "nothing missing");
    assert.deepEqual(biblesMissingHere(st([pc("b", ["ACF", "NVI"])]), ["ACF"]), {
        elsewhere: ["ACF", "NVI"], missing: ["NVI"], own: [], line: "Instaladas no outro computador: ACF e NVI. Falta a NVI aqui.",
    });
    // An edition of the church's own: asked for by its file, never downloaded.
    const bkj = biblesMissingHere(st([pc("b", ["BKJ", "NVI"])]), ["NVI"]);
    assert.deepEqual(bkj.own, ["BKJ"]);
    assert.equal(bkj.line, "Instaladas no outro computador: BKJ e NVI. Falta a BKJ aqui. A BKJ é uma edição da igreja: instale-a com o mesmo arquivo, em Instalar uma edição própria…");
    const many = biblesMissingHere(st([pc("b", ["NVI"]), pc("c", ["AA", "NVI"]), pc("d", ["ACF"], { verified: false }), pc("e", ["ACF"], { removed: { at: "x" } })]), []);
    assert.deepEqual(many.missing, ["AA", "NVI"], "computers without the code or taken out do not count");
    assert.equal(many.line, "Instaladas nos outros computadores: AA e NVI. Faltam a AA e a NVI aqui.");
    assert.equal(editionsList(["NVI", "ACF", "AA"]), "NVI, ACF e AA");
});

test("Código da igreja's summary counts the computers that hold the code", () => {
    assert.equal(syncSummary(base), "1 computador com o código");
    const withOthers = { ...base, engine: { state: "ok", computers: [{ pc: "b", verified: true }, { pc: "c", verified: false }, { pc: "d", verified: true, removed: { at: minus(1000), by: "me" } }, { pc: "e" }] } };
    assert.equal(syncSummary(withOthers), "3 computadores com o código", "this one, a verified one and one nobody checked; not the one without the code, not the removed one");
    assert.ok(SYNC_TRAVEL_SUMMARY.includes("vão") && SYNC_TRAVEL_SUMMARY.includes("ficam"));
});

// -- Google Drive direto, PR 3 (the mockup's boards 1–6) ----------------------

const drive = { available: true, store: "drive", folder: null, paired: true, paused: false, pc: "me", name: "PC-LOUVOR", version: "0.2.22", waiting: 0, since: { sent: 12, applied: 0 }, google: { signedIn: true, email: "igreja@exemplo.com", refused: false, keyLost: false, signingIn: false, configured: true }, engine: { state: "ok", lastPass: minus(40000), lastOk: minus(40000), computers: [] } };
const GB = 1e9;

test("syncsHere: a folder with the code, or Drive with it", () => {
    assert.equal(syncsHere(null), false);
    assert.equal(syncsHere(base), true);
    assert.equal(syncsHere({ ...base, paired: false }), false);
    assert.equal(syncsHere(drive), true);
    assert.equal(syncsHere({ ...drive, store: "folder" }), false);
});

test("googlePage: no desktop, no account, entering, the account, the folder", () => {
    assert.equal(googlePage(null), "unavailable");
    assert.equal(googlePage({ available: false }), "unavailable");
    assert.equal(googlePage({ available: true, folder: null, paired: false, engine: { state: "off" } }), "none", "board 1");
    assert.equal(googlePage({ ...drive, google: { ...drive.google, signingIn: true } }), "signing", "board 2");
    assert.equal(googlePage({ available: true, folder: null, google: { signingIn: true } }), "signing", "entering from nothing");
    assert.equal(googlePage(drive), "on", "board 3");
    assert.equal(googlePage({ ...drive, google: { signedIn: false, refused: true, email: "igreja@exemplo.com" } }), "on", "Google refused: still the account's page, with its problem");
    assert.equal(googlePage({ ...drive, google: { signedIn: false } }), "none", "Sair da conta: back to Entrar com Google");
    assert.equal(googlePage({ ...base, store: "folder" }), "folder", "board 5: the banner, then the folder");
    assert.equal(googlePage(base), "folder");
});

test("bytesLabel: pt-BR decimals", () => {
    assert.equal(bytesLabel(1.2 * GB), "1,2 GB");
    assert.equal(bytesLabel(15 * GB), "15 GB");
    assert.equal(bytesLabel(1 * GB), "1 GB");
    assert.equal(bytesLabel(640e6), "640 MB");
    assert.equal(bytesLabel(-1), "");
});

test("quotaView: the bar always on screen (G2 = A), warned above 90 %", () => {
    assert.equal(quotaView(null), null);
    const q = quotaView({ used: 6.6 * GB, total: 15 * GB, mine: 1.2 * GB });
    assert.equal(q.minePct, 8);
    assert.equal(q.otherPct, 36);
    assert.equal(q.warn, false);
    assert.equal(q.line, "O KERYX usa 1,2 GB · o resto da conta (Gmail, Drive) usa 5,4 GB · 8,4 GB livres de 15 GB");
    const full = quotaView({ used: 14 * GB, total: 15 * GB, mine: 3.3 * GB });
    assert.equal(full.warn, true);
    assert.equal(full.warnLine, "Restam 1 GB de 15 GB");
    assert.match(quotaView({ used: GB, total: null, mine: 0.5 * GB }).line, /não tem limite/);
});

test("driveProgress: em dia, sem internet, parada, desconectado", () => {
    assert.deepEqual(driveProgress(drive, NOW), { tone: "ok", label: "Em dia", detail: "última passagem há 40 s · 12 mudanças enviadas desde que o KERYX abriu" });
    assert.deepEqual(driveProgress({ ...drive, waiting: 7, engine: { state: "offline" } }, NOW), { tone: "wait", label: "Sem internet", detail: "7 mudanças esperando · tenta de novo sozinho" });
    assert.equal(driveProgress({ ...drive, google: { refused: true } }, NOW).tone, "need");
    // Entered, the join with the account's key still to come (Drive did not answer).
    assert.equal(driveProgress({ ...drive, paired: false, engine: { state: "unpaired" } }, NOW).label, "Juntando com a conta");
    assert.equal(driveProgress({ ...drive, engine: { state: "auth" } }, NOW).label, "Parada");
    assert.equal(driveProgress({ ...drive, engine: { state: "removed" } }, NOW).label, "Desconectado");
    assert.equal(driveProgress({ ...drive, engine: { state: "off" } }, NOW).label, "Começando…");
});

test("deviceRows: this one first, a computer long gone holds the cleanup", () => {
    const st = { ...drive, engine: { ...drive.engine, computers: [
        { pc: "a", name: "NOTEBOOK-PASTOR", version: "0.2.22", seen: minus(2 * 3600000), verified: true },
        { pc: "b", name: "PC-RECEPCAO", version: "0.2.21", lastChange: minus(41 * 86400000), verified: true },
        { pc: "c", name: "VELHO", verified: true, removed: { at: minus(3600000), by: "me" } },
        { pc: "d", name: "SEM-CODIGO", verified: false },
    ] } };
    assert.deepEqual(deviceRows(st, NOW).map((r) => [r.name, r.meta, r.stale, r.removed]), [
        ["PC-LOUVOR (este computador)", "KERYX 0.2.22 · agora", false, false],
        ["NOTEBOOK-PASTOR", "KERYX 0.2.22 · visto há 2 horas", false, false],
        ["PC-RECEPCAO", "sem sincronizar há 41 dias · segura a limpeza de arquivos antigos", true, false],
        ["VELHO", "desconectado há 1 hora · volta quando alguém entrar nele com a conta", false, true],
    ]);
    assert.ok(HOLD_DAYS >= 7);
});

test("cloudView: board 6 and its three variants", () => {
    const ok = cloudView({ ...drive, engine: { ...drive.engine, missingMedia: 1, computers: [{ pc: "a", name: "NOTEBOOK-PASTOR", seen: minus(2 * 3600000), verified: true }] }, arriving: { name: "abc.mp4", size: 100, got: 64 } }, NOW);
    assert.equal(ok.tone, "ok");
    assert.equal(ok.label, "Em dia");
    assert.equal(ok.when, "há 40 s");
    assert.equal(ok.act, "now");
    assert.deepEqual(ok.rows, [["Conta", "igreja@exemplo.com"], ["Internet", "conectado"], ["Esperando", "nada a enviar"], ["Chegando", "1 vídeo · 64 %"], ["Computadores", "2"]]);
    const off = cloudView({ ...drive, waiting: 7, engine: { state: "offline" } }, NOW);
    assert.deepEqual([off.tone, off.label, off.act], ["wait", "Sem internet", "retry"]);
    assert.equal(off.text, "7 mudanças esperando. Tudo aqui funciona; elas vão quando a internet voltar.");
    const again = cloudView({ ...drive, google: { signedIn: false, refused: true } }, NOW);
    assert.deepEqual([again.tone, again.label, again.act], ["need", "Entre de novo", "signin"]);
    const none = cloudView({ available: true, folder: null, paired: false, engine: { state: "off" } }, NOW);
    assert.deepEqual([none.tone, none.label, none.act], ["off", "Sem conta", "signin"]);
    assert.equal(cloudView({ ...drive, engine: { state: "removed" } }, NOW).tone, "need");
    assert.equal(cloudView({ ...base, store: "folder" }, NOW).act, "signin", "a folder computer is invited to enter");
    assert.equal(cloudTone({ available: false }), "off", "G5 = A: grey with no account, never hidden");
    assert.equal(cloudView({ ...drive, engine: { ...drive.engine, computers: [{ pc: "b", name: "PC-RECEPCAO", lastChange: minus(41 * 86400000), verified: true }] } }, NOW).rows[4][1], "2 · PC-RECEPCAO sem sincronizar");
});

test("arrivingPct", () => {
    assert.equal(arrivingPct({}), null);
    assert.equal(arrivingPct({ arriving: { name: "a.mp4", size: 0, got: 0 } }), null);
    assert.equal(arrivingPct({ arriving: { name: "a.mp4", size: 200, got: 129 } }), 64);
});

test("pageProblems: board 4 in order, the new account until É esta mesmo", () => {
    assert.deepEqual(pageProblems(drive, null), []);
    assert.deepEqual(pageProblems({ ...drive, google: { refused: true, email: "x@y" } }, null), ["auth"]);
    assert.deepEqual(pageProblems({ ...drive, engine: { state: "removed" } }, null), ["removed"]);
    const fresh = { ...drive, accountNew: true, google: { ...drive.google, email: "pessoal@gmail.com" } };
    assert.deepEqual(pageProblems(fresh, null), ["account"]);
    assert.deepEqual(pageProblems(fresh, null, "Pessoal@gmail.com"), [], "É esta mesmo, for that e-mail");
    assert.deepEqual(pageProblems(drive, { used: 14 * GB, total: 15 * GB, mine: GB }), ["space"]);
    assert.deepEqual(pageProblems({ ...base, store: "folder" }, null), [], "the folder page has its own banner");
});

test("joinNote (G1 = A): one toast after the first quiet pass", () => {
    const at = minus(60000);
    const pending = { at, before: 120 };
    const passed = (applied, when = minus(1000)) => ({ ...drive, engine: { state: "ok", lastOk: when, received: { applied } } });
    assert.equal(joinNote(null, drive, 0, NOW), null);
    assert.equal(joinNote(pending, passed(50), 150, NOW), null, "rows still arriving");
    assert.equal(joinNote(pending, passed(0, minus(120000)), 120, NOW), null, "a pass from before the entry");
    assert.equal(joinNote(pending, passed(0), 204, NOW), "Juntou com a conta da igreja: 84 músicas vieram e 120 foram daqui.");
    assert.equal(joinNote({ at, before: 0 }, passed(0), 1, NOW), "Juntou com a conta da igreja: 1 música veio.");
    assert.equal(joinNote({ at, before: 5 }, passed(0), 5, NOW), "Juntou com a conta da igreja: 5 músicas foram daqui.");
    assert.equal(joinNote({ at, before: 0 }, passed(0), 0, NOW), "drop", "an empty computer on an empty account says nothing");
    const late = { at: minus(JOIN_WAIT_MS + 1000), before: 1 };
    assert.match(joinNote(late, passed(3), 4, NOW), /3 músicas vieram/, "past the wait it says what came so far");
    assert.equal(joinNote({ at: minus(31 * 60000), before: 1 }, passed(0), 4, NOW), "drop");
    assert.ok(GOOGLE_GOES.startsWith("Vão:") && GOOGLE_STAYS.startsWith("Ficam aqui:"));
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLogger } = require("./logger.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-log-"));

test("writes timestamped lines to a daily file, formatting non-strings", () => {
    const dir = tmp();
    const log = createLogger({ dir, now: () => new Date(2026, 9, 6, 9, 5, 7) });
    log.info("aberto");
    log.warn("campo", { a: 1 });
    log.error(new Error("falhou").message, [1, 2]);
    const text = fs.readFileSync(path.join(dir, "keryx-2026-10-06.log"), "utf8").trimEnd().split("\n");
    assert.deepEqual(text, [
        "09:05:07 info  aberto",
        "09:05:07 warn  campo { a: 1 }",
        "09:05:07 error falhou [ 1, 2 ]",
    ]);
});

test("keeps the newest 7 daily files and nothing else", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "outro.txt"), "x");
    for (let d = 1; d <= 10; d++) fs.writeFileSync(path.join(dir, `keryx-2026-09-${String(d).padStart(2, "0")}.log`), "x");
    const log = createLogger({ dir, now: () => new Date(2026, 9, 6) });
    const left = fs.readdirSync(dir).sort();
    assert.deepEqual(left, ["keryx-2026-09-04.log", "keryx-2026-09-05.log", "keryx-2026-09-06.log", "keryx-2026-09-07.log", "keryx-2026-09-08.log", "keryx-2026-09-09.log", "keryx-2026-09-10.log", "outro.txt"]);
    assert.deepEqual(log.recentFiles(2).map((f) => path.basename(f)), ["keryx-2026-09-10.log", "keryx-2026-09-09.log"]);
});

test("a failing log write never throws", () => {
    const dir = tmp();
    const log = createLogger({ dir });
    fs.rmSync(dir, { recursive: true });
    assert.doesNotThrow(() => log.error("sem pasta"));
});

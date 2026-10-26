// node --test scripts/google-secret.test.cjs   (npm test)
// The Google client secret reaches the installer from the builder's shell,
// never from git: written before the pack, gone after, and a build without
// it stops unless it says so.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { writeSecret, removeSecret, FILE, ENV, SKIP } = require("./google-secret.cjs");
const pkg = require("../package.json");

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-gsecret-")), "googleSecret.json");

test("the secret from the shell is written for the pack, and removed after", () => {
    const file = tmpFile();
    assert.equal(writeSecret({ env: { [ENV]: "  GOCSPX-teste_123  " }, file }), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { clientSecret: "GOCSPX-teste_123" });
    removeSecret({ file });
    assert.equal(fs.existsSync(file), false);
    removeSecret({ file }); // already gone: nothing
});

test("no secret stops the build, unless a build without Google is asked for", () => {
    const file = tmpFile();
    assert.throws(() => writeSecret({ env: {}, file }), new RegExp(ENV));
    assert.throws(() => writeSecret({ env: { [ENV]: "duas palavras" }, file }), /não parece/);
    fs.writeFileSync(file, "{}");
    assert.equal(writeSecret({ env: { [SKIP]: "1" }, file }), false);
    assert.equal(fs.existsSync(file), false, "an old file never rides a build without Google");
});

test("electron-builder runs both hooks, the file is packed, and git never keeps it", () => {
    assert.equal(pkg.build.beforePack, "./scripts/google-secret-before.cjs");
    assert.equal(pkg.build.afterPack, "./scripts/google-secret-after.cjs");
    assert.equal(typeof require("./google-secret-before.cjs"), "function");
    assert.equal(typeof require("./google-secret-after.cjs"), "function");
    assert.ok(pkg.build.files.includes("electron/**/*"));
    assert.equal(FILE, path.join(__dirname, "..", "electron", "googleSecret.json"));
    const ignored = execFileSync("git", ["check-ignore", "-q", "--no-index", "electron/googleSecret.json"], { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    assert.equal(ignored.length, 0, "git check-ignore exits 0: the file is ignored");
});

test("googleConfig takes the built file, the shell overriding it", () => {
    const config = path.join(__dirname, "..", "electron", "googleConfig.cjs");
    const run = (env) => execFileSync(process.execPath, ["-e", `process.stdout.write(String(require(${JSON.stringify(config)}).clientSecret))`], { env: { ...process.env, ...env }, encoding: "utf8" });
    const had = fs.existsSync(FILE);
    if (!had) {
        assert.equal(run({ [ENV]: "" }), "null");
        fs.writeFileSync(FILE, JSON.stringify({ clientSecret: "GOCSPX-do-build" }));
        try {
            assert.equal(run({ [ENV]: "" }), "GOCSPX-do-build");
            assert.equal(run({ [ENV]: "GOCSPX-do-terminal" }), "GOCSPX-do-terminal");
        } finally {
            fs.rmSync(FILE, { force: true });
        }
    } else {
        assert.equal(run({ [ENV]: "GOCSPX-do-terminal" }), "GOCSPX-do-terminal");
    }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { localProblems, taken, uploads } = require("./release-upload.cjs");

const V = "0.2.17";
const yml = (notes = true) => `version: ${V}
files:
  - url: KERYX-Setup-${V}.exe
    sha512: abc==
    size: 100
path: KERYX-Setup-${V}.exe
sha512: abc==
${notes ? "releaseNotes: |\n  ## O que mudou\n" : ""}releaseDate: '2026-10-14T10:00:00.000Z'
`;
const files = [{ name: `KERYX-Setup-${V}.exe`, size: 100 }, { name: `KERYX-Setup-${V}.exe.blockmap`, size: 9 }, { name: "latest.yml", size: 300 }];
const installer = { sha512: "abc==", size: 100 };
const notes = "## O que mudou na 0.2.17\n";

test("a sound build may go up", () => {
    assert.deepEqual(localProblems({ version: V, files, yml: yml(), installer, notes }), []);
});

test("a build without its blockmap, or of another installer, stays home", () => {
    assert.deepEqual(localProblems({ version: V, files: files.filter((f) => !f.name.endsWith(".blockmap")), yml: yml(), installer, notes }), [`falta o arquivo KERYX-Setup-${V}.exe.blockmap`]);
    assert.match(localProblems({ version: V, files, yml: yml(), installer: { sha512: "outro==", size: 100 }, notes }).join("|"), /sha512/);
});

test("the notes: their file must exist and the build must have used it", () => {
    assert.match(localProblems({ version: V, files, yml: yml(), installer, notes: null }).join("|"), /falta docs\/release-notes\/0\.2\.17\.md/);
    assert.match(localProblems({ version: V, files, yml: yml(false), installer, notes }).join("|"), /latest\.yml sem as notas/);
});

test("any release of the version, draft or public, is taken", () => {
    const releases = [{ tag_name: "v0.2.16", draft: false }, { tag_name: `v${V}`, draft: true }];
    assert.equal(taken(releases, V), releases[1]);
    assert.equal(taken([{ tag_name: V, draft: false }], V).tag_name, V);
    assert.equal(taken([{ tag_name: "v0.2.16" }, { tag_name: "v0.2.170" }], V), null);
});

test("latest.yml goes up last, after the installer and its blockmap", () => {
    assert.deepEqual(uploads(V), [`KERYX-Setup-${V}.exe`, `KERYX-Setup-${V}.exe.blockmap`, "latest.yml"]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { problems } = require("./release-check.cjs");

const V = "0.2.15";
const yml = (over = {}) => `version: ${over.version || V}
files:
  - url: KERYX-Setup-${V}.exe
    sha512: ${over.sha || "abc=="}
    size: ${over.size || 100}
path: ${over.path || `KERYX-Setup-${V}.exe`}
sha512: ${over.sha || "abc=="}
releaseNotes: |
  ## O que mudou
releaseDate: '2026-10-11T10:00:00.000Z'
`;
const assets = (size = 100) => [{ name: `KERYX-Setup-${V}.exe`, size }, { name: `KERYX-Setup-${V}.exe.blockmap`, size: 9 }, { name: "latest.yml", size: 300 }];
const installer = { sha512: "abc==", size: 100 };

test("a sound release has nothing wrong", () => {
    assert.deepEqual(problems({ version: V, assets: assets(), yml: yml(), installer }), []);
});

test("the 422 case: only the blockmap came up", () => {
    const only = [{ name: `KERYX-Setup-${V}.exe.blockmap`, size: 9 }];
    const bad = problems({ version: V, assets: only, yml: null, installer: null });
    assert.deepEqual(bad, [`falta o arquivo KERYX-Setup-${V}.exe`, "falta o arquivo latest.yml"]);
});

test("latest.yml of another version, another installer or another size is caught", () => {
    assert.match(problems({ version: V, assets: assets(), yml: yml({ version: "0.2.14" }), installer }).join("|"), /diz a versão 0\.2\.14/);
    assert.match(problems({ version: V, assets: assets(), yml: yml({ path: "KERYX-Setup-0.2.14.exe" }), installer }).join("|"), /aponta para KERYX-Setup-0\.2\.14\.exe/);
    assert.match(problems({ version: V, assets: assets(), yml: yml({ sha: "outro==" }), installer }).join("|"), /sha512/);
    assert.match(problems({ version: V, assets: assets(), yml: yml({ size: 101 }), installer }).join("|"), /tamanho/);
    assert.match(problems({ version: V, assets: assets(99), yml: yml(), installer }).join("|"), /tamanho/);
});

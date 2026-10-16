const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { OUTPUT_PAGES, OUTPUT_BUDGET, pageLoad, checkBundle, summary } = require("./bundle-budget.cjs");
const { NETWORK_SCREENS, REMOTE_PATH } = require("../electron/lan.cjs");

const ROOT = "C:\\keryx\\";
const chunk = (fileName, bytes, { isEntry = false, imports = [], modules = [], css = [] } = {}) => ({ fileName, isEntry, imports, bytes, css, moduleIds: modules.map((m) => ROOT + m.split("/").join("\\")) });

// The shape the split build has: an entry, a renderer chunk shared by the
// outputs and the console, a console chunk, one chunk per output page.
const bundle = (over = {}) => [
    chunk("assets/index.js", 280_000, { isEntry: true, modules: ["src/main.jsx", "src/App.jsx"], css: ["assets/index.css"] }),
    chunk("assets/renderer.js", 58_000, { modules: ["src/components/screen/ScreenRenderer.jsx"], imports: ["assets/index.js"] }),
    chunk("assets/WinPages.js", 466_000, { modules: ["src/components/console/WinPages.jsx"], imports: ["assets/index.js", "assets/renderer.js"] }),
    chunk("assets/Console.js", 165_000, { modules: ["src/pages/Console.jsx"], imports: ["assets/index.js", "assets/WinPages.js", "assets/renderer.js"] }),
    ...Object.values(OUTPUT_PAGES).map((m) => chunk(`assets/${path.basename(m, ".jsx")}.js`, 2_000, { modules: [m], imports: ["assets/index.js", "assets/renderer.js"], ...(over[m] || {}) })),
];

test("the output pages are the network's: every NETWORK_SCREENS page, the remote and the start page", () => {
    const paths = Object.keys(OUTPUT_PAGES);
    for (const s of NETWORK_SCREENS) assert.ok(paths.includes(s.path), `${s.path} has no budget`);
    assert.ok(paths.includes(REMOTE_PATH));
    assert.ok(paths.includes("/"));
    for (const file of Object.values(OUTPUT_PAGES)) assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `${file} does not exist`);
});

test("a page loads the entry, its chunk and what they import, once each", () => {
    const load = pageLoad(bundle(), "src/pages/Projection.jsx");
    assert.deepEqual(load.files.sort(), ["assets/Projection.js", "assets/index.js", "assets/renderer.js"]);
    assert.equal(load.bytes, 280_000 + 58_000 + 2_000);
    assert.equal(pageLoad(bundle(), "src/pages/Console.jsx").bytes, 280_000 + 58_000 + 466_000 + 165_000);
    assert.equal(pageLoad(bundle(), "src/pages/Nada.jsx"), null);
});

test("a sound bundle passes", () => {
    const { loads, errors } = checkBundle(bundle());
    assert.deepEqual(errors, []);
    assert.equal(loads["/StageView"], 340_000);
    assert.match(summary(loads, 969_000), /340\.0 kB–340\.0 kB of JS \(budget 400\.0 kB\), the console 969\.0 kB/);
});

test("an output that pulls the console's code in is refused", () => {
    const { errors } = checkBundle(bundle({ "src/pages/StageView.jsx": { imports: ["assets/index.js", "assets/WinPages.js"] } }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^\/StageView loads 806\.0 kB of JS, over the outputs' budget of 400\.0 kB/);
    assert.ok(OUTPUT_BUDGET < 806_000);
});

test("a page missing from the bundle and a stylesheet outside the entry are refused", () => {
    const missing = bundle().filter((c) => c.fileName !== "assets/PastorView.js");
    assert.match(checkBundle(missing).errors.join("|"), /src\/pages\/PastorView\.jsx \(\/PastorView\) is not in the bundle/);
    const css = checkBundle(bundle({ "src/pages/RemoteView.jsx": { css: ["assets/RemoteView.css"] } })).errors;
    assert.deepEqual(css, ["assets/RemoteView.css loads with assets/RemoteView.js, after Tailwind: import the stylesheet in src/App.jsx's list."]);
});

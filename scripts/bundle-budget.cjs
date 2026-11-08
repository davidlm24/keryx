// The build-size budget (Codex audit 2026-10-16, "Outputs pay for the whole
// console bundle"). Every page is a chunk of its own (src/App.jsx): an output
// window, or a tablet or TV on the church network, loads the entry, its page
// and the chunks they import, and none of the console's code. The servers
// (electron/server.cjs, lan.cjs) send the files as built, uncompressed, so the
// budget counts bytes as built. Checked at the end of `vite build`
// (vite.config.js), so CI and every release build refuse a bundle past it;
// raising the budget is a decision to explain in the PR.

// What a screen may open: the NETWORK_SCREENS pages (electron/lan.cjs; the
// test checks the two lists agree), the controle remoto and the network's
// start page. Output windows on this computer open the same pages.
const OUTPUT_PAGES = {
    "/Projection": "src/pages/Projection.jsx",
    "/LyricProjection": "src/pages/LyricProjection.jsx",
    "/StageView": "src/pages/StageView.jsx",
    "/VideoProjection": "src/pages/VideoProjection.jsx",
    "/CommunicationProjection": "src/pages/CommunicationProjection.jsx",
    "/PastorView": "src/pages/PastorView.jsx",
    "/StreamView": "src/pages/StreamView.jsx",
    "/Remote": "src/pages/RemoteView.jsx",
    "/": "src/components/network/NetworkHome.jsx",
};
// Bytes of JS an output may load before it draws. 2026-10-16: 286–350 kB
// (StageView the heaviest); the whole console was 1,466 kB before the split.
const OUTPUT_BUDGET = 400_000;
// Only reported, never refused: what the console loads.
const CONSOLE_PAGE = "src/pages/Console.jsx";

const posix = (id) => String(id).split("\\").join("/").split("?")[0];
const kB = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

// The JS a page loads before it draws: the entry, the chunk holding the
// page's module and every chunk either imports statically (Vite preloads a
// lazy page's imports with it). `chunks`: [{ fileName, isEntry, imports,
// moduleIds, bytes }]. null when no chunk holds the module.
function pageLoad(chunks, module) {
    const byName = new Map(chunks.map((c) => [c.fileName, c]));
    const entry = chunks.find((c) => c.isEntry);
    const home = chunks.find((c) => c.moduleIds.some((id) => posix(id).endsWith(`/${module}`)));
    if (!entry || !home) return null;
    const files = new Set();
    const stack = [entry.fileName, home.fileName];
    while (stack.length) {
        const file = stack.pop();
        if (files.has(file) || !byName.has(file)) continue;
        files.add(file);
        stack.push(...byName.get(file).imports);
    }
    return { files: [...files], bytes: [...files].reduce((n, f) => n + byName.get(f).bytes, 0) };
}

// Every output page within the budget, and every stylesheet in the entry
// (src/App.jsx lists them in the order the single bundle had, so the
// console's ties with Tailwind's utilities resolve as before; a stylesheet a
// lazy chunk brought would load after Tailwind). `chunks` also carry `css`,
// the stylesheets Vite emitted for them.
function checkBundle(chunks, { pages = OUTPUT_PAGES, budget = OUTPUT_BUDGET } = {}) {
    const loads = {};
    const errors = [];
    for (const [path, module] of Object.entries(pages)) {
        const load = pageLoad(chunks, module);
        if (!load) {
            errors.push(`${module} (${path}) is not in the bundle: update OUTPUT_PAGES in scripts/bundle-budget.cjs.`);
            continue;
        }
        loads[path] = load.bytes;
        if (load.bytes > budget) errors.push(`${path} loads ${kB(load.bytes)} of JS, over the outputs' budget of ${kB(budget)}: keep the console's code out of the output path (a lazy import), see scripts/bundle-budget.cjs.`);
    }
    for (const c of chunks) {
        if (!c.isEntry && c.css && c.css.length) errors.push(`${c.css.join(", ")} loads with ${c.fileName}, after Tailwind: import the stylesheet in src/App.jsx's list.`);
    }
    return { loads, errors };
}

function summary(loads, consoleBytes, budget = OUTPUT_BUDGET) {
    const sizes = Object.values(loads);
    const range = sizes.length ? `${kB(Math.min(...sizes))}–${kB(Math.max(...sizes))}` : "nothing";
    return `keryx bundle: an output loads ${range} of JS (budget ${kB(budget)})${consoleBytes ? `, the console ${kB(consoleBytes)}` : ""}.`;
}

// The Vite plugin (build only). It measures the minified chunks before
// anything is written, a few hundred bytes short of the files (Vite fills
// in the preload lists after).
function bundleBudget() {
    let logger = null;
    return {
        name: "keryx-bundle-budget",
        apply: "build",
        configResolved(config) { logger = config.logger; },
        generateBundle(_, bundle) {
            const chunks = Object.values(bundle).filter((c) => c.type === "chunk").map((c) => ({
                fileName: c.fileName,
                isEntry: c.isEntry,
                imports: c.imports,
                moduleIds: c.moduleIds,
                bytes: Buffer.byteLength(c.code),
                css: [...(c.viteMetadata?.importedCss || [])],
            }));
            const { loads, errors } = checkBundle(chunks);
            if (errors.length) this.error(`Bundle budget:\n  ${errors.join("\n  ")}`);
            logger?.info(summary(loads, pageLoad(chunks, CONSOLE_PAGE)?.bytes));
        },
    };
}

module.exports = { OUTPUT_PAGES, OUTPUT_BUDGET, pageLoad, checkBundle, summary, bundleBudget };

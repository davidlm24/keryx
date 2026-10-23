// Is dist/ older than the sources? Phones and network screens are served from
// dist/ by electron/lan.cjs even under `desktop:dev`, so a stale build shows
// them an old page while the console (Vite) is current. Pure parts are tested
// (dist-stale.test.cjs); scripts/desktop.mjs dev decides what to do with them.
const fs = require("node:fs");
const path = require("node:path");

// What the build is made from; tests do not change what dist/ holds.
const SOURCE_DIRS = ["src", "shared"];
const IGNORED = /\.test\.[cm]?[jt]sx?$/;

// The newest mtime (ms) of any file under `dir`, or 0 when there is none.
function newestMtime(dir, fsx = fs) {
    let newest = 0;
    let entries;
    try {
        entries = fsx.readdirSync(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtime(full, fsx));
        } else if (!IGNORED.test(entry.name)) {
            try {
                newest = Math.max(newest, fsx.statSync(full).mtimeMs);
            } catch {
                // a file that vanished mid-scan is not a source
            }
        }
    }
    return newest;
}

// { stale, missing, builtAt, sourceAt }: stale also when dist/index.html is missing.
function distStatus(root, fsx = fs) {
    const index = path.join(root, "dist", "index.html");
    let builtAt = 0;
    try {
        builtAt = fsx.statSync(index).mtimeMs;
    } catch {
        return { stale: true, missing: true, builtAt: 0, sourceAt: 0 };
    }
    const sourceAt = Math.max(0, ...SOURCE_DIRS.map((d) => newestMtime(path.join(root, d), fsx)));
    return { stale: sourceAt > builtAt, missing: false, builtAt, sourceAt };
}

module.exports = { newestMtime, distStatus, SOURCE_DIRS };

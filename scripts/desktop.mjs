#!/usr/bin/env node
// Runs the desktop shell.
//   node scripts/desktop.mjs dev     Vite dev server + Electron on it (hot reload);
//                                    rebuilds a stale dist/ first, for phones and network screens
//   node scripts/desktop.mjs start   Electron on the built app in dist/
//   node scripts/desktop.mjs smoke   like start, but exits after the checks in electron/smoke.cjs
//   KERYX_SMOKE=1 node scripts/desktop.mjs dev   the same checks against the dev server,
//                                                plus the renderer adapter end to end
//   KERYX_SOAK=<minutes> with smoke: a long service on a loop, measured to a
//                                                CSV instead of the checks (electron/soak.cjs, docs/requisitos.md)
// Smoke runs use a throwaway data dir, never the real database.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron"); // the package exports the binary path
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "start";

if (!["dev", "start", "smoke"].includes(mode)) {
    console.error(`Unknown mode "${mode}". Use dev, start or smoke.`);
    process.exit(2);
}

const smoke = mode === "smoke" || process.env.KERYX_SMOKE === "1";
const smokeEnv = smoke
    ? { KERYX_SMOKE: "1", KERYX_PORT: "0", KERYX_LAN_PORT: "0", KERYX_DATA_DIR: process.env.KERYX_DATA_DIR || mkdtempSync(path.join(os.tmpdir(), "keryx-smoke-")) }
    : {};

function run(env) {
    return new Promise((resolve) => {
        const child = spawn(electronPath, [root], { stdio: "inherit", env: { ...process.env, ...env } });
        child.on("exit", (code) => resolve(code ?? 0));
    });
}

if (mode === "dev") {
    // The console runs from Vite, but phones and network screens are served
    // from dist/ (electron/lan.cjs). A stale dist/ shows them an old page, so
    // rebuild it first (about 20 s); KERYX_SKIP_BUILD=1 only warns.
    const { distStatus } = require("./dist-stale.cjs");
    const status = distStatus(root);
    if (status.stale) {
        const why = status.missing ? "dist/ is missing" : "dist/ is older than src/ or shared/";
        if (process.env.KERYX_SKIP_BUILD === "1") {
            console.warn(`Warning: ${why}, so phones and network screens will show an old page. Run \`npm run build\`.`);
        } else {
            console.log(`${why}: phones and network screens are served from it. Building (KERYX_SKIP_BUILD=1 skips)...`);
            const { build } = await import("vite");
            await build({ root, logLevel: "warn" });
        }
    }
    // The app talks to its own store over IPC: no browser preview store here.
    process.env.KERYX_NO_PREVIEW = "1";
    const { createServer } = await import("vite");
    const vite = await createServer({ root, server: { host: "127.0.0.1" } });
    await vite.listen();
    const url = vite.resolvedUrls?.local?.[0]?.replace(/\/$/, "");
    if (!url) {
        console.error("Vite did not report a local URL.");
        await vite.close();
        process.exit(1);
    }
    console.log(`Vite on ${url}; starting Electron`);
    const code = await run({ KERYX_DEV_URL: url, ...smokeEnv });
    await vite.close();
    process.exit(code);
} else {
    if (!existsSync(path.join(root, "dist", "index.html"))) {
        console.error("dist/ is missing. Run `npm run build` first.");
        process.exit(1);
    }
    process.exit(await run(smokeEnv));
}

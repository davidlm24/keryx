// The Google client secret goes into the installer, never into git (owner
// 2026-10-26): electron-builder's beforePack (package.json "build") writes
// it from the builder's own shell, KERYX_GOOGLE_CLIENT_SECRET, into
// electron/googleSecret.json (gitignored), which electron/googleConfig.cjs
// reads; afterPack removes it again once it is packed. Without the variable
// the build stops, so no installer ships whose "Entrar com Google" can only
// fail — unless KERYX_BUILD_WITHOUT_GOOGLE=1 says so on purpose (a test
// build). Google treats a desktop client's secret as public (it is readable
// in the installer); it is kept out of the repository by the project's rule
// for secrets, and so GitHub's push protection never blocks a push.

const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "electron", "googleSecret.json");
const ENV = "KERYX_GOOGLE_CLIENT_SECRET";
const SKIP = "KERYX_BUILD_WITHOUT_GOOGLE";

// The value from the environment, or null; never printed.
function secretFrom(env) {
    const v = String(env[ENV] || "").trim();
    if (!v) return null;
    if (/\s/.test(v) || v.length > 200) throw new Error(`${ENV} não parece a chave secreta do cliente do Google (uma linha, sem espaços).`);
    return v;
}

// -> true when the secret was written, false for a build without Google.
function writeSecret({ env = process.env, file = FILE } = {}) {
    const secret = secretFrom(env);
    if (!secret) {
        if (env[SKIP] === "1") {
            fs.rmSync(file, { force: true });
            return false;
        }
        throw new Error(`Falta ${ENV} neste terminal: sem ela, "Entrar com Google" do instalador não funciona (docs/google-drive-setup.md). Para um build de teste sem Google, ${SKIP}=1.`);
    }
    fs.writeFileSync(file, `${JSON.stringify({ clientSecret: secret })}\n`);
    return true;
}

function removeSecret({ file = FILE } = {}) {
    fs.rmSync(file, { force: true });
}

module.exports = { writeSecret, removeSecret, secretFrom, FILE, ENV, SKIP };

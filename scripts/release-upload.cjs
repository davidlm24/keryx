#!/usr/bin/env node
// Uploads a KERYX build to comunidadegerar/keryx-releases as ONE draft.
//
//   npx electron-builder --win --publish never -c.releaseInfo.releaseNotesFile=docs/release-notes/0.2.17.md
//   GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-upload.cjs 0.2.17 [--dry-run]
//
// Why not `electron-builder --publish always`: its PublishManager caches the
// GitHub publisher only after an await (reading the release notes), so the
// installer's and the blockmap's artifact events, arriving together, each
// get a publisher of their own and each creates the release. 0.2.15 and
// 0.2.16 came out as two drafts of one tag. Here the build publishes nothing;
// this script checks the files in release/ with release-check's own rules
// (plus the notes), refuses if v<version> exists in any state, creates the
// draft as electron-builder did (tag v<version>, name <version>, the notes as
// its text) and uploads one file at a time: the installer, its blockmap,
// latest.yml last. Then it runs release-check.cjs on the draft; making it
// public stays `release-check.cjs <version> --publish`. --dry-run stops
// before the first write. Exit 1 on anything wrong; the token is never
// printed.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { problems, api, headers, REPO } = require("./release-check.cjs");

const ROOT = path.join(__dirname, "..");

// The files of a release, in the order they go up: latest.yml, what the
// updater reads, only once the installer it names is there.
const uploads = (version) => [`KERYX-Setup-${version}.exe`, `KERYX-Setup-${version}.exe.blockmap`, "latest.yml"];

// What is wrong with the local build: [] when it may go up.
function localProblems({ version, files, yml, installer, notes }) {
    const out = problems({ version, assets: files, yml, installer });
    if (!notes || !notes.trim()) out.push(`falta docs/release-notes/${version}.md (o texto do release)`);
    else if (yml && !/^releaseNotes:/m.test(yml)) out.push(`latest.yml sem as notas: construa com -c.releaseInfo.releaseNotesFile=docs/release-notes/${version}.md`);
    return out;
}

// A release of this version already there, draft or public (electron-builder
// also took a bare "<version>" tag as the same release).
const taken = (releases, version) => releases.find((r) => r.tag_name === `v${version}` || r.tag_name === version) || null;

async function sha512(file) {
    const hash = crypto.createHash("sha512");
    let size = 0;
    for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); size += chunk.length; }
    return { sha512: hash.digest("base64"), size };
}

async function upload(release, file, name) {
    const body = await fs.promises.readFile(file);
    const url = `${release.upload_url.replace(/\{.*$/, "")}?name=${encodeURIComponent(name)}`;
    const type = name.endsWith(".yml") ? "text/yaml" : "application/octet-stream";
    const res = await fetch(url, { method: "POST", body, headers: headers({ Accept: "application/vnd.github+json", "Content-Type": type }) });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const asset = await res.json();
    if (asset.size !== body.length) throw new Error(`subiram ${asset.size} de ${body.length} bytes`);
}

async function main() {
    const args = process.argv.slice(2);
    const version = args[0];
    const dryRun = args.includes("--dry-run");
    const at = args.indexOf("--dir");
    const dir = path.resolve(at > -1 ? args[at + 1] || "" : path.join(ROOT, "release"));
    if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("uso: release-upload.cjs <versão> [--dry-run] [--dir <pasta>]");
    if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN não definido (veja o README, Releasing)");

    const names = uploads(version);
    const files = names.filter((n) => fs.existsSync(path.join(dir, n))).map((n) => ({ name: n, size: fs.statSync(path.join(dir, n)).size }));
    const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
    const yml = read(path.join(dir, "latest.yml"));
    const notes = read(path.join(ROOT, "docs", "release-notes", `${version}.md`));
    const exe = path.join(dir, names[0]);
    const installer = fs.existsSync(exe) ? await sha512(exe) : null;
    console.log(`${dir}: ${files.map((f) => f.name).join(", ") || "nenhum arquivo"}`);
    const bad = localProblems({ version, files, yml, installer, notes });
    if (bad.length) { bad.forEach((p) => console.error(`  ✗ ${p}`)); throw new Error("o build não está pronto; nada foi enviado"); }
    console.log(`  ✓ instalador, blockmap e latest.yml desta versão; sha512 e tamanho conferem (${installer.size} bytes)`);

    const found = taken(await api("/releases?per_page=100"), version);
    if (found) throw new Error(`${REPO} já tem ${found.draft ? "um rascunho" : "o release"} ${found.tag_name} (${found.assets.map((a) => a.name).join(", ") || "sem arquivos"}); nada foi enviado. Veja o README, Releasing.`);
    console.log(`  ✓ ${REPO} ainda não tem v${version}`);
    if (dryRun) { console.log(`--dry-run: criaria o rascunho v${version} e enviaria, um por vez: ${names.join(", ")}`); return; }

    const release = await api("/releases", { method: "POST", body: JSON.stringify({ tag_name: `v${version}`, name: version, body: notes, draft: true }) });
    console.log(`  ✓ rascunho v${version} criado`);
    const sent = [];
    for (const name of names) {
        try { await upload(release, path.join(dir, name), name); }
        catch (err) {
            throw new Error(`o envio de ${name} falhou (${err.message}); o rascunho v${version} ficou com: ${sent.join(", ") || "nada"}. Não rode de novo: complete o rascunho à mão (README, Releasing).`);
        }
        sent.push(name);
        console.log(`  ✓ ${name}`);
    }

    const check = spawnSync(process.execPath, [path.join(__dirname, "release-check.cjs"), version], { stdio: "inherit" });
    if (check.status !== 0) process.exitCode = 1;
}

if (require.main === module) main().catch((err) => { console.error(`✗ ${err.message}`); process.exitCode = 1; });
module.exports = { localProblems, taken, uploads };

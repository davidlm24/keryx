#!/usr/bin/env node
// Checks a KERYX release in comunidadegerar/keryx-releases and, with
// --publish, makes a draft public once it is sound.
//
//   GH_TOKEN="$(gh auth token --user comunidadegerar)" node scripts/release-check.cjs 0.2.15 [--publish]
//
// release-upload.cjs makes the release a draft, which the updater cannot
// see. The checks: the release has the installer, its blockmap and
// latest.yml; latest.yml names this version; the installer's sha512 and size
// are the ones latest.yml says. Only then, with --publish, the draft goes
// public, and the public latest.yml is read back. Exit 1 on anything wrong;
// the token is never printed. KERYX_RELEASES_REPO=owner/name points it (and
// release-upload.cjs) at a throwaway repository instead.

const crypto = require("node:crypto");

const REPO = process.env.KERYX_RELEASES_REPO || "comunidadegerar/keryx-releases";

// What is wrong with a release, from what was read of it: [] when sound.
function problems({ version, assets, yml, installer }) {
    const out = [];
    const want = [`KERYX-Setup-${version}.exe`, `KERYX-Setup-${version}.exe.blockmap`, "latest.yml"];
    for (const name of want) if (!assets.some((a) => a.name === name)) out.push(`falta o arquivo ${name}`);
    if (!yml) return out;
    // version and path are top-level keys; size sits under files[0].
    const field = (key, indent = "") => (new RegExp(`^${indent}${key}: *'?([^'\\n]+)'?\\s*$`, "m").exec(yml) || [])[1]?.trim();
    if (field("version") !== version) out.push(`latest.yml diz a versão ${field("version") || "(nenhuma)"}, não ${version}`);
    if (field("path") !== `KERYX-Setup-${version}.exe`) out.push(`latest.yml aponta para ${field("path") || "(nada)"}`);
    if (installer) {
        const sha = (/^\s*(?:- )?(?:url: .*\n\s*)?sha512: *(\S+)/m.exec(yml) || [])[1];
        if (installer.sha512 !== sha) out.push("o sha512 do instalador não é o do latest.yml");
        const size = Number(field("size", " +"));
        if (installer.size !== size) out.push(`o tamanho do instalador (${installer.size}) não é o do latest.yml (${size})`);
        const asset = assets.find((a) => a.name === `KERYX-Setup-${version}.exe`);
        if (asset && asset.size !== installer.size) out.push("o arquivo enviado não é o que foi baixado (tamanho)");
    }
    return out;
}

const headers = (extra = {}) => ({ Authorization: `Bearer ${process.env.GH_TOKEN}`, "User-Agent": "keryx-release-check", ...extra });
const api = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { ...init, headers: headers({ Accept: "application/vnd.github+json", ...(init.headers || {}) }) });
    if (!res.ok) throw new Error(`GitHub ${res.status} em ${path}`);
    return res.json();
};
const download = (id) => fetch(`https://api.github.com/repos/${REPO}/releases/assets/${id}`, { headers: headers({ Accept: "application/octet-stream" }), redirect: "follow" });

async function main() {
    const version = process.argv[2];
    const publish = process.argv.includes("--publish");
    if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("uso: release-check.cjs <versão> [--publish]");
    if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN não definido (veja o README, Releasing)");

    const releases = await api("/releases?per_page=20");
    const release = releases.find((r) => r.tag_name === `v${version}`);
    if (!release) throw new Error(`não há release v${version} (nem rascunho)`);
    console.log(`v${version}: ${release.draft ? "rascunho" : "público"}, arquivos: ${release.assets.map((a) => a.name).join(", ") || "nenhum"}`);

    const get = release.assets.find((a) => a.name === "latest.yml");
    const yml = get ? await (await download(get.id)).text() : null;
    const exe = release.assets.find((a) => a.name === `KERYX-Setup-${version}.exe`);
    let installer = null;
    if (exe) {
        const res = await download(exe.id);
        if (!res.ok) throw new Error(`não consegui baixar o instalador (${res.status})`);
        const hash = crypto.createHash("sha512");
        let size = 0;
        for await (const chunk of res.body) { hash.update(chunk); size += chunk.length; }
        installer = { sha512: hash.digest("base64"), size };
    }

    const bad = problems({ version, assets: release.assets, yml, installer });
    if (bad.length) { bad.forEach((p) => console.error(`  ✗ ${p}`)); throw new Error("o release não está pronto; não foi publicado"); }
    console.log(`  ✓ instalador, blockmap e latest.yml; sha512 e tamanho conferem (${installer.size} bytes)`);

    if (!publish) { console.log(release.draft ? "Rascunho em ordem. Para publicar: acrescente --publish." : "Release em ordem."); return; }
    if (!release.draft) { console.log("Já é público; nada a publicar."); return; }

    await api(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify({ draft: false, make_latest: "true" }) });
    console.log(`  ✓ v${version} publicado`);
    const pub = await fetch(`https://github.com/${REPO}/releases/latest/download/latest.yml`, { redirect: "follow" });
    const text = await pub.text();
    const seen = (/^version: *(\S+)/m.exec(text) || [])[1];
    if (seen !== version) throw new Error(`o latest.yml público diz ${seen || "(nada)"}, não ${version}`);
    console.log("  ✓ o latest.yml público já é desta versão");
}

if (require.main === module) main().catch((err) => { console.error(`✗ ${err.message}`); process.exitCode = 1; });
module.exports = { problems, api, headers, REPO };

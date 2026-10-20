import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MENU_LABELS, menuItem, labelOf, iconOf } from "./menuLabels.js";
import { ICON_NAMES } from "../icons.js";
import { keyHint, shortcutsFor, liveAction } from "./keys.js";
import { rowKey } from "./gridNav.js";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function sources(dir = SRC, out = []) {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) {
            if (relative(SRC, p).replace(/\\/g, "/") !== "components/ui") sources(p, out);
        } else if (/\.(jsx?|mjs)$/.test(f) && !/\.test\.mjs$/.test(f)) out.push(p);
    }
    return out;
}
const files = sources().map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));

test("the table: pt-BR labels, mapped icons, a hint only where a key exists", () => {
    for (const [id, m] of Object.entries(MENU_LABELS)) {
        assert.ok(m.label && typeof m.label === "string", id);
        assert.ok(ICON_NAMES.includes(m.icon), `${id}: icon ${m.icon} is not in icons.js`);
        // "…" ends a label only where the command asks for more before it acts.
        if (/^(Nova música|Novo aviso|Novo culto|Planejar o culto|Editar)/.test(m.label)) assert.ok(!m.label.endsWith("…"), `${id}: opens a page, no "…"`);
        if (m.key) assert.ok(keyHint(m.key), `${id}: key ${m.key} names no key`);
    }
    // The owner's words (Rodada M mockup, "todas as trocas").
    assert.equal(labelOf("doComputador"), "Do computador…");
    assert.equal(labelOf("youtube"), "Link do YouTube…");
    assert.equal(labelOf("temasEFundos"), "Temas e fundos");
    assert.equal(labelOf("porNaPrevia"), "Pôr na prévia");
    assert.equal(iconOf("excluir"), "trash");
    assert.equal(iconOf("tirar"), "x");
    assert.equal(iconOf("editarNoPlanejador"), "edit");
    assert.throws(() => menuItem("naoExiste"));
});

test("menuItem: the table's label and icon, the key's hint, the caller's extras last", () => {
    const sent = menuItem("enviarAoAr", { air: true, disabled: true });
    assert.deepEqual({ label: sent.label, icon: sent.icon, kbd: sent.kbd, air: sent.air, disabled: sent.disabled }, { label: "Enviar ao ar", icon: "play", kbd: "Enter", air: true, disabled: true });
    assert.equal(menuItem("encerrar").kbd, "Esc");
    assert.equal(menuItem("renomear").kbd, "F2");
    assert.equal("kbd" in menuItem("planejar"), false, "no key, no hint");
    assert.equal(menuItem("excluir", { label: "Excluir todas…" }).label, "Excluir todas…");
    assert.equal(menuItem("excluir", { label: "Excluir todas…" }).icon, "trash");
});

test("the hints are the keys the console really handles", () => {
    const enter = shortcutsFor("on").find((s) => s.action === "send" && s.keys === "Enter");
    assert.equal(keyHint("send"), enter.keys);
    assert.equal(liveAction({ key: "Enter", target: null }), "send");
    assert.equal(keyHint("end"), "Esc");
    assert.equal(liveAction({ key: "Escape", target: null }), "end");
    assert.equal(keyHint("undo"), "Ctrl+Z");
    // The lists' own keys (gridNav.js): Delete takes a row out, F2 renames.
    assert.equal(keyHint("delete"), "Delete");
    assert.equal(rowKey({ key: "Delete" }), "delete");
    assert.equal(keyHint("rename"), "F2");
    assert.equal(rowKey({ key: "F2" }), "rename");
    // They do not follow the letter keys; the letters do.
    assert.equal(keyHint("send", "off"), "Enter");
    assert.equal(keyHint("help", "off"), null);
});

test("every action of the table is used by a menu", () => {
    const used = (id) => files.some((f) => f.path !== "lib/console/menuLabels.js" && new RegExp(`(menuItem|mi)\\([^)]*"${id}"`).test(f.text));
    for (const id of Object.keys(MENU_LABELS)) assert.ok(used(id), `${id} is in the table but no menu builds it`);
});

// A menu item written by hand with a spelling the table replaced would drift
// back; this lists them. Cheap and tolerant: string literals on a label.
test("no menu spells a shared action its own way", () => {
    const FORBIDDEN = [
        [/label: "Enviar arquivos/, "Do computador…"],
        [/label: "Link do YouTube"(?!…)/, "Link do YouTube…"],
        [/label: "Link do YouTube(?!…)[^"]/, "Link do YouTube…"],
        [/label: "Selecionar"/, "Pôr na prévia"],
        [/label: "Nova música…"/, "Nova música"],
        [/label: "Novo aviso…"/, "Novo aviso"],
        [/label: "Planejar o culto…"/, "Planejar o culto"],
        [/label: "Configurações › Temas…"/, "Configurações › Temas e fundos…"],
        [/label: "Temas"[,\s]/, "Temas e fundos"],
        [/label: "Excluir…", icon: "(?!trash)/, "trash"],
        [/icon: "(?!trash)[a-z-]+", label: "Excluir…"/, "trash"],
        [/label: "Editar no planejador", icon: "(?!edit)/, "edit"],
        [/(?:^|[^\w.])label: "Pôr na prévia"/, "menuItem(\"porNaPrevia\")"],
        [/(?:^|[^\w.])label: "Enviar ao ar"/, "menuItem(\"enviarAoAr\")"],
        [/kbd: "(Enter|Esc|Delete|F2)"/, "keyHint(...)"],
    ];
    const bad = [];
    for (const f of files) {
        // The table itself, the key map and the settings search words may say them.
        if (f.path === "lib/console/menuLabels.js" || f.path === "lib/console/keys.js" || f.path === "lib/console/settingsSearch.js") continue;
        for (const [re, instead] of FORBIDDEN) {
            const m = f.text.match(re);
            if (m) bad.push(`${f.path}: ${m[0]} → ${instead}`);
        }
    }
    assert.deepEqual(bad, []);
});

test("an icon-only ⋯ opens a menu, never an action (Setlist's pencil)", () => {
    const rundown = files.find((f) => f.path === "components/console/Rundown.jsx").text;
    assert.ok(!/IconBtn name="more"/.test(rundown));
    assert.ok(/IconBtn name="edit" title="Editar no planejador"/.test(rundown));
});

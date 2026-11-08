import { keryx } from "@/api/keryxClient";
import { NOUNS, bulkDeleteQuestion, setlistLines, themeLines, itemsUsing, deletedSay } from "@/lib/console/bulkDelete";
import { takeOutMany } from "./setlistActions";

// Excluir several (owner 2026-10-21, M5 = A; the rules and the words are
// src/lib/console/bulkDelete.js): what is in use is read from the store when
// the question is asked (never the lists on screen, which may lag), ONE
// question, then the rows go one by one and the Setlist items that pointed
// at them leave their setlists, each culto numbered again once.

// Kinds a Setlist item can point at (ServiceItem.contentId).
const IN_SETLISTS = new Set(["song", "media", "notice", "material"]);

async function usageOf(kind) {
    const all = (name) => keryx.entities[name].list().then((r) => r || []).catch(() => []);
    if (IN_SETLISTS.has(kind)) {
        const [serviceItems, services] = await Promise.all([all("ServiceItem"), all("Service")]);
        return { serviceItems, services };
    }
    if (kind === "theme") {
        const [songs, services, templates, outputPrefs, themes, user] = await Promise.all([
            all("Song"), all("Service"), all("ServiceTemplate"), all("OutputPref"), all("ProjectionTheme"),
            keryx.auth.me().catch(() => null),
        ]);
        return { songs, services, templates, outputPrefs, themes, user };
    }
    return {};
}

// rows: the marked rows (each with an id); kind: a key of NOUNS; text: an
// extra line ("Os arquivos continuam na pasta de mídia."); remove: how one
// row goes (default: the entity's delete); after: the toast's tail.
// -> the rows that went ([] when the answer was no).
export async function deleteSeveral({ confirm, say, entity, kind, rows, nameOf = (r) => r.title, text = "", remove = null, after = "" }) {
    if (!rows?.length) return [];
    const noun = NOUNS[kind] || NOUNS.item;
    const ids = rows.map((r) => r.id);
    let data = {};
    try { data = await usageOf(kind); } catch { /* the question still asks, without the warning */ }
    const warn = IN_SETLISTS.has(kind) ? setlistLines(ids, data, noun) : kind === "theme" ? themeLines(ids, data) : [];
    const ok = await confirm(bulkDeleteQuestion({ noun, names: rows.map(nameOf), warn, text }));
    if (!ok) return [];
    const gone = [];
    for (const r of rows) {
        try {
            await (remove ? remove(r) : keryx.entities[entity].delete(r.id));
            gone.push(r);
        } catch { /* counted below */ }
    }
    const failed = rows.length - gone.length;
    if (IN_SETLISTS.has(kind) && gone.length) {
        const using = itemsUsing(gone.map((r) => r.id), data.serviceItems || []);
        if (using.length) await takeOutMany(using).catch(() => {});
    }
    say?.(`${deletedSay(gone.length, noun, failed)}${after && gone.length ? ` ${after}` : ""}`);
    return gone;
}

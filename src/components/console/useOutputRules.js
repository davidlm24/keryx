import { useCallback, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { openEditor } from "@/lib/editorWindow";
import { ruleKind } from "@/lib/contentKinds";
import { RULE_SHORTCUTS, normalizePref, normalizeRule, ruleOf, ruleShortcut, ruleLabel, ruleWithShortcut, ruleDrops, outputLook } from "@/lib/outputPrefs";

const listWords = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`);

// What each output receives, changed from the console itself (owner
// 2026-10-27): the Saídas popover's "Recebe" (S1 = A), a Multiview quadrant's
// chip (S2 = A) and the Prévia's "Mostrar … também" (P1 = A) — the same
// OutputPref.content_rule the Editor's Conteúdo writes. It is saved at once
// (every window and network screen of that page follows) and the toast says
// what it took off the air now, with Desfazer, as Esc does (S3 = A: Ctrl+Z
// too). The editor is the place for everything else: "Personalizar no Editor".
export default function useOutputRules(c) {
    const rows = useOutputPrefRows();
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const live = useRef(c.cur);
    live.current = c.cur;

    const rowOf = (page) => rowsRef.current.find((r) => r.screen_path === page) || null;
    // Writes one page's content_rule (null = back to the page's own rule).
    const write = async (page, contentRule) => {
        const row = rowOf(page) || (await keryx.entities.OutputPref.filter({ screen_path: page }))?.[0] || null;
        if (row?.id) return keryx.entities.OutputPref.update(row.id, { content_rule: contentRule });
        return keryx.entities.OutputPref.create({ screen_path: page, content_rule: contentRule });
    };

    const ruleFor = useCallback((page) => ruleOf(normalizePref(rowsRef.current.find((r) => r.screen_path === page) || null), page), []);

    // `build(rule)` -> the new rule. `say` overrides the toast's words.
    const setRule = useCallback(async (page, build) => {
        const row = rowOf(page);
        const before = ruleOf(normalizePref(row), page);
        const after = normalizeRule(build(before));
        if (!after || JSON.stringify(after) === JSON.stringify(before)) return;
        const was = row ? (row.content_rule ?? null) : null;
        const name = outputLook(page, row).name;
        try {
            await write(page, after);
        } catch (err) {
            c.say(err?.message || `Não foi possível mudar o que ${name} recebe.`);
            return;
        }
        // What it took off the air now, else what it shows now: the
        // shortcut's name, or the kinds added when the list is its own.
        const dropped = ruleDrops(before, after, live.current);
        const added = after.kinds.filter((k) => !before.kinds.includes(k)).map((k) => ruleKind(k).label);
        const label = ruleLabel(after);
        const text = dropped.length ? `${name} deixou de mostrar ${listWords(dropped)}.`
            : label === "Personalizado" && added.length ? `${name} passa a mostrar ${listWords(added)}.`
            : `${name} recebe: ${label}.`;
        c.say(text, { label: "Desfazer", undo: true, run: () => write(page, was).catch(() => c.say("Não foi possível desfazer.")) });
    }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

    // The menu of a page's rule: the four shortcuts, the one in use checked,
    // then the Editor for a list of its own.
    const receivesItems = useCallback((page) => {
        const now = ruleShortcut(ruleFor(page));
        return [
            ...RULE_SHORTCUTS.map((s) => ({ label: s.name, icon: now === s.id ? "check" : undefined, onSelect: () => setRule(page, (r) => ruleWithShortcut(r, s.id)) })),
            "sep",
            { label: "Personalizar no Editor", icon: "edit", onSelect: () => { const r = openEditor({ screen: page }); if (r?.error) c.say(r.error); } },
        ];
    }, [ruleFor, setRule, c]);

    return { rows, ruleFor, setRule, receivesItems };
}

import { useRef } from "react";
import { keryx } from "@/api/keryxClient";

const sameJson = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

// How an output's Ajustes save (OutputPref, src/lib/outputPrefs.js): each
// change is written at once; the output, and any network screen showing the
// same page, follows it live. The first change creates the row; changes made
// before it comes back update that one instead of creating another. A failed
// create is forgotten, so the next change tries again. Page options are one
// object: two quick switches must not undo each other, so each change builds
// on the last one sent until the row catches up.
//   - save(patch): any fields of the row;
//   - saveOpt(key, value): one key of `options`;
//   - saveOptions(next): the whole `options` object (colours back to default);
//   - options(): the options as last sent (or as the row has them);
//   - forgetOptions(): after "Restaurar padrão" wrote them fresh.
export default function useOutputPrefSave(path, row, pref, say) {
    const creating = useRef(null);
    if (row?.id) creating.current = null;
    const sentOpts = useRef(null);
    if (sentOpts.current && sameJson(sentOpts.current, row?.options)) sentOpts.current = null;
    const save = (patch) => {
        let done;
        if (row?.id) done = keryx.entities.OutputPref.update(row.id, patch);
        else if (creating.current) done = creating.current.then((r) => keryx.entities.OutputPref.update(r.id, patch));
        else {
            const made = keryx.entities.OutputPref.create({ screen_path: path, ...patch });
            creating.current = made;
            made.catch(() => { if (creating.current === made) creating.current = null; });
            done = made;
        }
        done.catch((err) => say(err?.message || "Não foi possível salvar o ajuste da saída."));
    };
    const options = () => sentOpts.current || pref.options;
    const saveOptions = (next) => { sentOpts.current = next; save({ options: next }); };
    const saveOpt = (k, v) => saveOptions({ ...options(), [k]: v });
    const forgetOptions = () => { sentOpts.current = null; };
    return { save, saveOpt, saveOptions, options, forgetOptions };
}

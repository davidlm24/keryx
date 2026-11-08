import React from "react";
import { codecOf, subscribeFiles } from "@/lib/videoFiles";
import { codecHint, codecMark, codecOfRow } from "@/lib/videoCodec";

// The amber "HEVC · pode não tocar" of a video that may freeze on the screens
// (Rodada O, O11 = B; the words are src/lib/videoCodec.js). From the Media
// `row` when the list has it, else by the file's `src` (src/lib/videoFiles.js,
// the background library's entries). Nothing for a video that plays.
export default function CodecMark({ row = null, src = "" }) {
    const known = React.useSyncExternalStore(subscribeFiles, () => (row ? null : codecOf(src)), () => null);
    const found = row ? codecOfRow(row) : known;
    const mark = codecMark(found);
    return mark ? <span className="codec-mark" title={codecHint(found)}>{mark}</span> : null;
}

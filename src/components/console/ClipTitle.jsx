import React from "react";
import { titleParts } from "@/lib/console/caption";

// A title that gives way in the middle (C-17): its start ends in "…" and its
// last part stays whole (titleParts), so two similar names still differ in a
// narrow caption. The whole name goes in the caller's tooltip.
export default function ClipTitle({ text, className = "" }) {
    const { head, tail } = titleParts(text);
    return (
        <span className={`kx-clip ${className}`}>
            <span className="kx-clip-h">{head}</span>
            {tail && <span className="kx-clip-t">{tail}</span>}
        </span>
    );
}

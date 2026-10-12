import React from "react";
import { SHORTCUTS } from "@/lib/console/keys";

// The console's shortcuts (src/lib/console/keys.js SHORTCUTS): the ? dialog
// and Configurações › Console draw this, so the two never differ.
export default function ShortcutList() {
    return (
        <div className="shortcuts">
            {SHORTCUTS.map((s) => (
                <React.Fragment key={s.keys}>
                    <span className="kx-kbd">{s.keys}</span>
                    <span className="shortcuts-d">{s.label}</span>
                </React.Fragment>
            ))}
        </div>
    );
}

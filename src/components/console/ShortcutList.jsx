import React from "react";
import { shortcutsFor } from "@/lib/console/keys";
import { usePrefs } from "@/hooks/useUser";

// The console's shortcuts (src/lib/console/keys.js SHORTCUTS): the ? dialog
// and Configurações › Console draw this, so the two never differ. The letter
// keys are listed as the church's choice has them (ligadas, com Shift,
// desligadas).
export default function ShortcutList() {
    const letters = usePrefs().letter_keys;
    return (
        <div className="shortcuts">
            {shortcutsFor(letters).map((s) => (
                <React.Fragment key={s.keys}>
                    <span className="kx-kbd">{s.keys}</span>
                    <span className="shortcuts-d">{s.label}</span>
                </React.Fragment>
            ))}
        </div>
    );
}

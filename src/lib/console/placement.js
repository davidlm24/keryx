// Where an output opens, as the select that picks it says it: Automático,
// Sempre numa janela or one of the monitors (electron/outputs.cjs'
// `assignment.target`: "auto" | "window" | { id, label, width, height }).
// One module for the Editor da tela's Destino and the Saídas popover, so both
// spell the choices the same way. Pure: no I/O, no React; console only.

const sizeOf = (d) => ({ width: d.bounds?.width || d.width, height: d.bounds?.height || d.height });

// The select's value for an assignment: "auto", "window", "d:<id>" (a monitor
// that is on) or "gone:<id>" (the one chosen is off now).
export function placementValue(assignment, displays = []) {
    const t = assignment?.target;
    if (t === "window") return "window";
    if (!t || t === "auto" || typeof t !== "object") return "auto";
    return displays.some((d) => d.id === t.id) ? `d:${t.id}` : `gone:${t.id}`;
}

// What choosing `value` asks of the main process (`displays.set(key, { target })`).
// A monitor that is no longer there gives null: nothing to ask.
export function placementTarget(value, displays = []) {
    if (value === "auto" || value === "window") return value;
    const d = String(value).startsWith("d:") ? displays.find((x) => `d:${x.id}` === value) : null;
    return d ? { id: d.id, label: d.label, ...sizeOf(d) } : null;
}

// The options, in the Editor's order: the two modes, every monitor that is on
// ("Tela N · L×A", N as the list counts them) and, last and disabled, the one
// the output was chosen for when it is off now.
export function placementOptions(displays = [], assignment = null) {
    const options = [
        { value: "auto", label: "Automático" },
        { value: "window", label: "Sempre numa janela" },
        ...displays.map((d, i) => {
            const { width, height } = sizeOf(d);
            return { value: `d:${d.id}`, label: `Tela ${i + 1} · ${width}×${height}` };
        }),
    ];
    const t = assignment?.target;
    if (t && typeof t === "object" && !displays.some((d) => d.id === t.id)) {
        options.push({ value: `gone:${t.id}`, label: `${t.width}×${t.height} (desligada)`, disabled: true });
    }
    return options;
}

// The short word for the popover's button: "Automático", "Janela", "Tela 2",
// or the off monitor's size ("1280×720 (desligada)"), with `off` set so the
// button turns amber.
export function placementWord(assignment, displays = []) {
    const t = assignment?.target;
    if (t === "window") return { text: "Janela", off: false };
    if (!t || t === "auto" || typeof t !== "object") return { text: "Automático", off: false };
    const n = displays.findIndex((d) => d.id === t.id) + 1;
    return n ? { text: `Tela ${n}`, off: false } : { text: `${t.width}×${t.height} (desligada)`, off: true };
}

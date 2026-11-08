// Configurações › Telas e saídas › Som e YouTube › Saída de som (owner
// 2026-11-08, mockup S1 = A): the select's list. Pure, so node --test checks it.

// The browser's audio outputs as the row lists them: Chromium's aliases of
// the default ("default", "communications") left out (the first option is
// Windows' default), each named by its label, else "Saída de som N" (a page
// without media permission sees no labels).
export function soundDevices(list = []) {
    return (list || [])
        .filter((d) => d && d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d, i) => ({ id: d.deviceId, label: (d.label || "").trim() || `Saída de som ${i + 1}` }));
}

// The options: Windows' default, every device, and the one chosen before
// when it is not connected now (disabled, named by the label kept).
export function soundOutOptions(devices = [], choice = { id: "", label: "" }) {
    const options = [{ value: "", label: "Som padrão do Windows" }, ...devices.map((d) => ({ value: d.id, label: d.label }))];
    if (choice?.id && !devices.some((d) => d.id === choice.id)) {
        options.push({ value: choice.id, label: `${choice.label || "O aparelho escolhido"} (desconectado)`, disabled: true });
    }
    return options;
}

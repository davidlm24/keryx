// Which pages are outputs (they render on a projector, TV or monitor) and
// where each one goes. Pure logic with no Electron import, so it is unit
// tested; outputs-manager.cjs applies it to real windows.

// key is the page path. windowName is what the pages pass to window.open;
// autoExternal outputs go to the first external display when the operator has
// not chosen one.
const OUTPUTS = [
    { key: "/Projection", label: "Projeção principal", windowName: "keryx_projection", autoExternal: true },
    { key: "/LyricProjection", label: "Letras (tela de letras)", windowName: "lyricProjection" },
    { key: "/VideoProjection", label: "Vídeo", windowName: "videoProjection" },
    { key: "/StageView", label: "Palco", windowName: "stageView" },
    { key: "/PastorView", label: "Tela do pastor", windowName: "pastorView" },
    { key: "/CommunicationProjection", label: "Comunicação", windowName: "communicationProjection" },
];

const WINDOWED = { width: 1280, height: 720 };

function outputForKey(key) {
    return OUTPUTS.find((o) => o.key === key) || null;
}

// The output a window.open URL points at, if it is on the app's own origin.
function outputKeyForUrl(url, origin) {
    try {
        const parsed = new URL(url);
        if (parsed.origin !== origin) return null;
        const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return outputForKey(pathname) ? pathname : null;
    } catch {
        return null;
    }
}

// Assignments are stored by display id, with label and size kept so a display
// whose id changed (new GPU driver, reboot) can still be recognised.
function displayRef(display) {
    return { id: display.id, label: display.label || "", width: display.bounds.width, height: display.bounds.height };
}

function findDisplay(displays, ref) {
    if (!ref || typeof ref !== "object") return null;
    const byId = displays.find((d) => d.id === ref.id);
    if (byId) return byId;
    const similar = displays.filter(
        (d) => ref.label && d.label === ref.label && d.bounds.width === ref.width && d.bounds.height === ref.height,
    );
    return similar.length === 1 ? similar[0] : null;
}

function externalDisplays(displays) {
    return displays
        .filter((d) => !d.primary)
        .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

// assignment: undefined | { target: "auto" | "window" | <display ref> }
// -> { mode: "fullscreen", display } | { mode: "window", missing?: true }
function resolvePlacement(output, displays, assignment) {
    const target = assignment && assignment.target !== undefined ? assignment.target : "auto";
    if (target === "window") return { mode: "window" };
    if (target === "auto") {
        if (!output.autoExternal) return { mode: "window" };
        const external = externalDisplays(displays)[0];
        return external ? { mode: "fullscreen", display: external } : { mode: "window" };
    }
    const display = findDisplay(displays, target);
    // The chosen display is unplugged: fall back to a window the operator can
    // see, and remember the choice so it returns with the monitor.
    return display ? { mode: "fullscreen", display } : { mode: "window", missing: true };
}

// Window bounds for windowed mode: centred on the primary display.
function windowedBounds(displays) {
    const primary = displays.find((d) => d.primary) || displays[0];
    const area = primary ? primary.workArea || primary.bounds : { x: 0, y: 0, width: WINDOWED.width, height: WINDOWED.height };
    const width = Math.min(WINDOWED.width, area.width);
    const height = Math.min(WINDOWED.height, area.height);
    return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

// Accept only shapes the app writes; anything else means "auto", closed at launch.
// openAtLaunch: the main process opens this output when KERYX starts.
function normalizeAssignment(value) {
    if (!value || typeof value !== "object") return { target: "auto", openAtLaunch: false };
    const { target } = value;
    const openAtLaunch = value.openAtLaunch === true;
    if (target === "auto" || target === "window") return { target, openAtLaunch };
    if (target && typeof target === "object" && Number.isFinite(target.id)) {
        return {
            target: {
                id: target.id,
                label: String(target.label || ""),
                width: Number(target.width) || 0,
                height: Number(target.height) || 0,
            },
            openAtLaunch,
        };
    }
    return { target: "auto", openAtLaunch };
}

module.exports = {
    OUTPUTS,
    outputForKey,
    outputKeyForUrl,
    displayRef,
    findDisplay,
    resolvePlacement,
    windowedBounds,
    normalizeAssignment,
};

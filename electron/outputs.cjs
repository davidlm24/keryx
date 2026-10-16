// Which pages are outputs (they render on a projector, TV or monitor) and
// where each one goes. Pure logic with no Electron import, so it is unit
// tested; outputs-manager.cjs applies it to real windows.

// key is the page path. windowName is what the pages pass to window.open;
// autoExternal outputs go to the first external display when the operator has
// not chosen one. The label is the output's one factory name, the same the
// renderer shows (shared/outputNames.json).
const NAMES = require("../shared/outputNames.json");
const OUTPUTS = [
    { key: "/Projection", label: NAMES["/Projection"], windowName: "keryx_projection", autoExternal: true },
    { key: "/LyricProjection", label: NAMES["/LyricProjection"], windowName: "lyricProjection" },
    { key: "/VideoProjection", label: NAMES["/VideoProjection"], windowName: "videoProjection" },
    { key: "/StageView", label: NAMES["/StageView"], windowName: "stageView" },
    { key: "/PastorView", label: NAMES["/PastorView"], windowName: "pastorView" },
    { key: "/CommunicationProjection", label: NAMES["/CommunicationProjection"], windowName: "communicationProjection" },
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

// An output whose monitor is gone (a cable bumped, the projector off, Win+P ›
// Duplicar) waits hidden, and comes back full screen when the monitor does
// (audit WIN-02). As a window it would land on the console's monitor: made
// full screen, it has no frame, no taskbar button and no pointer, and it
// covered the console and its "Reconectando…" banner. The banner is the
// signal; the choice is kept, so the output returns with the monitor.
const WAITING = Object.freeze({ mode: "hidden", missing: true });

// assignment: undefined | { target: "auto" | "window" | <display ref> }
// waiting: this output's window was full screen on a monitor (or is hidden
// waiting for one): the manager knows, from what it did to the window.
// -> { mode: "fullscreen", display } | { mode: "window" } | { mode: "hidden", missing: true }
function resolvePlacement(output, displays, assignment, { waiting = false } = {}) {
    const target = assignment && assignment.target !== undefined ? assignment.target : "auto";
    if (target === "window") return { mode: "window" };
    if (target === "auto") {
        if (!output.autoExternal) return { mode: "window" };
        const external = externalDisplays(displays)[0];
        if (external) return { mode: "fullscreen", display: external };
        // Only the console's monitor: opened so (a notebook alone), a window
        // the operator can see; the projector it was on left, it waits.
        return waiting ? WAITING : { mode: "window" };
    }
    const display = findDisplay(displays, target);
    return display ? { mode: "fullscreen", display } : WAITING;
}

// Already where a full-screen placement puts it: shown, full screen, at its
// monitor's bounds. A change on another monitor (the taskbar, a scale, a
// resolution) then leaves it alone — leaving and entering full screen again
// flashed the projector's desktop in front of the church (audit WIN-16).
// current: { fullScreen, visible, bounds } of the window now.
function inPlace(placement, current) {
    if (!placement || placement.mode !== "fullscreen" || !current) return false;
    const want = placement.display.bounds;
    const have = current.bounds || {};
    return Boolean(current.fullScreen && current.visible) && ["x", "y", "width", "height"].every((k) => have[k] === want[k]);
}

// An output stays above every other window while it is full screen on a
// monitor of its own (owner 2026-10-16, as Holyrics): nothing the operator
// opens or drags there can cover what the church sees. Never on the
// console's own monitor (one screen only, or the smoke's full-screen run),
// where it would hide the console for good, and never as a window.
function staysOnTop(placement, operatorDisplayId) {
    return Boolean(placement && placement.mode === "fullscreen" && placement.display && placement.display.id !== operatorDisplayId);
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
// removed: the operator took this output off the list (Saídas, the settings
// tabs, Verificar); the window never opens, not even at launch. The entry —
// screen, openAtLaunch, the OutputPref row — is kept, so "Adicionar saída"
// brings it back exactly as it was.
function normalizeAssignment(value) {
    if (!value || typeof value !== "object") return { target: "auto", openAtLaunch: false, removed: false };
    const { target } = value;
    const openAtLaunch = value.openAtLaunch === true;
    const removed = value.removed === true;
    if (target === "auto" || target === "window") return { target, openAtLaunch, removed };
    if (target && typeof target === "object" && Number.isFinite(target.id)) {
        return {
            target: {
                id: target.id,
                label: String(target.label || ""),
                width: Number(target.width) || 0,
                height: Number(target.height) || 0,
            },
            openAtLaunch,
            removed,
        };
    }
    return { target: "auto", openAtLaunch, removed };
}

// The main projection is the output the console mirrors (the Prévia) and
// auto-opens on send: KERYX without it is not a use case, so it cannot be
// removed from the list.
const canRemove = (key) => key !== "/Projection";

module.exports = {
    staysOnTop,
    inPlace,
    OUTPUTS,
    outputForKey,
    outputKeyForUrl,
    displayRef,
    findDisplay,
    resolvePlacement,
    windowedBounds,
    normalizeAssignment,
    canRemove,
};

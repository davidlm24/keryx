// When the console shows the update popup and when it may restart KERYX to
// install. The main process downloads (electron/updater.cjs); only the
// console installs, and never with something on air: a restart closes every
// output for about half a minute.

// The window after the console opens in which a found update opens the popup
// by itself (Atualizar automaticamente). Later it only rings the bell.
export const LAUNCH_WINDOW_MS = 3 * 60 * 1000;

const ACTIVE = ["available", "downloading", "downloaded", "error"];

// Something the congregation sees or hears right now.
export function onAir(live) {
    if (!live) return false;
    return Boolean(live.content || live.media || live.video || live.tool || live.communication || (live.audio && !live.audio.playback?.paused));
}

// An update the operator can act on: found, coming down, ready, or failed after being found.
export const hasUpdate = (u) => Boolean(u && u.version && ACTIVE.includes(u.status));

// The popup opens by itself only with Atualizar automaticamente, right after
// the console opened, once per session.
export function shouldOpenOnLaunch({ update, sinceMountMs, dismissed }) {
    return Boolean(update && update.auto && !dismissed && sinceMountMs <= LAUNCH_WINDOW_MS && ["available", "downloading", "downloaded"].includes(update.status));
}

// Install from the popup at once only when the download is done and nothing is on air.
export const canInstallNow = ({ update, live }) => Boolean(update && update.status === "downloaded" && !onAir(live));

const mb = (bytes) => (bytes / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: bytes < 1e7 ? 1 : 0 });

// "59 de 140 MB · 2,1 MB/s · falta 1 min"
export function progressText(u) {
    if (!u || u.status !== "downloading") return "";
    if (!u.total) return "Baixando…";
    const parts = [`${mb(u.transferred || 0)} de ${mb(u.total)} MB`];
    if (u.bytesPerSecond > 0) {
        parts.push(`${(u.bytesPerSecond / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB/s`);
        const left = Math.max(0, (u.total - (u.transferred || 0)) / u.bytesPerSecond);
        parts.push(left < 60 ? `faltam ${Math.max(1, Math.round(left))} s` : `falta${left >= 120 ? "m" : ""} ${Math.round(left / 60)} min`);
    }
    return parts.join(" · ");
}

// The title and line the popup shows for each state.
export function phaseOf(u) {
    if (!u) return { title: "", line: "" };
    switch (u.status) {
        case "available": return { title: `Nova versão: ${u.version}`, line: "Preparando o download…" };
        case "downloading": return { title: `Baixando a versão ${u.version}`, line: progressText(u) };
        case "downloaded": return { title: `Versão ${u.version} pronta`, line: "O KERYX fecha e abre de novo sozinho, em uns 30 segundos." };
        case "error": return { title: "A atualização parou", line: u.message || "Não foi possível baixar." };
        default: return { title: "", line: u.message || "" };
    }
}

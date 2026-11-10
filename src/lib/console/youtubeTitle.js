// The title YouTube gives a link (its oEmbed check in the main process,
// electron/youtube.cjs `check`), for a pedido that is only a link — the
// phone's (remoteRunner's youtubeName) and the console's Novo pedido.
// "" when the check says it is blocked or gone, the bridge is missing, or
// it takes longer than `ms`.
export async function youtubeTitle(url, ms = 2000) {
    const bridge = typeof window !== "undefined" ? window.keryxDesktop?.youtube : null;
    if (!bridge?.call || !url) return "";
    let timer;
    const late = new Promise((done) => { timer = setTimeout(done, ms, null); });
    try {
        const r = await Promise.race([bridge.call("check", { url }), late]);
        const check = r?.data || r;
        return check?.state === "ok" ? String(check.title || "") : "";
    } catch { return ""; } finally { clearTimeout(timer); }
}

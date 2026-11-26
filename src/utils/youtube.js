// Utility for detecting and parsing YouTube URLs

export function getYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        // watch?…&v=ID (the id is not the first parameter)
        /youtube\.com\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
        const match = url.match(p);
        if (match) return match[1];
    }
    return null;
}

export function isYouTubeUrl(url) {
    return !!getYouTubeId(url);
}

export function getYouTubeEmbedUrl(url, autoplay = true, controls = true) {
    const id = getYouTubeId(url);
    if (!id) return null;
    const params = new URLSearchParams({
        autoplay: autoplay ? "1" : "0",
        controls: controls ? "1" : "0",
        modestbranding: "1",
        rel: "0",
        playsinline: "1",
    });
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function getYouTubeThumbnail(url) {
    const id = getYouTubeId(url);
    if (!id) return null;
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
// The YouTube IFrame API, loaded once (it needs the internet). It fails
// loudly (audit 2026-11-26, FUNC-002): offline, or a script that never
// answers, the promise rejects (script error, or API_TIMEOUT_MS) and is
// forgotten, so the next link tries again — before, it waited forever and the
// screens stayed black until the window was reloaded. The player reports it
// as YT_UNREACHABLE (the refusal path, youtubeLinks.js says it).
export const YT_UNREACHABLE = -1;
export const API_TIMEOUT_MS = 12000;
let apiPromise = null;
export function loadYouTubeApi() {
    if (typeof window === "undefined") return Promise.reject(new Error("sem janela"));
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!apiPromise) {
        apiPromise = new Promise((resolve, reject) => {
            const previous = window.onYouTubeIframeAPIReady;
            const tag = document.createElement("script");
            let timer = null;
            const fail = () => {
                clearTimeout(timer);
                tag.remove();
                window.onYouTubeIframeAPIReady = previous;
                apiPromise = null;
                reject(new Error("O YouTube não carregou (sem internet?)."));
            };
            window.onYouTubeIframeAPIReady = () => {
                clearTimeout(timer);
                if (typeof previous === "function") previous();
                resolve(window.YT);
            };
            tag.src = "https://www.youtube.com/iframe_api";
            tag.onerror = fail;
            timer = setTimeout(fail, API_TIMEOUT_MS);
            document.head.appendChild(tag);
        });
    }
    return apiPromise;
}

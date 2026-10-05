// Utility for detecting and parsing YouTube URLs

export function getYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
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
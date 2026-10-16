import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { remember, forget, localId } from "@/lib/console/outputs";
import { bundledBackgrounds } from "@/lib/backgrounds";
import { useOutputLooks } from "@/hooks/useOutputPref";
import { backgroundList, sourceOf } from "@/lib/console/backgroundPrefs";
import { useUser } from "@/hooks/useUser";
import { usePendingMedia } from "@/hooks/usePendingMedia";

// What the console reads: the library (songs, media, communication pieces),
// the services and the chosen service's items, the themes. Each list follows
// its table through keryx.entities.<Name>.subscribe. Nothing here writes.

// No initialData: with a staleTime, an empty initial list would count as
// fresh data and never be fetched.
const EMPTY = [];
const useList = (name, args, key = name) => {
    const client = useQueryClient();
    useEffect(() => keryx.entities[name].subscribe(() => client.invalidateQueries({ queryKey: ["console", key] })), [name, key, client]);
    const q = useQuery({ queryKey: ["console", key], queryFn: () => keryx.entities[name].list(...args), staleTime: 60_000 });
    return { ...q, data: q.data ?? EMPTY };
};

// Which media files are on disk (desktop): a row whose file is gone gets
// missing: true (the console warns before sending it), and every row its size.
// A file the sync has not brought yet (usePendingMedia) is missing too, with
// syncing: true — the lists say "Baixando…", not "Arquivo não encontrado" —
// and a video's still not here yet is posterSyncing (no broken picture).
function useMediaFiles(rows) {
    const urls = rows.map((m) => m.file_url).filter(Boolean);
    const key = urls.join("|");
    const pending = usePendingMedia();
    const client = useQueryClient();
    // A file that arrives is on disk now: ask again.
    const seen = useRef(pending);
    useEffect(() => {
        if (seen.current === pending) return;
        seen.current = pending;
        client.invalidateQueries({ queryKey: ["console", "mediaFiles"] });
    }, [pending, client]);
    const info = useQuery({
        queryKey: ["console", "mediaFiles", key],
        queryFn: () => keryx.integrations.Core.FileInfo({ urls }),
        enabled: urls.length > 0,
        staleTime: 30_000,
    }).data;
    return useMemo(() => rows.map((m) => {
        const i = info?.[m.file_url];
        const syncing = pending.has(m.file_url);
        const posterSyncing = Boolean(m.thumbnail_url) && pending.has(m.thumbnail_url);
        if (!i && !syncing && !posterSyncing) return m;
        return {
            ...m,
            ...(i ? { missing: !i.exists, size: i.size } : {}),
            ...(syncing ? { missing: true, syncing: true } : {}),
            ...(posterSyncing ? { posterSyncing: true } : {}),
        };
    }), [rows, info, pending]);
}

// The projection themes (the same list and cache as useLibrary's).
export const useThemes = () => useList("ProjectionTheme", ["name"]).data;
// The service templates (their look: papel de parede and theme, serviceLook.js).
export const useServiceTemplates = () => useList("ServiceTemplate", ["name"]).data;

// Mídia and the background library are separate (owner's decision
// 2026-10-13): files sent as backgrounds are Media rows of category
// "background", listed only in the background library (useBackgrounds);
// `media` is everything else — the Biblioteca's Imagens and Vídeos, the
// media library, the aviso and layout editors.
export const isBackgroundMedia = (m) => m?.category === "background";

// A list has answered (or failed): before that, an empty list is not
// "nothing yet" and the Biblioteca shows no empty state (POL-03).
const answered = (q) => !q.isPending;

export function useLibrary() {
    const songsQ = useList("Song", ["title"]);
    const mediaQ = useList("Media", ["-created_date"]);
    const piecesQ = useList("CommunicationVideo", ["title"]);
    const songs = songsQ.data;
    const allMedia = useMediaFiles(mediaQ.data);
    const media = useMemo(() => allMedia.filter((m) => !isBackgroundMedia(m)), [allMedia]);
    const backgroundMedia = useMemo(() => allMedia.filter(isBackgroundMedia), [allMedia]);
    const pieces = piecesQ.data;
    const themes = useList("ProjectionTheme", ["name"]).data;
    const materials = useList("BibleMaterial", ["-created_date"]).data;
    const alertPresets = useList("AlertPreset", ["created_date"]).data;
    const timerPresets = useList("TimerPreset", ["minutes"]).data;
    const loaded = { songs: answered(songsQ), media: answered(mediaQ), pieces: answered(piecesQ) };
    return { songs, media, backgroundMedia, pieces, themes, materials, alertPresets, timerPresets, loaded };
}

// Every background the galleries can offer, with the church's settings
// (BackgroundPref, src/lib/console/backgroundPrefs.js): the ones that ship
// with KERYX by factory category, then the church's own backgrounds (Media
// rows of category "background": sent or brought in through the library).
const BUNDLED = bundledBackgrounds();
// Whether the church wants the forecast of the service's end and the delay
// ("termina ~", "passou N min"): Configurações › Culto, off by default.
export function useShowForecast() {
    return useUser((u) => u?.show_forecast === true);
}

export function useBackgroundPrefs() {
    return useList("BackgroundPref", []).data;
}
export function useBackgrounds() {
    const lib = useLibrary();
    const prefs = useBackgroundPrefs();
    // Before the libraries were separate, the Mídia's pictures were the
    // backgrounds: one the church set up as a background (it has a
    // BackgroundPref row) stays in the background library too.
    // Its origin says how it leaves the library (backgroundActions).
    const media = useMemo(() => {
        const set = new Set(prefs.map((p) => p?.source).filter(Boolean));
        return [...lib.backgroundMedia.map((m) => [m, "own"]), ...lib.media.filter((m) => set.has(sourceOf(m.file_url))).map((m) => [m, "media"])];
    }, [lib.backgroundMedia, lib.media, prefs]);
    return useMemo(() => {
        // A file the sync is still bringing stays listed (the tile says Baixando…).
        const of = (type) => media.filter(([m]) => m.type === type && m.file_url && (!m.missing || m.syncing) && !(type === "video" && /youtu/.test(m.file_url)))
            .map(([m, origin]) => ({ id: m.id, url: m.file_url, title: m.title, origin }));
        return backgroundList({ bundled: BUNDLED, images: of("image"), videos: of("video"), prefs });
    }, [media, prefs]);
}

// The services, newest first, and the items of the one in hand (today's by
// default, else the most recent).
export function useRundown(serviceId) {
    const client = useQueryClient();
    const servicesQ = useList("Service", ["-date"]);
    const services = servicesQ.data;
    useEffect(() => keryx.entities.ServiceItem.subscribe(() => client.invalidateQueries({ queryKey: ["console", "serviceItems"] })), [client]);
    const itemsQ = useQuery({
        queryKey: ["console", "serviceItems", serviceId],
        queryFn: () => keryx.entities.ServiceItem.filter({ serviceId }, "order"),
        enabled: Boolean(serviceId),
    });
    const items = itemsQ.data ?? EMPTY;
    // The Setlist's empty state waits for the services and its items (POL-03).
    const loaded = answered(servicesQ) && (!serviceId || answered(itemsQ));
    return { services, items: items.filter((i) => i.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), loaded };
}

export function pickDefaultService(services) {
    if (!services.length) return null;
    // Local date: toISOString() is UTC, so after 21:00 in Brazil "today"
    // would already be tomorrow and the evening service would be missed.
    const d = new Date();
    const two = (n) => String(n).padStart(2, "0");
    const today = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    return services.find((s) => s.date === today) || services[0];
}

// The outputs: the windows the main process places (desktop) and the
// screens on the church network (each says which page it shows;
// electron/lan.cjs). Polled, since window state has no event. The session
// memory (src/lib/console/outputs.js) keeps the ones that dropped, so a
// screen that leaves shows as Desconectada instead of vanishing.
export function useOutputs() {
    const [local, setLocal] = useState({ displays: [], outputs: [] });
    const [seen, setSeen] = useState({});
    // The operator's own names (Telas e saídas › Ajustes) go onto every row
    // here, so the popover, the banner and Verificar all say them.
    const look = useOutputLooks();
    const lookRef = useRef(look);
    lookRef.current = look;
    useEffect(() => {
        const bridge = window.keryxDesktop;
        if (!bridge) return undefined;
        let alive = true;
        // The bridge answers { data, error }; data = { displays, outputs }.
        // Both reads land before the memory is updated, so a window and the
        // network are judged from the same poll.
        const read = async () => {
            const [d, n] = await Promise.all([
                bridge.displays.list().catch(() => null),
                bridge.network ? bridge.network.call("info").catch(() => null) : null,
            ]);
            if (!alive) return;
            const name = (path, fallback) => (path && lookRef.current(path).custom) || fallback;
            const data = d?.data ? { ...d.data, outputs: (d.data.outputs || []).map((o) => ({ ...o, label: name(o.key, o.label) })) } : null;
            if (data) setLocal(data);
            const clients = n?.data ? (n.data.clients || []).map((cl) => ({ ...cl, label: name(cl.screen, cl.label) })) : null;
            // A removed output leaves the session memory too: a window closed
            // by removal is no "Fechada" nag, and re-adding starts clean.
            setSeen((prev) => {
                const outs = data ? data.outputs : [];
                let next = remember(prev, { outputs: outs.filter((o) => !o.removed), clients }, Date.now());
                for (const o of outs) if (o.removed) next = forget(next, localId(o.key));
                return next;
            });
        };
        read();
        const id = setInterval(read, 5000);
        return () => { alive = false; clearInterval(id); };
    }, []);
    // The shape Verificar and the player use: one entry per network screen,
    // online or not (lastSeen: when it dropped).
    const network = useMemo(() => Object.values(seen).filter((v) => v.kind === "net").map((v) => ({
        id: v.key,
        name: v.name,
        ip: v.ip,
        kind: /iPad|Tablet|Android(?!.*Mobile)/i.test(v.agent || "") ? "tablet" : "tv",
        online: !v.droppedAt,
        lastSeen: v.droppedAt,
        role: v.screen === "/VideoProjection" ? "media" : "lyrics",
    })), [seen]);
    const forgetOutput = useCallback((id) => setSeen((prev) => forget(prev, id)), []);
    return { displays: local.displays, outputs: local.outputs, network, seen, forgetOutput };
}

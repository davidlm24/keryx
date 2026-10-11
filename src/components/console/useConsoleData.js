import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { remember, forget } from "@/lib/console/outputs";
import { BACKGROUNDS, backgroundUrl } from "@/lib/backgrounds";
import { useOutputLooks } from "@/hooks/useOutputPref";
import { backgroundList } from "@/lib/console/backgroundPrefs";

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
function useMediaFiles(rows) {
    const urls = rows.map((m) => m.file_url).filter(Boolean);
    const key = urls.join("|");
    const info = useQuery({
        queryKey: ["console", "mediaFiles", key],
        queryFn: () => keryx.integrations.Core.FileInfo({ urls }),
        enabled: urls.length > 0,
        staleTime: 30_000,
    }).data;
    return useMemo(() => (info ? rows.map((m) => (info[m.file_url] ? { ...m, missing: !info[m.file_url].exists, size: info[m.file_url].size } : m)) : rows), [rows, info]);
}

export function useLibrary() {
    const songs = useList("Song", ["title"]).data;
    const media = useMediaFiles(useList("Media", ["-created_date"]).data);
    const pieces = useList("CommunicationVideo", ["title"]).data;
    const themes = useList("ProjectionTheme", ["name"]).data;
    const materials = useList("BibleMaterial", ["-created_date"]).data;
    return { songs, media, pieces, themes, materials };
}

// Every background the galleries can offer, with the church's settings
// (BackgroundPref, src/lib/console/backgroundPrefs.js): the ones that ship
// with KERYX by factory category, then the church's images from Mídia.
const BUNDLED = [...new Set(Object.values(BACKGROUNDS).flat())]
    .map((id) => ({ id, url: backgroundUrl(id), category: Object.keys(BACKGROUNDS).find((k) => BACKGROUNDS[k].includes(id)) }));
export function useBackgroundPrefs() {
    return useList("BackgroundPref", []).data;
}
export function useBackgrounds(media) {
    const prefs = useBackgroundPrefs();
    return useMemo(() => backgroundList({
        bundled: BUNDLED,
        images: (media || []).filter((m) => m.type === "image" && m.file_url && !m.missing).map((m) => ({ id: m.id, url: m.file_url, title: m.title })),
        prefs,
    }), [media, prefs]);
}

// The services, newest first, and the items of the one in hand (today's by
// default, else the most recent).
export function useRundown(serviceId) {
    const client = useQueryClient();
    const services = useList("Service", ["-date"]).data;
    useEffect(() => keryx.entities.ServiceItem.subscribe(() => client.invalidateQueries({ queryKey: ["console", "serviceItems"] })), [client]);
    const items = useQuery({
        queryKey: ["console", "serviceItems", serviceId],
        queryFn: () => keryx.entities.ServiceItem.filter({ serviceId }, "order"),
        enabled: Boolean(serviceId),
    }).data ?? EMPTY;
    return { services, items: items.filter((i) => i.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) };
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
            setSeen((prev) => remember(prev, { outputs: data ? data.outputs : [], clients }, Date.now()));
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

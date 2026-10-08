import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";

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
    return { songs, media, pieces, themes };
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

const ONLINE_MS = 45_000;

// The outputs: the windows the main process places (desktop) and the screens
// on the church network (ProjectionDevice heartbeats). Polled, since window
// state has no event.
export function useOutputs() {
    const [local, setLocal] = useState({ displays: [], outputs: [] });
    useEffect(() => {
        const bridge = window.keryxDesktop;
        if (!bridge) return undefined;
        let alive = true;
        // The bridge answers { data, error }; data = { displays, outputs }.
        const read = () => bridge.displays.list().then((r) => { if (alive && r && r.data) setLocal(r.data); }).catch(() => {});
        read();
        const id = setInterval(read, 5000);
        return () => { alive = false; clearInterval(id); };
    }, []);
    const devices = useList("ProjectionDevice", ["name"]).data;
    const now = Date.now();
    const network = devices.map((d) => ({
        id: d.id,
        name: d.name || "Tela na rede",
        kind: d.type || "tv",
        online: Boolean(d.is_online) && d.last_seen && now - Date.parse(d.last_seen) < ONLINE_MS,
        lastSeen: d.last_seen || null,
        role: d.role || "lyrics",
    }));
    return { displays: local.displays, outputs: local.outputs, network };
}

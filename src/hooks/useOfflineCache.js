import { useState, useEffect } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Hook de cache offline-first.
 * Carrega dados do localStorage imediatamente (instantâneo),
 * depois busca do servidor em background e actualiza.
 * Quando offline, serve apenas do cache.
 */
export function useOfflineCache(key, fetchFn, deps = []) {
    const [data, setData] = useState(() => {
        try {
            const cached = localStorage.getItem(`oc_${key}`);
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(!data.length);
    const [fromCache, setFromCache] = useState(!!data.length);
    const isOnline = useOnlineStatus();

    useEffect(() => {
        if (!isOnline) return;
        let cancelled = false;
        const load = async () => {
            try {
                const fresh = await fetchFn();
                if (cancelled) return;
                setData(fresh);
                setFromCache(false);
                localStorage.setItem(`oc_${key}`, JSON.stringify(fresh));
            } catch (e) {
                // Silenciosamente falha — mantém cache
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline, key, ...deps]);

    return { data, loading, fromCache, isOnline };
}

/**
 * Salva um item individual no cache offline.
 */
export function cacheItem(key, item) {
    try {
        const cached = JSON.parse(localStorage.getItem(`oc_${key}`) || "[]");
        const idx = cached.findIndex(i => i.id === item.id);
        if (idx >= 0) cached[idx] = item;
        else cached.push(item);
        localStorage.setItem(`oc_${key}`, JSON.stringify(cached));
    } catch {}
}

/**
 * Remove um item do cache offline.
 */
export function uncacheItem(key, id) {
    try {
        const cached = JSON.parse(localStorage.getItem(`oc_${key}`) || "[]");
        const filtered = cached.filter(i => i.id !== id);
        localStorage.setItem(`oc_${key}`, JSON.stringify(filtered));
    } catch {}
}
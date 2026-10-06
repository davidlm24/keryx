import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";

/**
 * Reconecta automaticamente a subscrição de projeção quando a ligação volta.
 * Re-busca o estado atual (LyricSync, VideoSync, LiveSession) para que o
 * tablet remoto sincronize em vez de ficar em branco após uma queda de rede.
 *
 * @param {function} onReconnect - chamada quando a ligação volta; recebe o estado atual
 * @param {string} entityType - entidade a re-buscar (ex: "LyricSync", "VideoSync")
 */
export function useProjectionReconnect(onReconnect, entityType) {
    const callbackRef = useRef(onReconnect);
    callbackRef.current = onReconnect;

    useEffect(() => {
        const handleOnline = async () => {
            try {
                const records = await keryx.entities[entityType].list("-timestamp", 1);
                if (records.length > 0) {
                    callbackRef.current(records[0]);
                }
            } catch (e) {
                // silencioso — vai tentar de novo na próxima reconexão
            }
        };

        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [entityType]);
}
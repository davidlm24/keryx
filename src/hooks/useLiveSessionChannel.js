import { useRef, useEffect } from "react";
import { keryx } from "@/api/keryxClient";

/**
 * Obtém o canal da LiveSession ativa mais recente ao montar.
 * As telas remotas usam este canal para filtrar eventos da LiveSession
 * e só reagir a sessões do seu próprio operador.
 */
export function useLiveSessionChannel() {
    const channelRef = useRef(null);

    useEffect(() => {
        const init = async () => {
            try {
                const sessions = await keryx.entities.LiveSession.list("-startedAt", 1);
                if (sessions.length > 0 && sessions[0].status === "active") {
                    channelRef.current = sessions[0].channel;
                }
            } catch (e) {}
        };
        init();
    }, []);

    return channelRef;
}
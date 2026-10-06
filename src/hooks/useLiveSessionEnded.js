import { useEffect, useRef } from "react";
import { useLiveState } from "@/hooks/useLiveState";

// Calls onEnded when the operator ends the session (Parar): screens that
// still keep their own state (video, Escola bíblica) clear themselves.
export function useLiveSessionEnded(onEnded) {
    const sessionId = useLiveState((s) => s?.session?.id ?? null);
    const previous = useRef(sessionId);
    const callback = useRef(onEnded);
    callback.current = onEnded;

    useEffect(() => {
        if (previous.current && !sessionId) callback.current();
        previous.current = sessionId;
    }, [sessionId]);
}

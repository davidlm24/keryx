import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";

/**
 * Envia um heartbeat periódico para ProjectionDevice, atualizando last_seen.
 * O operador pode assim ver quais ecrãs estão realmente online.
 *
 * @param {string|null} deviceId - ID do dispositivo atual (se conhecido)
 * @param {string} deviceName - nome do dispositivo para criar/registrar
 */
export function useDeviceHeartbeat(deviceId = null, deviceName = "Projection Screen") {
    const idRef = useRef(deviceId);

    useEffect(() => {
        if (!idRef.current) return;

        const send = () => {
            keryx.entities.ProjectionDevice.update(idRef.current, {
                is_online: true,
                last_seen: new Date().toISOString()
            }).catch(() => {});
        };

        send(); // imediato
        const interval = setInterval(send, 15000);
        const onOffline = () => {
            keryx.entities.ProjectionDevice.update(idRef.current, {
                is_online: false
            }).catch(() => {});
        };
        window.addEventListener("offline", onOffline);

        return () => {
            clearInterval(interval);
            window.removeEventListener("offline", onOffline);
            keryx.entities.ProjectionDevice.update(idRef.current, {
                is_online: false
            }).catch(() => {});
        };
    }, []);
}
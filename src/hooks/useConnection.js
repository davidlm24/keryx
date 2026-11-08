import { useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";

const subscribe = (callback) => keryx.connection.subscribe(callback);
const getSnapshot = () => keryx.connection.current();

// The link of a network screen to the KERYX computer
// ({ phase: "connecting" | "open" | "reconnecting", attempt }); always open
// on the desktop and in the preview.
export function useConnection() {
    return useSyncExternalStore(subscribe, getSnapshot);
}

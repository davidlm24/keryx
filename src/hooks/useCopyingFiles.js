import { useSyncExternalStore } from "react";
import { copyingNow, subscribeCopying } from "@/lib/mediaImport";

// The files this window is copying into the Mídia right now (mediaImport.js):
// the lists draw a row "Copiando o arquivo…" for each (copyingRows).
export const useCopyingFiles = () => useSyncExternalStore(subscribeCopying, copyingNow);

// Why a stage cannot go on air now, or null: the checks before every send
// (useConsole's send; the controle remoto hears the code). Pure (tested in
// remoteRunner.test.mjs).
import { pendingUrls, PENDING_SAY } from "../pendingMedia.js";
import { stageBlock } from "../presentation.js";

export const LOCKED_SAY = "Telas travadas: nada vai ao ar. Destrave em Saídas.";
// A video's still is not what goes on air: a send never waits for it.
export const PENDING_SKIP = { skip: ["poster", "thumbnail_url"] };

// -> { status, code, message } (codes of shared/remoteProtocol.json) | null.
// progress: how the making of a PDF's pages went (usePagesBackfill).
export function sendBlock(stage, { locked = false, pending = null, progress = null } = {}) {
    if (locked) return { status: 423, code: "locked", message: LOCKED_SAY };
    if (!stage) return { status: 409, code: "nothing", message: "Nada na prévia. Escolha um item da Setlist, uma música ou um versículo." };
    if (pendingUrls(stage, pending, PENDING_SKIP).length) return { status: 409, code: "syncing", message: PENDING_SAY };
    if (stage.missing) return { status: 409, code: "missing", message: "Arquivo não encontrado · Localizar… antes de enviar." };
    if (stage.blocked) return { status: 409, code: "blocked", message: stageBlock(stage, progress) };
    return null;
}

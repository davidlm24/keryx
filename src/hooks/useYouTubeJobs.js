import { useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";
import { getUser, updateUser } from "@/hooks/useUser";
import { jobActive } from "@/lib/youtubeLinks";

// The downloads of "Baixar para a Mídia" as this window hears them (main
// runs them, electron/youtube.cjs, and sends every job's progress to every
// window): a Map by Media id, read with useYouTubeJobs(). A job that ended
// stays a few seconds (done) or until it is tried again (failed), so its
// row can say so.
let jobs = new Map();
let started = false;
const listeners = new Set();
const KEEP_DONE_MS = 4000;
// The toast of the window that started a download, for how it ended.
const startedHere = new Map();

function put(job) {
    if (!job?.id) return;
    const next = new Map(jobs);
    next.set(job.id, job);
    jobs = next;
    for (const fn of listeners) fn();
    const say = startedHere.get(job.id);
    if (say && (job.phase === "done" || job.phase === "failed")) {
        startedHere.delete(job.id);
        say(job.phase === "done" ? "Pronto: o vídeo está na Mídia e toca sem internet." : job.message || "Não foi possível baixar o vídeo.");
    }
    if (job.phase === "done" || job.phase === "canceled") {
        setTimeout(() => {
            if (jobs.get(job.id) !== job) return;
            const after = new Map(jobs);
            after.delete(job.id);
            jobs = after;
            for (const fn of listeners) fn();
        }, KEEP_DONE_MS);
    }
}

const bridge = () => window.keryxDesktop?.youtube || null;

function start() {
    if (started) return;
    const b = bridge();
    if (!b) return;
    started = true;
    b.onJob(put);
    b.call("list").then((r) => { for (const job of r?.data || []) put(job); });
}

const subscribe = (fn) => { start(); listeners.add(fn); return () => listeners.delete(fn); };
const getSnapshot = () => jobs;

export function useYouTubeJobs() {
    return useSyncExternalStore(subscribe, getSnapshot);
}

// "Baixar para a Mídia" for a Media row that is a YouTube link: asks the
// Terms question once (Y5 = A, User.youtube_download_ok), then main
// downloads it and makes THE SAME row the file (Y1 = A).
// askText: the window's PromptDialog; say: its toast. -> true when started.
export async function downloadToMedia(row, { askText, say }) {
    const b = bridge();
    if (!b) { say?.("Baixar para a Mídia só funciona no KERYX do computador."); return false; }
    if (!row?.id) return false;
    if (jobActive(jobs.get(row.id))) { say?.(`"${row.title}" já está baixando.`); return true; }
    if (!getUser()?.youtube_download_ok) {
        const ok = await askText?.({ kind: "youtube-terms" });
        if (ok !== true) return false;
        await updateUser({ youtube_download_ok: true }).catch(() => {});
    }
    start();
    const r = await b.call("download", { id: row.id, url: row.file_url });
    if (r?.error) { say?.(r.error.message); return false; }
    if (say) startedHere.set(row.id, say);
    put(r.data);
    say?.(`Baixando "${row.title}" para a Mídia · o andamento aparece na linha dele, e o sino avisa ao terminar.`);
    return true;
}

export async function cancelDownload(row) {
    const b = bridge();
    if (b && row?.id) await b.call("cancel", { id: row.id });
}

// A YouTube row's youtube_state from what the check or the player found.
export function markYouTubeState(row, state) {
    if (!row?.id || !state || row.youtube_state === state) return Promise.resolve();
    return keryx.entities.Media.update(row.id, { youtube_state: state }).catch(() => {});
}

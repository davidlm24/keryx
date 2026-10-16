// The service planner's arithmetic (Planejador de culto): when each item
// starts, how long each section runs, when the service ends, and what a
// template keeps. Plain JS, no imports, so node --test can check it.
//
// A "SECTION" item is a header in the Setlist (Pré-culto, Culto, Pós-culto):
// it has no content, takes no time and is never sent to air.

export const TYPE_INFO = {
    SONG: { label: "Música", icon: "music" },
    BIBLE: { label: "Bíblia", icon: "book" },
    VIDEO: { label: "Vídeo", icon: "film" },
    AUDIO: { label: "Áudio", icon: "volume" },
    IMAGE: { label: "Imagem", icon: "image" },
    PDF: { label: "Apresentação", icon: "film" },
    POWERPOINT: { label: "Apresentação", icon: "film" },
    ANNOUNCEMENT: { label: "Aviso", icon: "megaphone" },
    TEXT: { label: "Texto", icon: "text" },
    TIMER: { label: "Timer", icon: "clock" },
    SECTION: { label: "Seção", icon: "list" },
    MATERIAL: { label: "Escola bíblica", icon: "book" },
};
export const typeLabel = (t) => TYPE_INFO[String(t || "").toUpperCase()]?.label || String(t || "Item");
export const typeIcon = (t) => TYPE_INFO[String(t || "").toUpperCase()]?.icon || "list";
export const isSection = (item) => String(item?.type || "").toUpperCase() === "SECTION";
// What the console can put on air (sections and disabled items cannot).
export const playableItems = (items) => (items || []).filter((i) => !isSection(i) && i.enabled !== false);

const MEDIA_TYPES = ["VIDEO", "IMAGE", "PDF", "POWERPOINT"];

// Whether the session's Setlist item (live.session.itemId) is still on air
// (the design audit's C-08): after Esc, or once something else went on air,
// it is only the last item sent — the Setlist marks it "último", never red.
// Under Tela preta or the Logo it stays on air, covered (the panels'
// "coberto" look, CRIT-14). Read from what is on top, in
// mainLayer's order (shared/live-state.mjs); a sound item counts while the
// audio channel plays it.
export function itemOnAir(live, items) {
    const id = live?.session?.itemId;
    const it = id ? (items || []).find((x) => x.id === id) : null;
    if (!it) return false;
    const type = String(it.type || "").toUpperCase();
    const own = it.contentId || null;
    if (type === "AUDIO") return Boolean(own) && live.audio?.id === own;
    if (live.tool) return type === "TIMER" && live.tool.mode === "timer";
    if (live.communication) return type === "ANNOUNCEMENT" && Boolean(own) && live.communication.item?.id === own;
    if (live.media) return MEDIA_TYPES.includes(type) && Boolean(own) && live.media.id === own;
    const ref = live.content?.ref;
    if (!ref) return false;
    if (ref.serviceItemId) return ref.serviceItemId === id;
    return Boolean(own) && [ref.songId, ref.passageId, ref.materialId, ref.mediaId].includes(own);
}

const minutesOf = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const two = (n) => String(n).padStart(2, "0");
export const clockAt = (seconds) => {
    const s = Math.round(seconds) % 86400;
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}`;
};
export const span = (seconds) => {
    const s = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
};

// A total, so it never reads as a clock time: "18 min", "1h15", "45 s".
export const total = (seconds) => {
    const s = Math.max(0, Math.round(seconds || 0));
    if (s < 60) return `${s} s`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? two(m % 60) : ""}`;
};

// The service's start in seconds after midnight (startTime, the legacy
// "time" field, else 19:00).
export const startOf = (service) => 60 * (minutesOf(service?.startTime) ?? minutesOf(service?.time) ?? 19 * 60);

// -> { rows: [{ item, at, section }], sections: { [index]: { count, seconds } },
//      count, seconds, ends }
// Disabled items keep their place but take no time.
export function plan(service, items) {
    let t = startOf(service);
    const start = t;
    const rows = [];
    const sections = {};
    let current = null;
    let count = 0;
    for (const [i, item] of (items || []).entries()) {
        if (isSection(item)) {
            current = i;
            sections[i] = { count: 0, seconds: 0 };
            rows.push({ item, at: null, section: i });
            continue;
        }
        const on = item.enabled !== false;
        const d = on ? Math.max(0, Number(item.duration) || 0) : 0;
        rows.push({ item, at: on ? t : null, section: current });
        if (on) {
            count += 1;
            if (current !== null) { sections[current].count += 1; sections[current].seconds += d; }
            t += d;
        }
    }
    return { rows, sections, count, seconds: t - start, ends: t };
}

// A template keeps each item's kind, title, duration, notes and what it
// points at (contentId): items made from it play, unlike the old ones.
export const templateItems = (items) => (items || []).map((it, order) => ({
    type: it.type, title: it.title || "", order, duration: it.duration || null, notes: it.notes || "", contentId: it.contentId || "",
}));

// Rows to create in a service from a template's or another service's items,
// after the ones it already has.
export const itemsFor = (serviceId, source, from = 0) => (source || []).map((it, k) => ({
    serviceId, order: from + k, type: it.type, title: it.title || "", contentId: it.contentId || "", duration: it.duration || null, notes: it.notes || "", enabled: it.enabled !== false,
}));

// Status: the three the planner shows; legacy values map onto them.
export const STATUS = [["DRAFT", "Rascunho"], ["READY", "Planejado"], ["COMPLETED", "Feito"]];
export const statusOf = (s) => ({ planning: "DRAFT", ready: "READY", completed: "COMPLETED", LIVE: "READY", ARCHIVED: "COMPLETED" }[s] || s || "DRAFT");

// "Nome · função" -> { member_name, role }
export function parseMember(text) {
    const [name, ...rest] = String(text || "").split("·");
    const member_name = name.trim();
    return member_name ? { member_name, role: rest.join("·").trim() || "Equipe" } : null;
}

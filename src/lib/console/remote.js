// The controle remoto (a phone on the church network, electron/lan.cjs):
// what the console tells it and says about it. The console runs each command
// as its own keys would (Console.jsx); this is the pure part. Tested.
import { captionParts } from "./caption.js";

// What the console says when a phone did something ("Celular: Tela preta").
export const REMOTE_LABEL = {
    next: "próximo slide",
    prev: "slide anterior",
    clear: "limpou o texto",
    play: "tocar / pausar",
    sendNext: "enviou o próximo",
    sendItem: "enviou um item da setlist",
    bibleSend: "enviou um versículo",
};
export const remoteSay = (action, detail = "") => `Celular: ${detail || REMOTE_LABEL[action] || action}.`;

// What the phone shows: the service, what is on air, the Setlist (sections
// as headers that are never sent) with the item on air and the next one.
export function remoteState({ service = null, items = [], airItemId = null, nextItemId = null, live = null }) {
    const { title, pos } = captionParts(live);
    return {
        service: service?.title || "",
        serviceId: service?.id || null,
        locked: Boolean(live?.locked),
        screen: live?.screen === "black" ? "black" : live?.screen === "logo" ? "logo" : "show",
        onAir: title && title !== "nada" ? { title, pos } : null,
        airItemId,
        nextItemId,
        items: items.map((it) => ({
            id: it.id,
            title: it.title || "",
            type: String(it.type || "").toUpperCase(),
            section: String(it.type || "").toUpperCase() === "SECTION",
        })),
    };
}

// A passage for the phone to check before sending: the reference and the
// start of its text, verse numbers in.
export function passagePreview(reference, verses, nums) {
    const chosen = nums.length ? verses.filter((v) => nums.includes(v.number)) : verses.slice(0, 1);
    const text = chosen.map((v) => `${v.number} ${v.text}`).join(" ");
    return { reference, text: text.length > 280 ? `${text.slice(0, 279).trimEnd()}…` : text };
}

import { mainLayer } from "@shared/live-state.mjs";

// What a screen shows, as a title and its position ("2/6" or ""): the parts
// of a monitor's caption.
export const captionParts = (doc) => {
    if (!doc) return { title: "", pos: "" };
    const layer = mainLayer(doc);
    // A video-channel clip covers the screens over every layer.
    if (doc.video && layer !== "black" && layer !== "logo") return { title: doc.video.title || "Vídeo", pos: "" };
    if (layer === "black") return { title: "Tela preta", pos: "" };
    if (layer === "logo") return { title: "Logo", pos: "" };
    if (layer === "content") return { title: doc.content.title || "Texto", pos: doc.content.slides.length > 1 ? `${doc.content.index + 1}/${doc.content.slides.length}` : "" };
    if (layer === "media") return { title: doc.media.title || "Mídia", pos: "" };
    if (layer === "communication") return { title: doc.communication.item?.title || "Aviso", pos: "" };
    if (layer === "tool") return { title: { clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" }[doc.tool.mode], pos: "" };
    return { title: "nada", pos: "" };
};

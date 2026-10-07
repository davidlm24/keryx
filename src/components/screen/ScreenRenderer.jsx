import React from "react";
import "./screen.css";
import { mainLayer, currentSlide, toolTime } from "@shared/live-state.mjs";
import { FONT_MAP, getTextEffect } from "@/lib/deviceStyles";
import LiveMediaView from "@/components/projection/LiveMediaView";
import LiveVideo from "@/components/projection/LiveVideo";

// The projected screen as a pure function of a live-state document (or a
// console's local copy of one): the projector window renders it full-screen
// (fill) and the console's monitors render it in a box, so a preview is the
// output scaled down. `now` is the live clock (useLiveNow) for timers and
// countdowns; `preview` keeps media from playing (a poster instead) and
// audio silent. `motion` is the console's Programa monitor: still a muted
// preview, but videos (the media layer and the video channel) really play,
// in step with the screens, so the monitor mirrors the projector.
export default function ScreenRenderer({ state, now, logoUrl = "", preview = false, motion = false, fill = false, className = "" }) {
    const cls = `ks ${fill ? "ks-fill" : "ks-box"} ${className}`;
    if (!state) return <div className={cls}><Idle logoUrl={logoUrl} /></div>;

    const layer = mainLayer(state);
    if (layer === "black") return <div className={cls}><div className="ks-black" /></div>;
    if (layer === "logo") {
        return <div className={cls}><div className="ks-logo-screen">{logoUrl && <img src={logoUrl} alt="" />}</div></div>;
    }

    return (
        <div className={cls}>
            <Background state={state} layer={layer} />
            {layer === "none" && <Idle logoUrl={logoUrl} />}
            {layer === "content" && <Content content={state.content} />}
            {layer === "tool" && <Tool tool={state.tool} now={now} />}
            {layer === "communication" && <Communication comm={state.communication} now={now} />}
            {layer === "media" && (preview ? <MediaPoster media={state.media} motion={motion} /> : <LiveMediaView media={state.media} />)}
            {!preview && layer === "content" && state.content.audio && (
                <audio key={state.content.startedAt} src={state.content.audio} autoPlay className="hidden" />
            )}
            {state.logo?.visible && logoUrl && layer !== "media" && (
                <img className={`ks-logo ks-${state.logo.size} ks-${state.logo.corner}`} src={logoUrl} alt="" />
            )}
            {preview && motion && state.video && (
                <div className="ks-vidcover"><LiveVideo item={state.video} muted className="ks-vidcover-v" /></div>
            )}
            <Overlays overlays={state.overlays} />
            {state.alert && <div className={`ks-alert ks-alert-${state.alert.type}`}>{state.alert.message}</div>}
        </div>
    );
}

function Idle({ logoUrl }) {
    return <><div className="ks-bg-default" /><div className="ks-idle">{logoUrl && <img src={logoUrl} alt="" />}</div></>;
}

const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("/"));

// The background under the content: the item's own (a song's image, a tool's
// or piece's), else the background layer, else the default gradient. Media
// and communication pieces with their own imagery paint over it.
function Background({ state, layer }) {
    const own = layer === "content" ? state.content.style?.background_image
        : layer === "tool" ? state.tool.style?.background_image
        : layer === "communication" ? (state.communication.item.background_image || state.communication.item.background_color)
        : null;
    const bg = own || null;
    const liveBg = !bg && state.background ? state.background : null;
    if (layer === "media") return <div className="ks-black" />;
    if (bg) {
        if (isUrl(bg)) return <><div className="ks-bg-img" style={{ backgroundImage: `url(${bg})` }} /><div className="ks-bg-dim" /></>;
        return <div className="ks-layer" style={{ background: bg }} />;
    }
    if (liveBg) {
        if (liveBg.kind === "video") return <video className="ks-bg-video" src={liveBg.value} autoPlay loop muted playsInline />;
        if (liveBg.kind === "color") return <div className="ks-layer" style={{ background: liveBg.value }} />;
        return <><div className="ks-bg-img" style={{ backgroundImage: `url(${liveBg.value})` }} /><div className="ks-bg-dim" /></>;
    }
    return <div className="ks-bg-default" />;
}

const SIZES = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];
const SIZE_CQW = { xsmall: "2.4cqw", small: "3cqw", medium: "3.8cqw", large: "4.8cqw", xlarge: "5.8cqw", xxlarge: "7cqw" };
const ANIM = { fade: "ks-anim-fade", slide: "ks-anim-slide", zoom: "ks-anim-zoom", crossfade: "ks-anim-fade", none: "", cut: "" };

function textStyle(style) {
    const color = style.text_color || "#ffffff";
    const base = { fontFamily: FONT_MAP[style.font_family] || FONT_MAP.sans };
    if (style.text_color_2) {
        return { ...base, backgroundImage: `linear-gradient(to right, ${color}, ${style.text_color_2})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color };
    }
    return { ...base, color, ...getTextEffect(style.text_effect || "shadow", color) };
}

// Bible slides carry "16 Porque Deus… 17 Porque…": the numbers become marks.
function verseNodes(text) {
    const parts = String(text).split(/(?:^|\s)(\d{1,3})\s+(?=\S)/);
    if (parts.length < 3) return text;
    const out = [];
    if (parts[0].trim()) out.push(parts[0]);
    for (let i = 1; i < parts.length; i += 2) out.push(<sup key={i}>{parts[i]}</sup>, parts[i + 1]);
    return out;
}

function Content({ content }) {
    const style = content.style || {};
    const slide = currentSlide(content) || { text: "" };
    const size = SIZES.includes(style.font_size) ? style.font_size : "large";
    const align = style.text_align || "center";
    const pos = style.text_position || "middle";
    const anim = ANIM[style.transition ?? "fade"] ?? "ks-anim-fade";
    const bible = content.kind === "bible";
    const reference = content.ref?.reference || content.title;
    const key = `${content.startedAt}:${content.index}`;
    return (
        <>
            {!bible && content.title && <div className="ks-title" style={{ fontFamily: FONT_MAP[style.font_family] || FONT_MAP.sans }}>{content.title}</div>}
            <div className={`ks-content ks-al-${align} ks-pos-${pos} ${bible ? "ks-bible" : ""}`} style={{ "--ks-size": SIZE_CQW[size] }}>
                <div key={key} className={anim} style={{ display: "contents" }}>
                    {slide.is_chorus && !bible && <div className="ks-chorus">Refrão</div>}
                    <div className={`ks-text ks-${size}`} style={textStyle(style)}>{bible ? verseNodes(slide.text) : slide.text}</div>
                    {bible && reference && <div className="ks-ref" style={{ color: style.text_color || "#ffffff" }}>{reference}</div>}
                </div>
            </div>
        </>
    );
}

const two = (n) => String(n).padStart(2, "0");
const clockOf = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    return `${h ? two(h) + ":" : ""}${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

function Tool({ tool, now }) {
    const style = tool.style || {};
    const color = { color: style.text_color || "#ffffff", fontFamily: FONT_MAP[style.font_family] || FONT_MAP.sans };
    if (tool.mode === "freetext") return <div className="ks-tool"><div className="ks-free" style={color}>{tool.text}</div></div>;
    if (tool.mode === "clock") {
        const d = new Date(now);
        return (
            <div className="ks-tool" style={color}>
                <div className="ks-tool-v">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                <div className="ks-tool-date">{d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</div>
            </div>
        );
    }
    const ms = toolTime(tool, now);
    const done = tool.mode === "timer" && ms === 0;
    return (
        <div className="ks-tool" style={color}>
            <div className="ks-tool-lab">{tool.mode === "timer" ? "Tempo restante" : "Cronômetro"}</div>
            <div className={`ks-tool-v ${done ? "ks-done" : ""}`}>{clockOf(ms)}</div>
        </div>
    );
}

// Communication pieces (CommunicationVideo rows): the time counts from the
// shared start, so every screen shows the same second.
function Communication({ comm, now }) {
    const item = comm.item || {};
    const elapsed = Math.max(0, now - comm.startedAt);
    const duration = Number(item.duration) || 0;
    const color = { color: item.text_color || "#ffffff" };
    // An image + text piece shows its picture whole; the background behind it is painted by Background.
    const img = item.type === "image_text" && isUrl(item.image_url) ? <img className="ks-comm-img" src={item.image_url} alt="" /> : null;
    let big = null;
    if (item.type === "countdown") big = clockOf(Math.max(0, duration * 1000 - elapsed));
    else if (item.type === "timer") big = clockOf(duration ? Math.min(elapsed, duration * 1000) : elapsed);
    return (
        <div className="ks-comm" style={color}>
            {img}
            {item.type === "countdown" && (item.subtext || item.text) && <div className="ks-comm-s">{item.subtext || item.text}</div>}
            {big && <div className="ks-comm-big">{big}</div>}
            {item.type !== "countdown" && item.text && <div className="ks-comm-t">{item.text}</div>}
            {item.type !== "countdown" && item.subtext && <div className="ks-comm-s">{item.subtext}</div>}
            {comm.playlist && <div className="ks-media-count">{comm.playlistIndex + 1} / {comm.playlist.length}</div>}
        </div>
    );
}

const KIND_LABEL = { video: "Vídeo", youtube: "YouTube", image: "Imagem", gif: "GIF", pdf: "Apresentação", powerpoint: "Apresentação", audio: "Áudio" };

function MediaPoster({ media, motion = false }) {
    const image = media.kind === "image" || media.kind === "gif";
    const moving = motion && (media.kind === "video" || media.kind === "youtube");
    return (
        <div className="ks-media">
            {image && <img src={media.url} alt="" />}
            {moving && <LiveVideo item={media} muted className="ks-vidcover-v" />}
            {!image && !moving && <><div className="ks-media-kind">{KIND_LABEL[media.kind] || media.kind}</div><div className="ks-media-t">{media.title || media.url}</div></>}
            {media.playlist && <div className="ks-media-count">{media.playlistIndex + 1} / {media.playlist.length}</div>}
        </div>
    );
}

function Overlays({ overlays }) {
    const shown = (overlays || []).filter((o) => o && o.enabled !== false);
    if (shown.length === 0) return null;
    return (
        <div className="ks-overlays">
            {shown.map((o) => {
                const style = { left: `${o.x ?? 0}%`, top: `${o.y ?? 0}%`, width: `${o.width ?? 20}%`, opacity: o.opacity ?? 1, zIndex: o.z_index ?? 10 };
                if (o.type === "logo" || o.type === "image") return <div key={o.id} className="ks-ov" style={style}><img src={o.content} alt="" /></div>;
                if (o.type === "announcement" || o.type === "text") return <div key={o.id} className="ks-ov ks-ov-text" style={style}>{o.content}</div>;
                return null;
            })}
        </div>
    );
}

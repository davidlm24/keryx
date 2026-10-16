import React from "react";
import "./screen.css";
import GeneratorBackground from "./GeneratorBackground";
import { mainLayer, currentSlide, toolTime, layerHidden, layerLocked, LAYER_ORDER } from "@shared/live-state.mjs";
import { FONT_MAP, getTextEffect } from "@/lib/deviceStyles";
import LiveMediaView from "@/components/projection/LiveMediaView";
import LiveVideo from "@/components/projection/LiveVideo";
import { noticeTime, fileAt, clockOf } from "@/lib/console/notice";
import { ringBell } from "@/lib/bell";
import { usePrefs } from "@/hooks/useUser";
import { verseSegments, withoutVerseMarks } from "@/lib/verseMarks";
import { refLine } from "@/lib/bibleDisplay";
import { fitScale } from "@/lib/console/lyricFit";
import ChordedLines, { chordedOf } from "@/components/network/ChordedLines";
import ActivityView from "./ActivityView";

// The projected screen as a pure function of a live-state document (or a
// console's local copy of one): the projector window renders it full-screen
// (fill) and the console's monitors render it in a box, so a preview is the
// output scaled down. `now` is the live clock (useLiveNow) for timers and
// countdowns; `preview` keeps media from playing (a poster instead) and
// audio silent. `motion` is the console's Programa monitor: still a muted
// preview, but videos (the media layer and the video channel) really play,
// in step with the screens, so the monitor mirrors the projector.
export default function ScreenRenderer({ state, now, logoUrl = "", preview = false, motion = false, fill = false, audio = !preview, className = "" }) {
    const cls = `ks ${fill ? "ks-fill" : "ks-box"} ${className}`;
    // The item's title on top of the slide: the item's choice (style.title),
    // else the theme's, stamped at send; this legacy church pref is only the
    // fallback for content no theme dressed (Rodada B 2026-10-14).
    const showTitle = usePrefs().show_item_title;
    if (!state) return <div className={cls}><Idle logoUrl={logoUrl} /></div>;

    const layer = mainLayer(state);
    if (layer === "black") return <div className={cls}><div className="ks-black" /></div>;
    if (layer === "logo") {
        return <div className={cls}><div className="ks-logo-screen">{logoUrl && <img src={logoUrl} alt="" />}</div></div>;
    }

    // The look layers stack as the operator ordered them (Camadas): top first.
    const order = Array.isArray(state.layerOrder) && state.layerOrder.length === LAYER_ORDER.length ? state.layerOrder : LAYER_ORDER;
    const z = (k) => 10 * (order.length - order.indexOf(k));
    // Nothing on air: the Fundo layer stays on screen (Esc takes the text
    // and the media, not the Fundo); the idle look only when there is none.
    const fundo = Boolean(state.background) && !layerHidden(state, "background");
    return (
        <div className={cls}>
            <div className="ks-z" style={{ zIndex: z("background") }}><Background state={state} layer={layer} preview={preview} motion={motion} /></div>
            <div className="ks-z" style={{ zIndex: z("content") }}>
                {layer === "none" && !fundo && (state.idle === "black" ? <div className="ks-black" /> : <Idle logoUrl={logoUrl} wallpaper={state.idle === "background" ? state.idleUrl : null} dim={state.idleDim} blur={state.idleBlur} />)}
                {layer === "content" && !layerHidden(state, "content") && (currentSlide(state.content)?.activity
                    ? <ActivityView content={state.content} now={now} audio={audio} look={activityLook(state.content, showTitle, preview && !motion)} />
                    : <Content content={state.content} showTitle={showTitle} still={preview && !motion} />)}
                {layer === "tool" && <Tool tool={state.tool} now={now} />}
                {layer === "communication" && <Communication comm={state.communication} now={now} logoUrl={logoUrl} preview={preview} motion={motion} audio={audio} />}
                {layer === "media" && (preview ? <MediaPoster media={state.media} motion={motion} /> : <LiveMediaView media={state.media} />)}
            </div>
            {!preview && layer === "content" && state.content.audio && (
                <audio key={state.content.startedAt} src={state.content.audio} autoPlay className="hidden" />
            )}
            {/* An output that hides the song's words (OutputPref Mostrar) still plays its track. */}
            {!preview && state.track?.src && !(layer === "content" && state.content?.audio) && (
                <audio key={state.track.startedAt} src={state.track.src} autoPlay className="hidden" />
            )}
            {state.logo?.visible && logoUrl && layer !== "media" && (
                <div className="ks-z" style={{ zIndex: z("logo") }}><img className={`ks-logo ks-${state.logo.size} ks-${state.logo.corner}`} style={logoLook(state.logo)} src={logoUrl} alt="" /></div>
            )}
            {preview && motion && state.video && (
                <div className="ks-vidcover"><LiveVideo item={state.video} muted className="ks-vidcover-v" /></div>
            )}
            <Overlays overlays={state.overlays} z={z("overlays")} />
            {state.alert && <div className={`ks-alert ks-alert-${state.alert.type}`}>{state.alert.message}</div>}
        </div>
    );
}

// Nothing on air: the operator's wallpaper (cover, no logo over it: it was
// chosen instead of the logo), else the default gradient with the logo.
// The corner logo's own look (Camadas): opacity, a free width (% of the
// width) and its distance from the corner; without them, the CSS defaults.
function logoLook(logo) {
    const out = {};
    if (logo.opacity != null) out.opacity = logo.opacity;
    if (logo.width != null) { out.width = `${logo.width}cqw`; out.height = `${logo.width}cqw`; }
    if (logo.margin != null) {
        const m = `${logo.margin}cqw`;
        const [v, h] = String(logo.corner || "bottom-right").split("-");
        out[v] = m;
        out[h] = m;
    }
    return out;
}

function Idle({ logoUrl, wallpaper, dim, blur }) {
    if (wallpaper) {
        // The wallpaper as it is, unless Aparência › Fundos gave it a dim or a blur.
        const look = bgLook({ kind: "image", dim: dim ?? 0, blur });
        return <><div className="ks-bg-img ks-idle-wall" style={{ backgroundImage: `url("${String(wallpaper).replace(/"/g, "%22")}")`, ...(blur ? { filter: look.image.filter, transform: look.image.transform } : {}) }} />{look.dim}</>;
    }
    return <><div className="ks-bg-default" /><div className="ks-idle">{logoUrl && <img src={logoUrl} alt="" />}</div></>;
}

// Old rows saved Tailwind-style gradients ("to br"), which CSS ignores.
const SIDE = { t: "top", b: "bottom", l: "left", r: "right" };
const cssBackground = (v) => (typeof v === "string" ? v.replace(/\bto ([tblr])([tblr])?\b/g, (_m, a, b) => `to ${[a, b].filter(Boolean).map((x) => SIDE[x]).join(" ")}`) : v);

const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("/"));

// The background under the content: the item's own (a song's image, a tool's
// or piece's), else the background layer, else the default gradient. Media
// and communication pieces with their own imagery paint over it.
// The content's style on the slide on screen: a song part with a theme of its
// own (slide.style, src/lib/console/songTheme.js) lays its look over the song's.
const slideStyle = (content) => {
    const own = currentSlide(content)?.style;
    return own ? { ...(content.style || {}), ...own } : content.style || {};
};

function Background({ state, layer, preview, motion }) {
    if (layer === "media") return <div className="ks-black" />;
    // Camadas' eye on the Fundo: no Fundo, and no picture of a song's own
    // either; an aviso's or a tool's own look stays (it is theirs, not the
    // Fundo's), and without one the screen is black.
    const hidden = layerHidden(state, "background");
    if (hidden && layer !== "tool" && layer !== "communication") return <div className="ks-black" />;
    const cs = layer === "content" ? slideStyle(state.content) : null;
    // The Fundo held by Camadas' padlock: a song's (or a part's) own
    // picture is not drawn over it. Avisos and tools keep their own look.
    const own = layer === "content" ? (layerLocked(state, "background") ? null : cs.background_image || cssBackground(cs.background_color))
        : layer === "tool" ? state.tool.style?.background_image
        : layer === "communication" ? (state.communication.item.background_image || cssBackground(state.communication.item.background_color))
        : null;
    const bg = own || null;
    const liveBg = !bg && !hidden && state.background ? state.background : null;
    if (bg) {
        if (isUrl(bg)) {
            // The item's own picture, with the dim and blur its background
            // brought from Fundos (style.background_dim/_blur).
            const st = layer === "content" ? cs : layer === "tool" ? state.tool.style : layer === "communication" ? state.communication.item : null;
            const look = bgLook({ kind: "image", dim: st?.background_dim, blur: st?.background_blur });
            return <><div className="ks-bg-img" style={{ backgroundImage: `url(${bg})`, ...(st?.background_blur ? { filter: look.image.filter, transform: look.image.transform } : {}) }} />{look.dim}</>;
        }
        return <div className="ks-layer" style={{ background: bg }} />;
    }
    if (liveBg) {
        if (liveBg.kind === "color") return <div className="ks-layer" style={{ background: liveBg.value }} />;
        const look = bgLook(liveBg);
        // A generated background: computed on the screen (GeneratorBackground),
        // moving on an output and on the Programa monitor, still elsewhere.
        if (liveBg.kind === "generator" && liveBg.gen) return <><GeneratorBackground gen={liveBg.gen} animate={!preview || motion} />{look.dim}</>;
        if (liveBg.kind === "video") return <><video className="ks-bg-video" style={look.media} src={liveBg.value} autoPlay loop muted playsInline />{look.dim}</>;
        return <><div className="ks-bg-img" style={{ backgroundImage: `url(${liveBg.value})`, ...look.image }} />{look.dim}</>;
    }
    return hidden ? <div className="ks-black" /> : <div className="ks-bg-default" />;
}

// The Fundo layer's own look (Camadas): fit, which part shows, blur (px at
// 1920 wide, so in cqw) and how dark; without them, the old look (cover,
// centred, .45 dark for pictures, none for videos).
const PX = 100 / 1920; // 1px of a 1920-wide screen, in cqw
function bgLook(bg) {
    const blur = bg.blur ? { filter: `blur(${(bg.blur * PX).toFixed(3)}cqw)`, transform: "scale(1.06)" } : {};
    const pos = bg.position || "center";
    const dim = bg.dim ?? (bg.kind === "video" || bg.kind === "generator" ? 0 : 0.45);
    return {
        image: { backgroundSize: bg.fit || "cover", backgroundPosition: pos, backgroundRepeat: "no-repeat", ...blur },
        media: { objectFit: bg.fit || "cover", objectPosition: pos, ...blur },
        dim: dim > 0 ? <div className="ks-bg-dim" style={{ background: `rgba(0, 0, 0, ${dim})` }} /> : null,
    };
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

// Camadas' extra text look: how see-through, how wide, the line spacing,
// capitals, a box behind it (a band across the screen or a block around the
// text) and a fine vertical nudge (% of the screen's height, in cqw).
const LINE_HEIGHT = { tight: 1.08, normal: 1.22, loose: 1.45 };
const rgba = (hex, a) => { const n = parseInt(String(hex || "#000000").slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
function textExtra(style) {
    const out = {};
    if (style.text_opacity != null) out.opacity = style.text_opacity;
    if (style.text_max_width != null) out.maxWidth = `${style.text_max_width}%`;
    if (style.line_height && LINE_HEIGHT[style.line_height]) out.lineHeight = LINE_HEIGHT[style.line_height];
    if (style.text_case === "upper") out.textTransform = "uppercase";
    if (style.text_box === "block" || style.text_box === "band") {
        out.boxDecorationBreak = "clone";
        out.WebkitBoxDecorationBreak = "clone";
        if (!style.text_color_2) out.backgroundColor = rgba(style.text_box_color, style.text_box_opacity ?? 0.55);
        out.padding = style.text_box === "band" ? "1.4cqw 8cqw" : "1.2cqw 2.4cqw";
        out.borderRadius = style.text_box === "band" ? 0 : "1cqw";
        if (style.text_box === "band") { out.alignSelf = "stretch"; out.marginInline = "-8cqw"; out.maxWidth = "none"; }
    }
    return out;
}

// Bible slides carry "16 Porque Deus… 17 Porque…": the numbers become marks.
// Only numbers in sequence are marks (src/lib/verseMarks.js): "930 anos" stays text.
function verseNodes(text, numbers = "sup") {
    if (numbers === "hide") return withoutVerseMarks(text);
    const segs = verseSegments(text);
    if (segs.length === 1 && segs[0].n === null) return text;
    return segs.flatMap((x, i) => (x.n === null ? [x.text] : [<sup key={i}>{x.n}</sup>, x.text]));
}

// One line of the lyrics is one line on screen (owner 2026-10-14): a song's
// lines never wrap; when the longest does not fit the text's box the
// slide's font shrinks (fitScale, down to FIT_MIN). Only a line too long
// even then wraps, rather than leave the screen. The natural width comes
// from a hidden copy of the text (`probe`, one line per line at the text's
// size); measured after layout and again when the screen is resized or the
// fonts arrive.
const FIT_MIN = 0.45;
function useFitWidth(on, deps) {
    const textRef = React.useRef(null);
    const probeRef = React.useRef(null);
    const [fit, setFit] = React.useState({ scale: 1, wrap: false });
    const measure = React.useCallback(() => {
        const text = textRef.current, probe = probeRef.current;
        const box = text?.closest(".ks-content");
        if (!on || !text || !probe || !box) return;
        const bs = getComputedStyle(box), ts = getComputedStyle(text);
        const contentW = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
        const maxW = ts.maxWidth.endsWith("%") ? (contentW * parseFloat(ts.maxWidth)) / 100 : contentW;
        const avail = Math.min(contentW, maxW) - parseFloat(ts.paddingLeft) - parseFloat(ts.paddingRight);
        const natural = probe.offsetWidth;
        const scale = fitScale(avail, natural, FIT_MIN);
        const wrap = natural * scale > avail + 1;
        setFit((f) => (Math.abs(f.scale - scale) > 0.004 || f.wrap !== wrap ? { scale, wrap } : f));
    }, [on]);
    React.useLayoutEffect(measure, [measure, ...deps]);
    React.useEffect(() => {
        if (!on) return undefined;
        const box = textRef.current?.closest(".ks-content");
        const ro = typeof ResizeObserver === "function" && box ? new ResizeObserver(() => measure()) : null;
        ro?.observe(box);
        let alive = true;
        document.fonts?.ready?.then(() => { if (alive) measure(); });
        return () => { alive = false; ro?.disconnect(); };
    }, [on, measure]);
    return { textRef, probeRef, fit: on ? fit : { scale: 1, wrap: false } };
}

// still: a preview that does not move (the Prévia, thumbnails, samples) —
// the text without its transition; the Programa and the outputs keep it.
// content.show (an output's own settings, prefState): `labels` draws the
// part's name over the slide, `chords` the lyrics' chords over the syllables.
function Content({ content, showTitle = true, still = false }) {
    const style = slideStyle(content);
    // The item's own choice (Camadas) wins over the church's (showTitle).
    const titled = style.title === "hide" ? false : style.title === "show" ? true : showTitle;
    const slide = currentSlide(content) || { text: "" };
    const size = SIZES.includes(style.font_size) ? style.font_size : "large";
    const align = style.text_align || "center";
    const pos = style.text_position || "middle";
    const anim = still ? "" : ANIM[style.transition ?? "fade"] ?? "ks-anim-fade";
    const bible = content.kind === "bible";
    const lyrics = content.kind === "lyrics";
    const show = content.show || {};
    const chorded = lyrics && show.chords ? chordedOf(content.stage, content.index, slide.text) : null;
    const reference = slide.ref || content.ref?.reference || content.title;
    const key = `${content.startedAt}:${content.index}`;
    const { textRef, probeRef, fit } = useFitWidth(lyrics, [key, slide.text, chorded, size, style.font_family, style.text_max_width, style.text_box, style.text_case]);
    const body = bible ? verseNodes(slide.text, style.verse_numbers) : chorded ? <ChordedLines chorded={chorded} /> : slide.text;
    return (
        <>
            {!bible && titled && content.title && <div className="ks-title" style={{ fontFamily: FONT_MAP[style.font_family] || FONT_MAP.sans }}>{content.title}</div>}
            <div className={`ks-content ks-al-${align} ks-pos-${pos} ${bible ? "ks-bible" : ""}`} style={{ "--ks-size": SIZE_CQW[size], ...(style.text_nudge ? { translate: `0 ${(style.text_nudge * 0.5625).toFixed(2)}cqw` } : {}) }}>
                <div key={key} className={anim} style={{ display: "contents", ...(style.transition_ms ? { "--ks-tr": `${Math.round(style.transition_ms)}ms` } : {}) }}>
                    {show.labels && !bible && slide.label && <div className="ks-chorus">{slide.label}</div>}
                    {isUrl(slide.image_url) && <img className={`ks-slide-img ${slide.text ? "" : "is-alone"}`} src={slide.image_url} alt="" />}
                    {(slide.text || !slide.image_url) && (
                        <div ref={textRef} className={`ks-text ks-${size} ${lyrics ? `ks-lines ${fit.wrap ? "is-wrap" : ""}` : ""}`} style={{ ...textStyle(style), ...textExtra(style) }}>
                            {lyrics ? <>
                                <span className="ks-fit" style={fit.scale < 1 ? { fontSize: `${fit.scale}em` } : undefined}>{body}</span>
                                <span ref={probeRef} className="ks-fit-probe" aria-hidden="true">{body}</span>
                            </> : body}
                        </div>
                    )}
                    {bible && refLine(reference, style.ref_line) && <div className="ks-ref" style={{ color: style.text_color || "#ffffff" }}>{refLine(reference, style.ref_line)}</div>}
                </div>
            </div>
        </>
    );
}

// The theme's look for an Escola bíblica activity (ActivityView.jsx): the
// same font, colour, effect, size, title and transition as the text.
function activityLook(content, showTitle, still) {
    const style = slideStyle(content);
    const size = SIZES.includes(style.font_size) ? style.font_size : "large";
    return {
        text: textStyle(style), font: { fontFamily: FONT_MAP[style.font_family] || FONT_MAP.sans }, color: style.text_color || "#ffffff", size: SIZE_CQW[size],
        titled: style.title === "hide" ? false : style.title === "show" ? true : showTitle, upper: style.text_case === "upper",
        anim: still ? "" : ANIM[style.transition ?? "fade"] ?? "ks-anim-fade",
    };
}

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

// Communication pieces (CommunicationVideo rows, src/lib/console/notice.js):
// the time counts from the shared start, so every screen shows the same
// second. The piece brings its own look — text size, font, colour, effect
// and position, a background image, colour, video or a loop of files, the
// church logo in a corner — and, on outputs that play sound (`audio`), its
// background audio and the alert chime.
const NOTICE_CQW = { small: "3.4cqw", medium: "4.2cqw", large: "5cqw", xlarge: "6.2cqw", xxlarge: "7.6cqw" };

function Communication({ comm, now, logoUrl, preview, motion, audio }) {
    const item = comm.item || {};
    const elapsed = Math.max(0, now - comm.startedAt);
    const t = noticeTime(item, elapsed);
    const urgent = item.type === "countdown" && t !== null && t > 0 && t <= 10_000;
    const file = fileAt(item.files, elapsed);
    const video = file?.file.type === "video" ? file.file.url : !file && isUrl(item.background_video) ? item.background_video : null;
    const picture = file?.file.type === "image" ? file.file.url : null;
    const playing = !preview || motion;
    const ts = textStyle(item);
    const heading = item.text || (item.type === "countdown" || item.type === "timer" ? "" : item.title);
    return (
        <>
            {picture && <><div key={file.index} className="ks-bg-img" style={{ backgroundImage: `url(${picture})` }} /><div className="ks-bg-dim" /></>}
            {video && <><video key={`${video}${file?.index ?? ""}`} className="ks-bg-video" src={video} autoPlay={playing} loop={!file} muted playsInline preload="metadata" /><div className="ks-bg-dim" /></>}
            {audio && isUrl(item.background_audio) && <audio key={comm.startedAt} src={item.background_audio} autoPlay loop className="hidden" />}
            {audio && item.sound_alert && <Chime key={comm.startedAt} />}
            <div className={`ks-comm ks-comm-${item.type || "announcement"} ks-al-${item.text_position_h || "center"} ks-pos-${item.text_position_v || "middle"}`} style={{ "--ks-size": NOTICE_CQW[item.font_size] || NOTICE_CQW.large }}>
                {item.type === "attention" && <div className="ks-comm-flag">Atenção</div>}
                {heading && <div className="ks-comm-t" style={ts}>{heading}</div>}
                {t !== null && <div className={`ks-comm-big ${urgent ? "ks-urgent" : ""}`} style={ts}>{clockOf(t)}</div>}
                {item.subtext && <div className="ks-comm-s" style={ts}>{item.subtext}</div>}
            </div>
            {item.show_logo && logoUrl && <img className={`ks-logo ks-medium ks-${item.logo_position || "top-left"}`} src={logoUrl} alt="" />}
            {comm.playlist && <div className="ks-media-count">{comm.playlistIndex + 1} / {comm.playlist.length}</div>}
        </>
    );
}

// The church's chime (on or off, its volume: Configurações, on the profile).
function Chime() {
    const prefs = usePrefs();
    React.useEffect(() => { ringBell({ on: prefs.chime_on, volume: prefs.chime_volume }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

const KIND_LABEL = { video: "Vídeo", youtube: "YouTube", image: "Imagem", gif: "GIF", pdf: "Apresentação", powerpoint: "Apresentação", audio: "Áudio" };

function MediaPoster({ media, motion = false }) {
    const image = media.kind === "image" || media.kind === "gif";
    const moving = motion && (media.kind === "video" || media.kind === "youtube");
    return (
        <div className="ks-media">
            {image && <img src={media.url} alt="" />}
            {moving && <LiveVideo item={media} muted className="ks-vidcover-v" />}
            {!image && !moving && media.poster && <><img src={media.poster} alt="" /><div className="ks-media-chip">{KIND_LABEL[media.kind] || media.kind}</div></>}
            {!image && !moving && !media.poster && <><div className="ks-media-kind">{KIND_LABEL[media.kind] || media.kind}</div><div className="ks-media-t">{media.title || media.url}</div></>}
            {media.playlist && <div className="ks-media-count">{media.playlistIndex + 1} / {media.playlist.length}</div>}
        </div>
    );
}

function Overlays({ overlays, z }) {
    const shown = (overlays || []).filter((o) => o && o.enabled !== false);
    if (shown.length === 0) return null;
    return (
        <div className="ks-overlays" style={{ zIndex: z }}>
            {shown.map((o) => {
                const style = { left: `${o.x ?? 0}%`, top: `${o.y ?? 0}%`, width: `${o.width ?? 20}%`, opacity: o.opacity ?? 1, zIndex: o.z_index ?? 10 };
                if (o.type === "logo" || o.type === "image") return <div key={o.id} className="ks-ov" style={style}><img src={o.content} alt="" /></div>;
                if (o.type === "announcement" || o.type === "text") return <div key={o.id} className="ks-ov ks-ov-text" style={style}>{o.content}</div>;
                return null;
            })}
        </div>
    );
}

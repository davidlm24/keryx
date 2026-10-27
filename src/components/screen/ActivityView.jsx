import React from "react";
import "./activity.css";
import { currentSlide, revealOf } from "@shared/live-state.mjs";
import { blanksView, memorizeView, discussionTime, LETTERS, TRUE_FALSE } from "@/lib/activity";
import { clockOf } from "@/lib/console/notice";
import { ringBell } from "@/lib/bell";
import { usePrefs } from "@/hooks/useUser";

// An Escola bíblica activity on screen (slide.activity, owner 2026-10-16,
// Rodada E4), drawn by ScreenRenderer in place of the plain text: the
// question or the verse in the theme's font and colour (`look`, from the
// renderer), laid out for the class, and how far it was revealed
// (content.revealed, content.reveal) on the same slide — the right card lit
// green with ✓ and the others dimmed, the V or F, the next word back, more
// words gone, the discussion's timer counting down (and the church's chime
// when it ends, on outputs that play sound).
export default function ActivityView({ content, now, look, audio = false }) {
    const slide = currentSlide(content);
    const a = slide.activity;
    const reveal = revealOf(content);
    const step = reveal?.step || 0;
    const text = look.text;
    const words = (runs) => runs.map((r, i) => {
        if (r.blank) return <span key={i} className="ks-gap"><span>{r.text}</span></span>;
        if (r.shown) return <span key={i} className={`ks-word-in ${r.last ? "is-new" : ""}`}>{r.text}</span>;
        return <React.Fragment key={i}>{r.text}</React.Fragment>;
    });
    let body;
    if (a.kind === "choice" || a.kind === "truefalse") {
        const tf = a.kind === "truefalse";
        const options = tf ? TRUE_FALSE : a.options;
        const shown = step > 0;
        body = (
            <>
                <div className="ks-act-q" style={text}>{slide.text}</div>
                <div className={`ks-act-opts ${tf ? "is-tf" : options.length > 4 ? "is-many" : ""}`}>
                    {options.map((o, k) => (
                        <div key={k} className={`ks-act-opt ${shown ? (k === a.correct ? "is-right" : "is-dim") : ""}`}>
                            <b>{tf ? o[0] : LETTERS[k]}</b>
                            <span style={text}>{o}</span>
                            {shown && k === a.correct && <i aria-label="certa">✓</i>}
                        </div>
                    ))}
                </div>
                {shown && a.explain && <div className="ks-act-ref">{a.explain}</div>}
            </>
        );
    } else if (a.kind === "blanks" || a.kind === "memorize") {
        const runs = a.kind === "blanks" ? blanksView(slide.text, a.blanks, step) : memorizeView(slide.text, a.order, a.rounds, step);
        body = (
            <>
                <div className="ks-act-verse" style={text}>{words(runs)}</div>
                {a.explain && <div className="ks-act-ref">{a.explain}</div>}
            </>
        );
    } else {
        const t = discussionTime(a, reveal, now);
        body = (
            <>
                <div className="ks-act-q" style={text}>{slide.text}</div>
                <div className={`ks-act-timer ${t.started ? "" : "is-wait"} ${t.done ? "is-done" : ""}`} style={text}>{clockOf(t.left)}</div>
                {a.explain && <div className="ks-act-ref">{a.explain}</div>}
                {/* The chime once, as the time runs out (a window opened later stays quiet). */}
                {audio && t.done && now - t.endsAt < 4000 && <Bell key={t.endsAt} />}
            </>
        );
    }
    return (
        <>
            {look.titled && content.title && <div className="ks-title" style={look.font}>{content.title}</div>}
            <div className={`ks-act ks-act-${a.kind}`} style={{ "--ks-size": look.size, color: look.color, ...look.font, ...(look.upper ? { textTransform: "uppercase" } : {}) }}>
                <div key={`${content.startedAt}:${content.index}`} className={look.anim} style={{ display: "contents" }}>
                    {slide.label && <div className="ks-act-kicker">{slide.label}</div>}
                    {body}
                </div>
            </div>
        </>
    );
}

// The church's chime (on or off, its volume: Configurações, on the profile).
function Bell() {
    const prefs = usePrefs();
    React.useEffect(() => { ringBell({ on: prefs.chime_on, volume: prefs.chime_volume }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

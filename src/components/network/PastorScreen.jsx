import React from "react";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { captionParts, airFor } from "@/lib/console/caption";
import { typeLabel } from "@/lib/console/setlist";
import "@/components/network/net.css";

const two = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
// "Sábado, 10 de outubro": the first letter only (pt-BR keeps months lower case).
const upperFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const span = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`);

// What the pastor's tablet draws: exactly what the congregation sees, by the
// projector's own renderer; the time and how long the service has been
// running; and the next items (`upcoming`). The page (PastorView) feeds it
// the live state; the console's Prévia feeds it the prepared stage
// (`embed`: inside a monitor).
export default function PastorScreen({ live, nowMs, logo, upcoming = [], hasService = false, embed = false, opts = {}, scale = 1, church = null }) {
    const now = new Date(nowMs);
    // Which parts this screen shows (Configurações › Telas e saídas ›
    // Ajustes); missing keys mean the screen as it always was.
    const show = { clock: opts.clock ?? true, next: (opts.next_count ?? 3) !== 0 };
    const rootStyle = scale !== 1 ? { "--kp-text": scale } : undefined;
    const session = live?.session || null;
    const { title, pos } = captionParts(live);
    const onAir = title !== "nada";
    const content = live?.content || null;
    const slides = content?.slides || [];
    const index = content?.index || 0;
    const itemFor = airFor(live, nowMs);
    const running = session?.startedAt ? Math.max(0, Math.floor((nowMs - session.startedAt) / 1000)) : null;

    return (
        <div className={`net ${embed ? "net-embed" : ""}`} style={rootStyle}>
          <div className="net-pastor">
            <header className="np-h">
                <div className="np-who">
                    <b>{church?.name || "Tela do pastor"}</b>
                    <span>{upperFirst(now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}{church?.city ? ` · ${church.city}` : ""}</span>
                </div>
                {show.clock && <div className="np-time">
                    <b>{hhmm(now)}</b>
                    <span className={running != null ? "is-run" : ""}>{running == null ? "Nada no ar ainda" : `${hasService ? "Culto" : "No ar"} há ${span(running)}`}</span>
                </div>}
            </header>
            <section className="np-air" aria-label="No ar agora">
                <div className="np-cap">
                    <span className={`net-section ${onAir ? "is-air" : ""}`}>No ar</span>
                    <b>{title}</b>
                    {pos && <span>{pos}</span>}
                    {itemFor && <span className="np-since">há {itemFor}</span>}
                </div>
                <div className="np-mon">
                    <ScreenRenderer state={live} now={nowMs} logoUrl={logo} preview audio={false} />
                </div>
                {slides.length > 1 && (
                    <div className="np-prog" aria-label={`Slide ${index + 1} de ${slides.length}`}>
                        {slides.map((_, i) => <i key={i} className={i === index ? "is-on" : i < index ? "is-done" : ""} />)}
                    </div>
                )}
            </section>
            {show.next && <aside className="np-side" aria-label="Próximos no culto">
                <span className="net-section">Próximo</span>
                {upcoming.length ? (
                    <div className="np-list">
                        {upcoming.map((it, i) => (
                            <div key={it.id} className={`np-item ${i === 0 ? "is-next" : ""}`}>
                                <b>{it.title || typeLabel(it.type)}</b>
                                <span>{typeLabel(it.type)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="np-empty">{hasService ? "Fim da setlist." : "Nenhum culto escolhido no console."}</p>
                )}
            </aside>}
          </div>
        </div>
    );
}

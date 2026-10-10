import React, { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { captionParts } from "@/components/console/CenterPanel";
import { playableItems, typeLabel } from "@/lib/console/setlist";
import { nextItems } from "@/lib/network/views";
import "@/components/network/net.css";

const two = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
// "Sábado, 10 de outubro": the first letter only (pt-BR keeps months lower case).
const upperFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const span = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`);

// The service on air: the session's, else the service of the item on air (a
// session that began before a service was picked keeps serviceId empty).
function useServiceId(session) {
    const [fromItem, setFromItem] = useState(null);
    const itemId = session?.serviceId ? null : session?.itemId || null;
    useEffect(() => {
        if (!itemId) { setFromItem(null); return undefined; }
        let alive = true;
        keryx.entities.ServiceItem.get(itemId).then((it) => { if (alive) setFromItem(it?.serviceId || null); }).catch(() => { if (alive) setFromItem(null); });
        return () => { alive = false; };
    }, [itemId]);
    return session?.serviceId || fromItem;
}

// The service's items, from the database (a network screen reads it like the
// console does), kept current by the store's realtime changes.
function useServiceItems(serviceId) {
    const [items, setItems] = useState([]);
    useEffect(() => {
        if (!serviceId) { setItems([]); return undefined; }
        let alive = true;
        const load = () => keryx.entities.ServiceItem.filter({ serviceId }, "order")
            .then((rows) => { if (alive) setItems(rows || []); })
            .catch(() => { if (alive) setItems([]); });
        load();
        const off = keryx.entities.ServiceItem.subscribe?.((change) => { if (change?.data?.serviceId === serviceId || change?.type === "delete") load(); });
        window.addEventListener("online", load);
        return () => { alive = false; off?.(); window.removeEventListener("online", load); };
    }, [serviceId]);
    return items;
}

// The pastor's screen (a tablet on the pulpit, often upright): exactly what
// the congregation sees, drawn by the projector's own renderer; the time and
// how long the service has been running; and what comes next in the Setlist.
export default function PastorView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const logo = useChurchLogo();
    const now = new Date(nowMs);
    const session = live?.session || null;
    const serviceId = useServiceId(session);
    const items = playableItems(useServiceItems(serviceId));
    const upcoming = nextItems(items, session, 3);
    const { title, pos } = captionParts(live);
    const onAir = title !== "nada";
    const content = live?.content || null;
    const slides = content?.slides || [];
    const index = content?.index || 0;
    const running = session?.startedAt ? Math.max(0, Math.floor((nowMs - session.startedAt) / 1000)) : null;

    return (
        <div className="net">
          <div className="net-pastor">
            <header className="np-h">
                <div className="np-who">
                    <b>Tela do pastor</b>
                    <span>{upperFirst(now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}</span>
                </div>
                <div className="np-time">
                    <b>{hhmm(now)}</b>
                    <span className={running != null ? "is-run" : ""}>{running == null ? "Nada no ar ainda" : `${serviceId ? "Culto" : "No ar"} há ${span(running)}`}</span>
                </div>
            </header>
            <section className="np-air" aria-label="No ar agora">
                <div className="np-cap">
                    <span className={`net-section ${onAir ? "is-air" : ""}`}>No ar</span>
                    <b>{title}</b>
                    {pos && <span>{pos}</span>}
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
            <aside className="np-side" aria-label="Próximos no culto">
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
                    <p className="np-empty">{serviceId ? "Fim da setlist." : "Nenhum culto escolhido no console."}</p>
                )}
            </aside>
          </div>
        </div>
    );
}

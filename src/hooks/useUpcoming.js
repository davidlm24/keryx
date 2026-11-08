import { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { playableItems } from "@/lib/console/setlist";
import { nextItems } from "@/lib/network/views";

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

// What comes next in the service on air, for the Pastor and Palco screens
// (PastorScreen's "Próximo", a layout's "Próximos da Setlist"): the playable
// items after the one on air, up to `count`, and whether a service is on.
export function useUpcoming(live, count = 10) {
    const session = live?.session || null;
    const serviceId = useServiceId(session);
    const items = playableItems(useServiceItems(serviceId));
    const upcoming = useMemo(() => nextItems(items, session, count), [items, session, count]);
    return { upcoming, hasService: Boolean(serviceId), items };
}

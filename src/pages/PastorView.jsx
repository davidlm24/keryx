import React, { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import PastorScreen from "@/components/network/PastorScreen";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
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

// The pastor's screen (a tablet on the pulpit, often upright): PastorScreen
// on the live state, with what comes next in the service's Setlist.
export default function PastorView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const logo = useChurchLogo();
    const session = live?.session || null;
    const serviceId = useServiceId(session);
    const items = playableItems(useServiceItems(serviceId));
    return <PastorScreen live={live} nowMs={nowMs} logo={logo} upcoming={nextItems(items, session, 3)} hasService={Boolean(serviceId)} />;
}

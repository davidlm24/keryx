import { keryx } from "@/api/keryxClient";
import { isSection, typeLabel } from "@/lib/console/setlist";

// Taking an item out of the Setlist (owner 2026-10-16, 0.2.18), shared by the
// console's Setlist (right click) and Planejar o culto. "Tirar", never
// "Excluir": the song, passage or file stays in the KERYX; only its place in
// this culto goes. No rendering here.

// The question asked first (useConfirm).
export function takeOutQuestion(item) {
    const name = item?.title || typeLabel(item?.type);
    return isSection(item)
        ? { title: "Tirar a seção?", text: `A seção "${name}" sai da setlist; os itens dela continuam.`, ok: "Tirar" }
        : { title: "Tirar da setlist?", text: `"${name}" sai da setlist deste culto e continua no KERYX.`, ok: "Tirar" };
}

// Out of the setlist, and the rest numbered again from what the store holds
// (never the list on screen, which may lag), so no two items share a place.
export async function takeOut(item) {
    await keryx.entities.ServiceItem.delete(item.id);
    const rest = (await keryx.entities.ServiceItem.filter({ serviceId: item.serviceId }, "order")) || [];
    for (const [i, it] of rest.entries()) if (it.order !== i) await keryx.entities.ServiceItem.update(it.id, { order: i });
}

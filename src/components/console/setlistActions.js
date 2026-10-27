import { keryx } from "@/api/keryxClient";
import { isSection, typeLabel } from "@/lib/console/setlist";
import { renumberPlan } from "@/lib/console/bulkDelete";

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

// Several at once (a selection, or the items of rows being deleted): every
// one out first, then each culto numbered again ONCE from the store
// (renumberPlan) — taking out one by one renumbered after each. -> how many
// could not be taken out.
export async function takeOutMany(items) {
    let failed = 0;
    for (const it of items) {
        try { await keryx.entities.ServiceItem.delete(it.id); } catch { failed++; }
    }
    const touched = [...new Set(items.map((it) => it.serviceId).filter(Boolean))];
    const rest = [];
    for (const serviceId of touched) rest.push(...((await keryx.entities.ServiceItem.filter({ serviceId }, "order")) || []));
    for (const { id, order } of renumberPlan(rest)) await keryx.entities.ServiceItem.update(id, { order });
    return failed;
}

import { useBridge, usePoll } from "./parts";
import { outputStatusText } from "@/lib/console/outputs";
import { placementValue, placementTarget } from "@/lib/console/placement";

// The monitors and where each output opens (electron/outputs.cjs), read from
// the main process every 3 s. Shared by Telas e saídas (the cards) and the
// Editor's Ajustes › Destino (Rodada H2: the screen select and "Abrir ao
// iniciar" moved there). `say` is the console's toast.
//   - displays: the desktop bridge (null in a plain browser);
//   - state: { displays, outputs } or null while it is read; readError: why not;
//   - apply(promise): a change answers with the new state, or says why it failed;
//   - valueOf(assignment) / choose(output, value): the select's value and what
//     choosing one asks of the main process;
//   - statusOf(output): "Tela cheia na Tela 2" (outputStatusText).
export function useDisplays(say) {
    const displays = useBridge("displays");
    const [state, , setState, readError] = usePoll(() => displays?.list(), 3000);
    const list = state?.displays || [];
    const outputs = state?.outputs || [];
    // Every change answers with the new state, or says why it failed.
    const apply = (p) => p.then((res) => { if (res?.error) say(res.error.message); else if (res?.data) setState(res.data); })
        .catch((err) => say(err?.message || "Não foi possível mudar a saída."));
    // A display's number as Windows counts it here (0: not among the ones on).
    const number = (id) => list.findIndex((d) => d.id === id) + 1;
    const valueOf = (a) => placementValue(a, list);
    const choose = (o, value) => {
        const target = placementTarget(value, list);
        return target ? apply(displays.set(o.key, { target })) : Promise.resolve();
    };
    const statusOf = (o) => outputStatusText(o.placement, number(o.placement?.displayId));
    return { displays, state, setState, readError, list, outputs, apply, number, valueOf, choose, statusOf };
}

// The network pages' info (electron/lan.cjs): on or off, the addresses and
// the screens connected now. Shared by Telas na rede and the Editor's
// Destino › Na rede.
export function useNetworkInfo() {
    const network = useBridge("network");
    const [info, , setInfo, readError] = usePoll(() => network?.call("info"), 3000);
    return { network, info, setInfo, readError };
}

// Ajuda › Primeiros passos (owner 2026-10-20, Rodada M0): the console in
// seven steps, for whoever takes the projection desk for the first time.
// Each step says where the thing is and may offer one button that opens it
// (`go`: an id the console's dialog maps to its own action). The keys follow
// the church's "Teclas de uma letra" (`hint`, keys.js keyHint): with the
// letters off, the step names the button instead of the letter.
//
// A step: { title, text, go?: { id, label } }.

export const FIRST_STEP_GOALS = ["outs", "planner", "search", "verify"];

export function firstSteps(hint = () => null) {
    const key = (action, fallback) => {
        const k = hint(action);
        return k ? `${fallback} (${k})` : fallback;
    };
    return [
        {
            title: "Ligue as telas",
            text: "Com o projetor ligado, abra a Projeção em Saídas: o status das telas, no topo, à direita. Cada saída aberta mostra o que está no ar.",
            go: { id: "outs", label: "Abrir Saídas" },
        },
        {
            title: "Monte o culto",
            text: "Em Planejar o culto, escolha o culto do dia e ponha músicas, passagens, avisos e mídias na ordem. O Setlist, à direita, é essa lista.",
            go: { id: "planner", label: "Planejar o culto" },
        },
        {
            title: "Prepare na Prévia",
            text: "Um clique num item do Setlist, da Biblioteca ou dos Slides o põe na Prévia. A Prévia é só sua: nada vai às telas ainda.",
        },
        {
            title: "Envie ao ar",
            text: "Enter ou um duplo clique envia o que está na Prévia. ← e → passam os slides no ar; ↑ e ↓ escolhem o próximo, em verde.",
        },
        {
            title: "Busque qualquer coisa",
            text: `A busca do topo (${hint("search") || "Ctrl+F"}) acha músicas, mídias e passagens: digite "jo 3 16" e a Bíblia abre no versículo.`,
            go: { id: "search", label: "Abrir a busca" },
        },
        {
            title: "Se algo der errado",
            text: `${key("black", "Tela preta")}, ${key("logo", "Logo")} e ${key("clear", "Limpar")} ficam no Programa. Esc tira tudo do ar, e Desfazer (Ctrl+Z) volta o que estava.`,
        },
        {
            title: "Antes do culto",
            text: "Verificar tudo confere as telas, as mídias e as Bíblias. Para ensaiar sem mexer nas telas, use Travar telas, em Saídas.",
            go: { id: "verify", label: "Verificar tudo" },
        },
    ];
}

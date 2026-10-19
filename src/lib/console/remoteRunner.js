// The controle remoto's commands (a phone, electron/lan.cjs → main's
// `keryx:remote` → the console, useRemote.js): each one runs what the
// console's own key or palette does, so Travar telas, themes and the Desfazer
// of Encerrar hold; the answer goes back to the phone, and the console says
// what the phone did. Pure: everything the console owns comes in as deps
// (node:test cannot resolve `@/`), read once per command so it sees the
// latest state. Tested (remoteRunner.test.mjs).
import { remoteState, remoteSay, passagePreview } from "./remote.js";
import { isSection } from "./setlist.js";
import { playerLayer, playerOp } from "./player.js";
import { referenceNums } from "./bibleVerses.js";
import { formatReference, parseReference } from "../bibleBooks.js";

export const refuse = (message, status = 409) => ({ ok: false, message, status });

// One entry per action. `onAir`: it puts something new on air, so locked
// screens refuse it (423) before anything else is checked.
export const REMOTE_HANDLERS = {
    state: {
        run: ({ d }) => ({ ok: true, data: remoteState({ service: d.service, items: d.items, airItemId: d.airNow ? d.airItemId : null, nextItemId: d.nextItem?.id || null, live: d.live() }) }),
    },
    next: { onAir: true, run: step },
    prev: { onAir: true, run: step },
    black: { run: screenMode },
    logo: { run: screenMode },
    clear: {
        run: async ({ d, action }) => {
            await d.clearText();
            return { ok: true, message: remoteSay(action) };
        },
    },
    play: {
        onAir: true,
        run: async ({ d, action }) => {
            const op = playerOp(d.live(), playerLayer(d.live(), d.playerPick), "toggle");
            if (!op) return refuse("Nada tocando.");
            await d.callOp(op[0], op[1]);
            return { ok: true, message: remoteSay(action) };
        },
    },
    end: {
        // As the Esc: everything off, with Desfazer on the console.
        run: async ({ d }) => {
            await d.end({ by: "Celular" });
            return { ok: true, message: "Projeção encerrada." };
        },
    },
    sendNext: {
        onAir: true,
        run: async ({ d, sendOne }) => {
            const { nextItem, items } = d;
            if (!nextItem) return refuse("Não há próximo item na setlist.");
            return sendOne(await d.buildStage(nextItem, items.indexOf(nextItem)), `enviou "${nextItem.title}"`);
        },
    },
    sendItem: {
        onAir: true,
        run: async ({ d, args, sendOne }) => {
            const { items } = d;
            const index = items.findIndex((i) => i.id === args.itemId);
            if (index < 0) return refuse("Esse item não está na setlist.", 404);
            if (isSection(items[index])) return refuse("Uma seção não vai ao ar.");
            return sendOne(await d.buildStage(items[index], index), `enviou "${items[index].title}"`);
        },
    },
    bibleFind: {
        run: async ({ d, args }) => {
            const r = await reference(d, args);
            if (r.error) return r.error;
            if (r.nums.length && !r.verses.some((v) => r.nums.includes(v.number))) return refuse(`${formatReference(r.ref)} não existe na ${r.version}.`, 404);
            return { ok: true, data: passagePreview(`${formatReference(r.ref)} · ${r.version}`, r.verses, r.nums) };
        },
    },
    bibleSend: {
        onAir: true,
        run: async ({ d, args, sendOne }) => {
            const r = await reference(d, args);
            if (r.error) return r.error;
            const live = d.live();
            const onAir = live?.content?.kind === "bible" ? live.content : null;
            const st = d.stageFromVerses({ verses: r.verses, nums: r.nums, how: d.prefs.bible_verses_per_slide, version: r.version, book: r.ref.book, chapter: r.ref.chapter, onAir });
            if (!st) return refuse(`${formatReference(r.ref)} não existe na ${r.version}.`, 404);
            return sendOne(st, `enviou ${formatReference(r.ref)}`);
        },
    },
};

async function step({ d, action }) {
    if (!d.live()?.content) return refuse("Nada com slides no ar.");
    await d.callOp(action === "next" ? "content.next" : "content.prev");
    return { ok: true, message: remoteSay(action) };
}

async function screenMode({ d, action }) {
    const turningOn = d.live()?.screen !== action;
    await d.liveOp("screen.set", { mode: turningOn ? action : "show" });
    return { ok: true, message: remoteSay(action, `${action === "black" ? "Tela preta" : "Logo"} ${turningOn ? "ligado" : "desligado"}`) };
}

async function reference(d, args) {
    const ref = parseReference(args.ref);
    if (!ref) return { error: refuse(`Não entendi "${args.ref}". Escreva como jo 3 16.`, 400) };
    const { version, verses } = await d.referenceVerses(ref);
    return { ref, version, verses, nums: referenceNums(ref) };
}

// deps (an object, or a function giving the latest one):
//   live()            what is on air (the console's live state)
//   locked            Travar telas is on
//   lockedSay         what a locked refusal says
//   service, items, airItemId, airNow, nextItem   the Setlist as the console sees it
//   prefs, playerPick
//   callOp, liveOp, clearText, say, end           the console's live operations (end: Esc, with its Desfazer toast)
//   sendStage(stage) → truthy when it went on air; buildStage(item, index)
//   referenceVerses(ref) → { version, verses }; stageFromVerses(...)
export function createRemoteRunner(deps) {
    const current = () => (typeof deps === "function" ? deps() : deps);

    const run = async ({ action, args = {} }) => {
        const d = current();
        const handler = Object.hasOwn(REMOTE_HANDLERS, action) ? REMOTE_HANDLERS[action] : null;
        if (handler?.onAir && d.locked) return refuse(d.lockedSay, 423);
        if (!handler) return refuse("Comando desconhecido.", 400);
        const sendOne = async (stage, said) => ((await d.sendStage(stage)) ? { ok: true, message: remoteSay(action, said) } : refuse("Não foi para o ar."));
        return handler.run({ d, action, args, sendOne });
    };

    // What goes back to the phone: a throw is a 500 with its message, and
    // what the phone did shows on the console too (Encerrar says it with its
    // Desfazer).
    const answer = async (command) => {
        let reply;
        try { reply = await run(command); } catch (err) { reply = { ok: false, message: err?.message || "Não foi possível.", status: err?.status || 500 }; }
        if (reply.ok && reply.message && command.action !== "end") current().say(reply.message);
        return reply;
    };

    return { run, answer };
}

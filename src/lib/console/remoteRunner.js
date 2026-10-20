// The controle remoto's commands (a phone, electron/lan.cjs → main's
// `keryx:remote` → the console, useRemote.js): each one runs what the
// console's own key or palette does, so Travar telas, themes and the Desfazer
// of Encerrar hold; the answer goes back to the phone, and the console says
// what the phone did. The actions, their args and refusal codes are
// shared/remoteProtocol.json's (lan.cjs has checked the args' types; here
// their meaning: ids that exist in the console's own lists). Refusals go in
// the order 423 (locked) → 404 (not_found) → 409 (nothing, missing,
// syncing, blocked). Writes run one at a time; Tela preta, Logo, Limpar,
// Tirar, Encerrar, Tirar o aviso and Travar never wait behind them.
//
// Pure: everything the console owns comes in as deps (node:test cannot
// resolve `@/`), read once per command so it sees the latest state. Tested
// (remoteRunner.test.mjs).
import { PROTOCOL, EMERGENCY, remoteKind, remoteState, remoteSay, passagePreview, refFromArgs, libraryPage, backItemOf } from "./remote.js";
import { isSection } from "./setlist.js";
import { playerLayer, playerLayers, playerOp, videoSwap, followAction, followsItem } from "./player.js";
import { referenceNums } from "./bibleVerses.js";
import { formatReference, BIBLE_VERSIONS } from "../bibleBooks.js";
import { timerChoices } from "./timerPresets.js";
import { orderPresets } from "./alertPresets.js";
import { livePosition } from "../../../shared/live-state.mjs";

const M = PROTOCOL.messages;
const STATUS = PROTOCOL.codes;

// A refusal: { ok: false, message, status, code? }.
export const refuse = (message, status = 409, code) => ({ ok: false, message, status, ...(code ? { code } : {}) });
const fail = (code, message) => refuse(message, STATUS[code], code);
const notInBible = (ref, version) => fail("not_found", M.notInBible.replace("{reference}", formatReference(ref)).replace("{version}", version));
const ok = (message, data) => ({ ok: true, message, ...(data !== undefined ? { data } : {}) });

// Where the phone's Camadas switches go.
const LAYER_OF = { text: "content", bg: "background" };
const LAYER_WORD = { text: "Texto", bg: "Fundo", corner: "Logo" };
const OFF_WORD = { tool: "relógio / timer", communication: "aviso", media: "mídia", video: "vídeo", audio: "som", content: "texto" };
const TOOL_WORD = { clock: "o relógio", stopwatch: "o cronômetro" };
const FOLLOW_WORD = { start: "letra automática iniciada", pause: "letra automática pausada", resume: "letra automática retomada" };
const PLAYER_WORD = { toggle: "tocar / pausar", back: "voltou 10 s", forward: "avançou 10 s", prev: "faixa anterior", next: "próxima faixa", volume: "volume", seek: "posição do player" };

// The layer the phone's player means: the one asked, while it plays; else
// the one the console's player shows.
function playerTarget(d, live, args) {
    if (args.layer) return playerLayers(live).includes(args.layer) ? args.layer : null;
    return playerLayer(live, d.playerPick);
}

async function player({ d, live, args }) {
    const layer = playerTarget(d, live, args);
    const item = layer ? live[layer] : null;
    const follow = live?.content?.follow || null;
    // The live clock with nothing playing: Tocar is the follow's (the console's player too).
    if (!item && !args.layer && follow?.source === "clock" && args.do === "toggle") {
        await d.callOp("content.follow", { action: followAction(follow) });
        return ok(remoteSay("follow", FOLLOW_WORD[followAction(follow)]));
    }
    if (!item) return fail("nothing", M.nothingPlaying);
    if (args.do === "swap") {
        const swap = videoSwap(live, layer);
        if (!swap) return fail("nothing", "Este item não troca entre vídeo e som.");
        if (swap.disabled) return fail("blocked", `${swap.title}.`);
        const op = playerOp(live, layer, swap.action);
        await d.callOp(op[0], op[1]);
        return ok(remoteSay("player", swap.action === "audioOnly" ? "tirou o vídeo · o som continua" : "mostrou o vídeo"));
    }
    if (args.do === "volume" && args.volume === undefined) return refuse("Comando inválido.", 400);
    if (args.do === "seek" && args.to === undefined) return refuse("Comando inválido.", 400);
    // As the console's player: the item's length, else what its output reported, else the song's.
    const duration = item.duration || d.reportedDuration?.(layer, item.url) || (followsItem(follow, item) ? follow.length || null : null);
    const pos = args.do === "seek" ? args.to : livePosition(item.playback, d.now());
    const op = playerOp(live, layer, args.do, { pos, duration, volume: args.volume === undefined ? null : args.volume / 100 });
    if (!op) return fail("nothing", args.do === "next" ? "Não há próxima faixa." : M.nothingPlaying);
    await d.callOp(op[0], op[1]);
    return ok(remoteSay("player", args.do === "volume" ? `volume ${args.volume}%` : PLAYER_WORD[args.do]));
}

// The reference the phone asked for, read in the edition it chose (else
// the Bíblia's): { ref, version, verses, nums } or { error }.
async function reference(d, args) {
    const ref = refFromArgs(args);
    if (!ref) return { error: refuse(args.ref !== undefined ? `Não entendi "${args.ref}". Escreva como jo 3 16.` : "Referência inválida.", 400) };
    if (args.version && !BIBLE_VERSIONS.some((v) => v.id === args.version)) return { error: fail("not_found", `A versão ${args.version} não existe no KERYX.`) };
    const { version, verses } = await d.referenceVerses(ref, args.version || null);
    if (!verses?.length) return { error: notInBible(ref, version) };
    const nums = referenceNums(ref);
    if (nums.length && !verses.some((v) => nums.includes(v.number))) return { error: notInBible(ref, version) };
    return { ref, version, verses, nums };
}

// One entry per action of the contract (remoteProtocol.test checks the
// list). run({ d, live, args, v, send }) → the answer. quiet: the console
// says nothing (a volume step, a seek, a slide picked). locks(…): refused
// while locked although the contract's kind says T (what the live state
// refuses anyway: bringing the video back, the corner logo).
export const REMOTE_HANDLERS = {
    state: {
        run: async ({ d, live, v }) => {
            const { items, airItemId, airNow } = d;
            return ok("", remoteState({
                v, app: d.app?.() || "", service: d.service, items, rows: d.rows, media: d.media, progressOf: d.progressOf,
                airItemId: airNow ? airItemId : null, nextItemId: d.nextItem?.id || null, backItemId: backItemOf(live, items, airNow ? airItemId : null),
                live, bible: await d.bible?.().catch(() => null), timers: timerChoices(d.timerPresets), alerts: orderPresets(d.alertPresets),
            }));
        },
    },
    library: {
        run: ({ d, args }) => ok("", libraryPage({ ...args, songs: d.songs, media: d.media, pieces: d.pieces, materials: d.materials, loaded: d.loaded, progressOf: d.progressOf })),
    },
    next: { run: step },
    prev: { run: step },
    goto: {
        quiet: true,
        run: async ({ d, live, args }) => {
            const content = live?.content;
            if (!content) return fail("nothing", M.noSlides);
            if (args.index >= (content.slides?.length || 0)) return fail("not_found", "Esse slide não existe.");
            await d.callOp("content.goTo", { index: args.index });
            return ok(remoteSay("goto", `slide ${args.index + 1}`));
        },
    },
    black: { run: screenMode },
    logo: { run: screenMode },
    clear: {
        run: async ({ d, action }) => {
            await d.clearText();
            return ok(remoteSay(action));
        },
    },
    off: {
        run: async ({ d, live, args }) => {
            if (!live?.[args.layer]) return fail("nothing", "Nada no ar nessa camada.");
            await d.callOp(`${args.layer}.clear`, {});
            return ok(remoteSay("off", `tirou ${OFF_WORD[args.layer]}`));
        },
    },
    end: {
        // As the Esc: everything off and the music stopped, with Desfazer on
        // the console (its toast says so: the answer's own is not said again).
        run: async ({ d }) => {
            const undo = await d.end({ by: "Celular" });
            return ok("Projeção encerrada.", { undo: Boolean(undo) });
        },
    },
    undo: {
        run: async ({ d, action }) => (d.undo() ? ok(remoteSay(action)) : fail("nothing", M.nothingToUndo)),
    },
    sendNext: {
        run: async ({ d, send }) => {
            const { nextItem, items } = d;
            if (!nextItem) return fail("nothing", "Não há próximo item na setlist.");
            return send(() => d.buildStage(nextItem, items.indexOf(nextItem)), `enviou "${nextItem.title}"`);
        },
    },
    sendItem: {
        run: async ({ d, args, send }) => {
            const { items } = d;
            const index = items.findIndex((i) => i.id === args.itemId);
            if (index < 0) return fail("not_found", M.notInSetlist);
            if (isSection(items[index])) return fail("nothing", "Uma seção não vai ao ar.");
            return send(() => d.buildStage(items[index], index), `enviou "${items[index].title}"`);
        },
    },
    sendMedia: {
        run: async ({ d, args, send }) => {
            const list = { song: d.songs, media: d.media, piece: d.pieces, material: d.materials }[args.kind] || [];
            const row = list.find((r) => r.id === args.id);
            if (!row) return fail("not_found", M.notFound);
            const stages = d.stages;
            const build = {
                song: () => stages.song(row, {}, d.themes),
                media: () => stages.media(row, { toVideo: Boolean(args.toVideo) && row.type === "video" }),
                piece: () => stages.piece(row),
                material: () => stages.material(row),
            }[args.kind];
            return send(build, `enviou "${row.title || row.text || ""}"`);
        },
    },
    bibleFind: {
        run: async ({ d, args, v }) => {
            const r = await reference(d, args);
            if (r.error) return r.error;
            const name = formatReference(r.ref);
            // Version 1 pages show the reference alone: the edition rides in it.
            return ok("", passagePreview(v >= 2 ? name : `${name} · ${r.version}`, r.verses, r.nums, r.version));
        },
    },
    bibleSend: {
        run: async ({ d, live, args, send }) => {
            const r = await reference(d, args);
            if (r.error) return r.error;
            const onAir = live?.content?.kind === "bible" ? live.content : null;
            // A chapter alone goes as its chapter, from verse 1 (the arrows walk it).
            const nums = r.nums.length ? r.nums : [r.verses[0].number];
            const st = d.stages.verses({ verses: r.verses, nums, how: d.prefs.bible_verses_per_slide, version: r.version, book: r.ref.book, chapter: r.ref.chapter, onAir });
            if (!st) return notInBible(r.ref, r.version);
            return send(() => st, `enviou ${formatReference(r.ref)}`);
        },
    },
    player: {
        quiet: ({ args }) => args.do === "volume" || args.do === "seek",
        locks: ({ live, args, d }) => args.do === "swap" && videoSwap(live, playerTarget(d, live, args))?.action === "showVideo",
        run: player,
    },
    // Version 1: the same as player { do: toggle }.
    play: {
        run: async (ctx) => {
            const r = await player({ ...ctx, args: { do: "toggle" } });
            return r.ok ? ok(remoteSay("play")) : r;
        },
    },
    follow: {
        run: async ({ d, live, args }) => {
            if (!live?.content?.follow) return fail("nothing", M.noFollow);
            await d.callOp("content.follow", { action: args.do });
            return ok(remoteSay("follow", FOLLOW_WORD[args.do]));
        },
    },
    layer: {
        // The corner logo is logo.set, which the live state refuses while locked either way.
        locks: ({ args }) => args.which === "corner",
        run: async ({ d, args }) => {
            if (args.which === "video") return fail("nothing", "O celular ainda não controla a camada de vídeo.");
            if (args.which === "corner") await d.callOp("logo.set", { visible: args.on });
            else await d.callOp(args.on ? "layers.show" : "layers.hide", { layer: LAYER_OF[args.which] });
            return ok(remoteSay("layer", `${LAYER_WORD[args.which]} ${args.on ? "mostrado" : "escondido"}`));
        },
    },
    alert: {
        run: async ({ d, args }) => {
            let message = args.message;
            if (args.presetId !== undefined) {
                const preset = (d.alertPresets || []).find((p) => p.id === args.presetId);
                if (!preset) return fail("not_found", M.notFound);
                message = preset.message;
            }
            await d.callOp("alert.show", { message, type: "message" });
            return ok(remoteSay("alert", "aviso rápido no ar"));
        },
    },
    alertClear: {
        run: async ({ d, live, action }) => {
            if (!live?.alert) return fail("nothing", "Nenhum aviso no ar.");
            await d.callOp("alert.clear", {});
            return ok(remoteSay(action));
        },
    },
    tool: {
        run: async ({ d, args, send }) => {
            const minutes = args.minutes || 5;
            const word = args.mode === "timer" ? `o timer de ${minutes} min` : TOOL_WORD[args.mode];
            return send(() => d.stages.tool(args.mode, { minutes }), `enviou ${word}`);
        },
    },
    timerAdjust: {
        run: async ({ d, live, args }) => {
            if (live?.tool?.mode !== "timer") return fail("nothing", "Nenhum timer no ar.");
            await d.callOp("tool.adjust", { deltaMs: args.deltaMs });
            const min = args.deltaMs / 60000;
            return ok(remoteSay("timerAdjust", `timer ${min > 0 ? "+" : "−"}${Math.abs(min)} min`));
        },
    },
    lock: {
        run: async ({ d, args }) => {
            await d.liveOp("screens.lock", { locked: args.locked });
            return ok(remoteSay("lock", args.locked ? "telas travadas" : "telas destravadas"));
        },
    },
    // Setlist automática (Rodada N2): the culto's switch, as the Setlist's header.
    "setlist.autoplay": {
        run: async ({ d, args }) => {
            if (!d.service?.id) return fail("nothing", "Nenhum culto escolhido no console.");
            const word = args.on ? "avançar sozinho ligado" : "avançar sozinho desligado";
            if (Boolean(d.service.autoplay) === args.on) return ok(remoteSay("setlist.autoplay", word));
            await d.setAutoplay(args.on);
            return ok(remoteSay("setlist.autoplay", word));
        },
    },
};

async function step({ d, live, action }) {
    if (!live?.content) return fail("nothing", M.noSlides);
    await d.callOp(action === "next" ? "content.next" : "content.prev");
    return ok(remoteSay(action));
}

// Tela preta / Logo: `on` given = that state (a phone retrying never flips
// it back); omitted = toggle (version 1 pages).
async function screenMode({ d, live, action, args }) {
    const isOn = live?.screen === action;
    const turnOn = args.on === undefined ? !isOn : args.on;
    const word = `${action === "black" ? "Tela preta" : "Logo"} ${turnOn ? "ligado" : "desligado"}`;
    if (turnOn === isOn) return ok(remoteSay(action, word));
    await d.liveOp("screen.set", { mode: turnOn ? action : "show" });
    return ok(remoteSay(action, word));
}

// A thrown live-state error as the phone hears it.
const CODE_OF = { 423: "locked", 404: "not_found", 409: "nothing", 503: "busy" };
const thrown = (err) => {
    const status = err?.status || 500;
    return refuse(err?.message || "Não foi possível.", status, CODE_OF[status]);
};

// deps (an object, or a function giving the latest one):
//   live()            what is on air now (keryx.live.current()); now() its clock
//   locked            Travar telas is on (else live().locked)
//   lockedSay         what a locked refusal says
//   service, items, rows (setlist.js plan), airItemId, airNow, nextItem
//   songs, media, pieces, materials, themes, alertPresets, timerPresets, loaded   the library
//   prefs, playerPick, reportedDuration(layer, url), app(), bible() → { version, installed }
//   callOp, liveOp, clearText, say, end({ by }) → whether Desfazer is offered, undo() → whether it ran
//   sendStage(stage, { keepPrev, why }) → true when it went; buildStage(item, index)
//   setAutoplay(on)   the culto's Avançar sozinho (Service.autoplay)
//   referenceVerses(ref, version?) → { version, verses }
//   stages: { song, media, piece, material, verses, tool }   the stage builders (stage.js)
export function createRemoteRunner(deps) {
    const current = () => (typeof deps === "function" ? deps() : deps);

    // A send: the stage (built lazily; a row gone is not found) goes on air
    // as the console's own send, leaving the operator's Prévia alone.
    const sender = (d, action) => async (build, said) => {
        let stage;
        try { stage = await build(); } catch { return fail("not_found", M.notFound); }
        if (!stage) return fail("not_found", M.notFound);
        let why = null;
        const went = await d.sendStage(stage, { keepPrev: true, why: (b) => { why = b; } });
        if (went) return ok(remoteSay(action, said), { title: stage.title || "" });
        if (why?.code === "missing") return fail("missing", M.fileMissing);
        if (why?.code === "syncing") return fail("syncing", M.syncing);
        if (why) return refuse(why.message, why.status || 409, why.code);
        return fail("nothing", "Não foi para o ar.");
    };

    const exec = async ({ action, args = {}, v = 1 }) => {
        const d = current();
        const handler = Object.hasOwn(REMOTE_HANDLERS, action) ? REMOTE_HANDLERS[action] : null;
        if (!handler) return refuse("Comando desconhecido.", 400);
        const live = d.live();
        const locked = d.locked ?? Boolean(live?.locked);
        const ctx = { d, live, args: args || {}, v, action };
        if (locked && (remoteKind(action, ctx.args) === "S" || handler.locks?.(ctx))) return refuse(d.lockedSay || M.locked, 423, "locked");
        return handler.run({ ...ctx, send: sender(d, action) });
    };

    // Writes one at a time (a double tap never skips two slides at once);
    // reads in parallel; the emergency lane never waits.
    let chain = Promise.resolve();
    const run = (command = {}) => {
        if (remoteKind(command.action, command.args) === "R" || EMERGENCY.has(command.action) || !Object.hasOwn(REMOTE_HANDLERS, command.action || "")) return exec(command);
        const p = chain.then(() => exec(command));
        chain = p.catch(() => {});
        return p;
    };

    const quiet = (command) => {
        const h = Object.hasOwn(REMOTE_HANDLERS, command.action || "") ? REMOTE_HANDLERS[command.action] : null;
        if (!h || remoteKind(command.action, command.args) === "R" || command.action === "end") return true;
        return typeof h.quiet === "function" ? h.quiet({ args: command.args || {} }) : Boolean(h.quiet);
    };

    // What goes back to the phone: a throw becomes its status and code, and
    // what the phone did shows on the console too (not the reads, the small
    // steps, nor Encerrar, which says it with its Desfazer).
    const answer = async (command = {}) => {
        let reply;
        try { reply = await run(command); } catch (err) { reply = thrown(err); }
        if (reply.ok && reply.message && !quiet(command)) current().say(reply.message);
        return reply;
    };

    return { run, answer };
}

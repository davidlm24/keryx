// Bíblias neste computador (owner 2026-10-27): the editions the church
// ticked at the first opening (or in Configurações › Bíblia e músicas ›
// Escolher as Bíblias…) are downloaded here, in the background, one after
// the other, each whole or nothing as Baixar does (bible.cjs
// installFromSource). The rules are shared/bibleSetup.mjs; this is the
// runner: the state in settings.json "bibleSetup", one pass at a time, the
// next passes at launch, every SETUP_RETRY_MS while any edition waits, and
// when the PC wakes (main.cjs), so a church without internet at the first
// opening gets its Bibles when it has some. Every change is pushed to the
// windows (onChange → keryx:bible:setup) and the end rings the bell.
// Pure Node: tested with a fake install.

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SETTINGS_KEY = "bibleSetup";
const loadRules = () => import(pathToFileURL(path.join(__dirname, "..", "shared", "bibleSetup.mjs")).href);

// install: (version) => Promise<{ version, verses }> (throws a BibleError);
// installed: () => { NVI: 31105, … }; known: the siglas that install.
function createBibleSetup({ settings, install, installed, known, notify = () => {}, onChange = () => {}, logger = console, now = () => new Date(), setTimer = setInterval, clearTimer = clearInterval, rules = loadRules }) {
    let rulesModule = null;
    const mod = async () => (rulesModule ||= await rules());
    let installing = null;
    let timer = null;

    const read = (m) => m.normalizeSetup(settings.get(SETTINGS_KEY, null));
    const write = (m, s) => { settings.set(SETTINGS_KEY, m.normalizeSetup(s)); };
    const count = () => { try { return installed() || {}; } catch { return {}; } };

    // What the console shows: the rules' status, plus what is being
    // downloaded right now and what is installed here.
    async function state() {
        const m = await mod();
        const here = count();
        return { ...m.setupStatus(read(m), here), installing, installed: here };
    }
    const push = async () => { try { onChange(await state()); } catch (err) { logger.warn(`[keryx-biblias] ${err.message}`); } };

    // Every waiting edition, one at a time (never two passes at once).
    let running = null;
    function flush() {
        if (running) return running;
        running = (async () => {
            const m = await mod();
            let got = 0;
            try {
                for (;;) {
                    const before = read(m);
                    const [version] = m.pendingSetup(before, count());
                    if (!version) break;
                    installing = version;
                    await push();
                    let outcome;
                    try {
                        const r = await install(version);
                        outcome = { ok: true };
                        got += 1;
                        logger.info(`[keryx-biblias] ${version} instalada: ${r?.verses ?? "?"} versículos`);
                    } catch (err) {
                        outcome = { error: { status: Number(err?.status) || 0, message: err?.message || String(err) } };
                        logger.warn(`[keryx-biblias] ${version} não baixou (${outcome.error.status || "?"}): ${outcome.error.message}`);
                    }
                    const { state: next, stop } = m.afterInstall(read(m), version, outcome);
                    write(m, next);
                    installing = null;
                    if (stop) break;
                }
            } finally {
                installing = null;
                running = null;
            }
            const st = m.setupStatus(read(m), count());
            if (st.finished && (got || Object.keys(st.failed).length)) said(st);
            await push();
        })();
        return running;
    }

    // The bell, once per answer: what came, and what did not and why.
    function said(st) {
        const failed = Object.keys(st.failed);
        if (!failed.length) {
            notify({ key: "bible-setup", kind: "info", title: `${st.done.length === 1 ? "Bíblia instalada" : "Bíblias instaladas"}: ${st.done.join(", ")}`, body: "Funcionam sem internet. Em Configurações › Bíblia e músicas, escolha a versão em uso e as outras edições.", action: "settings:biblia" });
            return;
        }
        const why = failed.map((v) => `${v}: ${st.failed[v]}`).join(" · ");
        notify({ key: "bible-setup", kind: "warn", title: failed.length === 1 ? `A ${failed[0]} não baixou` : `${failed.length} Bíblias não baixaram`, body: `${st.done.length ? `Instaladas: ${st.done.join(", ")}. ` : ""}${why}. Tente de novo em Configurações › Bíblia e músicas, ou instale do arquivo.`, action: "settings:biblia" });
    }

    // The church's answer: the siglas ticked. Downloads start at once.
    async function choose(versions) {
        const m = await mod();
        write(m, m.chooseSetup(read(m), versions, known, now().toISOString()));
        const st = await state();
        flush().catch((err) => logger.warn(`[keryx-biblias] ${err.message}`));
        return st;
    }
    async function dismiss() {
        const m = await mod();
        write(m, m.dismissSetup(read(m), now().toISOString()));
        await push();
        return state();
    }

    // At launch: one pass now, then one every SETUP_RETRY_MS while any waits.
    async function start() {
        if (timer) return;
        const m = await mod();
        timer = setTimer(() => { if (m.pendingSetup(read(m), count()).length) flush().catch(() => {}); }, m.SETUP_RETRY_MS);
        timer?.unref?.();
        await flush().catch((err) => logger.warn(`[keryx-biblias] ${err.message}`));
    }
    function stop() { if (timer) clearTimer(timer); timer = null; }

    return { state, choose, dismiss, flush, start, stop };
}

module.exports = { createBibleSetup, SETTINGS_KEY };

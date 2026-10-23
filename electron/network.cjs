// Turns the network-screen server (lan.cjs) on and off from Settings and
// remembers it. Off until the operator enables it: listening on the church
// Wi-Fi is a choice, and Windows asks for firewall permission the first time.

const crypto = require("node:crypto");
const { createLanServer, lanAddresses } = require("./lan.cjs");

const SETTINGS_KEY = "network";
const DEFAULT_PORT = 7701;
const PIN = /^\d{4,8}$/;

// The controle remoto's code: six digits from the system's random source.
const newRemoteCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const newRemoteSecret = () => crypto.randomBytes(32).toString("hex");

function createNetwork({ store, live, settings, distDir, mediaDir, bundledDir, logger, port, onRemote = null }) {
    if (port === undefined || Number.isNaN(port)) port = DEFAULT_PORT;
    const config = () => {
        const saved = settings.get(SETTINGS_KEY, {}) || {};
        // The secret signs the PIN cookie; a new one is made once and kept.
        if (!saved.secret) {
            const withSecret = { ...saved, secret: crypto.randomBytes(32).toString("hex") };
            settings.set(SETTINGS_KEY, withSecret);
            return withSecret;
        }
        return saved;
    };
    const save = (patch) => settings.set(SETTINGS_KEY, { ...config(), ...patch });

    const lan = createLanServer({ distDir, mediaDir, bundledDir, store, live, getConfig: () => config(), onRemote, log: (m) => logger.warn(m) });
    // The controle remoto's settings ("network".remote): on/off, its code and
    // the key that signs the phones' cookie.
    const remote = () => config().remote || {};
    const saveRemote = (patch) => save({ remote: { ...remote(), ...patch } });
    // The Equipe's ("network".team, Rodada Q): the same shape, its own code
    // and key. The two codes are never the same (the code decides the role).
    const team = () => config().team || {};
    const saveTeam = (patch) => save({ team: { ...team(), ...patch } });
    const codeOtherThan = (other) => { let code; do code = newRemoteCode(); while (code === other); return code; };
    let lastError = "";

    async function start() {
        try {
            const { port: bound } = await lan.start({ port, host: "0.0.0.0" });
            lastError = "";
            logger.info(`[keryx-lan] telas na rede ligadas na porta ${bound}`);
        } catch (err) {
            lastError = err.code === "EADDRINUSE"
                ? `A porta ${port} já está em uso por outro programa.`
                : `Não foi possível ligar as telas na rede: ${err.message}`;
            logger.error(`[keryx-lan] ${lastError}`);
        }
    }

    function info() {
        const { enabled, pin } = config();
        const running = lan.running();
        const boundPort = lan.port();
        return {
            enabled: Boolean(enabled),
            running,
            port: boundPort || port,
            hasPin: Boolean(pin),
            // Never the code itself (revealRemoteCode, on demand).
            remote: { enabled: Boolean(remote().enabled), hasCode: Boolean(remote().code) },
            team: { enabled: Boolean(team().enabled), hasCode: Boolean(team().code) },
            error: lastError,
            urls: running ? lanAddresses().map((a) => ({ name: a.name, url: `http://${a.address}:${boundPort}` })) : [],
            clients: lan.clients(),
            screens: lan.screens ? lan.screens() : lan.NETWORK_SCREENS,
        };
    }

    return {
        info,
        async startIfEnabled() {
            if (config().enabled) await start();
        },
        stop: () => lan.stop(),
        ops: {
            info: async () => info(),
            setEnabled: async (_event, enabled) => {
                save({ enabled: Boolean(enabled) });
                if (enabled) await start();
                else {
                    lan.stop();
                    lastError = "";
                    logger.info("[keryx-lan] telas na rede desligadas");
                }
                return info();
            },
            // Controle remoto: on (a code and a key are made the first time),
            // off, a new code, Desconectar todos (a new key) — each signs the
            // phones out but turning it on.
            setRemote: async (_event, enabled) => {
                if (enabled) saveRemote({ enabled: true, code: remote().code || codeOtherThan(team().code), secret: remote().secret || newRemoteSecret() });
                else { saveRemote({ enabled: false }); lan.dropRemotes("control"); }
                logger.info(`[keryx-lan] controle remoto ${enabled ? "ligado" : "desligado"}`);
                return info();
            },
            newRemoteCode: async () => { saveRemote({ code: codeOtherThan(team().code), secret: newRemoteSecret() }); lan.dropRemotes("control"); return info(); },
            disconnectRemotes: async () => { saveRemote({ secret: newRemoteSecret() }); lan.dropRemotes("control"); return info(); },
            revealRemoteCode: async () => ({ code: remote().code || "" }),
            // The Equipe (Rodada Q): the same four, on its own code and key;
            // changing one never signs the other's phones out.
            setTeam: async (_event, enabled) => {
                if (enabled) saveTeam({ enabled: true, code: team().code || codeOtherThan(remote().code), secret: team().secret || newRemoteSecret() });
                else { saveTeam({ enabled: false }); lan.dropRemotes("team"); }
                logger.info(`[keryx-lan] equipe ${enabled ? "ligada" : "desligada"}`);
                return info();
            },
            newTeamCode: async () => { saveTeam({ code: codeOtherThan(remote().code), secret: newRemoteSecret() }); lan.dropRemotes("team"); return info(); },
            disconnectTeam: async () => { saveTeam({ secret: newRemoteSecret() }); lan.dropRemotes("team"); return info(); },
            revealTeamCode: async () => ({ code: team().code || "" }),
            // The PIN itself, on demand (Mostrar PIN): only the console asks
            // (keryx:network is a trusted channel); info() never carries it.
            revealPin: async () => ({ pin: config().pin || "" }),
            // An empty PIN removes it. Changing it signs every screen out.
            setPin: async (_event, pin) => {
                const value = String(pin || "").trim();
                if (value && !PIN.test(value)) {
                    throw Object.assign(new Error("O PIN deve ter de 4 a 8 números."), { status: 400 });
                }
                save({ pin: value });
                return info();
            },
        },
    };
}

module.exports = { createNetwork, DEFAULT_PORT };

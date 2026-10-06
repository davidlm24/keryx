// Turns the network-screen server (lan.cjs) on and off from Settings and
// remembers it. Off until the operator enables it: listening on the church
// Wi-Fi is a choice, and Windows asks for firewall permission the first time.

const crypto = require("node:crypto");
const { createLanServer, lanAddresses } = require("./lan.cjs");

const SETTINGS_KEY = "network";
const DEFAULT_PORT = 7701;
const PIN = /^\d{4,8}$/;

function createNetwork({ store, settings, distDir, mediaDir, bundledDir, logger, port }) {
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

    const lan = createLanServer({ distDir, mediaDir, bundledDir, store, getConfig: () => config(), log: (m) => logger.warn(m) });
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
            error: lastError,
            urls: running ? lanAddresses().map((a) => ({ name: a.name, url: `http://${a.address}:${boundPort}` })) : [],
            clients: lan.clients(),
            screens: lan.NETWORK_SCREENS,
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

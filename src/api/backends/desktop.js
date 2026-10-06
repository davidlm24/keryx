// Desktop backend for src/api/client.js: the local SQLite store in the
// Electron main process (electron/db/store.cjs), reached through
// window.keryxDesktop from electron/preload.cjs. No login, no network.

import { ClientError } from "../errors";

// The database stores media as keryx-media://<file>, independent of the
// local server's host and port; windows get a URL they can load. Pages test
// `startsWith("http")` to tell an image from a colour, so it must be http.
const MEDIA_SCHEME = "keryx-media://";

// One local operator profile stands in for user accounts.
const PROFILE_ID = "local";

const isPlainObject = (v) => v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;

function mapStrings(value, fn) {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
    if (isPlainObject(value)) {
        const out = {};
        for (const [key, v] of Object.entries(value)) out[key] = mapStrings(v, fn);
        return out;
    }
    return value;
}

const notInDesktop = (what) => async () => {
    throw new ClientError(`${what} não está disponível na versão desktop do KERYX.`, 501);
};

export function createDesktopBackend(bridge) {
    const mediaBase = bridge.mediaBaseUrl;
    const toStore = (v) => mapStrings(v, (s) => (s.startsWith(mediaBase) ? MEDIA_SCHEME + s.slice(mediaBase.length) : s));
    const fromStore = (v) => mapStrings(v, (s) => (s.startsWith(MEDIA_SCHEME) ? mediaBase + s.slice(MEDIA_SCHEME.length) : s));

    async function call(entity, op, args) {
        let res;
        try {
            res = await bridge.db.call(entity, op, toStore(args));
        } catch (err) {
            throw new ClientError(`Falha ao acessar a base de dados local: ${err.message}`, 500, err);
        }
        if (res.error) throw new ClientError(res.error.message, res.error.status);
        return fromStore(res.data);
    }

    // -- Realtime: one bridge listener fans out to subscribe() callbacks.
    const subscribers = new Map();
    let listening = false;
    function listen() {
        if (listening) return;
        listening = true;
        bridge.db.onChange((change) => {
            const callbacks = subscribers.get(change.entity);
            if (!callbacks || callbacks.size === 0) return;
            const event = { type: change.type, id: change.id, data: fromStore(change.data), timestamp: change.timestamp };
            for (const callback of [...callbacks]) {
                try {
                    callback(event);
                } catch (err) {
                    console.error(`[keryx] erro no callback de subscribe(${change.entity}):`, err);
                }
            }
        });
    }

    function makeEntity(name) {
        const entity = {
            list: (...args) => call(name, "list", args),
            filter: (...args) => call(name, "filter", args),
            get: (id) => call(name, "get", [id]),
            create: (data) => call(name, "create", [data]),
            bulkCreate: (rows) => call(name, "bulkCreate", [rows]),
            update: (id, data) => call(name, "update", [id, data]),
            bulkUpdate: (rows) => call(name, "bulkUpdate", [rows]),
            delete: (id) => call(name, "delete", [id]),
            // Callbacks receive { type: 'create'|'update'|'delete', data, id, timestamp }
            // with `data` the whole row, deletes included.
            subscribe(callback) {
                listen();
                if (!subscribers.has(name)) subscribers.set(name, new Set());
                const callbacks = subscribers.get(name);
                callbacks.add(callback);
                return () => callbacks.delete(callback);
            },
        };
        if (name === "User") {
            // Whatever id a page passes, it means the local profile.
            entity.get = () => call("User", "get", [PROFILE_ID]);
            entity.update = (_id, data) => call("User", "update", [PROFILE_ID, data]);
            entity.delete = notInDesktop("Excluir a conta");
        }
        return entity;
    }

    const cache = new Map();
    const entities = new Proxy({}, {
        get(_, name) {
            if (typeof name !== "string") return undefined;
            if (!cache.has(name)) cache.set(name, makeEntity(name));
            return cache.get(name);
        },
    });

    // auth.me() is the local profile in the shape pages expect from a user.
    const asUser = (profile) => ({
        ...profile,
        id: PROFILE_ID,
        email: profile.email ?? null,
        full_name: profile.full_name || "Operador",
        role: "admin",
        is_verified: true,
        disabled: false,
    });

    const auth = {
        me: async () => asUser(await call("User", "get", [PROFILE_ID])),
        isAuthenticated: async () => true,
        updateMe: async (data) => asUser(await call("User", "update", [PROFILE_ID, data])),
        onAuthStateChange: () => ({ unsubscribe() {} }),
        logout: async () => {},
        redirectToLogin() {},
        setToken() {},
        loginViaEmailPassword: notInDesktop("Login"),
        loginWithProvider: notInDesktop("Login"),
        register: notInDesktop("Cadastro"),
        verifyOtp: notInDesktop("Cadastro"),
        resendOtp: notInDesktop("Cadastro"),
        resetPasswordRequest: notInDesktop("Recuperação de senha"),
        resetPassword: notInDesktop("Recuperação de senha"),
        deleteAccount: notInDesktop("Excluir a conta"),
    };

    async function UploadFile({ file } = {}) {
        if (!file) throw new ClientError("Nenhum arquivo fornecido.", 400);
        const res = await bridge.media.importFile(file);
        if (res.error) throw new ClientError(res.error.message, res.error.status);
        return { file_url: mediaBase + res.data.fileName };
    }

    const integrations = {
        Core: {
            UploadFile,
            // AI features are out of v1 (docs/desktop-architecture.md, section 11).
            InvokeLLM: notInDesktop("A IA"),
            SendEmail: notInDesktop("Envio de email"),
            SendSMS: notInDesktop("Envio de SMS"),
            GenerateImage: notInDesktop("Geração de imagens"),
            ExtractDataFromUploadedFile: notInDesktop("Extração de dados de arquivos"),
        },
    };

    const appLogs = { async logUserInApp() {} };

    return { entities, auth, integrations, appLogs };
}

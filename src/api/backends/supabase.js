// Supabase backend for src/api/client.js: the web build (npm run dev in a
// browser). The desktop app uses ./desktop.js instead and never creates this
// client. Same surface as the desktop backend; see client.js.
//
// Mapping: entity Song -> table public.song (snake_case); columns are the
// entity field names verbatim; User -> public.profile (one row per auth user).

import { createClient } from "@supabase/supabase-js";
import { ClientError } from "../errors";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Created on first use so that importing this module has no side effects.
let client = null;
function sb() {
    if (client) return client;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        // Loud, once, instead of a cascade of opaque fetch failures.
        console.error("[keryx] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set. Copy .env.example to .env.");
    }
    client = createClient(SUPABASE_URL ?? "http://invalid.localhost", SUPABASE_KEY ?? "missing", {
        auth: {
            flowType: "pkce",
            persistSession: true,
            autoRefreshToken: true,
            // OAuth and password-recovery links land on the app with a `code`
            // query param; this exchanges it for a session on load.
            detectSessionInUrl: true,
        },
    });
    return client;
}

// ---------------------------------------------------------------------------
// Errors. supabase-js returns { data, error }; the pages expect a thrown error
// with a .message (they render err.message) and sometimes a .status.
// ---------------------------------------------------------------------------

function unwrap({ data, error }, status) {
    if (error) throw new ClientError(error.message || String(error), status ?? error.status ?? error.code, error);
    return data;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const toTable = (entityName) =>
    entityName === "User" ? "profile" : entityName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// Base44 sort strings: "field", "+field", "-field".
function applySort(q, sort) {
    if (!sort) return q;
    const desc = sort.startsWith("-");
    const column = sort.replace(/^[-+]/, "");
    return q.order(column, { ascending: !desc });
}

const isPageOptions = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function applyRange(q, limit, skip) {
    const from = skip || 0;
    if (limit) return q.range(from, from + limit - 1);
    if (from) return q.range(from, from + 999);
    return q;
}

// Base44 filter queries are Mongo-shaped. The pages only use plain equality,
// but the cheap operators are mapped so a future `{ $in: [...] }` doesn't
// silently return everything. Root-level $and/$or/$nor are not supported.
function applyFilter(q, query) {
    for (const [field, value] of Object.entries(query || {})) {
        if (field.startsWith("$")) {
            throw new ClientError(`Filtro '${field}' não é suportado pelo cliente KERYX.`, 400);
        }
        if (value === null || value === undefined) {
            q = q.is(field, null);
        } else if (Array.isArray(value)) {
            q = q.in(field, value);
        } else if (typeof value === "object") {
            for (const [op, v] of Object.entries(value)) {
                switch (op) {
                    case "$eq": q = q.eq(field, v); break;
                    case "$ne": q = q.neq(field, v); break;
                    case "$gt": q = q.gt(field, v); break;
                    case "$gte": q = q.gte(field, v); break;
                    case "$lt": q = q.lt(field, v); break;
                    case "$lte": q = q.lte(field, v); break;
                    case "$in": q = q.in(field, v); break;
                    case "$nin": q = q.not(field, "in", `(${v.map((x) => JSON.stringify(x)).join(",")})`); break;
                    case "$regex": q = q.ilike(field, `%${v}%`); break;
                    case "$exists": q = v ? q.not(field, "is", null) : q.is(field, null); break;
                    default:
                        throw new ClientError(`Operador '${op}' não é suportado pelo cliente KERYX.`, 400);
                }
            }
        } else {
            q = q.eq(field, value);
        }
    }
    return q;
}

// Only fields the server owns; never let a page overwrite them on update.
const SYSTEM_FIELDS = ["id", "created_date", "updated_date", "created_by", "created_by_id"];
function stripSystem(data) {
    const out = { ...data };
    for (const k of SYSTEM_FIELDS) delete out[k];
    return out;
}

let channelSeq = 0;

function makeEntity(entityName) {
    const table = toTable(entityName);
    const from = () => sb().from(table);

    // Both read forms Base44 offered: positional (sort, limit, skip) returns an
    // array; an options object ({ sort, limit, skip }) returns a page
    // ({ items, next_cursor }). WorshipChat uses the latter.
    const read = async (query, sort, limit, skip) => {
        const paged = isPageOptions(sort);
        const opts = paged ? sort : { sort, limit, skip };
        let q = from().select("*");
        q = applyFilter(q, query);
        q = applySort(q, opts.sort);
        q = applyRange(q, opts.limit, opts.skip);
        const rows = unwrap(await q);
        return paged ? { items: rows, next_cursor: null } : rows;
    };

    const entity = {
        list: (sort, limit, skip) => read(undefined, sort, limit, skip),
        filter: (query, sort, limit, skip) => read(query, sort, limit, skip),

        async get(id) {
            return unwrap(await from().select("*").eq("id", id).single(), 404);
        },

        async create(data) {
            return unwrap(await from().insert(stripSystem(data)).select().single());
        },

        async bulkCreate(rows) {
            return unwrap(await from().insert(rows.map(stripSystem)).select());
        },

        async update(id, data) {
            if (entityName === "User") return auth.updateMe(data, id);
            return unwrap(await from().update(stripSystem(data)).eq("id", id).select().single());
        },

        // Base44 shape: [{ id, ...changes }, ...]. One statement each; the app
        // only sends a handful of rows at a time (reordering service items).
        async bulkUpdate(rows) {
            return Promise.all(rows.map(({ id, ...changes }) => entity.update(id, changes)));
        },

        async delete(id) {
            if (entityName === "User") return auth.deleteAccount(id);
            unwrap(await from().delete().eq("id", id));
            return { success: true };
        },

        // Realtime. Callbacks receive { type: 'create'|'update'|'delete', data, id, timestamp }
        // with `data` being the whole row (tables the app subscribes to have
        // REPLICA IDENTITY FULL, so update/delete carry it too).
        subscribe(callback) {
            const channel = sb()
                .channel(`${table}:${++channelSeq}`)
                .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
                    const type = { INSERT: "create", UPDATE: "update", DELETE: "delete" }[payload.eventType];
                    if (!type) return;
                    const data = type === "delete" ? payload.old : payload.new;
                    try {
                        callback({ type, data, id: data?.id, timestamp: payload.commit_timestamp });
                    } catch (err) {
                        console.error(`[keryx] erro no callback de subscribe(${entityName}):`, err);
                    }
                })
                .subscribe();
            return () => {
                sb().removeChannel(channel);
            };
        },
    };
    return entity;
}

const entityCache = new Map();
export const entities = new Proxy(
    {},
    {
        get(_, name) {
            if (typeof name !== "string") return undefined;
            if (!entityCache.has(name)) entityCache.set(name, makeEntity(name));
            return entityCache.get(name);
        },
    },
);

// ---------------------------------------------------------------------------
// Auth. Same method names Base44 exposed; the pages call these directly.
// ---------------------------------------------------------------------------

const sameOriginUrl = (path) => new URL(path || "/", window.location.origin).toString();

async function currentSession() {
    const { data } = await sb().auth.getSession();
    return data.session ?? null;
}

async function loadProfile(userId) {
    const { data } = await sb().from("profile").select("*").eq("id", userId).maybeSingle();
    return data ?? {};
}

// Base44's User was the auth user plus the custom fields from
// base44/entities/User.jsonc. Rebuild that shape from auth + profile.
function mergeUser(user, profile) {
    return {
        ...profile,
        id: user.id,
        email: user.email,
        full_name: profile.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        role: profile.role ?? "user",
        is_verified: Boolean(user.email_confirmed_at),
        disabled: profile.disabled ?? false,
        created_date: user.created_at,
        updated_date: profile.updated_date ?? user.updated_at,
    };
}

export const auth = {
    async me() {
        const session = await currentSession();
        if (!session?.user) throw new ClientError("Não autenticado", 401);
        return mergeUser(session.user, await loadProfile(session.user.id));
    },

    // Returns { unsubscribe }. Events: SIGNED_IN, SIGNED_OUT, USER_UPDATED, ...
    onAuthStateChange(callback) {
        return sb().auth.onAuthStateChange((event) => callback(event)).data.subscription;
    },

    async isAuthenticated() {
        return Boolean(await currentSession());
    },

    async updateMe(data, userId) {
        const session = await currentSession();
        if (!session?.user) throw new ClientError("Não autenticado", 401);
        const id = userId || session.user.id;
        const profile = unwrap(await sb().from("profile").update(stripSystem(data)).eq("id", id).select().single());
        return mergeUser(session.user, profile);
    },

    async loginViaEmailPassword(email, password) {
        const data = unwrap(await sb().auth.signInWithPassword({ email, password }), 401);
        return { access_token: data.session?.access_token, user: data.user };
    },

    // Google / Facebook need the provider enabled in the Supabase dashboard
    // (Authentication > Providers) with this app's origin as a redirect URL.
    async loginWithProvider(provider, fromUrl = "/") {
        unwrap(await sb().auth.signInWithOAuth({ provider, options: { redirectTo: sameOriginUrl(fromUrl) } }));
    },

    async logout(redirectUrl) {
        await sb().auth.signOut();
        if (redirectUrl) window.location.href = redirectUrl;
    },

    redirectToLogin(nextUrl) {
        const next = nextUrl ? new URL(nextUrl, window.location.origin) : new URL(window.location.href);
        const returnTo = next.pathname + next.search + next.hash;
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    },

    // Supabase persists the session itself after verifyOtp / sign-in. Kept so
    // the register page's call site stays valid.
    setToken() {},

    // Sign-up with an emailed code. Needs "Confirm email" ON and the
    // "Confirm signup" template to include {{ .Token }} (Authentication >
    // Email Templates); the default template sends a link instead.
    async register({ email, password }) {
        const data = unwrap(await sb().auth.signUp({ email, password }));
        return { user: data.user, access_token: data.session?.access_token ?? null };
    },

    async verifyOtp({ email, otpCode }) {
        const data = unwrap(await sb().auth.verifyOtp({ email, token: otpCode, type: "signup" }), 400);
        return { access_token: data.session?.access_token, user: data.user };
    },

    async resendOtp(email) {
        unwrap(await sb().auth.resend({ type: "signup", email }));
        return { success: true };
    },

    async resetPasswordRequest(email) {
        unwrap(await sb().auth.resetPasswordForEmail(email, { redirectTo: sameOriginUrl("/reset-password") }));
        return { success: true };
    },

    // The recovery email links to /reset-password?code=...; supabase-js turns
    // that into a session on load (detectSessionInUrl), after which the new
    // password is a plain updateUser. A token_hash is accepted too, for
    // templates that embed {{ .TokenHash }} instead of a link.
    async resetPassword({ resetToken, newPassword }) {
        if (!(await currentSession()) && resetToken) {
            unwrap(await sb().auth.verifyOtp({ token_hash: resetToken, type: "recovery" }), 400);
        }
        if (!(await currentSession())) {
            throw new ClientError("Link de recuperação inválido ou expirado. Peça um novo.", 400);
        }
        unwrap(await sb().auth.updateUser({ password: newPassword }));
        return { success: true };
    },

    // Deleting an auth user needs the service role, so it runs in an Edge
    // Function. Only the signed-in user can delete their own account.
    async deleteAccount(userId) {
        const session = await currentSession();
        if (!session?.user) throw new ClientError("Não autenticado", 401);
        if (userId && userId !== session.user.id) throw new ClientError("Você só pode excluir a própria conta.", 403);
        unwrap(await sb().functions.invoke("delete-account", { body: {} }));
        return { success: true };
    },
};

// ---------------------------------------------------------------------------
// Integrations. UploadFile and InvokeLLM are the two the pages use.
// ---------------------------------------------------------------------------

const BUCKET = "media";

const safeName = (name) =>
    String(name || "file").normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-100);

async function UploadFile({ file }) {
    if (!file) throw new ClientError("Nenhum arquivo fornecido.", 400);
    const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
    unwrap(await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
    const { data } = sb().storage.from(BUCKET).getPublicUrl(path);
    return { file_url: data.publicUrl };
}

// Mirrors Base44's contract: with response_json_schema the result is the
// parsed object, otherwise a string. Served by supabase/functions/invoke-llm.
async function InvokeLLM(params) {
    const { data, error } = await sb().functions.invoke("invoke-llm", { body: params });
    if (error) {
        // functions.invoke hides the function's own error body; surface it.
        let detail = error.message;
        try {
            const body = await error.context?.json?.();
            if (body?.error) detail = body.error;
        } catch { /* keep the generic message */ }
        throw new ClientError(detail || "Falha ao contactar o modelo de IA.", error.context?.status);
    }
    return data?.result ?? data;
}

const notAvailable = (name) => async () => {
    throw new ClientError(`${name} não está disponível nesta versão do KERYX.`, 501);
};

// Files in Storage are not checked one by one: nothing to report.
const FileInfo = async () => ({});

export const integrations = {
    Core: {
        UploadFile,
        FileInfo,
        InvokeLLM,
        SendEmail: notAvailable("Envio de email"),
        SendSMS: notAvailable("Envio de SMS"),
        GenerateImage: notAvailable("Geração de imagens"),
        ExtractDataFromUploadedFile: notAvailable("Extração de dados de arquivos"),
    },
};

// Base44 recorded page views for its analytics dashboard. No equivalent here.
export const appLogs = {
    async logUserInApp() {},
};

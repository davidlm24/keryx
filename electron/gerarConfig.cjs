// The GERAR's Supabase project (owner 2026-11-18, "a mesa do culto"): its
// URL and its anon key are PUBLIC by design (the GERAR's own web pages ship
// them); every protection is the GERAR's RLS. Never the service role here.
//
// The values below are the GERAR's own public ones (its .env's VITE_SUPABASE_URL
// and VITE_SUPABASE_PUBLISHABLE_KEY, a JWT of role anon; copied 2026-11-18 by the
// owner's call). KERYX_GERAR_URL / KERYX_GERAR_ANON_KEY in the shell override
// them (a test GERAR).

const URL_DEFAULT = "https://iafvcxnpkvwbpxppzgjn.supabase.co";
const ANON_DEFAULT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZnZjeG5wa3Z3YnB4cHB6Z2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzE4OTAsImV4cCI6MjA5NjYwNzg5MH0.Jz6RQJ6tFARJLj38s_3Ovj_oO4X2OJcvnHVgGVTKafQ";

function gerarConfig(env = process.env) {
    const url = String(env.KERYX_GERAR_URL || URL_DEFAULT).trim().replace(/\/+$/, "");
    const anonKey = String(env.KERYX_GERAR_ANON_KEY || ANON_DEFAULT).trim();
    const configured = /^https:\/\/[^\s/]+$/.test(url) && anonKey.length > 20;
    return {
        configured,
        url,
        anonKey,
        // The Edge Function that trades a one-time code for this computer's
        // device session (GERAR's supabase/functions/keryx-link).
        linkUrl: configured ? `${url}/functions/v1/keryx-link` : "",
    };
}

module.exports = { gerarConfig };

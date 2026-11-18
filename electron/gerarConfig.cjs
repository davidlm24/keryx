// The GERAR's Supabase project (owner 2026-11-18, "a mesa do culto"): its
// URL and its anon key are PUBLIC by design (the GERAR's own web pages ship
// them); every protection is the GERAR's RLS. Never the service role here.
//
// Until the values are written below, a build reads them from the builder's
// shell (KERYX_GERAR_URL, KERYX_GERAR_ANON_KEY), and a KERYX without them
// says "não preparado para o GERAR" on Configurações › Conexões.

const URL_DEFAULT = "";
const ANON_DEFAULT = "";

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

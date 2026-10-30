// Whether Windows' firewall lets the church's phones and screens reach KERYX
// on the network this computer is on now (owner 2026-10-30, mockup "Revisão
// de 30/10", F = A). The 30/10 case: the Wi-Fi was a Private network and the
// only rules for KERYX allowed Public, so every phone was refused while
// Configurações showed the QR as if it worked. Windows asks once, the first
// time KERYX listens, and that answer is easy to get half right.
//
// check() reads the active networks' categories and the inbound rules for
// this program; allow() adds one rule for private, public and domain, run
// elevated (Windows asks for the administrator's password) — only from the
// operator's click in Configurações › Telas na rede, never by itself. The
// installer stays per user and never touches the firewall.
//
// The verdict is pure and tested (firewall.test.cjs); the PowerShell around
// it is the one part only a real Windows confirms.

const { execFile } = require("node:child_process");

const TIMEOUT_MS = 10000;

// Get-NetConnectionProfile's NetworkCategory -> the firewall profile's name.
const PROFILE_OF = { Private: "Private", Public: "Public", DomainAuthenticated: "Domain" };
const ALL = ["Private", "Public", "Domain"];

// { categories: ["Private", …], rules: [{ action, profile }] } -> the verdict.
// A rule's profile is "Any" or a list ("Private, Public"). An enabled Block
// rule for the program on a profile wins over an Allow, as in Windows.
function firewallVerdict({ categories = [], rules = [] } = {}) {
    const active = [...new Set(categories.map((c) => PROFILE_OF[c]).filter(Boolean))];
    const profilesOf = (rule) => {
        const p = String(rule.profile || "");
        return /any/i.test(p) || !p ? ALL : ALL.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(p));
    };
    const allowed = new Set();
    const blocked = new Set();
    for (const rule of rules) {
        const set = /block/i.test(rule.action) ? blocked : /allow/i.test(rule.action) ? allowed : null;
        if (set) for (const p of profilesOf(rule)) set.add(p);
    }
    const shut = active.filter((p) => blocked.has(p) || !allowed.has(p));
    return { blocked: shut.length > 0, profiles: active, shut };
}

// The PowerShell that lists the categories and this program's inbound rules,
// as one line of JSON. The path rides in the environment (KERYX_FW_ARG),
// never inside the code: as an argument, -Command split it at its spaces.
const CHECK_PS = [
    "$exe = $env:KERYX_FW_ARG",
    "$c = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.NetworkCategory })",
    "$r = @(Get-NetFirewallApplicationFilter -Program $exe -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { [string]$_.Enabled -eq 'True' -and [string]$_.Direction -eq 'Inbound' } | ForEach-Object { @{ action = [string]$_.Action; profile = [string]$_.Profile } })",
    "@{ categories = $c; rules = $r } | ConvertTo-Json -Compress -Depth 3",
].join("\n");

// netsh's own quoting: the program path between double quotes, never a
// double quote inside it (a Windows path cannot hold one).
function allowArgs(exe) {
    if (/["\r\n]/.test(exe)) throw Object.assign(new Error("Caminho do programa inválido."), { status: 400 });
    return `advfirewall firewall add rule name="KERYX" dir=in action=allow enable=yes profile=private,public,domain program="${exe}"`;
}

// arg: the one value the script reads as $env:KERYX_FW_ARG.
function runPowerShell(script, arg, { exec = execFile, timeout = TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
        exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
            { windowsHide: true, timeout, env: { ...process.env, KERYX_FW_ARG: arg } }, (err, stdout) => (err ? reject(err) : resolve(String(stdout || ""))));
    });
}

function createFirewall({ platform = process.platform, exe = process.execPath, exec = execFile, log = () => {} } = {}) {
    let cached = null;
    async function check({ fresh = false } = {}) {
        if (platform !== "win32") return { blocked: false, profiles: [], shut: [], supported: false };
        if (cached && !fresh && Date.now() - cached.at < 30000) return cached.value;
        let value;
        try {
            const out = await runPowerShell(CHECK_PS, exe, { exec });
            const parsed = JSON.parse(out.trim() || "{}");
            const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
            value = { ...firewallVerdict({ categories: list(parsed.categories), rules: list(parsed.rules) }), supported: true };
        } catch (err) {
            // Not knowing is not a warning: the page says nothing.
            log(`[keryx-firewall] check: ${err && err.message}`);
            value = { blocked: false, profiles: [], shut: [], supported: false };
        }
        cached = { at: Date.now(), value };
        return value;
    }
    // Elevated: Windows asks for the administrator's password (UAC). A "No"
    // there throws, and the page says it was not allowed.
    async function allow() {
        if (platform !== "win32") return check();
        const elevate = "Start-Process -FilePath netsh.exe -ArgumentList $env:KERYX_FW_ARG -Verb RunAs -WindowStyle Hidden -Wait";
        try {
            await runPowerShell(elevate, allowArgs(exe), { exec, timeout: 120000 });
        } catch (err) {
            log(`[keryx-firewall] allow: ${err && err.message}`);
            throw Object.assign(new Error("O Windows não liberou o KERYX no firewall."), { status: 409 });
        }
        log("[keryx-firewall] regra de entrada do KERYX adicionada (privada, pública, domínio)");
        return check({ fresh: true });
    }
    return { check, allow };
}

module.exports = { createFirewall, firewallVerdict, allowArgs };

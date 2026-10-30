const test = require("node:test");
const assert = require("node:assert/strict");
const { createFirewall, firewallVerdict, allowArgs } = require("./firewall.cjs");

test("firewallVerdict: the 30/10 case — a Private Wi-Fi, KERYX allowed only on Public", () => {
    const v = firewallVerdict({ categories: ["Private"], rules: [{ action: "Allow", profile: "Public" }, { action: "Allow", profile: "Public" }] });
    assert.deepEqual(v, { blocked: true, profiles: ["Private"], shut: ["Private"] });
});

test("firewallVerdict: allowed where the computer is, Any included", () => {
    assert.equal(firewallVerdict({ categories: ["Private"], rules: [{ action: "Allow", profile: "Private, Public" }] }).blocked, false);
    assert.equal(firewallVerdict({ categories: ["Public", "Private"], rules: [{ action: "Allow", profile: "Any" }] }).blocked, false);
    assert.equal(firewallVerdict({ categories: ["DomainAuthenticated"], rules: [{ action: "Allow", profile: "Domain" }] }).blocked, false);
});

test("firewallVerdict: no rule at all is blocked; a Block rule wins over an Allow", () => {
    assert.equal(firewallVerdict({ categories: ["Private"], rules: [] }).blocked, true);
    assert.deepEqual(firewallVerdict({ categories: ["Private"], rules: [{ action: "Allow", profile: "Any" }, { action: "Block", profile: "Private" }] }).shut, ["Private"]);
});

test("firewallVerdict: no network, nothing to say", () => {
    assert.deepEqual(firewallVerdict({ categories: [], rules: [] }), { blocked: false, profiles: [], shut: [] });
    assert.equal(firewallVerdict().blocked, false);
});

test("allowArgs: the path in quotes, never a quote inside it", () => {
    assert.equal(allowArgs("C:\\Program Files\\KERYX\\KERYX.exe"), 'advfirewall firewall add rule name="KERYX" dir=in action=allow enable=yes profile=private,public,domain program="C:\\Program Files\\KERYX\\KERYX.exe"');
    assert.throws(() => allowArgs('C:\\x" & calc'), /inválido/);
});

test("check: reads PowerShell's JSON (one rule comes as an object), the path in the environment", async () => {
    const calls = [];
    const exec = (file, args, opts, done) => { calls.push(opts.env.KERYX_FW_ARG); done(null, '{"categories":"Private","rules":{"action":"Allow","profile":"Public"}}'); };
    const fw = createFirewall({ platform: "win32", exe: "C:\\K\\KERYX.exe", exec });
    assert.deepEqual(await fw.check(), { blocked: true, profiles: ["Private"], shut: ["Private"], supported: true });
    assert.equal(calls[0], "C:\\K\\KERYX.exe");
    await fw.check();
    assert.equal(calls.length, 1, "cached for a moment");
});

test("check: a failure or another system says nothing", async () => {
    const broken = createFirewall({ platform: "win32", exec: (f, a, o, done) => done(new Error("no powershell")) });
    assert.equal((await broken.check()).blocked, false);
    assert.equal((await createFirewall({ platform: "linux" }).check()).supported, false);
});

test("allow: elevated netsh, then a fresh check; a refusal throws in pt-BR", async () => {
    const seen = [];
    let allowedNow = false;
    const exec = (file, args, opts, done) => {
        seen.push(opts.env.KERYX_FW_ARG);
        if (args.some((a) => /RunAs/.test(a))) { allowedNow = true; return done(null, ""); }
        done(null, JSON.stringify({ categories: ["Private"], rules: [{ action: "Allow", profile: allowedNow ? "Private, Public, Domain" : "Public" }] }));
    };
    const fw = createFirewall({ platform: "win32", exe: "C:\\K\\KERYX.exe", exec });
    assert.equal((await fw.check()).blocked, true);
    assert.equal((await fw.allow()).blocked, false);
    assert.match(seen[1], /program="C:\\K\\KERYX.exe"/);
    const no = createFirewall({ platform: "win32", exec: (f, a, o, done) => done(new Error("canceled by the user")) });
    await assert.rejects(no.allow(), /não liberou/);
});

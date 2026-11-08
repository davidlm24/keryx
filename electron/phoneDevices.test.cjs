const test = require("node:test");
const assert = require("node:assert/strict");
const { createDevices, deviceName, cleanName, normalizeDevices, hashOf, TICKET_MS, MAX_DEVICES, STALE_MS, SAVE_EVERY_MS } = require("./phoneDevices.cjs");

function fixture(rows = []) {
    let saved = rows;
    let writes = 0;
    const clock = { t: Date.parse("2026-11-08T12:00:00Z") };
    const d = createDevices({ load: () => saved, save: (r) => { saved = r; writes += 1; }, now: () => clock.t });
    return { d, clock, saved: () => saved, writes: () => writes };
}

test("a ticket is for one door, opens the page without being spent, and pairs one phone only", () => {
    const { d, saved } = fixture();
    const t = d.ticket("control");
    assert.match(t.ticket, /^[A-Za-z0-9_-]{22}$/);
    assert.deepEqual(d.peek(t.ticket), { role: "control" });
    assert.deepEqual(d.peek(t.ticket), { role: "control" }, "looking is free (WhatsApp's preview)");
    assert.equal(d.status(t.ticket).state, "waiting");
    const made = d.redeem(t.ticket, { name: "  Celular\tdo João ", agent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" });
    assert.equal(made.device.name, "Celular do João");
    assert.equal(made.device.role, "control");
    assert.match(made.cookie, /^[a-f0-9]{16}\.[A-Za-z0-9_-]{43}$/);
    assert.equal(d.redeem(t.ticket, {}), null, "spent");
    assert.equal(d.peek(t.ticket), null);
    assert.deepEqual(d.status(t.ticket), { state: "done", device: { id: made.device.id, name: "Celular do João", role: "control" } });
    // Only the key's hash is kept.
    const row = saved()[0];
    assert.equal(row.hash, hashOf(made.cookie.split(".")[1]));
    assert.ok(!JSON.stringify(saved()).includes(made.cookie.split(".")[1]));
    assert.ok(!("hash" in d.list()[0]), "the console never sees the hash");
    assert.throws(() => d.ticket("admin"), /Porta/);
});

test("a ticket expires after 5 minutes; cancel and unknown read as expired", () => {
    const { d, clock } = fixture();
    const t = d.ticket("team");
    clock.t += TICKET_MS + 1;
    assert.equal(d.peek(t.ticket), null);
    assert.equal(d.redeem(t.ticket, {}), null);
    assert.equal(d.status(t.ticket).state, "expired");
    const u = d.ticket("team");
    d.cancel(u.ticket);
    assert.equal(d.peek(u.ticket), null);
    assert.equal(d.status("nope").state, "expired");
    // Four open at most: the oldest goes.
    const many = [1, 2, 3, 4, 5].map(() => d.ticket("control").ticket);
    assert.equal(d.peek(many[0]), null);
    assert.ok(d.peek(many[4]));
});

test("check: the right key only; it marks the phone seen and saves at most every 10 minutes", () => {
    const { d, clock, writes } = fixture();
    const { device, cookie } = d.redeem(d.ticket("team").ticket, { agent: "iPhone Safari" });
    const before = writes();
    assert.equal(d.check(cookie).id, device.id);
    assert.equal(d.check(`${device.id}.${"A".repeat(43)}`), null, "a wrong key");
    assert.equal(d.check("junk"), null);
    assert.equal(d.check(""), null);
    clock.t += 60000;
    d.check(cookie);
    assert.equal(writes(), before, "seen in memory only");
    assert.equal(d.list()[0].lastSeen, new Date(clock.t).toISOString(), "the console sees it at once");
    clock.t += SAVE_EVERY_MS;
    d.check(cookie);
    assert.equal(writes(), before + 1);
});

test("rename, remove, Desconectar todos of one door; flush saves what was only seen", () => {
    const { d, clock, saved } = fixture();
    const a = d.redeem(d.ticket("control").ticket, { name: "A" });
    const b = d.redeem(d.ticket("team").ticket, { name: "B" });
    const c = d.redeem(d.ticket("team").ticket, { name: "C" });
    d.rename(a.device.id, "Celular do Davi");
    assert.equal(d.list().find((x) => x.id === a.device.id).name, "Celular do Davi");
    assert.throws(() => d.rename(a.device.id, "   "), /nome/);
    assert.throws(() => d.rename("0000000000000000", "x"), /não está/);
    assert.equal(d.remove(b.device.id), true);
    assert.equal(d.check(b.cookie), null, "disconnected: its key no longer opens");
    assert.deepEqual(d.removeRole("team"), [c.device.id]);
    assert.deepEqual(d.list().map((x) => x.id), [a.device.id]);
    clock.t += 1000;
    d.check(a.cookie);
    d.flush();
    assert.equal(saved()[0].lastSeen, new Date(clock.t).toISOString());
});

test("a phone not seen for 180 days leaves by itself; 30 at most, the oldest seen first (M2 = A)", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const row = (i, daysAgo) => ({ id: i.toString(16).padStart(16, "0"), role: "control", name: `P${i}`, hash: "a".repeat(64), createdAt: "", lastSeen: new Date(now - daysAgo * 86400000).toISOString() });
    assert.deepEqual(normalizeDevices([row(1, 10), row(2, 181), { id: "x" }, null], now).map((d) => d.name), ["P1"]);
    const many = Array.from({ length: 35 }, (_, i) => row(i + 1, i));
    const kept = normalizeDevices(many, now);
    assert.equal(kept.length, MAX_DEVICES);
    assert.equal(kept.at(-1).name, "P30");
    assert.ok(STALE_MS === 180 * 86400000);
});

test("names: what a phone calls itself, and what a person types", () => {
    assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Mobile Safari/604"), "iPhone · Safari");
    assert.equal(deviceName("Mozilla/5.0 (Linux; Android 14; SM-A54) AppleWebKit Chrome/130 Mobile Safari/537"), "Android · Chrome");
    assert.equal(deviceName("Mozilla/5.0 (Linux; Android 13) SamsungBrowser/23 Chrome/115 Safari/537"), "Tablet Android · Samsung Internet");
    assert.equal(deviceName(""), "Celular");
    assert.equal(cleanName("a\nb\u0000c"), "a b c");
    assert.equal(cleanName("x".repeat(60)).length, 40);
});

test("an invite link (N9): 24 hours, one phone, kept as a hash so it outlives a restart", () => {
    const { INVITE_MS, MAX_INVITES } = require("./phoneDevices.cjs");
    let saved = [];
    let invites = [];
    const clock = { t: Date.parse("2026-11-08T12:00:00Z") };
    const make = () => createDevices({ load: () => saved, save: (r) => { saved = r; }, loadInvites: () => invites, saveInvites: (r) => { invites = r; }, now: () => clock.t });
    const d = make();
    const inv = d.ticket("team", { invite: true });
    assert.equal(inv.invite, true);
    assert.equal(inv.expires - clock.t, INVITE_MS);
    assert.ok(!JSON.stringify(invites).includes(inv.ticket), "never the ticket itself");
    // A restart: a new store reads the same invite.
    clock.t += 20 * 3600 * 1000;
    const again = make();
    assert.deepEqual(again.peek(inv.ticket), { role: "team", invite: true });
    assert.deepEqual(again.peek(inv.ticket), { role: "team", invite: true }, "looking is free (WhatsApp's preview)");
    const made = again.redeem(inv.ticket, { name: "Celular da Bia" });
    assert.equal(made.device.role, "team");
    assert.equal(again.redeem(inv.ticket, {}), null, "one phone");
    assert.deepEqual(invites, []);
    // Past 24 hours: gone.
    const late = again.ticket("control", { invite: true });
    clock.t += INVITE_MS + 1;
    assert.equal(again.peek(late.ticket), null);
    // 20 at most: the oldest goes.
    const many = Array.from({ length: MAX_INVITES + 2 }, () => again.ticket("control", { invite: true }).ticket);
    assert.equal(invites.length, MAX_INVITES);
    assert.equal(again.peek(many[0]), null);
    assert.ok(again.peek(many.at(-1)));
});

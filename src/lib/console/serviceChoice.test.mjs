import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseService } from "./serviceChoice.js";

const day = new Date(2026, 9, 20, 22, 30); // 22:30 local: still the 20th
const services = [
    { id: "dom", date: "2026-10-18" },
    { id: "hoje", date: "2026-10-20" },
    { id: "velho", date: "2026-10-01" },
];
const onAir = (serviceId, over = {}) => ({ screen: "show", content: { slides: ["x"] }, session: { serviceId }, ...over });

test("today's culto by the local date, else the most recent", () => {
    assert.equal(chooseService(services, null, day).id, "hoje");
    assert.equal(chooseService([services[0], services[2]], null, day).id, "dom");
    assert.equal(chooseService([], null, day), null);
});

test("the culto on the screens wins: a reload or a crash mid-service keeps its Setlist", () => {
    assert.equal(chooseService(services, onAir("dom"), day).id, "dom");
    assert.equal(chooseService(services, onAir("sumiu"), day).id, "hoje", "a culto that no longer exists");
    assert.equal(chooseService(services, onAir("dom", { content: null }), day).id, "hoje", "nothing on air");
    assert.equal(chooseService(services, onAir("dom", { screen: "black" }), day).id, "hoje", "a normal start reopens black: yesterday's session does not count");
});

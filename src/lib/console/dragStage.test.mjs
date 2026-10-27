import test from "node:test";
import assert from "node:assert/strict";
import { setDragStage, getDragStage, getDragStages, clearDragStage } from "./dragStage.js";

test("dragStage: one stage, or several in order (Rodada O2)", () => {
    setDragStage({ id: "song:a" });
    assert.equal(getDragStage().id, "song:a");
    assert.deepEqual(getDragStages().map((s) => s.id), ["song:a"]);
    setDragStage([{ id: "song:a" }, null, { id: "song:b" }]);
    assert.equal(getDragStage().id, "song:a", "the Prévia and the Programa take the first");
    assert.deepEqual(getDragStages().map((s) => s.id), ["song:a", "song:b"]);
    clearDragStage();
    assert.equal(getDragStage(), null);
    assert.deepEqual(getDragStages(), []);
    setDragStage([]);
    assert.equal(getDragStage(), null, "an empty list carries nothing");
});

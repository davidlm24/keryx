import test from "node:test";
import assert from "node:assert/strict";
import {
    MEDIA_CATEGORY_DEFAULTS, mediaCategoryOf, mediaCategoryList, managedMediaCategories, mediaCategoriesInUse, mediaInCategory,
    addMediaCategory, renameMediaCategory, removeMediaCategory, FALLBACK_CATEGORY,
} from "./mediaCategories.js";

test("an old key reads as its name; nothing reads as Outros", () => {
    assert.equal(mediaCategoryOf({ category: "sermon" }), "Pregação");
    assert.equal(mediaCategoryOf({ category: "worship" }), "Louvor");
    assert.equal(mediaCategoryOf({ category: "announcement" }), "Avisos");
    assert.equal(mediaCategoryOf({ category: "testimony" }), "Testemunho");
    assert.equal(mediaCategoryOf({ category: "other" }), "Outros");
    assert.equal(mediaCategoryOf({}), "Outros");
    assert.equal(mediaCategoryOf({ category: "  " }), "Outros");
    assert.equal(mediaCategoryOf({ category: "Jovens" }), "Jovens");
});

test("never edited: today's five, Outros last", () => {
    assert.deepEqual(mediaCategoryList(null), MEDIA_CATEGORY_DEFAULTS);
    assert.deepEqual(mediaCategoryList(["Jovens", "background", "Pregação"]), ["Jovens", "Pregação"]);
});

test("the editor lists the church's, then the names in use, and Outros always", () => {
    const media = [{ category: "Zeta" }, { category: "worship" }, { category: "Alfa" }];
    assert.deepEqual(managedMediaCategories(["Louvor"], media), ["Louvor", "Alfa", "Zeta", "Outros"]);
    assert.deepEqual(managedMediaCategories(["Outros", "Louvor"], []), ["Outros", "Louvor"]);
});

test("the chips show only the categories that have a file", () => {
    const media = [{ category: "sermon" }, { category: "Jovens" }, {}];
    assert.deepEqual(mediaCategoriesInUse(null, media), ["Pregação", "Outros", "Jovens"]);
});

test("a rename or a delete moves the files whose name matches, old keys included", () => {
    const media = [{ id: "a", category: "sermon" }, { id: "b", category: "Pregação" }, { id: "c", category: "Louvor" }];
    assert.deepEqual(mediaInCategory(media, "Pregação").map((m) => m.id), ["a", "b"]);
});

test("reserved names are refused; Outros never renamed or deleted", () => {
    const list = [...MEDIA_CATEGORY_DEFAULTS];
    assert.ok(addMediaCategory(list, "Background").error);
    assert.ok(addMediaCategory(list, "font").error);
    assert.ok(addMediaCategory(list, "sermon").error);
    assert.ok(renameMediaCategory(list, "Louvor", "other").error);
    assert.deepEqual(addMediaCategory(list, "Jovens").list, [...list, "Jovens"]);
    assert.ok(addMediaCategory(list, "louvor").error);
    assert.deepEqual(renameMediaCategory(list, "Louvor", "Adoração").list, ["Pregação", "Adoração", "Avisos", "Testemunho", "Outros"]);
    assert.ok(renameMediaCategory(list, FALLBACK_CATEGORY, "Diversos").error);
    assert.ok(removeMediaCategory(list, FALLBACK_CATEGORY).error);
    assert.deepEqual(removeMediaCategory(list, "Avisos").list, ["Pregação", "Louvor", "Testemunho", "Outros"]);
});

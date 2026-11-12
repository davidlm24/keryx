// Fundos gerados: what a surface without WebGL shows (and every screen while
// the shaders load). Its own module so a screen has it without the
// console's names and presets (src/lib/generators.js) and without
// shared/generators.mjs growing for the pages that never draw one.
//
// A still gradient of the colours; a degradê is its two sets' middle
// colours in its direction.
const BLEND_ANGLE = { h: "90deg", v: "180deg", d: "135deg", move: "135deg" };
export const cssFallback = (gen) => {
    const colors = gen?.colors?.length ? gen.colors : ["#000"];
    if (!gen?.colors2?.length) return `linear-gradient(160deg, ${colors.join(", ")})`;
    const mid = (cs) => cs[Math.floor(cs.length / 2)];
    return `linear-gradient(${BLEND_ANGLE[gen.blend] || BLEND_ANGLE.h}, ${mid(colors)}, ${mid(gen.colors2)})`;
};

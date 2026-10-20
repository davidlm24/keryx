// A small XML reader for the song formats (OpenLyrics today, ProPresenter 6
// next): no DOMParser, so node --test and every window read alike. Pure.
// -> { name, attrs, children: [node | string] } for the root element; names
// lose their namespace prefix ("ol:verse" -> "verse"). Throws on a broken file.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

export const decodeEntities = (text) => String(text).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, ref) => {
    if (ref[0] === "#") {
        const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[ref] ?? all;
});

const localName = (name) => name.slice(name.indexOf(":") + 1);

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(source) {
    const xml = String(source ?? "");
    const root = { name: "#document", attrs: {}, children: [] };
    const stack = [root];
    let i = 0;
    const text = (s) => { if (s) stack[stack.length - 1].children.push(decodeEntities(s)); };
    while (i < xml.length) {
        const lt = xml.indexOf("<", i);
        if (lt < 0) { text(xml.slice(i)); break; }
        text(xml.slice(i, lt));
        if (xml.startsWith("<!--", lt)) { i = end(xml, "-->", lt); continue; }
        if (xml.startsWith("<![CDATA[", lt)) {
            const close = xml.indexOf("]]>", lt);
            if (close < 0) throw new Error("XML inválido.");
            stack[stack.length - 1].children.push(xml.slice(lt + 9, close));
            i = close + 3;
            continue;
        }
        if (xml.startsWith("<?", lt)) { i = end(xml, "?>", lt); continue; }
        if (xml.startsWith("<!", lt)) { i = end(xml, ">", lt); continue; }
        const gt = tagEnd(xml, lt);
        const body = xml.slice(lt + 1, gt);
        if (body[0] === "/") {
            const name = localName(body.slice(1).trim());
            const open = stack.pop();
            if (!open || open === root || open.name !== name) throw new Error("XML inválido.");
        } else {
            const selfClosing = body.endsWith("/");
            const inner = selfClosing ? body.slice(0, -1) : body;
            const m = /^\s*([^\s/>]+)/.exec(inner);
            if (!m) throw new Error("XML inválido.");
            const attrs = {};
            for (const a of inner.slice(m[0].length).matchAll(ATTR_RE)) attrs[localName(a[1])] = decodeEntities(a[3] ?? a[4] ?? "");
            const node = { name: localName(m[1]), attrs, children: [] };
            stack[stack.length - 1].children.push(node);
            if (!selfClosing) stack.push(node);
        }
        i = gt + 1;
    }
    if (stack.length !== 1) throw new Error("XML inválido.");
    const top = root.children.find((c) => typeof c !== "string");
    if (!top) throw new Error("XML inválido.");
    return top;
}

function end(xml, close, from) {
    const at = xml.indexOf(close, from);
    if (at < 0) throw new Error("XML inválido.");
    return at + close.length;
}

// The ">" that closes a tag, skipping the ones inside quoted attributes.
function tagEnd(xml, from) {
    let quote = "";
    for (let i = from + 1; i < xml.length; i++) {
        const ch = xml[i];
        if (quote) { if (ch === quote) quote = ""; } else if (ch === "\"" || ch === "'") quote = ch;
        else if (ch === ">") return i;
    }
    throw new Error("XML inválido.");
}

// Helpers over the tree.
export const elements = (node, name) => (node?.children || []).filter((c) => typeof c !== "string" && (!name || c.name === name));
export const child = (node, name) => elements(node, name)[0] || null;
export const textOf = (node) => (node ? node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("") : "");

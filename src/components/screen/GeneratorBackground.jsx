import React, { useEffect, useRef, useState } from "react";
import { fragmentSource, VERTEX_SOURCE, cssFallback } from "@/lib/generators";
import { getLevel, listenSystemLevel, follow } from "@/lib/audioLevel";

// A generated background (src/lib/generators.js) filling its box.
//
// Moving (an output, the Programa monitor): its own WebGL canvas, one
// full-screen triangle 30 times a second, at most 960 pixels wide (the
// noise is smooth, so the picture scales up clean and a weak GPU keeps
// up), paused while the window is hidden. With gen.audio the level of the
// PC's sound (src/lib/audioLevel.js) rides into the shader, smoothed.
//
// Still (the Prévia, the galleries, the Multiview's quiet tiles): a plain
// 2D canvas with one frame copied from ONE shared offscreen WebGL renderer
// — a browser allows only a handful of WebGL contexts per page, and the
// console shows many previews at once. Without WebGL a still gradient of
// the colours stands in.
const FPS = 30;
const MAX_W = 960;
const STILL_W = 480;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const UNIFORMS = ["u_res", "u_time", "u_speed", "u_scale", "u_intensity", "u_spacing", "u_persistence", "u_contrast", "u_detail", "u_ncol", "u_c0", "u_c1", "u_c2", "u_audio"];

// A WebGL context with a program per generator: draw(gen, t, audio) paints
// the whole canvas. null when the context cannot be had (no WebGL, or lost).
function makeRenderer(canvas) {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl || gl.isContextLost()) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const programs = new Map();
    const programFor = (id) => {
        if (programs.has(id)) return programs.get(id);
        const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SOURCE));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentSource(id)));
        gl.linkProgram(prog);
        let made = null;
        if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            made = { prog, u: Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])), pos: gl.getAttribLocation(prog, "a_pos") };
        } else if (!gl.isContextLost()) {
            // A shader that does not compile here is a bug, not this PC's fault: say which.
            console.warn("Fundo gerado: o shader não compilou", id, gl.getProgramInfoLog(prog), ...(gl.getAttachedShaders(prog) || []).map((sh) => gl.getShaderInfoLog(sh)));
        }
        programs.set(id, made);
        return made;
    };
    return {
        gl,
        lost: () => gl.isContextLost(),
        draw(g, t, audio = 0) {
            const p = programFor(g.id);
            if (!p) return false;
            gl.useProgram(p.prog);
            gl.enableVertexAttribArray(p.pos);
            gl.vertexAttribPointer(p.pos, 2, gl.FLOAT, false, 0, 0);
            gl.viewport(0, 0, canvas.width, canvas.height);
            const u = p.u;
            gl.uniform2f(u.u_res, canvas.width, canvas.height);
            gl.uniform1f(u.u_time, t);
            gl.uniform1f(u.u_audio, audio);
            gl.uniform1f(u.u_speed, g.speed); gl.uniform1f(u.u_scale, g.scale); gl.uniform1f(u.u_intensity, g.intensity);
            gl.uniform1f(u.u_spacing, g.spacing); gl.uniform1f(u.u_persistence, g.persistence); gl.uniform1f(u.u_contrast, g.contrast);
            gl.uniform1i(u.u_detail, g.detail); gl.uniform1i(u.u_ncol, g.colors.length);
            const cs = [g.colors[0], g.colors[1] || g.colors[0], g.colors[2] || g.colors[1] || g.colors[0]].map(hex);
            gl.uniform3f(u.u_c0, ...cs[0]); gl.uniform3f(u.u_c1, ...cs[1]); gl.uniform3f(u.u_c2, ...cs[2]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            return true;
        },
        dispose() { gl.getExtension("WEBGL_lose_context")?.loseContext(); },
    };
}

// The one renderer every still preview shares: a frame is drawn there and
// copied into the preview's own 2D canvas at once.
let still = null;
function stillFrame(g, w, h) {
    if (still && still.lost()) still = null;
    if (!still) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        still = makeRenderer(c);
        if (still) still.canvas = c;
    }
    if (!still) return null;
    if (still.canvas.width !== w || still.canvas.height !== h) { still.canvas.width = w; still.canvas.height = h; }
    return still.draw(g, 0, 0) ? still.canvas : null;
}

// The canvas size for a box: capped width, the box's proportions.
const sizeFor = (box, maxW) => {
    const w = Math.max(2, Math.min(maxW, Math.round(box.width)));
    return { w, h: Math.max(2, Math.round(w * box.height / box.width)) };
};

export default function GeneratorBackground({ gen, animate = true }) {
    const ref = useRef(null);
    const genRef = useRef(gen);
    genRef.current = gen;
    const [lost, setLost] = useState(0);
    const [noGl, setNoGl] = useState(false);

    // Still: one frame from the shared renderer, redrawn when the box or
    // the generator changes.
    useEffect(() => {
        if (animate) return undefined;
        const canvas = ref.current;
        if (!canvas) return undefined;
        const paint = () => {
            const box = canvas.parentElement?.getBoundingClientRect();
            if (!box || !box.width || !box.height) return;
            const { w, h } = sizeFor(box, STILL_W);
            const frame = stillFrame(genRef.current, w, h);
            if (!frame) { setNoGl(true); return; }
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            canvas.getContext("2d").drawImage(frame, 0, 0, w, h);
        };
        paint();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(paint) : null;
        if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
        return () => ro?.disconnect();
    }, [gen, animate]);

    // Moving: its own renderer and frame loop.
    useEffect(() => {
        if (!animate) return undefined;
        const canvas = ref.current;
        if (!canvas) return undefined;
        const r = makeRenderer(canvas);
        if (!r) { setNoGl(true); return undefined; }
        const resize = () => {
            const box = canvas.parentElement?.getBoundingClientRect();
            if (!box || !box.width || !box.height) return;
            const { w, h } = sizeFor(box, MAX_W);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        };
        let shownLevel = 0;
        const draw = (t) => {
            const g = genRef.current;
            resize();
            shownLevel = g.audio ? follow(shownLevel, getLevel()) : 0;
            if (!r.draw(g, t, shownLevel) && !r.lost()) setNoGl(true);
        };
        const t0 = performance.now();
        let raf = 0, last = 0;
        const frame = (ts) => {
            raf = requestAnimationFrame(frame);
            if (ts - last < 1000 / FPS) return;
            last = ts;
            draw((ts - t0) / 1000);
        };
        const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
        const onVisible = () => (document.hidden ? stop() : start());
        const onLost = (e) => { e.preventDefault(); stop(); };
        const onRestored = () => setLost((n) => n + 1);
        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
        document.addEventListener("visibilitychange", onVisible);
        if (gen.audio) listenSystemLevel();
        draw(0);
        start();
        return () => {
            stop();
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            document.removeEventListener("visibilitychange", onVisible);
            r.dispose();
        };
    }, [gen.id, gen.audio, animate, lost]);

    if (noGl) return <div className="ks-layer" style={{ background: cssFallback(gen) }} />;
    return <canvas ref={ref} className="ks-bg-gen" key={`${animate ? "live" : "still"}:${lost}`} aria-hidden="true" />;
}

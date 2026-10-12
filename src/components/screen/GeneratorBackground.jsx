import React, { useEffect, useRef, useState } from "react";
import { fragmentSource, VERTEX_SOURCE, cssFallback } from "@/lib/generators";

// A generated background (src/lib/generators.js) on a WebGL canvas filling
// its box: the shader draws one full-screen triangle, 30 frames a second,
// at most 960 pixels wide (the noise is smooth, so the picture scales up
// clean and a weak GPU keeps up), paused while the window is hidden. Not
// animating (a still preview) it draws one frame and stops. Without WebGL
// a still gradient of the colours stands in.
const FPS = 30;
const MAX_W = 960;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);

export default function GeneratorBackground({ gen, animate = true }) {
    const ref = useRef(null);
    const genRef = useRef(gen);
    genRef.current = gen;
    const drawRef = useRef(null);
    const [lost, setLost] = useState(0);
    const [noGl, setNoGl] = useState(false);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return undefined;
        const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" });
        if (!gl) { setNoGl(true); return undefined; }
        const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SOURCE));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentSource(gen.id)));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            // A shader that does not compile here is a bug, not this PC's fault: say which.
            console.warn("Fundo gerado: o shader não compilou", gen.id, gl.getProgramInfoLog(prog), ...gl.getAttachedShaders(prog).map((sh) => gl.getShaderInfoLog(sh)));
            setNoGl(true);
            return undefined;
        }
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const pos = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        const u = Object.fromEntries(["u_res", "u_time", "u_speed", "u_scale", "u_intensity", "u_spacing", "u_persistence", "u_contrast", "u_detail", "u_ncol", "u_c0", "u_c1", "u_c2"].map((n) => [n, gl.getUniformLocation(prog, n)]));

        // The canvas follows its box, capped: the picture is drawn small and
        // scaled by the browser.
        const resize = () => {
            const box = canvas.parentElement?.getBoundingClientRect();
            if (!box || !box.width || !box.height) return;
            const w = Math.max(2, Math.min(MAX_W, Math.round(box.width)));
            const h = Math.max(2, Math.round(w * box.height / box.width));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        };
        const draw = (t) => {
            const g = genRef.current;
            resize();
            gl.uniform2f(u.u_res, canvas.width, canvas.height);
            gl.uniform1f(u.u_time, t);
            gl.uniform1f(u.u_speed, g.speed); gl.uniform1f(u.u_scale, g.scale); gl.uniform1f(u.u_intensity, g.intensity);
            gl.uniform1f(u.u_spacing, g.spacing); gl.uniform1f(u.u_persistence, g.persistence); gl.uniform1f(u.u_contrast, g.contrast);
            gl.uniform1i(u.u_detail, g.detail); gl.uniform1i(u.u_ncol, g.colors.length);
            const cs = [g.colors[0], g.colors[1] || g.colors[0], g.colors[2] || g.colors[1] || g.colors[0]].map(hex);
            gl.uniform3f(u.u_c0, ...cs[0]); gl.uniform3f(u.u_c1, ...cs[1]); gl.uniform3f(u.u_c2, ...cs[2]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        drawRef.current = draw;
        const t0 = performance.now();
        let raf = 0, last = 0;
        const frame = (ts) => {
            raf = requestAnimationFrame(frame);
            if (ts - last < 1000 / FPS) return;
            last = ts;
            draw((ts - t0) / 1000);
        };
        const start = () => { if (!raf && animate && !document.hidden) raf = requestAnimationFrame(frame); };
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
        const onVisible = () => (document.hidden ? stop() : start());
        const onLost = (e) => { e.preventDefault(); stop(); };
        const onRestored = () => setLost((n) => n + 1);
        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
        document.addEventListener("visibilitychange", onVisible);
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw(animate ? (performance.now() - t0) / 1000 : 0)) : null;
        if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
        draw(0);
        start();
        return () => {
            stop();
            drawRef.current = null;
            ro?.disconnect();
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            document.removeEventListener("visibilitychange", onVisible);
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
    }, [gen.id, animate, lost]);

    // A slider moved on a still preview: one new frame.
    useEffect(() => { if (!animate) drawRef.current?.(0); }, [gen, animate]);

    if (noGl) return <div className="ks-layer" style={{ background: cssFallback(gen) }} />;
    return <canvas ref={ref} className="ks-bg-gen" key={lost} aria-hidden="true" />;
}

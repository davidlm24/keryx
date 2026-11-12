// Fundos gerados: the GLSL each generator draws (WebGL 1, GLSL ES 1.0, so
// an old church PC's integrated GPU draws it). Loaded only when a screen
// draws a generated background (src/components/screen/GeneratorBackground.jsx
// imports it on demand), so the outputs' first load stays light: the names,
// parameters and presets are src/lib/generators.js, what the numbers are
// shared/generators.mjs.
//
// Each body reads `p` (the screen in pattern units, aspect-corrected), `uv`
// (0..1), `t` (time, already by the speed) and the hash/noise/fbm helpers,
// and leaves `v` (0..1), which the palette colours.
import { GENERATOR_IDS } from "../../shared/generators.mjs";

// The palette is a ramp of 1 to 5 colours (u_c0…u_c4; with three it is the
// three-stop palette of before, exactly), and the degradê a second ramp
// (u_d0…u_d4) the first turns into across the screen (u_blend: 0 off,
// 1 left → right, 2 top → bottom, 3 diagonal, 4 two patches drifting).
const PRELUDE = `
precision highp float;
uniform vec2 u_res;
uniform float u_time, u_speed, u_scale, u_intensity, u_spacing, u_persistence, u_contrast, u_audio;
uniform int u_detail, u_ncol, u_ncol2, u_blend;
uniform vec3 u_c0, u_c1, u_c2, u_c3, u_c4, u_d0, u_d1, u_d2, u_d3, u_d4;
float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 q) {
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 q) {
    float v = 0.0, a = 0.5, amp = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= u_detail) break;
        v += a * noise(q); amp += a;
        q *= u_spacing; a *= u_persistence;
    }
    return amp > 0.0 ? v / amp : 0.0;
}
vec3 ramp(float x, int n, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
    x = clamp(x, 0.0, 1.0);
    if (n < 2) return a;
    if (n == 2) return mix(a, b, x);
    if (n == 3) return x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, (x - 0.5) * 2.0);
    if (n == 4) {
        float y4 = x * 3.0;
        return y4 < 1.0 ? mix(a, b, y4) : (y4 < 2.0 ? mix(b, c, y4 - 1.0) : mix(c, d, y4 - 2.0));
    }
    float y5 = x * 4.0;
    return y5 < 1.0 ? mix(a, b, y5) : (y5 < 2.0 ? mix(b, c, y5 - 1.0) : (y5 < 3.0 ? mix(c, d, y5 - 2.0) : mix(d, e, y5 - 3.0)));
}
vec3 palette(float x) { return ramp(x, u_ncol, u_c0, u_c1, u_c2, u_c3, u_c4); }
void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y) * u_scale;
    float t = u_time * u_speed;
`;
const CODA = `
    // Áudio-reativo: the sound's level (0..1, smoothed on the screen) pushes
    // the pattern out and brightens it.
    float s = (mix(0.5, v, min(1.0, u_intensity * (1.0 + u_audio * 0.7))) - 0.5) * (1.0 + u_contrast * 3.0) + 0.5 + u_audio * 0.18;
    vec3 kxCol = palette(s);
    if (u_blend > 0 && u_ncol2 > 0) {
        float kxG = uv.x;
        if (u_blend == 2) kxG = 1.0 - uv.y;
        else if (u_blend == 3) kxG = (uv.x + 1.0 - uv.y) * 0.5;
        else if (u_blend == 4) kxG = smoothstep(0.25, 0.75, noise(vec2(uv.x * 1.6 + u_time * 0.04, uv.y * 1.6 - u_time * 0.03)));
        kxCol = mix(kxCol, ramp(s, u_ncol2, u_d0, u_d1, u_d2, u_d3, u_d4), smoothstep(0.1, 0.9, kxG));
    }
    gl_FragColor = vec4(kxCol, 1.0);
}
`;

export const BODIES = {
    fluid: `
            vec2 q = vec2(fbm(p + t * 0.10), fbm(p + vec2(5.2, 1.3) + t * 0.08));
            vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15), fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.126));
            float v = fbm(p + 4.0 * r);`,
    aurora: `
            float w = fbm(vec2(p.x * 0.6 + t * 0.3, t * 0.15));
            float w2 = fbm(vec2(p.x * 1.3 - t * 0.2, 7.0 + t * 0.1));
            float band = exp(-pow((uv.y - 0.45 - (w - 0.5) * 0.6) * 2.6, 2.0));
            float band2 = exp(-pow((uv.y - 0.62 - (w2 - 0.5) * 0.5) * 3.5, 2.0));
            float v = clamp(band * (0.5 + 0.5 * fbm(p * 1.5 + t * 0.4)) + 0.6 * band2 * (0.5 + 0.5 * fbm(p * 2.2 - t * 0.3)), 0.0, 1.0);`,
    gradient: `
            float a = t * 0.25;
            vec2 d = vec2(cos(a), sin(a));
            float v = clamp(dot(uv - 0.5, d) * 0.8 + 0.5 + 0.12 * sin(t * 0.6 + uv.x * 4.0 + uv.y * 2.0), 0.0, 1.0);`,
    stars: `
            float v = 0.06 * noise(p * 0.6 + t * 0.02);
            for (int l = 0; l < 2; l++) {
                float fl = float(l);
                vec2 q = p * (4.0 - fl * 1.8) + vec2(t * 0.02, fl * 31.0);
                vec2 cell = floor(q), f = fract(q);
                float h = hash(cell + fl * 7.0);
                vec2 d = f - vec2(0.2 + 0.6 * hash(cell + 2.3), 0.2 + 0.6 * hash(cell + 5.9));
                float tw = 0.55 + 0.45 * sin(t * (2.0 + 4.0 * h) + h * 50.0);
                float r = (0.025 + 0.02 * fl) * (1.0 + u_audio * 0.4);
                v += step(0.55 - fl * 0.25, h) * exp(-dot(d, d) / (r * r)) * mix(tw, 1.0, 0.3 * fl) * (0.6 + 0.4 * fl);
            }
            v = clamp(v, 0.0, 1.0);`,
    mist: `
            float a = fbm(p * 0.6 + vec2(t * 0.12, t * 0.03));
            float b = fbm(p * 1.3 + vec2(-t * 0.09, t * 0.05) + a * 1.6);
            float v = smoothstep(0.3, 0.85, a * 0.5 + b * 0.5 + u_audio * 0.08) * (0.45 + 0.25 * (1.0 - uv.y));`,
    tunnel: `
            vec2 c = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
            c.y *= 1.9;
            float r = max(length(c), 0.001);
            vec2 dir = c / r;
            float z = log(r) * 1.4 - t * 1.2;
            float n = noise(dir * u_scale * 4.0 + vec2(z, z * 0.6));
            float m = noise(dir * u_scale * 9.0 + vec2(z * 1.7, -z));
            float streak = pow(n, 5.0) * 1.5 + pow(m, 8.0) * 1.0;
            float v = streak * smoothstep(0.05, 0.45, r) + 0.18 * (1.0 - smoothstep(0.0, 0.9, abs(c.y) * 1.2)) * smoothstep(0.0, 0.3, r);
            v = clamp(v, 0.0, 1.0);`,
    beams: `
            float x = p.x * 0.9 + sin(t * 0.3) * 0.2;
            float bars = noise(vec2(x * 2.0 + t * 0.25, t * 0.07));
            float fine = noise(vec2(x * 7.0 - t * 0.4, 3.0));
            float vert = 0.55 + 0.45 * smoothstep(0.0, 0.6, uv.y) * (1.0 - smoothstep(0.35, 1.0, uv.y));
            float v = clamp(smoothstep(0.2, 0.8, bars) * vert + pow(fine, 3.0) * 0.2, 0.0, 1.0);`,
    lines: `
            float xs = p.x * 4.0 + noise(vec2(p.x * 0.9, 7.0)) * 2.5;
            float id = floor(xs);
            float e = fract(xs);
            float a = noise(vec2(id * 0.73 + t * 0.15, uv.y * 1.1 - t * 0.06));
            float soft = smoothstep(0.0, 0.18, e) * (1.0 - smoothstep(0.82, 1.0, e));
            float v = smoothstep(0.1, 0.9, a) * (0.75 + 0.25 * soft);`,
    columns: `
            float n = max(3.0, floor(u_scale * 2.4));
            float col = floor(uv.x * n);
            float f = fract(uv.x * n);
            float mid = 1.0 - abs((col + 0.5) / n - 0.5) * 1.7;
            float lift = 0.85 + 0.15 * sin(t * 0.8 + col * 1.7);
            float glow = exp(-uv.y * (2.4 - mid)) * (0.35 + 0.65 * mid) * lift;
            float seam = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.94, 1.0, f));
            float shade = 0.82 + 0.18 * sin(f * 3.14159);
            float v = clamp(glow * shade * (0.55 + 0.45 * seam), 0.0, 1.0);`,
    horizon: `
            float h = 1.0 - uv.y;
            float shimmer = fbm(vec2(p.x * 0.4 + t * 0.06, uv.y * 2.5 - t * 0.03));
            float v = clamp(pow(h, 1.6) + (shimmer - 0.5) * 0.12 + 0.03 * sin(t * 0.4), 0.0, 1.0);`,
    room: `
            vec2 c = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
            vec2 bw = vec2(0.42, 0.24);
            float kx = abs(c.x) / bw.x, ky = abs(c.y) / bw.y;
            float k = max(kx, ky);
            float light = fbm(c * 3.0 / max(k, 1.0) + vec2(t * 0.15, -t * 0.1));
            float v;
            if (k <= 1.0) {
                v = 0.8 + 0.1 * (1.0 - length(c / bw) * 0.5) + (light - 0.5) * 0.15;
            } else {
                float depth = 1.0 / k;
                float wall = kx > ky ? 0.45 + 0.35 * depth : (c.y < 0.0 ? 0.95 - 0.25 * (1.0 - depth) : 0.55 + 0.25 * depth);
                float crease = exp(-abs(kx - ky) * 18.0) * 0.25;
                v = wall + crease + (light - 0.5) * 0.12 * depth;
            }
            v = clamp(v + exp(-abs(k - 1.0) * 60.0) * 0.12, 0.0, 1.0);`,
    refraction: `
            vec2 r = vec2(p.x * 0.8 + p.y * 0.5, p.y * 0.35 - p.x * 0.1);
            vec2 w = vec2(fbm(r * 0.5 + vec2(t * 0.08, 0.0)), fbm(r * 0.5 + vec2(3.7, -t * 0.06)));
            float a = fbm(r * 0.45 + w * 1.4 + vec2(0.0, t * 0.04));
            float soft = smoothstep(0.35, 0.75, a);
            float fringe = (1.0 - smoothstep(0.0, 0.025, abs(a - 0.6))) * 0.3;
            float v = clamp(soft * 0.7 + fringe + 0.05, 0.0, 1.0);`,
    reflections: `
            vec2 r = vec2((p.x + p.y) * 0.7, (p.y - p.x) * 0.7);
            float wob = fbm(vec2(r.x * 0.25, r.y * 0.8) + t * 0.05);
            float ln = noise(vec2(r.y * 2.2 + wob * 2.5, r.x * 0.12 + t * 0.07));
            float caust = pow(1.0 - abs(ln * 2.0 - 1.0), 5.0);
            float glow = fbm(vec2(r.x * 0.2 - t * 0.03, r.y * 0.6));
            float v = clamp(caust * 0.8 * smoothstep(0.2, 0.7, glow) + glow * 0.3, 0.0, 1.0);`,
    fluted: `
            float n = floor(u_scale * 12.0);
            float k = uv.x * n;
            float id = floor(k);
            float f = fract(k);
            float off = noise(vec2(id * 0.12 + t * 0.2, t * 0.1)) - 0.5;
            float y1 = uv.y - 0.5 + off * 0.25;
            float y2 = uv.y - 0.5 - off * 0.45;
            float band = exp(-y1 * y1 * 9.0) + exp(-y2 * y2 * 40.0) * 0.35;
            float rib = 0.65 + 0.35 * sin(f * 3.14159);
            float v = clamp(band * rib + 0.04 * rib, 0.0, 1.0);`,
    wideglass: `
            float k = p.x * 1.6;
            float id = floor(k);
            float f = fract(k);
            float base = fbm(vec2(id * 0.15 + (f - 0.5) * 0.3 + t * 0.1, uv.y * 0.9 - t * 0.05));
            float grad = smoothstep(0.0, 1.0, uv.y * 0.6 + base * 0.6);
            float sheen = exp(-(f - 0.3) * (f - 0.3) * 40.0) * 0.25;
            float edge = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.95, 1.0, f));
            float v = clamp(grad * (0.7 + 0.3 * sin(f * 3.14159)) * (0.6 + 0.4 * edge) + sheen * base, 0.0, 1.0);`,
    watercolor: `
            vec2 q1 = vec2(fbm(p + vec2(0.0, t * 0.08)), fbm(p + vec2(5.2, 1.3) - t * 0.06));
            float w1 = fbm(p * 0.8 + 2.5 * q1);
            float w2 = fbm(p * 1.3 + 2.0 * q1.yx + vec2(7.0, 2.0));
            float w3 = fbm(p * 0.5 - 1.5 * q1 + vec2(1.0, 9.0) + t * 0.03);
            float l1 = smoothstep(0.38, 0.62, w1);
            float l2 = smoothstep(0.45, 0.6, w2);
            float l3 = smoothstep(0.4, 0.7, w3);
            float pool = (1.0 - smoothstep(0.0, 0.08, abs(w1 - 0.5))) * 0.12;
            float grain = (hash(floor(gl_FragCoord.xy * 0.5)) - 0.5) * 0.05;
            float v = clamp(l1 * 0.45 + l2 * 0.3 + l3 * 0.25 - pool + grain, 0.0, 1.0);`,
    mosaic: `
            float rows = floor(u_scale * 8.0);
            float ry = uv.y + (noise(vec2(uv.y * 7.0, 3.0)) - 0.5) * 0.09;
            float row = floor(ry * rows);
            float r1 = hash(vec2(row, 1.0));
            float r2 = hash(vec2(row, 7.0));
            float way = r1 < 0.5 ? -1.0 : 1.0;
            float xs = uv.x * (u_res.x / u_res.y) / 1.78 + t * (0.08 + r1 * 0.2) * way;
            float bx = floor(xs * 30.0);
            float g = noise(vec2(bx * 0.11 + r2 * 40.0, row * 0.07));
            float v = smoothstep(0.15, 0.85, g) * (r2 < 0.12 ? 0.05 : 1.0);`,
    blocks: `
            vec2 g = vec2(p.x * 2.2, p.y * 3.0);
            vec2 cell = floor(g);
            vec2 f = fract(g);
            float a = noise(cell * 0.23 + vec2(t * 0.25, 0.0));
            float b = noise(cell.yx * 0.19 + vec2(4.0, -t * 0.2));
            float soft = smoothstep(0.0, 0.12, f.x) * (1.0 - smoothstep(0.88, 1.0, f.x)) * smoothstep(0.0, 0.12, f.y) * (1.0 - smoothstep(0.88, 1.0, f.y));
            float v = smoothstep(0.15, 0.85, a * 0.6 + b * 0.4) * (0.8 + 0.2 * soft);`,
    silk: `
            vec2 w = vec2(fbm(p * 0.4 + vec2(t * 0.06, 0.0)), fbm(p * 0.4 + vec2(2.0, t * 0.05)));
            float ph = p.x * 0.9 + p.y * 1.6 + w.x * 5.0;
            float fold = sin(ph) * 0.5 + 0.5;
            float fold2 = sin(ph * 2.3 + w.y * 4.0 + 1.0) * 0.5 + 0.5;
            float v = (pow(fold, 3.0) * 0.7 + pow(fold2, 6.0) * 0.3) * 0.85 + 0.08;`,
    dunes: `
            float v = 0.92;
            for (int i = 0; i < 6; i++) {
                float fi = float(i);
                float y = 0.86 - fi * 0.15 + sin(p.x * (0.8 + fi * 0.25) + t * (0.2 + fi * 0.07) + fi * 1.7) * 0.07 + (noise(vec2(p.x * 0.6 + fi * 5.0, t * 0.05)) - 0.5) * 0.1;
                float m = 1.0 - smoothstep(y - 0.004, y + 0.004, uv.y);
                float shade = 0.75 - fi * 0.12 + 0.12 * smoothstep(y - 0.12, y, uv.y);
                v = mix(v, shade, m);
            }`,
    lightrain: `
            float v = 0.0;
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float cx = uv.x * (10.0 + fi * 9.0) * u_scale / 3.0 * (u_res.x / u_res.y) / 1.78;
                float id = floor(cx);
                float f = fract(cx) - 0.5;
                float r = hash(vec2(id, fi * 7.0 + 1.0));
                float y = fract(uv.y * (0.5 + fi * 0.2) + t * (0.25 + r * 0.5) * (1.0 - fi * 0.2) + r * 10.0);
                v += pow(1.0 - y, 6.0) * exp(-f * f * (60.0 + fi * 40.0)) * step(0.35, r) * (0.9 - fi * 0.25);
            }
            v = clamp(v + 0.04 * (1.0 - uv.y), 0.0, 1.0);`,
    prism: `
            vec2 c1 = uv - vec2(0.15 + 0.1 * sin(t * 0.2), 0.85);
            float a1 = exp(-length(c1 * vec2(0.8, 1.6)) * 2.2);
            vec2 c2 = uv - vec2(0.9, 0.2 + 0.1 * cos(t * 0.17));
            float a2 = exp(-length(c2 * vec2(1.5, 0.9)) * 2.6);
            float sweep = pow(sin((uv.x * 1.2 + uv.y * 0.7) * 3.0 + t * 0.3 + fbm(p * 0.4 + t * 0.05) * 3.0) * 0.5 + 0.5, 3.0);
            float v = clamp(a1 * 0.8 + a2 * 0.6 + sweep * 0.25 * (a1 + a2 + 0.2), 0.0, 1.0);`,
    ink: `
            vec2 q2 = vec2(p.x, p.y - t * 0.35);
            vec2 w = vec2(fbm(q2 * 0.9 + vec2(0.0, t * 0.05)), fbm(q2 * 0.9 + vec2(5.0, 2.0)));
            float plume = fbm(vec2(p.x * 1.2 + (w.x - 0.5) * 2.2, q2.y * 0.6 + w.y));
            float cxn = uv.x - 0.5 - (w.x - 0.5) * 0.25;
            float col = exp(-cxn * cxn * 6.0);
            float fade = 1.0 - smoothstep(0.15, 1.05, uv.y);
            float v = clamp(smoothstep(0.35, 0.75, plume) * (0.35 + 0.65 * col) * fade + 0.03, 0.0, 1.0);`,
    stainedglass: `
            vec2 g = p * 1.3;
            vec2 ic = floor(g);
            vec2 fc = fract(g);
            float d1 = 9.0;
            float d2 = 9.0;
            float idv = 0.0;
            for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                    vec2 o = vec2(float(i), float(j));
                    vec2 h2 = vec2(hash(ic + o), hash(ic + o + 17.0));
                    vec2 pt = o + 0.5 + 0.4 * sin(t * 0.3 + 6.283 * h2) - fc;
                    float d = dot(pt, pt);
                    if (d < d1) { d2 = d1; d1 = d; idv = h2.x; } else if (d < d2) { d2 = d; }
                }
            }
            float lead = smoothstep(0.02, 0.09, sqrt(d2) - sqrt(d1));
            float glow = 0.35 + 0.65 * (0.5 + 0.5 * sin(idv * 30.0 + t * 0.6));
            float v = lead * glow * (0.85 + 0.15 * noise(g * 6.0));`,
    lightgrid: `
            vec2 c = (uv - vec2(0.5, 0.52)) * vec2(u_res.x / u_res.y, 1.0);
            float glow = exp(-abs(c.y) * 9.0) * 0.8;
            float v = glow + 0.1 * fbm(vec2(c.x * 2.0, c.y * 6.0 - t * 0.05)) * (1.0 - c.y);
            if (c.y < 0.0) {
                float z = 0.35 / max(-c.y, 0.004);
                float kk = u_scale * 0.6;
                float lx = 1.0 - smoothstep(0.0, 0.006 * z * kk, abs(fract(c.x * z * kk + 0.5) - 0.5));
                float lz = 1.0 - smoothstep(0.0, 0.006 * z * z * kk / 0.35, abs(fract(z * kk + t * 1.2 + 0.5) - 0.5));
                v = max(lx, lz) * exp(-z * 0.12) * 0.85 + glow;
            }
            v = clamp(v, 0.0, 1.0);`,
};

export const VERTEX_SOURCE = "attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }";
export const fragmentSource = (id) => PRELUDE + (BODIES[id] || BODIES[GENERATOR_IDS[0]]) + CODA;

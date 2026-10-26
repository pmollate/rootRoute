'use client';

import { useEffect, useRef } from 'react';
import { REDUCED_MOTION_QUERY } from '@/config/scenes';
import { sizeCanvas } from '@/lib/canvas';
import { loadImage } from '@/lib/dom';
import { clamp, lerp, RAD, rand } from '@/lib/math';
import { cssToken } from '@/lib/theme';

type LonLat = [number, number];

// NASA Blue Marble maps (public domain), equirectangular; pin points from scripts/globe-dots.mjs
const EARTH_SRC = '/media/globe-earth.webp';
const CLOUDS_SRC = '/media/globe-clouds.webp';
const DOTS_SRC = '/media/globe-dots.json';
const PINS = 12;
const PIN_SWAP_MS = 1500; // one pin hops to a new spot this often
const R = 0.9; // globe radius as a share of half the canvas; the rest is atmosphere halo

const VERT = `
attribute vec2 a;
varying vec2 p;
void main() { p = a / ${R.toFixed(2)}; gl_Position = vec4(a, 0.0, 1.0); }`;

// Orthographic sphere: per pixel, undo the tilt, look up lon/lat in the map, then light it.
const FRAG = `
precision highp float;
uniform sampler2D earth;
uniform sampler2D clouds;
uniform float lambda;
uniform float tilt;
uniform float cloudShift;
varying vec2 p;
const float PI = 3.14159265;
const vec3 HALO = vec3(0.45, 0.62, 0.92); // the blue of the night sky
void main() {
  float d = length(p);
  if (d > 1.0) {
    float h = clamp(1.0 - (d - 1.0) / ${(1 / R - 1).toFixed(3)}, 0.0, 1.0);
    h = h * h * h * 0.4;
    gl_FragColor = vec4(HALO * h, h);
    return;
  }
  float z = sqrt(1.0 - d * d);
  vec3 n = vec3(p, z);
  float ct = cos(tilt), st = sin(tilt);
  float y0 = p.y * ct + z * st;
  float z0 = -p.y * st + z * ct;
  float lat = asin(clamp(y0, -1.0, 1.0));
  float lon = atan(p.x, z0) - lambda;
  vec2 uv = vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);

  // recoloured to the hero's night depot: navy seas like the sky, silver-white land like the truck
  // (shaded by the map's own relief), and faint pale weather
  vec3 col = texture2D(earth, uv).rgb;
  float ocean = smoothstep(0.04, 0.16, col.b - max(col.r, col.g));
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  vec3 sea = mix(vec3(0.07, 0.12, 0.22), vec3(0.16, 0.27, 0.44), smoothstep(0.05, 0.35, lum));
  vec3 land = mix(vec3(0.56, 0.61, 0.68), vec3(0.93, 0.94, 0.95), smoothstep(0.12, 0.6, lum));
  col = mix(land, sea, ocean);
  float cl = smoothstep(0.45, 0.95, texture2D(clouds, vec2(fract(uv.x + cloudShift), uv.y)).r);
  col = mix(col, vec3(0.9, 0.93, 0.97), cl * 0.2);

  vec3 L = normalize(vec3(0.5, 0.55, 0.7)); // from the upper right, where the dock lights are
  vec3 lit = col * (0.3 + 0.85 * max(dot(n, L), 0.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  lit += pow(max(dot(n, H), 0.0), 48.0) * ocean * (1.0 - cl) * 0.3;
  lit = mix(lit, vec3(0.55, 0.72, 1.0), pow(1.0 - z, 3.0) * 0.45); // sky-blue atmosphere at the limb
  lit += vec3(1.0, 0.85, 0.6) * pow(max(dot(n, L), 0.0), 6.0) * 0.08; // a touch of warm dock light

  float a = 1.0 - smoothstep(0.985, 1.0, d);
  float h = (1.0 - a) * 0.4;
  gl_FragColor = vec4(lit * a + HALO * h, a + h);
}`;

/** Sets up the globe shader; returns draw(lambda°, tilt°, cloudShift), or undefined without WebGL. */
function makeGlobe(c: HTMLCanvasElement, maps: HTMLImageElement[]) {
  const gl = c.getContext('webgl', { premultipliedAlpha: true, antialias: true });
  if (!gl) return;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  maps.forEach((img, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    // plain linear, no mipmaps: mipmapping would draw a seam where the map wraps at the date line
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  });
  gl.uniform1i(gl.getUniformLocation(prog, 'earth'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'clouds'), 1);
  const uLambda = gl.getUniformLocation(prog, 'lambda');
  const uTilt = gl.getUniformLocation(prog, 'tilt');
  const uCloud = gl.getUniformLocation(prog, 'cloudShift');

  return (lambda: number, tilt: number, cloudShift: number) => {
    sizeCanvas(c);
    gl.viewport(0, 0, c.width, c.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uLambda, lambda * RAD);
    gl.uniform1f(uTilt, tilt * RAD);
    gl.uniform1f(uCloud, cloudShift);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

/**
 * A small Earth in the hero's night-depot palette, in the hero's bottom-right corner. It turns on a wandering spin and
 * tilt, clouds drift a touch faster than the land, and red pins drop on random land points, one
 * hopping somewhere new every 1.5 s. Drag it to turn it any way you like; a flick keeps it
 * spinning, then it eases back into its own drift. Reduced motion: still, but still draggable.
 */
export function HeroGlobe() {
  const globe = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gc = globe.current;
    const oc = overlay.current;
    if (!gc || !oc) return;
    const ctx = oc.getContext('2d')!;
    const still = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    // pin colours come from the theme (styles/theme.css)
    const ACCENT = cssToken('--accent');
    const PIN_DOT = cssToken('--bg');
    let drawGlobe: ReturnType<typeof makeGlobe>;
    let dots: LonLat[] = [];
    let raf = 0;
    let visible = true;
    let dead = false;

    // spin (°/s) and tilt (°) ease toward targets that are re-rolled every few seconds
    const spin = { v: 14, to: 14 };
    const tilt = { v: -14, to: -14 };
    let lambda = rand(-20, 40); // opens on Europe and Africa, like a studio globe
    let clouds = 0;
    let nextRoll = 0;

    const pins: { at: LonLat; born: number }[] = [];
    let nextSwap = 0;

    // pointer drag: the surface follows the finger; v is the spin speed (°/s) to hand back on release
    let drag: { x: number; y: number; t: number; v: number } | null = null;

    // lon/lat → unit-sphere x, y (up), z (towards the viewer); the same maths as the shader
    const project = ([lon, lat]: LonLat) => {
      const l = (lon + lambda) * RAD;
      const p = lat * RAD;
      const t = tilt.v * RAD;
      const x = Math.cos(p) * Math.sin(l);
      const y0 = Math.sin(p);
      const z0 = Math.cos(p) * Math.cos(l);
      return { x, y: y0 * Math.cos(t) - z0 * Math.sin(t), z: y0 * Math.sin(t) + z0 * Math.cos(t) };
    };
    // a random land point, preferably on the side facing the viewer so the drop is seen
    const randomLand = (): LonLat => {
      let d = dots[0];
      for (let i = 0; i < 40; i++) {
        d = dots[Math.floor(Math.random() * dots.length)];
        if (project(d).z > 0.35) break;
      }
      return d;
    };

    const drawPins = (now: number) => {
      sizeCanvas(oc);
      const { width: w, height: h } = oc;
      const r = (Math.min(w, h) / 2) * R;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);
      for (const pin of pins) {
        const { x, y, z } = project(pin.at);
        if (z <= 0.05) continue;
        const age = still ? 1 : clamp((now - pin.born) / 400);
        const px = cx + x * r;
        const py = cy - y * r;
        const fade = age * clamp((z - 0.05) / 0.25);
        if (!still) {
          const pulse = ((now - pin.born) % 1600) / 1600;
          const pr = r * (0.03 + pulse * 0.1);
          ctx.globalAlpha = fade * (1 - pulse) * 0.7;
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = r * 0.012;
          ctx.beginPath();
          ctx.ellipse(px, py, pr, pr * (0.4 + 0.6 * z), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // map pin: round head over a point that touches the surface; drops in from above
        const hr = r * 0.055 * (0.7 + 0.3 * z);
        const tipY = py - hr * 1.5 * (1 - age);
        const headY = tipY - hr * 1.7;
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(px, py, hr * 0.55, hr * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(px, headY, hr, Math.PI * 0.82, Math.PI * 0.18);
        ctx.lineTo(px, tipY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PIN_DOT;
        ctx.beginPath();
        ctx.arc(px, headY, hr * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const draw = (now: number) => {
      drawGlobe?.(lambda, tilt.v, clouds);
      drawPins(now);
    };

    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      if (now > nextRoll) {
        // mostly eastward, now and then a slow drift back the other way
        spin.to = Math.random() < 0.2 ? rand(-12, -5) : rand(8, 26);
        tilt.to = rand(-28, 8);
        nextRoll = now + rand(2500, 5000);
      }
      if (!drag) {
        const ease = 1 - Math.exp(-dt * 0.8);
        spin.v = lerp(spin.v, spin.to, ease);
        tilt.v = lerp(tilt.v, tilt.to, ease);
        lambda = (lambda + spin.v * dt) % 360;
      }
      clouds = (clouds + dt * 0.004) % 1;

      if (now > nextSwap) {
        pins[Math.floor(Math.random() * pins.length)] = { at: randomLand(), born: now };
        nextSwap = now + PIN_SWAP_MS;
      }

      draw(now);
      if (visible && !dead) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    });
    const onResize = () => draw(0);

    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), v: 0 };
      oc.setPointerCapture(e.pointerId);
      oc.classList.add('is-dragging');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const now = performance.now();
      const k = 1 / RAD / ((oc.clientWidth / 2) * R); // degrees per pixel, so the point under the finger stays put
      const dx = (e.clientX - drag.x) * k;
      const dy = (e.clientY - drag.y) * k;
      lambda = (lambda + dx) % 360;
      tilt.v = tilt.to = clamp(tilt.v + dy, -85, 85); // past the poles the globe would flip over
      drag.v = lerp(drag.v, dx / Math.max((now - drag.t) / 1000, 0.008), 0.5);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      if (still) draw(0);
    };
    const onUp = () => {
      if (!drag) return;
      // a flick keeps spinning and slows back to an easy drift
      spin.v = performance.now() - drag.t < 80 ? clamp(drag.v, -540, 540) : 0;
      spin.to = 14;
      nextRoll = performance.now() + 4000;
      drag = null;
      oc.classList.remove('is-dragging');
    };
    oc.addEventListener('pointerdown', onDown);
    oc.addEventListener('pointermove', onMove);
    oc.addEventListener('pointerup', onUp);
    oc.addEventListener('pointercancel', onUp);

    Promise.all([loadImage(EARTH_SRC), loadImage(CLOUDS_SRC), fetch(DOTS_SRC).then((r) => r.json() as Promise<LonLat[]>)])
      .then(([earth, cloudMap, d]) => {
        if (dead) return;
        drawGlobe = makeGlobe(gc, [earth, cloudMap]);
        dots = d;
        for (let i = 0; i < PINS; i++) pins.push({ at: randomLand(), born: -1e6 - i * 400 });
        if (still) {
          draw(0);
          window.addEventListener('resize', onResize);
          return;
        }
        nextSwap = performance.now() + PIN_SWAP_MS;
        io.observe(gc);
      })
      .catch(() => undefined);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      oc.removeEventListener('pointerdown', onDown);
      oc.removeEventListener('pointermove', onMove);
      oc.removeEventListener('pointerup', onUp);
      oc.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <>
      <canvas ref={globe} className="hero-globe-canvas" />
      <canvas ref={overlay} className="hero-globe-canvas hero-globe-grab" />
    </>
  );
}

/* =============================================================================
   MRS Aircraft — scroll-scrubbed 3D harness.

   Every exploded view on the site is built here in code rather than loaded as
   a downloaded model, for one reason: an exploded view needs parts. Almost
   every freely licensed aerospace model on the web is a single merged mesh,
   which cannot come apart. Building them parametrically gives named assemblies
   with known positions and axes, so the explode is exact, the callouts anchor
   to real geometry, and the whole thing costs no download at all.

   This module owns everything the scenes share: the three.js import, the
   renderer, the painted studio environment, the brand materials, the camera
   framing, the DOM callouts, the damped scroll scrub, and teardown. A scene
   module supplies geometry and a per-frame pose, nothing else.

   There is no scroll listener anywhere. An IntersectionObserver starts and
   stops a rAF loop, and the loop reads the track rect once per frame, which is
   the only way to get sub-frame accuracy out of a pinned section.
   ========================================================================== */

const THREE_URL = "https://unpkg.com/three@0.184.0/build/three.module.js";

// Brand. These objects are company livery, not a photograph of hardware that
// belongs to somebody else.
export const NAVY = 0x0b2a4a;
export const GOLD = 0xc8a24a;
export const STEEL = 0xb9c4d4;
export const SKIN = 0xe8edf5;
export const GRAPHITE = 0x161c2a;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// Smootherstep. Parts settle rather than arriving at constant speed.
export const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/* How hard the scene chases the scroll position, in seconds. The scrub is a
   damped follow rather than a direct mapping: at 0 the object is welded to the
   scrollbar and every wheel notch reads as a jolt, and past about 0.12 it
   starts to feel like lag. This one number is the difference between a scroll
   scene that feels like weight and one that feels like dragging a slider. */
const TAU = 0.06;

function studioEnvironment(THREE, renderer) {
  // A painted equirect rather than an HDR download: one gradient sky, a soft
  // key, and a warm bounce. Enough for metal to read as metal.
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0.0, "#1b2b46");
  sky.addColorStop(0.45, "#6d7f9e");
  sky.addColorStop(0.52, "#9aa8c0");
  sky.addColorStop(1.0, "#0a1020");
  x.fillStyle = sky;
  x.fillRect(0, 0, 512, 256);
  const key = x.createRadialGradient(120, 55, 0, 120, 55, 130);
  key.addColorStop(0, "rgba(255,250,235,1)");
  key.addColorStop(1, "rgba(255,250,235,0)");
  x.fillStyle = key;
  x.fillRect(0, 0, 512, 256);
  const bounce = x.createRadialGradient(390, 195, 0, 390, 195, 165);
  bounce.addColorStop(0, "rgba(200,162,74,.55)");
  bounce.addColorStop(1, "rgba(200,162,74,0)");
  x.fillStyle = bounce;
  x.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export function brandMaterials(THREE) {
  return {
    skin: new THREE.MeshPhysicalMaterial({
      color: SKIN, metalness: 0.18, roughness: 0.32,
      clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 1.1,
    }),
    navy: new THREE.MeshPhysicalMaterial({
      color: NAVY, metalness: 0.24, roughness: 0.34,
      clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 1.0,
    }),
    gold: new THREE.MeshPhysicalMaterial({
      color: GOLD, metalness: 1, roughness: 0.19, envMapIntensity: 1.7,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: STEEL, metalness: 0.94, roughness: 0.28, envMapIntensity: 1.35,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: GRAPHITE, metalness: 0.7, roughness: 0.55,
    }),
  };
}

/**
 * Mount a scroll-scrubbed scene into `host`.
 *
 * A scene definition supplies:
 *   parts    [{ key, label, detail }]   assembly order, one callout each
 *   build    (THREE, M) -> { root, groups }
 *   framing  (wide) -> { fit, x, y, look }   camera fit in metres, plus offset
 *   pose     (root, p)                       rotation at progress p
 *   place    (groups, p) -> number[]         per-part local progress, 0 to 1
 *   staticAt                                 the one frame reduced motion gets
 */
export async function mountScrubScene(host, def) {
  const THREE = await import(/* @vite-ignore */ THREE_URL);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.className = "engine-canvas";
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: "high-performance",
    });
  } catch (e) {
    host.setAttribute("data-webgl", "failed");
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(THREE, renderer);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0x8fa4c8, 0.5));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.1);
  key.position.set(-7, 8, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(GOLD, 1.5);
  rim.position.set(9, -1, -7);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x7f9ad6, 0.55);
  fill.position.set(5, -6, 5);
  scene.add(fill);

  const { root, groups } = def.build(THREE, brandMaterials(THREE));
  scene.add(root);

  // Callouts are DOM, not sprites: real text, selectable, readable by a screen
  // reader, and styled by the same stylesheet as the rest of the site.
  const labelLayer = document.createElement("div");
  labelLayer.className = "engine-labels";
  labelLayer.setAttribute("aria-hidden", "true");
  host.appendChild(labelLayer);

  const labels = def.parts.map((p) => {
    const el = document.createElement("div");
    el.className = "engine-label";
    el.innerHTML =
      `<span class="engine-label-name">${p.label}</span>` +
      `<span class="engine-label-detail">${p.detail}</span>`;
    labelLayer.appendChild(el);
    return el;
  });

  // The same information, once, for assistive technology and for no-JS parity.
  const list = document.createElement("ul");
  list.className = "sr-only";
  list.innerHTML = def.parts
    .map((p) => `<li>${p.label}: ${p.detail}</li>`)
    .join("");
  host.appendChild(list);

  const v = new THREE.Vector3();
  const size = { w: 0, h: 0 };
  // Scratch list for the callout de-collision pass, reused every frame so the
  // loop allocates nothing.
  const marks = def.parts.map(() => ({ x: 0, y: 0, on: false }));
  const MIN_GAP = 34;   // px between callout baselines before they read as one

  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    size.w = r.width;
    size.h = r.height;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;

    // Distance is derived from the vertical field of view, so the object frames
    // the same way at every aspect with headroom left for the callouts.
    const f = def.framing(r.width >= 900);
    const half = Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, 1.1, f.fit / (2 * half));

    // On a wide screen the copy owns the left third, so the object sits right
    // of centre. Stacked layouts keep it central and the copy goes above.
    root.position.x = f.x;
    root.position.y = f.y;

    camera.lookAt(f.look, 0, -0.4);
    camera.updateProjectionMatrix();
  }

  function apply(progress) {
    const p = clamp(progress);
    def.pose(root, p);
    const locals = def.place(groups, p);

    // Pass one: project every visible part to screen space.
    for (let i = 0; i < marks.length; i++) {
      const g = groups[def.parts[i].key];
      const m = marks[i];
      // A callout for a part that has not moved yet would sit on the assembled
      // stack with every other callout.
      m.on = !!g && locals[i] >= 0.35;
      if (!m.on) continue;
      g.getWorldPosition(v);
      v.project(camera);
      m.x = (v.x * 0.5 + 0.5) * size.w;
      m.y = (-v.y * 0.5 + 0.5) * size.h;
    }

    // Pass two: separate callouts that land on the same place on screen.
    //
    // Geometry that comes apart cleanly in world space can still project to one
    // spot, at a bad camera angle or on a narrow viewport, and two callouts in
    // the same place are worse than one. Sort by y, find runs that sit in the
    // same column and closer than MIN_GAP, then space each run evenly about its
    // own mean. Spacing about the mean rather than pushing everything down is
    // what stops a long run from marching off the bottom of the stage and away
    // from the parts it is naming.
    const order = [];
    for (let i = 0; i < marks.length; i++) if (marks[i].on) order.push(i);
    order.sort((a, b) => marks[a].y - marks[b].y);

    let runStart = 0;
    const closeRun = (end) => {
      const n = end - runStart;
      if (n < 2) return;
      let sum = 0;
      for (let k = runStart; k < end; k++) sum += marks[order[k]].y;
      const top = sum / n - ((n - 1) * MIN_GAP) / 2;
      for (let k = runStart; k < end; k++) marks[order[k]].y = top + (k - runStart) * MIN_GAP;
    };
    for (let k = 1; k < order.length; k++) {
      const prev = marks[order[k - 1]];
      const cur = marks[order[k]];
      const near = Math.abs(cur.x - prev.x) <= 190 && cur.y - prev.y < MIN_GAP;
      if (!near) {
        closeRun(k);
        runStart = k;
      }
    }
    closeRun(order.length);

    // Pass three: write.
    for (let i = 0; i < labels.length; i++) {
      const el = labels[i];
      if (!el) continue;
      if (!marks[i].on) {
        el.style.opacity = "0";
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.opacity = String(clamp((locals[i] - 0.35) / 0.3));
      el.style.transform =
        `translate3d(${marks[i].x.toFixed(1)}px, ${marks[i].y.toFixed(1)}px, 0)`;
    }

    renderer.render(scene, camera);
  }

  resize();
  let current = reduced ? def.staticAt : 0;
  const ro = new ResizeObserver(() => {
    resize();
    apply(current);
  });
  ro.observe(host);

  let running = false;
  let raf = 0;
  let last = 0;
  const track = host.closest("[data-scene-track]") || host;

  function progressFromTrack() {
    const r = track.getBoundingClientRect();
    const span = r.height - innerHeight;
    if (span <= 0) return 0;
    return clamp(-r.top / span);
  }

  function frame(now) {
    if (!running) return;
    // Clamped, so a backgrounded tab coming back does not travel the whole
    // timeline in one step.
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;

    const target = progressFromTrack();
    const next = current + (target - current) * (1 - Math.exp(-dt / TAU));
    // Only touch the GPU when something actually changed.
    if (Math.abs(next - current) > 0.00008) {
      current = next;
      apply(current);
    }
    raf = requestAnimationFrame(frame);
  }

  if (reduced) {
    // No scrubbing, no loop. One static frame that shows every part.
    apply(def.staticAt);
    host.setAttribute("data-webgl", "static");
  } else {
    apply(0);
    host.setAttribute("data-webgl", "ready");
    // The loop exists only while the section is on screen. No frames burned on
    // a section nobody is looking at.
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "200px 0px" }
    ).observe(track);
  }

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material])
            .forEach((m) => m.dispose());
        }
      });
    },
  };
}

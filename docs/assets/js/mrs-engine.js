/* =============================================================================
   MRS Aircraft — exploded high-bypass turbofan. Home page.

   Geometry only. The renderer, the studio environment, the camera framing, the
   callouts and the damped scroll scrub all live in mrs-scene.js.

   Dimensions are a high-bypass turbofan in metres: 2.5 m fan radius, 4.6 m
   nacelle, 26 fan blades, 30 stator vanes.
   ========================================================================== */

import { mountScrubScene, clamp, ease } from "./mrs-scene.js";

/**
 * Each assembly, in order along the axis. `out` is how far it travels when
 * fully exploded, in metres, positive forward. `at` is the scroll progress it
 * starts moving at, so the engine comes apart front to back rather than all at
 * once.
 *
 * The `at` values plus WINDOW set how much scrolling the teardown costs. They
 * are tuned against the track height in mrs.css: the last part has to finish
 * moving before the section unpins, or the explode reads as unfinished.
 */
const PARTS = [
  { key: "spinner", label: "Spinner", detail: "Machined nose cone", out: 7.2, at: 0.00 },
  { key: "fan", label: "Fan stage", detail: "26 titanium blades", out: 4.9, at: 0.05 },
  { key: "lip", label: "Intake lip", detail: "Formed leading edge", out: 3.1, at: 0.10 },
  { key: "nacelle", label: "Nacelle", detail: "Composite cowling", out: 1.1, at: 0.15 },
  { key: "stators", label: "Stator ring", detail: "30 outlet guide vanes", out: -1.6, at: 0.20 },
  { key: "core", label: "Core", detail: "Compressor and turbine", out: -3.9, at: 0.25 },
  { key: "nozzle", label: "Exhaust nozzle", detail: "Convergent section", out: -6.4, at: 0.30 },
  { key: "plug", label: "Exhaust plug", detail: "Centre body", out: -8.9, at: 0.35 },
];

// How much of the scroll one part spends travelling. Short windows overlapping
// closely is what makes the teardown feel quick without any part snapping.
const WINDOW = 0.44;

// Global scale on the travel distances. Tuned so the fully exploded assembly
// clears the copy column on the left and stays inside the frame on the right.
const SPREAD = 0.72;

function build(THREE, M) {
  const root = new THREE.Group();
  root.name = "MRS_turbofan";
  const groups = {};
  const add = (key) => {
    const g = new THREE.Group();
    g.name = key;
    groups[key] = g;
    root.add(g);
    return g;
  };

  // -- spinner ---------------------------------------------------------------
  const spinner = add("spinner");
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.7, 40), M.gold);
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = 2.35;
  spinner.add(cone);

  // -- fan stage -------------------------------------------------------------
  const fan = add("fan");
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.6, 36), M.navy);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 1.4;
  fan.add(hub);
  const blade = new THREE.BoxGeometry(1.78, 0.075, 0.46);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const b = new THREE.Mesh(blade, M.steel);
    b.position.set(Math.cos(a) * 1.44, Math.sin(a) * 1.44, 1.4);
    b.rotation.z = a;
    b.rotation.x = 0.52;              // stagger angle
    fan.add(b);
  }

  // -- intake lip ------------------------------------------------------------
  const lip = add("lip");
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.2, 20, 72), M.gold);
  ring.position.z = 2.3;
  lip.add(ring);
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.46, 0.5, 64, 1, true), M.skin);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 2.05;
  lip.add(collar);

  // -- nacelle ---------------------------------------------------------------
  const nacelle = add("nacelle");
  const cowl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.24, 4.4, 64, 1, true), M.skin);
  cowl.rotation.x = Math.PI / 2;
  nacelle.add(cowl);
  // Livery band. Geometry, not a decal, so it can never mis-register.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(2.505, 2.34, 0.85, 64, 1, true), M.navy);
  band.rotation.x = Math.PI / 2;
  band.position.z = -1.35;
  nacelle.add(band);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.035, 12, 72), M.gold);
  trim.position.z = -0.9;
  nacelle.add(trim);

  // -- stator ring -----------------------------------------------------------
  const stators = add("stators");
  const vane = new THREE.BoxGeometry(1.05, 0.055, 0.32);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const v = new THREE.Mesh(vane, M.dark);
    v.position.set(Math.cos(a) * 1.76, Math.sin(a) * 1.76, 0.28);
    v.rotation.z = a;
    v.rotation.x = -0.3;
    stators.add(v);
  }
  const shroud = new THREE.Mesh(new THREE.TorusGeometry(2.28, 0.09, 12, 64), M.steel);
  shroud.position.z = 0.28;
  stators.add(shroud);

  // -- core ------------------------------------------------------------------
  const core = add("core");
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 0.95, 3.0, 48, 1, true), M.steel);
  casing.rotation.x = Math.PI / 2;
  casing.position.z = -0.9;
  core.add(casing);
  // Compressor and turbine discs, stepping down along the axis.
  for (let i = 0; i < 7; i++) {
    const r = 1.05 - i * 0.07;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.1, 36), i > 4 ? M.gold : M.dark);
    disc.rotation.x = Math.PI / 2;
    disc.position.z = 0.15 - i * 0.42;
    core.add(disc);
  }
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 4.2, 20), M.dark);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.7;
  core.add(shaft);

  // -- nozzle ----------------------------------------------------------------
  const nozzle = add("nozzle");
  const cone2 = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.12, 1.9, 48, 1, true), M.navy);
  cone2.rotation.x = Math.PI / 2;
  cone2.position.z = -3.1;
  nozzle.add(cone2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.055, 12, 56), M.gold);
  rim.position.z = -4.05;
  nozzle.add(rim);

  // -- exhaust plug ----------------------------------------------------------
  const plug = add("plug");
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.78, 2.1, 32), M.steel);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -4.3;
  plug.add(tail);

  return { root, groups };
}

export function mountEngine(host) {
  return mountScrubScene(host, {
    parts: PARTS,
    staticAt: 0.62,
    build,

    // The engine is roughly 10 m across assembled and spreads to about 18 m
    // exploded.
    framing: (wide) => ({
      fit: wide ? 18 : 22,
      x: wide ? 5.8 : 0,
      y: wide ? 0 : -1.4,
      look: wide ? 3.2 : 0,
    }),

    // Assembled it sits at three quarters, showing the fan face. As it comes
    // apart it turns towards side on, so the parts separate across the screen
    // instead of stacking away from the camera. Turning the object is what
    // makes an exploded view legible; without it you are looking down the axis
    // at eight things in a line.
    pose: (root, p) => {
      root.rotation.y = 0.42 + p * 0.92;
      root.rotation.x = 0.20 - p * 0.08;
    },

    place: (groups, p) =>
      PARTS.map((part, i) => {
        const g = groups[part.key];
        // Each part gets its own window of the scroll, opening at part.at.
        const local = ease(clamp((p - part.at) / WINDOW));
        if (g) {
          g.position.z = part.out * SPREAD * local;
          // A small alternating lift. Keeps the callouts from landing on top of
          // each other without pretending the parts left the centreline.
          g.position.y = (i % 2 ? -1 : 1) * local * 1.35;
        }
        return local;
      }),
  });
}

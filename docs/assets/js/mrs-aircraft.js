/* =============================================================================
   MRS Aircraft — exploded airliner. Investors page.

   Geometry only. The renderer, the studio environment, the camera framing, the
   callouts and the damped scroll scrub all live in mrs-scene.js.

   The third scene on the site, and deliberately the widest one: the engine is
   cylindrical, the wing box is planar, this is the whole aeroplane. It sits on
   the investors page under "where the money goes", because the four things the
   money buys are easier to believe when you can see the object they add up to.

   Dimensions are a narrowbody in metres: 24 m long, 26 m span, 3.8 m fuselage
   diameter. Axes: z runs along the fuselage with the nose at +z, x is span,
   y is up.
   ========================================================================== */

import { mountScrubScene, clamp, ease } from "./mrs-scene.js";

const PARTS = [
  { key: "nose", label: "Radome and flight deck", detail: "Forward pressure bulkhead",
    out: [0, 1.6, 9.5], at: 0.00 },
  { key: "fwd", label: "Forward fuselage", detail: "Frames, stringers, skin",
    out: [0, 3.6, 4.2], at: 0.05 },
  { key: "wing", label: "Wing", detail: "Torsion box and control surfaces",
    out: [0, -5.0, 0.6], at: 0.10 },
  { key: "engines", label: "Powerplant", detail: "Two high-bypass turbofans",
    out: [0, -2.6, 4.4], at: 0.15 },
  { key: "gear", label: "Landing gear", detail: "Nose and main assemblies",
    out: [0, -7.4, -1.2], at: 0.20 },
  { key: "aft", label: "Aft fuselage", detail: "Pressure dome and tail cone",
    out: [0, 0.6, -9.5], at: 0.25 },
  { key: "tail", label: "Empennage", detail: "Fin, rudder and stabilisers",
    out: [0, 4.2, -13.5], at: 0.30 },
];

const WINDOW = 0.44;
const SPREAD = 0.78;

const R = 1.9;             // fuselage radius
const SPAN = 13;           // semi-span

/** A tapered planform panel in the x/z plane, extruded in y. */
function panel(THREE, pts, thickness) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A vertical fin in the y/z plane, extruded across the span. */
function fin(THREE, pts, thickness) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.rotateY(Math.PI / 2);            // extrusion runs across the span
  g.translate(-thickness / 2, 0, 0);
  return g;
}

function build(THREE, M) {
  const root = new THREE.Group();
  root.name = "MRS_airliner";
  const groups = {};
  const add = (key) => {
    const g = new THREE.Group();
    g.name = key;
    groups[key] = g;
    root.add(g);
    return g;
  };

  // -- radome and flight deck ------------------------------------------------
  const nose = add("nose");
  // Ogive rather than a hemisphere: four short cones stepping down, which
  // reads as a nose profile instead of a ball stuck on a tube.
  const prof = [[R, 1.86, 8.9], [1.86, 1.62, 10.0], [1.62, 1.18, 10.8], [1.18, 0.4, 11.35]];
  for (const [r1, r2, z] of prof) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r2, r1, z === 11.35 ? 0.8 : 1.1, 36, 1, true), M.skin);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = z;
    nose.add(seg);
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.6, 36, 1, true), M.skin);
  deck.rotation.x = Math.PI / 2;
  deck.position.z = 8.5;
  nose.add(deck);
  // Flight deck glazing, geometry rather than a texture.
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 1.3), M.dark);
  glass.position.set(0, 0.92, 9.7);
  glass.rotation.x = -0.3;
  nose.add(glass);

  // -- forward fuselage ------------------------------------------------------
  const fwd = add("fwd");
  const fwdBarrel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8.4, 36, 1, true), M.skin);
  fwdBarrel.rotation.x = Math.PI / 2;
  fwdBarrel.position.z = 3.8;
  fwd.add(fwdBarrel);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.62, 36, 1, true), M.navy);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.z = 3.8;
  stripe.position.y = 0;
  fwd.add(stripe);
  // Cabin windows as a dotted line each side, at cabin height.
  for (let i = 0; i < 11; i++) {
    for (const sx of [1, -1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.22), M.dark);
      w.position.set(sx * (R - 0.06), 0.62, 7.3 - i * 0.72);
      fwd.add(w);
    }
  }

  // -- wing ------------------------------------------------------------------
  const wing = add("wing");
  for (const sx of [1, -1]) {
    const half = new THREE.Mesh(
      panel(THREE, [[0, 2.6], [SPAN * sx, -1.2], [SPAN * sx, -2.4], [0, -3.4]], 0.42),
      M.skin);
    half.position.y = -0.9;
    wing.add(half);
    // Leading edge, in the accent, so the wing reads at a glance.
    const le = new THREE.Mesh(
      panel(THREE, [[0, 2.6], [SPAN * sx, -1.2], [SPAN * sx, -1.5], [0, 2.1]], 0.44),
      M.gold);
    le.position.y = -0.91;
    wing.add(le);
    // Winglet.
    const tip = new THREE.Mesh(fin(THREE, [[-1.2, 0], [-1.5, 2.1], [-0.6, 2.1], [0.4, 0]], 0.16), M.navy);
    tip.position.set(SPAN * sx, -0.7, -1.8);
    tip.rotation.z = sx * 0.2;
    wing.add(tip);
  }

  // -- powerplant ------------------------------------------------------------
  const engines = add("engines");
  for (const sx of [1, -1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.86, 3.7, 28, 1, true), M.skin);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(sx * 5.4, -1.9, 1.7);
    engines.add(nacelle);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.1, 12, 36), M.gold);
    lip.position.set(sx * 5.4, -1.9, 3.55);
    engines.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.96, 28), M.dark);
    fan.position.set(sx * 5.4, -1.9, 3.4);
    engines.add(fan);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 1.8), M.steel);
    pylon.position.set(sx * 5.4, -1.25, 1.2);
    engines.add(pylon);
  }

  // -- landing gear ----------------------------------------------------------
  const gear = add("gear");
  const leg = (x, z, len, wheels) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 12), M.steel);
    strut.position.set(x, -R - len / 2 + 0.2, z);
    gear.add(strut);
    for (let i = 0; i < wheels; i++) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.2, 10, 20), M.dark);
      tyre.rotation.y = Math.PI / 2;
      tyre.position.set(x + (wheels > 1 ? (i - 0.5) * 0.62 : 0), -R - len + 0.2, z);
      gear.add(tyre);
    }
  };
  leg(0, 8.2, 1.9, 1);
  leg(3.1, -0.6, 2.3, 2);
  leg(-3.1, -0.6, 2.3, 2);

  // -- aft fuselage ----------------------------------------------------------
  const aft = add("aft");
  const aftBarrel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 7.2, 36, 1, true), M.skin);
  aftBarrel.rotation.x = Math.PI / 2;
  aftBarrel.position.z = -4.0;
  aft.add(aftBarrel);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(R, 0.45, 5.4, 36, 1, true), M.skin);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = -10.3;
  cone.rotation.z = 0;
  aft.add(cone);
  const aftStripe = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.62, 36, 1, true), M.navy);
  aftStripe.rotation.x = Math.PI / 2;
  aftStripe.position.z = -4.0;
  aft.add(aftStripe);

  // -- empennage -------------------------------------------------------------
  const tail = add("tail");
  const vfin = new THREE.Mesh(
    fin(THREE, [[-2.0, 0], [-3.4, 5.2], [-1.1, 5.2], [2.4, 0]], 0.28), M.navy);
  vfin.position.set(0, 1.5, -10.2);
  tail.add(vfin);
  // The mark on the fin: the same geometric chevron as the site favicon.
  const chev = new THREE.Mesh(
    fin(THREE, [[-2.2, 2.2], [-1.5, 4.0], [-0.8, 2.2]], 0.34), M.gold);
  chev.position.set(0, 1.5, -10.2);
  tail.add(chev);
  for (const sx of [1, -1]) {
    const stab = new THREE.Mesh(
      panel(THREE, [[0, 1.1], [5.4 * sx, -1.4], [5.4 * sx, -2.2], [0, -1.9]], 0.26),
      M.skin);
    stab.position.set(0, 1.1, -10.6);
    tail.add(stab);
  }

  return { root, groups };
}

export function mountAircraft(host) {
  return mountScrubScene(host, {
    parts: PARTS,
    staticAt: 0.68,
    build,

    // 26 m of span assembled, opening to about 34 m along the axis. The widest
    // object on the site, so it takes the largest fit of the three scenes.
    framing: (wide) => ({
      fit: wide ? 34 : 42,
      x: wide ? 7.2 : 0,
      y: wide ? 0.4 : -1.6,
      look: wide ? 4.0 : 0,
    }),

    // Assembled it sits three-quarter from the front, the angle an aeroplane
    // is photographed from. As it comes apart it swings towards side on, which
    // is the only view where a fuselage separating along its own axis reads.
    pose: (root, p) => {
      root.rotation.y = -0.58 - p * 0.78;   // three-quarter, opening to side on
      root.rotation.x = 0.18 - p * 0.05;
      root.rotation.z = -0.03 * p;
    },

    place: (groups, p) =>
      PARTS.map((part) => {
        const g = groups[part.key];
        const local = ease(clamp((p - part.at) / WINDOW));
        if (g) {
          g.position.set(
            part.out[0] * SPREAD * local,
            part.out[1] * SPREAD * local,
            part.out[2] * SPREAD * local
          );
        }
        return local;
      }),
  });
}

/* =============================================================================
   MRS Aircraft — exploded wing torsion box. What We Do page.

   Geometry only. The renderer, the studio environment, the camera framing, the
   callouts and the damped scroll scrub all live in mrs-scene.js.

   Dimensions are a half-wing in metres: 9 m semi-span, 3.5 m root chord
   tapering to 1.5 m, 0.6 m root thickness, 9 ribs, 6 spanwise stringers.

   Axes: x runs spanwise, root at -4.5 and tip at +4.5. z is chordwise, with
   the leading edge forward at +z. y is thickness. Everything is built about
   the origin so the group can be turned without drifting off frame.
   ========================================================================== */

import { mountScrubScene, clamp, ease } from "./mrs-scene.js";

/**
 * Assembly order, matching the way the box actually comes apart: skin off
 * first, then the load paths, then what was underneath. `out` is the travel
 * when fully exploded, in metres. `at` is the scroll progress the part starts
 * moving at.
 *
 * Each part leaves along a different vector, which is what keeps eight
 * callouts from piling into the same corner of the screen.
 */
const PARTS = [
  { key: "upper", label: "Upper skin", detail: "Shear panel",
    out: [0, 3.6, 0.3], at: 0.00 },
  { key: "sparF", label: "Front spar", detail: "Main load path",
    out: [0, -1.6, 3.2], at: 0.05 },
  { key: "sparR", label: "Rear spar", detail: "Flap and gear attachment",
    out: [0, -1.9, -3.2], at: 0.10 },
  { key: "ribs", label: "Ribs", detail: "Section and stiffness",
    out: [-2.8, 0.1, 0], at: 0.15 },
  { key: "stringers", label: "Stringers", detail: "Skin stabilisation",
    out: [0, 1.9, 2.5], at: 0.20 },
  { key: "lead", label: "Leading edge", detail: "Formed section",
    out: [0, 0.2, 6.0], at: 0.25 },
  { key: "flap", label: "Trailing edge flap", detail: "High lift device",
    out: [0, 0.1, -6.0], at: 0.30 },
  { key: "tip", label: "Winglet", detail: "Tip device",
    out: [3.6, 2.6, 0], at: 0.35 },
];

// How much of the scroll one part spends travelling, and the global scale on
// the travel distances. Tuned together with the track height in mrs.css: the
// last part has to finish moving before the section unpins.
const WINDOW = 0.44;
const SPREAD = 0.8;

const SPAN = 4.5;          // semi-span, each way from the origin
const ROOT_LE = 1.75;      // chord runs +1.75 to -1.75 at the root
const ROOT_TE = -1.75;
const TIP_LE = 0.95;       // swept and tapered at the tip
const TIP_TE = -0.55;

/**
 * A tapered planform panel. Written in world chord values and negated inside,
 * because ExtrudeGeometry builds in the shape plane and rotateX(-90) maps
 * shape y onto world -z.
 */
function panel(THREE, rootLE, rootTE, tipLE, tipTE, thickness) {
  const s = new THREE.Shape();
  s.moveTo(-SPAN, -rootLE);
  s.lineTo(SPAN, -tipLE);
  s.lineTo(SPAN, -tipTE);
  s.lineTo(-SPAN, -rootTE);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A spar web, tapering in height from root to tip. Shape plane is x by y. */
function web(THREE, rootHalf, tipHalf, thickness) {
  const s = new THREE.Shape();
  s.moveTo(-SPAN, -rootHalf);
  s.lineTo(SPAN, -tipHalf);
  s.lineTo(SPAN, tipHalf);
  s.lineTo(-SPAN, rootHalf);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
}

/** A rib plate with lightening holes, extruded spanwise. */
function rib(THREE, chord, thick, plate) {
  const s = new THREE.Shape();
  const c = chord / 2;
  const t = thick / 2;
  s.moveTo(-c, -t);
  s.lineTo(c, -t);
  s.lineTo(c, t);
  s.lineTo(-c, t);
  s.closePath();

  // Three holes, sized off whichever dimension runs out first, so a narrow
  // outboard rib does not end up as a ring of holes with no material left.
  const n = 3;
  const r = Math.min(t * 0.52, (chord / (n + 1)) * 0.34);
  if (r > 0.05) {
    for (let i = 0; i < n; i++) {
      const cx = -c + chord * ((i + 1) / (n + 1));
      const h = new THREE.Path();
      h.absarc(cx, 0, r, 0, Math.PI * 2, true);
      s.holes.push(h);
    }
  }

  const g = new THREE.ExtrudeGeometry(s, { depth: plate, bevelEnabled: false });
  g.rotateY(Math.PI / 2);          // extrusion runs spanwise
  return g;
}

// Chord and thickness at a spanwise station, 0 at the root and 1 at the tip.
const chordAt = (f) => (ROOT_LE - ROOT_TE) * (1 - f) + (TIP_LE - TIP_TE) * f;
const thickAt = (f) => 0.6 * (1 - f) + 0.26 * f;

function build(THREE, M) {
  const root = new THREE.Group();
  root.name = "MRS_wingbox";
  const groups = {};
  const add = (key) => {
    const g = new THREE.Group();
    g.name = key;
    groups[key] = g;
    root.add(g);
    return g;
  };

  // -- upper skin ------------------------------------------------------------
  const upper = add("upper");
  const upperPanel = new THREE.Mesh(
    panel(THREE, ROOT_LE - 0.1, ROOT_TE + 0.45, TIP_LE - 0.06, TIP_TE + 0.2, 0.05),
    M.skin);
  upperPanel.position.y = 0.24;
  upper.add(upperPanel);
  // Livery stripe along the box, geometry rather than a decal.
  const stripe = new THREE.Mesh(
    panel(THREE, 0.42, 0.16, 0.28, 0.11, 0.052), M.navy);
  stripe.position.y = 0.242;
  upper.add(stripe);

  // -- spars -----------------------------------------------------------------
  // Front and rear, each a web with a flange top and bottom. The flanges are
  // rotated to follow the taper rather than pretending it is not there.
  const spar = (key, z, rootHalf, tipHalf, material) => {
    const g = add(key);
    const w = new THREE.Mesh(web(THREE, rootHalf, tipHalf, 0.05), M.steel);
    w.position.z = z;
    g.add(w);
    const tilt = Math.atan2(rootHalf - tipHalf, SPAN * 2);
    const mean = (rootHalf + tipHalf) / 2;
    for (const sign of [1, -1]) {
      const f = new THREE.Mesh(
        new THREE.BoxGeometry(SPAN * 2, 0.05, 0.34), material);
      f.position.set(0, sign * mean, z + 0.025);
      f.rotation.z = -sign * tilt;
      g.add(f);
    }
    return g;
  };
  spar("sparF", 0.95, 0.3, 0.13, M.gold);
  spar("sparR", -1.05, 0.24, 0.1, M.steel);

  // -- ribs ------------------------------------------------------------------
  const ribs = add("ribs");
  const count = 9;
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const r = new THREE.Mesh(rib(THREE, chordAt(f) * 0.62, thickAt(f) * 0.78, 0.035), M.dark);
    // Sit each rib on the chord line at its station, following the sweep.
    const le = ROOT_LE * (1 - f) + TIP_LE * f;
    const te = ROOT_TE * (1 - f) + TIP_TE * f;
    r.position.set(-SPAN + f * SPAN * 2, 0, (le + te) / 2 - 0.05);
    ribs.add(r);
  }

  // -- stringers -------------------------------------------------------------
  // Six spanwise sections under the upper skin. They taper inboard to outboard
  // with the box, so they are laid out as a fraction of the chord.
  const stringers = add("stringers");
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const zRoot = ROOT_LE - 0.35 - t * 2.1;
    const zTip = TIP_LE - 0.18 - t * 0.95;
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(SPAN * 2, 0.06, 0.13),
      i % 2 ? M.steel : M.dark);
    s.position.set(0, 0.16, (zRoot + zTip) / 2);
    s.rotation.y = Math.atan2(zRoot - zTip, SPAN * 2);
    stringers.add(s);
  }

  // -- leading edge ----------------------------------------------------------
  const lead = add("lead");
  const dnose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.22, SPAN * 2, 22, 1), M.gold);
  dnose.rotation.z = Math.PI / 2;
  dnose.rotation.y = Math.atan2(ROOT_LE - TIP_LE, SPAN * 2);
  dnose.position.z = (ROOT_LE + TIP_LE) / 2;
  lead.add(dnose);

  // -- trailing edge flap ----------------------------------------------------
  const flap = add("flap");
  const flapPanel = new THREE.Mesh(
    panel(THREE, ROOT_TE + 0.62, ROOT_TE, TIP_TE + 0.3, TIP_TE, 0.16), M.navy);
  flapPanel.position.y = -0.08;
  flap.add(flapPanel);
  const trim = new THREE.Mesh(
    panel(THREE, ROOT_TE + 0.08, ROOT_TE, TIP_TE + 0.05, TIP_TE, 0.17), M.gold);
  trim.position.y = -0.085;
  flap.add(trim);

  // -- winglet ---------------------------------------------------------------
  const tip = add("tip");
  const w = new THREE.Shape();
  w.moveTo(TIP_LE, 0);
  w.lineTo(TIP_TE, 0);
  w.lineTo(TIP_TE + 0.42, 1.85);
  w.lineTo(TIP_LE - 0.18, 1.85);
  w.closePath();
  const wg = new THREE.ExtrudeGeometry(w, { depth: 0.09, bevelEnabled: false });
  wg.rotateY(-Math.PI / 2);
  wg.translate(SPAN, 0, 0);
  const winglet = new THREE.Mesh(wg, M.skin);
  winglet.rotation.z = -0.16;        // canted outboard
  tip.add(winglet);
  const wtip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.7), M.gold);
  wtip.position.set(SPAN - 0.28, 1.82, TIP_TE + 0.6);
  wtip.rotation.z = -0.16;
  tip.add(wtip);

  return { root, groups };
}

export function mountAirframe(host) {
  return mountScrubScene(host, {
    parts: PARTS,
    staticAt: 0.66,
    build,

    // 9.5 m of span assembled, opening out to 14 m across and 6 m tall once
    // the panels are off. Framed a little tighter than the engine because the
    // wing is a flatter object and reads as small if it is given the same box.
    framing: (wide) => ({
      fit: wide ? 15 : 20,
      x: wide ? 5.0 : 0,
      y: wide ? 0.2 : -1.2,
      look: wide ? 2.8 : 0,
    }),

    // Starts as a planform, near enough a drawing seen from above. As it comes
    // apart it rolls towards edge on, because the skins separate vertically
    // and a top view would hide every one of them behind the one above.
    pose: (root, p) => {
      root.rotation.y = -0.62 + p * 0.42;
      root.rotation.x = 0.46 - p * 0.30;
      root.rotation.z = 0.05 * p;
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

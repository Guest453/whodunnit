// police.js — procedural police officers + handcuffs for "Whodunnit"
// (see cutscene-contract.md, agent B).
//
//   buildPolice(scene, THREE, opts = {}) -> {
//     group, officers, walkTo, cuff, setPosition, update, dispose
//   }
//
//   opts = { count = 2, entry: [x, z] }
//
// Two or three officers assembled only from THREE primitives plus canvas
// textures. No external assets, no network, no timers: every bit of motion is
// driven by the caller's dt (walkTo/cuff/update). Authoring matches people.js:
// the model looks down +Z with its feet on the group origin (y = 0), so facing
// a horizontal direction (dx, dz) means yaw = Math.atan2(dx, dz).

const NOMINAL = 1.78; // reference head-to-toe height for proportions
const ARRIVE = 0.4; // walkTo "arrived" radius, metres
const WALK_SPEED = 1.35; // metres / second
const CROWD_SPEED = 1.5; // closing speed while ringing a suspect
const TURN_RATE = 7.0; // rad / second while walking
const CUFF_RING_R = 0.85; // radius of the ring around the suspect
const REACH_TIME = 0.9; // seconds to raise arms + bring cuffs in
const SNAP_TIME = 0.5; // seconds to snap the cuffs shut

// ---------------------------------------------------------------------------
// Small random + easing helpers
// ---------------------------------------------------------------------------

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampDt(dt) {
  return Math.max(0, Math.min(Number(dt) || 0, 0.05));
}

function easeInOut(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// Step `cur` toward `goal` by at most `maxStep`, taking the short way around.
function turnToward(cur, goal, maxStep) {
  let diff = goal - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return goal;
  return cur + Math.sign(diff) * maxStep;
}

// ---------------------------------------------------------------------------
// Primitive constructors (same conventions as people.js)
// ---------------------------------------------------------------------------

// Cylinder whose origin sits at its TOP, so it hangs from a shoulder like a bone.
function tube(THREE, rTop, rBottom, len, seg, mat) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, seg);
  geo.translate(0, -len / 2, 0);
  return new THREE.Mesh(geo, mat);
}

function box(THREE, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// ---------------------------------------------------------------------------
// Canvas textures — deliberately avoid getImageData/createImageData so the
// module also runs under the headless document stub used by the build test.
// ---------------------------------------------------------------------------

function fabricTexture(THREE, seed) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const r = makeRng(seed || 1);
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  for (let i = 0; i < size; i += 4) ctx.fillRect(i, 0, 1, size);
  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let i = 0; i < size; i += 4) ctx.fillRect(0, i, size, 1);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 40; i += 1) ctx.fillRect(Math.floor(r() * size), Math.floor(r() * size), 2, 1);
  const tex = new THREE.CanvasTexture(canvas);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Fluorescent hi-vis panel with two retro-reflective bands.
function hivisTexture(THREE) {
  const w = 64;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ccff2b";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f4f8fa";
  ctx.fillRect(0, Math.round(h * 0.28), w, Math.round(h * 0.13));
  ctx.fillRect(0, Math.round(h * 0.59), w, Math.round(h * 0.13));
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < w; i += 5) ctx.fillRect(i, 0, 1, h);
  const tex = new THREE.CanvasTexture(canvas);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials — dark service navy with fluorescent yellow-green hi-vis.
// ---------------------------------------------------------------------------

function makeMaterials(THREE, look) {
  const cloth = fabricTexture(THREE, look.seed);
  const m = (color, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.02 }, extra));
  return {
    jacket: m("#222c3e", { map: cloth }),
    jacketDark: m("#161d2b", { map: cloth }),
    trouser: m("#1a2130", { map: cloth }),
    belt: m("#0d1017", { roughness: 0.5, metalness: 0.25 }),
    boot: m("#0b0d12", { roughness: 0.45, metalness: 0.15 }),
    hivis: m("#ffffff", {
      map: hivisTexture(THREE),
      roughness: 0.55,
      metalness: 0.05,
      emissive: new THREE.Color("#6f8a00"),
      emissiveIntensity: 0.28,
    }),
    metal: m("#ccd5dd", { roughness: 0.3, metalness: 0.85 }),
    skin: m(look.skin, { roughness: 0.62, metalness: 0 }),
    eye: m("#191920", { roughness: 0.25 }),
    brow: m("#2a2016", { roughness: 0.5 }),
    mouth: m("#7a3a38", { roughness: 0.5 }),
  };
}

// ---------------------------------------------------------------------------
// Handcuffs prop — two metal rings joined by a short link, with hinged clasps.
// ---------------------------------------------------------------------------

function buildCuffs(THREE) {
  const group = new THREE.Group();
  group.name = "handcuffs";
  const metal = new THREE.MeshStandardMaterial({ color: "#c8d1d9", metalness: 0.9, roughness: 0.25 });

  const ringGeo = new THREE.TorusGeometry(0.05, 0.011, 6, 18);
  const claspGeo = new THREE.TorusGeometry(0.057, 0.008, 6, 12, Math.PI * 0.9);
  const linkGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6);
  linkGeo.rotateZ(Math.PI / 2);

  const link = new THREE.Mesh(linkGeo, metal);
  group.add(link);

  const rings = [];
  const clasps = [];
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(ringGeo, metal);
    ring.position.x = side * 0.05;
    group.add(ring);
    rings.push(ring);

    const clasp = new THREE.Mesh(claspGeo, metal);
    clasp.position.x = side * 0.05;
    group.add(clasp);
    clasps.push(clasp);
  }

  // t: 1 = fully open (swung apart), 0 = snapped shut.
  function setOpen(t) {
    const open = Math.max(0, Math.min(1, t));
    for (let i = 0; i < 2; i += 1) {
      const dir = i === 0 ? 1 : -1;
      const base = (i === 0 ? -1 : 1) * (0.05 + open * 0.02);
      rings[i].position.x = base;
      clasps[i].position.x = base;
      clasps[i].rotation.z = Math.PI * 0.5 + dir * open * Math.PI * 0.75;
    }
    link.scale.set(1 + open * 0.35, 1, 1 + open * 0.35);
  }
  setOpen(1);

  return { group, setOpen };
}

// ---------------------------------------------------------------------------
// One officer
// ---------------------------------------------------------------------------

function buildOfficer(THREE, index, look, rng) {
  const group = new THREE.Group();
  group.name = `officer-${index}`;

  const M = makeMaterials(THREE, look);
  const s = look.height / NOMINAL;

  // ---- proportions (metres) ----
  const footH = 0.05 * s;
  const footL = 0.26 * s;
  const footW = 0.12 * s;
  const shin = 0.42 * s;
  const thigh = 0.42 * s;
  const legR = 0.07 * s;
  const hipH = 0.14 * s;
  const hipW = 0.32 * s;
  const hipD = 0.2 * s;
  const torsoH = 0.34 * s;
  const torsoW = 0.35 * s;
  const torsoD = 0.24 * s;
  const chestH = 0.16 * s;
  const chestW = 0.43 * s;
  const chestD = 0.26 * s;
  const neckH = 0.06 * s;
  const neckR = 0.055 * s;
  const headW = 0.2 * s;
  const headH = 0.23 * s;
  const headD = 0.21 * s;
  const armR = 0.055 * s;
  const upperArm = 0.3 * s;
  const foreArm = 0.28 * s;

  const yHipBottom = footH + shin + thigh;
  const yHipTop = yHipBottom + hipH;
  const yHeadTop = yHipTop + torsoH + chestH + neckH + headH;

  // ---- legs / boots ----
  const legs = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * (hipW / 2 - legR * 0.6), yHipBottom, 0);
    leg.add(tube(THREE, legR * 1.05, legR * 0.85, thigh, 8, M.trouser));
    const knee = new THREE.Group();
    knee.position.y = -thigh;
    knee.add(tube(THREE, legR * 0.85, legR * 0.7, shin, 8, M.trouser));
    knee.add(box(THREE, footW, footH, footL, M.boot, 0, -shin + footH / 2, footL * 0.18));
    leg.add(knee);
    group.add(leg);
    legs[side < 0 ? "left" : "right"] = leg;
  }

  // ---- hips + duty belt ----
  group.add(box(THREE, hipW, hipH, hipD, M.trouser, 0, yHipBottom + hipH / 2, 0));
  group.add(box(THREE, hipW * 1.04, 0.05 * s, hipD * 1.04, M.belt, 0, yHipTop + 0.005 * s, 0));
  group.add(box(THREE, 0.05 * s, 0.045 * s, 0.012 * s, M.metal, 0, yHipTop + 0.005 * s, hipD * 0.52)); // buckle

  // ---- upper body (pivots at the waist so it can breathe and sway) ----
  const body = new THREE.Group();
  body.position.set(0, yHipTop, 0);
  group.add(body);

  const torso = box(THREE, torsoW, torsoH, torsoD, M.jacket, 0, torsoH / 2, 0);
  body.add(torso);
  const chest = box(THREE, chestW, chestH, chestD, M.jacket, 0, torsoH + chestH / 2, 0);
  body.add(chest);

  // hi-vis vest over the jacket
  const vestH = torsoH * 1.35;
  const vestY = torsoH * 0.68;
  body.add(box(THREE, torsoW * 1.06, vestH, torsoD * 1.08, M.hivis, 0, vestY, 0));
  // jacket opening down the middle of the vest
  body.add(box(THREE, 0.07 * s, vestH * 0.98, 0.014 * s, M.jacketDark, 0, vestY, torsoD * 0.55));

  // dark collar + shoulder epaulettes + silver badge
  body.add(box(THREE, chestW * 0.72, 0.045 * s, chestD * 0.9, M.jacketDark, 0, torsoH + chestH * 0.98, 0));
  for (const side of [-1, 1]) {
    body.add(box(THREE, chestW * 0.24, 0.022 * s, chestD * 0.62, M.jacketDark, side * chestW * 0.36, torsoH + chestH * 1.0, 0));
  }
  body.add(box(THREE, 0.045 * s, 0.05 * s, 0.012 * s, M.metal, -chestW * 0.28, torsoH + chestH * 0.62, chestD * 0.52));
  // shoulder radio
  body.add(box(THREE, 0.03 * s, 0.06 * s, 0.03 * s, M.jacketDark, chestW * 0.5, torsoH + chestH * 0.9, 0));

  const neck = tube(THREE, neckR, neckR * 1.15, neckH, 8, M.skin);
  neck.position.y = torsoH + chestH + neckH;
  body.add(neck);

  // ---- arms (shoulder pivots; hands can swing while walking and reach during cuff) ----
  const arms = {};
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (chestW / 2 + armR * 0.35), torsoH + chestH * 0.88, 0);
    shoulder.rotation.z = -side * 0.1;
    shoulder.add(tube(THREE, armR, armR * 0.9, upperArm, 8, M.jacket));
    // hi-vis band on the sleeve
    const band = tube(THREE, armR * 1.08, armR * 1.08, 0.075 * s, 8, M.hivis);
    band.position.y = -upperArm * 0.62;
    shoulder.add(band);
    const elbow = new THREE.Group();
    elbow.position.y = -upperArm;
    elbow.add(tube(THREE, armR * 0.9, armR * 0.72, foreArm, 8, M.jacket));
    elbow.add(box(THREE, armR * 1.55, armR * 2.2, armR * 1.15, M.skin, 0, -foreArm - armR * 0.6, 0));
    shoulder.add(elbow);
    body.add(shoulder);
    arms[side < 0 ? "left" : "right"] = shoulder;
  }

  // ---- head, stern face and peaked cap ----
  const headPivot = new THREE.Group();
  headPivot.position.y = torsoH + chestH + neckH;
  body.add(headPivot);

  headPivot.add(box(THREE, headW, headH, headD, M.skin, 0, headH / 2, 0));
  const faceZ = headD / 2;
  for (const side of [-1, 1]) {
    headPivot.add(box(THREE, 0.03 * s, 0.02 * s, 0.012 * s, M.eye, side * 0.045 * s, headH * 0.6, faceZ + 0.004 * s));
    const brow = box(THREE, 0.052 * s, 0.012 * s, 0.012 * s, M.brow, side * 0.045 * s, headH * 0.71, faceZ + 0.004 * s);
    brow.rotation.z = -side * 0.2;
    headPivot.add(brow);
  }
  headPivot.add(box(THREE, 0.022 * s, 0.034 * s, 0.03 * s, M.skin, 0, headH * 0.52, faceZ + 0.012 * s)); // nose
  headPivot.add(box(THREE, 0.06 * s, 0.011 * s, 0.014 * s, M.mouth, 0, headH * 0.34, faceZ + 0.004 * s)); // mouth

  // peaked cap: band, flared crown, forward peak, badge
  const capY = headH * 0.9;
  const bandGeo = new THREE.CylinderGeometry(headW * 0.6, headW * 0.63, 0.055 * s, 12);
  const band = new THREE.Mesh(bandGeo, M.jacketDark);
  band.position.y = capY;
  headPivot.add(band);
  const crownGeo = new THREE.CylinderGeometry(headW * 0.78, headW * 0.62, 0.09 * s, 12);
  const crown = new THREE.Mesh(crownGeo, M.jacketDark);
  crown.position.y = capY + 0.07 * s;
  headPivot.add(crown);
  const peak = box(THREE, headW * 0.98, 0.018 * s, headD * 0.52, M.belt, 0, capY - 0.03 * s, headD * 0.5);
  peak.rotation.x = -0.18;
  headPivot.add(peak);
  headPivot.add(box(THREE, 0.045 * s, 0.03 * s, 0.012 * s, M.metal, 0, capY + 0.005 * s, headD * 0.55));

  // ---- animation state ----
  const officer = {
    index,
    group,
    mode: "idle",
    t: 0,
    phase: rng() * 10,
    yaw: 0,
    stride: rng() * Math.PI * 2,
    armReach: 0,
    headYaw: 0,
    headYawTarget: 0,
    nextTurn: 1 + rng() * 3,
    // refs used by the shared update
    body,
    chest,
    hipY: yHipTop,
    s,
    legs,
    armsLeft: arms.left,
    armsRight: arms.right,
    headPivot,
  };
  return officer;
}

// ---------------------------------------------------------------------------
// Shared per-officer animation (breathing + idle sway / walk cycle / cuff pose)
// ---------------------------------------------------------------------------

function updateOfficer(o, d) {
  o.t += d;
  const t = o.t + o.phase;

  // breathing is always on so nobody ever looks frozen
  const breath = Math.sin(t * 1.6) * 0.5 + 0.5;
  o.chest.scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1 + breath * 0.02);
  o.body.position.y = o.hipY + breath * 0.004 * o.s;

  if (o.mode === "walk") {
    o.body.rotation.z = Math.sin(o.stride) * 0.04;
    o.body.rotation.x = 0.06;
    o.body.position.x = 0;
    o.legs.left.rotation.x = Math.sin(o.stride) * 0.5;
    o.legs.right.rotation.x = -Math.sin(o.stride) * 0.5;
    o.armsLeft.rotation.x = -Math.sin(o.stride) * 0.4;
    o.armsRight.rotation.x = Math.sin(o.stride) * 0.4;
    o.armsLeft.rotation.z = -(-1) * 0.1;
    o.armsRight.rotation.z = -(1) * 0.1;
  } else if (o.mode === "cuff") {
    const reach = o.armReach;
    o.body.rotation.z = Math.sin(t * 0.6) * 0.01;
    o.body.rotation.x = 0.04;
    o.body.position.x = 0;
    o.legs.left.rotation.x *= 1 - Math.min(1, d * 6);
    o.legs.right.rotation.x *= 1 - Math.min(1, d * 6);
    o.armsLeft.rotation.x = -reach * 1.15;
    o.armsRight.rotation.x = -reach * 1.15;
    o.armsLeft.rotation.z = -(-1) * (0.1 + reach * 0.32);
    o.armsRight.rotation.z = -(1) * (0.1 + reach * 0.32);
  } else {
    // idle: slow weight shift, drifting arms, settling legs
    o.body.rotation.z = Math.sin(t * 0.5) * 0.022;
    o.body.rotation.x *= 1 - Math.min(1, d * 4);
    o.body.position.x = Math.sin(t * 0.5) * 0.006 * o.s;
    o.legs.left.rotation.x *= 1 - Math.min(1, d * 6);
    o.legs.right.rotation.x *= 1 - Math.min(1, d * 6);
    o.armsLeft.rotation.x = Math.sin(t * 0.6 + 1) * 0.04;
    o.armsRight.rotation.x = Math.sin(t * 0.6) * 0.04;
    o.armsLeft.rotation.z = -(-1) * 0.1;
    o.armsRight.rotation.z = -(1) * 0.1;
  }

  o.armReach = Math.max(0, o.armReach);

  // occasional slow head turn
  if (t > o.nextTurn) {
    o.headYawTarget = (Math.sin(t * 1.7) * 0.5 + 0.5) * 0.7 - 0.35;
    o.nextTurn = t + 2.5 + (0.5 + 0.5 * Math.sin(t * 3.1)) * 4.5;
  }
  o.headYaw += (o.headYawTarget - o.headYaw) * Math.min(1, d * 2.2);
  o.headPivot.rotation.y = o.headYaw;
  o.headPivot.rotation.x = Math.sin(t * 1.1) * 0.02;
}

// ---------------------------------------------------------------------------
// buildPolice
// ---------------------------------------------------------------------------

export function buildPolice(scene, THREE, opts = {}) {
  const options = opts || {};
  const count = Math.max(1, Math.min(4, Math.round(options.count == null ? 2 : options.count)));
  const entry = Array.isArray(options.entry) ? options.entry : [0, 0];

  const group = new THREE.Group();
  group.name = "police";
  if (scene && scene.add) scene.add(group);

  const rng = makeRng(0x9e3779b9 ^ (count * 2654435761));
  const skins = ["#f6d3b0", "#e8b98d", "#d29a6a", "#b07a4c", "#8a5a35"];

  // Two or three slightly different heights, lined up on entry.
  const officers = [];
  for (let i = 0; i < count; i += 1) {
    const look = {
      height: 1.66 + i * 0.055 + rng() * 0.05 + (count > 2 ? 0.01 : 0),
      skin: skins[(i + Math.floor(rng() * 3)) % skins.length],
      seed: 0x51a2 + i * 7919 + Math.floor(rng() * 1000),
    };
    const officer = buildOfficer(THREE, i, look, rng);
    officer.group.position.set((i - (count - 1) / 2) * 0.7, 0, (i % 2) * 0.22 * rng());
    officer.yaw = 0;
    officer.group.rotation.y = 0;
    group.add(officer.group);
    officers.push(officer);
  }

  // ---- handcuffs prop, parked hidden in the group ----
  const cuffs = buildCuffs(THREE);
  cuffs.group.visible = false;
  cuffs.group.position.set(0, 1.1, 0.3);
  group.add(cuffs.group);

  // ---- cuff sequence state ----
  const state = {
    running: false,
    done: false,
    phase: "idle",
    t: 0,
    target: new THREE.Vector3(),
    wrist: new THREE.Vector3(),
    hand: new THREE.Vector3(),
    yaw: 0,
    slots: [],
    closed: 0,
  };

  const tmp = new THREE.Vector3();

  function setPosition(pos) {
    const x = Number(pos && pos[0]) || 0;
    const z = Number(pos && pos[1]) || 0;
    group.position.set(x, 0, z);
  }
  setPosition(entry);

  function update(dt) {
    const d = clampDt(dt);
    for (const o of officers) updateOfficer(o, d);
  }

  function walkTo(target, dt) {
    const d = clampDt(dt);
    const tx = Number(target && target[0]) || 0;
    const tz = Number(target && target[1]) || 0;
    let arrived = true;

    for (const o of officers) {
      const g = o.group;
      const dx = tx - g.position.x;
      const dz = tz - g.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > ARRIVE) {
        arrived = false;
        o.mode = "walk";
        const step = Math.min(dist, WALK_SPEED * d);
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        o.yaw = turnToward(o.yaw, Math.atan2(dx, dz), d * TURN_RATE);
        g.rotation.y = o.yaw;
        o.stride += d * 7.5;
      } else {
        o.mode = "idle";
        if (dist > 1e-4) {
          o.yaw = turnToward(o.yaw, Math.atan2(dx, dz), d * 4);
          g.rotation.y = o.yaw;
        }
      }
      updateOfficer(o, d);
    }
    return arrived;
  }

  function beginCuff(targetGroup) {
    if (targetGroup && targetGroup.getWorldPosition) {
      targetGroup.getWorldPosition(tmp);
    } else {
      const p = (targetGroup && targetGroup.position) || { x: 0, y: 0, z: 0 };
      tmp.set(p.x || 0, p.y || 0, p.z || 0);
    }
    group.updateMatrixWorld(true);
    group.worldToLocal(tmp);
    state.target.copy(tmp);

    const ry = targetGroup && targetGroup.rotation ? Number(targetGroup.rotation.y) || 0 : 0;
    state.yaw = ry;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);
    state.wrist.set(state.target.x + fwdX * 0.22, state.target.y + 1.02, state.target.z + fwdZ * 0.22);

    // Ring the suspect, assigning each officer the nearest free slot.
    const n = officers.length;
    state.slots = [];
    const free = [];
    for (let i = 0; i < n; i += 1) {
      const a = ry + Math.PI * 0.5 + (i / n) * Math.PI * 2;
      free.push(new THREE.Vector3(state.target.x + Math.sin(a) * CUFF_RING_R, 0, state.target.z + Math.cos(a) * CUFF_RING_R));
    }
    for (const o of officers) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < free.length; i += 1) {
        const dd = (free[i].x - o.group.position.x) ** 2 + (free[i].z - o.group.position.z) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      state.slots.push(free.splice(best, 1)[0]);
    }

    state.phase = "ring";
    state.t = 0;
    state.running = true;
    state.done = false;
    state.closed = 0;
    cuffs.group.visible = false;
    for (const o of officers) {
      o.mode = "walk";
      o.armReach = 0;
    }
  }

  function cuff(targetGroup, dt) {
    if (state.done) return true;
    if (!state.running) beginCuff(targetGroup);
    const d = clampDt(dt);
    state.t += d;

    if (state.phase === "ring") {
      let allHere = true;
      for (let i = 0; i < officers.length; i += 1) {
        const o = officers[i];
        const slot = state.slots[i];
        const dx = slot.x - o.group.position.x;
        const dz = slot.z - o.group.position.z;
        const dist = Math.hypot(dx, dz);
        o.mode = "walk";
        if (dist > 0.12) {
          allHere = false;
          const step = Math.min(dist, CROWD_SPEED * d);
          o.group.position.x += (dx / dist) * step;
          o.group.position.z += (dz / dist) * step;
          o.yaw = turnToward(o.yaw, Math.atan2(dx, dz), d * TURN_RATE);
          o.stride += d * 7.5;
        } else {
          const fy = Math.atan2(state.target.x - o.group.position.x, state.target.z - o.group.position.z);
          o.yaw = turnToward(o.yaw, fy, d * 5);
        }
        o.group.rotation.y = o.yaw;
        updateOfficer(o, d);
      }
      if (allHere) {
        // capture the lead officer's hands as the cuffs' starting point
        const lead = officers[0];
        state.hand.set(
          lead.group.position.x + Math.sin(lead.yaw) * 0.32,
          1.12,
          lead.group.position.z + Math.cos(lead.yaw) * 0.32,
        );
        state.phase = "reach";
        state.t = 0;
        cuffs.group.visible = true;
        cuffs.setOpen(1);
        cuffs.group.position.copy(state.hand);
        cuffs.group.rotation.set(0, state.yaw, 0);
        for (const o of officers) o.mode = "cuff";
      }
      return false;
    }

    if (state.phase === "reach") {
      const k = Math.min(1, state.t / REACH_TIME);
      const e = easeInOut(k);
      for (const o of officers) {
        o.mode = "cuff";
        o.armReach = e;
        updateOfficer(o, d);
      }
      cuffs.group.visible = true;
      cuffs.group.position.lerpVectors(state.hand, state.wrist, e);
      cuffs.group.rotation.x = -e * 0.15;
      cuffs.group.rotation.y = state.yaw;
      cuffs.setOpen(1 - e * 0.15);
      state.closed = 1 - e * 0.15;
      if (k >= 1) {
        state.phase = "snap";
        state.t = 0;
      }
      return false;
    }

    if (state.phase === "snap") {
      const k = Math.min(1, state.t / SNAP_TIME);
      const e = easeInOut(k);
      for (const o of officers) {
        o.mode = "cuff";
        o.armReach = 1;
        updateOfficer(o, d);
      }
      cuffs.group.position.copy(state.wrist);
      cuffs.group.position.y = state.wrist.y + Math.sin(k * Math.PI) * 0.02; // little jolt as it clicks
      cuffs.group.rotation.x = -0.15;
      cuffs.group.rotation.y = state.yaw;
      cuffs.setOpen(Math.max(0, 0.85 - e * 0.85));
      if (k >= 1) {
        state.phase = "done";
        state.running = false;
        state.done = true;
        for (const o of officers) {
          o.mode = "idle";
          o.armReach = 0;
        }
        return true;
      }
      return false;
    }

    return false;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    group.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const key of ["map", "normalMap", "alphaMap", "emissiveMap", "roughnessMap", "metalnessMap"]) {
          if (m[key] && m[key].dispose) m[key].dispose();
        }
        if (m.dispose) m.dispose();
      }
    });
  }

  return { group, officers, walkTo, cuff, setPosition, update, dispose };
}

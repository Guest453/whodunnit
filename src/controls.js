// controls.js — first-person walking controls for the whodunnit mansion.
//
// The camera is *driven* by an internal player position (feet on the floor):
// mouse look is delegated to three's PointerLockControls when available, while
// movement and collision live here so the player can never walk through a wall.
// Everything is frame-rate independent through the dt passed to update().
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const EYE_HEIGHT = 1.65;   // camera height above the floor, in metres
const RADIUS = 0.35;       // player collision circle radius
const WALK_SPEED = 3.2;    // m/s
const RUN_SPEED = 5.6;     // m/s while a Shift key is held
const ACCEL = 14;          // how quickly velocity chases its target (1/s)
const BOB_FREQ = 9.5;      // head-bob cycles per metre travelled
const BOB_AMOUNT = 0.035;  // head-bob amplitude, in metres
const MAX_PITCH = Math.PI / 2 - 0.05; // keep the camera from flipping over
const LOOK_SENS = 0.0022;  // fallback mouse sensitivity (rad per pixel)

// Keys that would otherwise scroll the page while we walk.
const MOVE_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createFirstPerson(camera, domElement, colliders, spawn, THREE) {
  // THREE is supplied by the integrator; fall back to a global if omitted.
  const T = THREE || globalThis.THREE;
  if (!T) throw new Error("createFirstPerson: a THREE namespace is required");

  // Keyboard/mouse events live on the canvas's document (a browser necessity).
  const doc = (domElement && domElement.ownerDocument) ||
    (typeof document !== "undefined" ? document : null);

  const solids = Array.isArray(colliders) ? colliders.filter(Boolean) : [];
  const start = (spawn && spawn.position) || [0, 0, 0];
  const startYaw = (spawn && spawn.yaw) || 0;

  // --- player state ---------------------------------------------------------
  // `position` is the feet position and is returned live so the caller can read
  // it; velocity/bob are internal. `next`/`prev` are reused scratch vectors.
  const position = new T.Vector3(start[0], start[1], start[2]);
  const velocity = new T.Vector3();
  const next = new T.Vector3();
  const prev = new T.Vector3();
  const euler = new T.Euler(0, 0, 0, "YXZ");
  let yaw = startYaw;    // radians, around Y
  let pitch = 0;         // radians, around X (fallback look only)
  let bob = 0;           // head-bob phase, advanced by distance travelled

  // --- pointer lock / mouse look -------------------------------------------
  // PointerLockControls only rotates the camera, so we are free to own its
  // position. If the addon is missing or throws, we degrade to keyboard-only
  // movement (plus an optional hand-rolled look while the pointer is locked).
  let controls = null;
  try {
    if (domElement && typeof PointerLockControls === "function") {
      controls = new PointerLockControls(camera, domElement);
    }
  } catch (_) {
    controls = null;
  }

  function onMouseMove(e) {
    if (controls || !doc || doc.pointerLockElement !== domElement) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch = clamp(pitch - e.movementY * LOOK_SENS, -MAX_PITCH, MAX_PITCH);
  }

  // --- keyboard -------------------------------------------------------------
  const keys = Object.create(null);
  function onKeyDown(e) {
    keys[e.code] = true;
    if (MOVE_CODES.has(e.code) && e.preventDefault) e.preventDefault();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
  }

  if (doc) {
    doc.addEventListener("keydown", onKeyDown);
    doc.addEventListener("keyup", onKeyUp);
    if (!controls) doc.addEventListener("mousemove", onMouseMove);
  }

  // Sync our yaw (and pitch) with the camera. With PointerLockControls the
  // addon owns camera rotation during a mousemove; reading it back here keeps
  // the caller-facing `yaw` live every frame.
  function applyLook() {
    if (controls) {
      euler.setFromQuaternion(camera.quaternion);
      yaw = euler.y;
      pitch = euler.x;
    } else {
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
  }

  // Point the camera at the spawn yaw before the very first frame.
  camera.rotation.set(0, startYaw, 0, "YXZ");
  camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);

  // --- collision ------------------------------------------------------------
  // Circle-vs-AABB, resolved one axis at a time: move on X and push out of any
  // wall we ended up inside, then repeat for Z. Treating the player as a point
  // against a radius-inflated box ("Minkowski sum") keeps the maths trivial,
  // and resolving the axes separately is what makes sliding along a wall feel
  // smooth instead of sticking.
  function resolveAxis(axis, moved) {
    for (let i = 0; i < solids.length; i++) {
      const c = solids[i];
      const minX = c.minX - RADIUS, maxX = c.maxX + RADIUS;
      const minZ = c.minZ - RADIUS, maxZ = c.maxZ + RADIUS;
      // Outside the inflated box on any side -> no overlap.
      if (moved.x <= minX || moved.x >= maxX) continue;
      if (moved.z <= minZ || moved.z >= maxZ) continue;
      // Overlapping: push back to the face we entered through, chosen from
      // where we were before the move so we never tunnel to the far side.
      if (axis === "x") {
        moved.x = prev.x <= (c.minX + c.maxX) * 0.5 ? minX : maxX;
      } else {
        moved.z = prev.z <= (c.minZ + c.maxZ) * 0.5 ? minZ : maxZ;
      }
    }
  }

  // --- per-frame movement ---------------------------------------------------
  function update(dt) {
    if (!(dt > 0)) return;             // ignore pauses / bad timestamps
    dt = Math.min(dt, 0.05);           // clamp tab-switch style spikes

    // Desired direction from WASD + arrows, expressed in the yaw frame.
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let dx = -sin * f + cos * s;
    let dz = -cos * f - sin * s;
    const len = Math.hypot(dx, dz);
    const speed = keys.ShiftLeft || keys.ShiftRight ? RUN_SPEED : WALK_SPEED;
    if (len > 0) { dx = (dx / len) * speed; dz = (dz / len) * speed; }

    // Frame-rate independent ease towards the target velocity: on a big frame
    // step we move almost the whole way, on a small one only a little.
    const k = 1 - Math.exp(-ACCEL * dt);
    velocity.x += (dx - velocity.x) * k;
    velocity.z += (dz - velocity.z) * k;

    // --- move + collide, X then Z ---
    prev.copy(position);
    next.set(position.x + velocity.x * dt, position.y, position.z);
    resolveAxis("x", next);
    position.x = next.x;

    next.set(position.x, position.y, position.z + velocity.z * dt);
    resolveAxis("z", next);
    position.z = next.z;

    // --- camera placement + light head-bob ---
    const moved = Math.hypot(position.x - prev.x, position.z - prev.z);
    const bobSpeed = Math.min(moved / Math.max(dt * WALK_SPEED, 1e-4), 1);
    bob += moved * BOB_FREQ;
    const bobY = Math.sin(bob) * BOB_AMOUNT * bobSpeed;

    applyLook(); // pick up the addon's rotation and expose the new yaw
    camera.position.set(position.x, position.y + EYE_HEIGHT + bobY, position.z);
  }

  // --- pointer lock ---------------------------------------------------------
  function lock() {
    if (controls && controls.lock) {
      try { controls.lock(); } catch (_) { /* unsupported: keyboard still works */ }
      return;
    }
    if (domElement && domElement.requestPointerLock) domElement.requestPointerLock();
  }

  function isLocked() {
    if (controls) {
      try { return !!controls.isLocked; } catch (_) { /* fall through */ }
    }
    return !!(doc && doc.pointerLockElement === domElement);
  }

  function dispose() {
    if (doc) {
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      doc.removeEventListener("mousemove", onMouseMove);
    }
    if (controls && controls.dispose) {
      try { controls.dispose(); } catch (_) { /* ignore */ }
    }
    controls = null;
    if (doc && doc.exitPointerLock && doc.pointerLockElement === domElement) {
      doc.exitPointerLock();
    }
  }

  // `position` is a shared Vector3; `yaw` is exposed through a getter so the
  // caller always reads the current heading rather than a stale snapshot.
  const api = { update, lock, isLocked, position, dispose };
  Object.defineProperty(api, "yaw", { get: () => yaw, enumerable: true });
  return api;
}

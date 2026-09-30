// cutscene.js — camera-directed capture / reveal sequence (see cutscene-contract.md).
//
//   playCutscene(config) -> { update(dt), skip(), done }
//
// config = { scene, camera, THREE, culprit, police, kind: "win" | "lose",
//            victimName, sceneRoom, onEvent(name), duration }
//
// `culprit` is a suspect controller from people.js: { group, face(yaw),
// setTalking(on), update(dt) }. `police` is from police.js:
// { group, officers, walkTo([x,z], dt), cuff(group, dt), update(dt) }.
//
// This module ONLY drives the camera, the police controller and the culprit
// controller. There is no DOM here and no alert(): events are reported through
// config.onEvent so the integrator can show its own overlay.
//
// Timeline (all numbers in seconds; see `scaled()` for retiming):
//
//   WIN                                                       events
//   ───────────────────────────────────────────────────────── ──────────
//   0  ESTABLISH   1.2s  ease out to a wide shot of the room
//   1  APPROACH    2.0s  police stride in toward the culprit    "arrive"
//   2  CUFF        1.2s  officers surround + close cuffs        "cuffed"
//   3  SLUMP       0.8s  culprit sinks, hangs their head
//   4  ORBIT       2.6s  camera sweeps one full circle
//   5  HERO        0.6s  settle on the closing hero shot        "done"
//                      total ≈ 8.4s
//
//   LOSE
//   ───────────────────────────────────────────────────────── ──────────
//   0  ESTABLISH   1.4s  camera turns to the true killer
//   1  HOLD        1.6s  a slow push-in on the killer           "done"
//                      total ≈ 3.0s
//
// Pass `duration` to linearly retime the whole thing (win aims 7-9s).

export function playCutscene(config) {
  const {
    scene,
    camera,
    THREE,
    culprit,
    police,
    kind = "win",
    victimName,
    sceneRoom,
    onEvent,
    duration,
  } = config || {};

  const isWin = kind !== "lose";

  // Controller accessors — every optional guard keeps this module runnable even
  // when police.js / a suspect method is missing (e.g. in a headless test).
  const culpritGroup = (culprit && culprit.group) || null;
  const policeApi = police || null;
  const call = (obj, name, ...args) => {
    if (obj && typeof obj[name] === "function") return obj[name](...args);
    return undefined;
  };

  // ---- base durations, scaled by config.duration --------------------------
  const BASE_WIN = { establish: 1.2, approach: 2.0, cuff: 1.2, slump: 0.8, orbit: 2.6, hero: 0.6 };
  const BASE_LOSE = { establish: 1.4, hold: 1.6 };
  const BASE = isWin
    ? BASE_WIN.establish + BASE_WIN.approach + BASE_WIN.cuff + BASE_WIN.slump + BASE_WIN.orbit + BASE_WIN.hero
    : BASE_LOSE.establish + BASE_LOSE.hold;
  const scale = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) / BASE : 1;
  const scaled = (b) => Math.max(0.15, b * scale);
  const T = isWin
    ? {
        establish: scaled(BASE_WIN.establish),
        approach: scaled(BASE_WIN.approach),
        cuff: scaled(BASE_WIN.cuff),
        slump: scaled(BASE_WIN.slump),
        orbit: scaled(BASE_WIN.orbit),
        hero: scaled(BASE_WIN.hero),
      }
    : { establish: scaled(BASE_LOSE.establish), hold: scaled(BASE_LOSE.hold) };

  // ---- small helpers ------------------------------------------------------
  const clampDt = (dt) => Math.max(0, Math.min(Number(dt) || 0, 0.05));
  // Frame-rate independent exponential ease: lerp `from` toward `to` by dt.
  const ease = (dt, k) => 1 - Math.exp(-k * dt);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  const culpritPos = () => {
    if (culpritGroup && culpritGroup.position) return tmpA.copy(culpritGroup.position);
    return tmpA.set(0, 0, 0);
  };
  // Fire a named event exactly once, in order, for the current kind.
  const fired = Object.create(null);
  function fire(name) {
    if (fired[name]) return;
    fired[name] = true;
    if (typeof onEvent === "function") onEvent(name);
  }
  const sequence = isWin ? ["arrive", "cuffed", "done"] : ["done"];

  // Look target, lerped so the camera never snaps. Seeded from where the
  // camera is already aimed so the first frame is continuous.
  const look = new THREE.Vector3();
  {
    const dir = new THREE.Vector3();
    if (typeof camera.getWorldDirection === "function") camera.getWorldDirection(dir);
    else dir.set(0, 0, -1);
    look.copy(camera.position).addScaledVector(dir, 4);
  }
  function aimAt(dest, dt, k) {
    look.lerp(dest, dt === null ? 1 : ease(dt, k));
    camera.lookAt(look);
  }
  function moveTo(dest, dt, k) {
    if (dt === null) camera.position.copy(dest);
    else camera.position.lerp(dest, ease(dt, k));
  }

  // Camera framings, computed from the culprit's position.
  const HEAD = () => tmpB.copy(culpritPos()).addScaledVector(UP, 1.15).clone();
  const UP = new THREE.Vector3(0, 1, 0);

  const startAngle = Math.atan2(
    camera.position.x - culpritPos().x,
    camera.position.z - culpritPos().z
  );
  const HERO_R = 2.3;
  const heroPos = new THREE.Vector3(
    culpritPos().x + Math.sin(startAngle) * HERO_R,
    culpritPos().y + 1.55,
    culpritPos().z + Math.cos(startAngle) * HERO_R
  );
  const establishPos = new THREE.Vector3(
    culpritPos().x + Math.sin(startAngle) * 4.6,
    culpritPos().y + 2.3,
    culpritPos().z + Math.cos(startAngle) * 5.0
  );
  const loseFramePos = new THREE.Vector3(
    culpritPos().x + Math.sin(startAngle) * 3.0,
    culpritPos().y + 1.7,
    culpritPos().z + Math.cos(startAngle) * 3.2
  );
  const losePushPos = new THREE.Vector3(
    culpritPos().x + Math.sin(startAngle) * 1.9,
    culpritPos().y + 1.5,
    culpritPos().z + Math.cos(startAngle) * 2.0
  );

  // Slump state (culprit sinks forward and hangs their head). Applied to the
  // controller's group so we never touch anything it owns internally.
  let slumpBaseY = 0;
  let slumpTarget = 0; // 0..1 eased
  function applySlump(k) {
    if (!culpritGroup) return;
    if (!culpritGroup.rotation) return;
    culpritGroup.rotation.x = 0.3 * k;
    culpritGroup.position.y = slumpBaseY - 0.07 * k;
  }
  function snapSlump() {
    slumpTarget = 1;
    applySlump(1);
  }

  // ---- done handshake -----------------------------------------------------
  const api = { done: false, update, skip };

  // ---- state machine ------------------------------------------------------
  let state = 0;
  let stateT = 0;
  const advance = () => {
    stateT = 0;
    state += 1;
  };

  function updateWin(dt) {
    switch (state) {
      // 0 — ESTABLISH: ease out to a wide shot of the room.
      case 0: {
        stateT += dt;
        moveTo(establishPos, dt, 2.4);
        aimAt(HEAD(), dt, 3.0);
        if (stateT >= T.establish) advance();
        break;
      }
      // 1 — APPROACH: police stride in toward the culprit.
      case 1: {
        stateT += dt;
        const target = culpritPos();
        const arrived = policeApi
          ? policeApi.walkTo([target.x, target.z], dt) === true
          : true;
        // Keep the camera drifting slightly ahead of the officers.
        moveTo(establishPos, dt, 1.6);
        aimAt(HEAD(), dt, 3.0);
        if (arrived || stateT >= T.approach) {
          fire("arrive"); // officers have reached the culprit
          advance();
        }
        break;
      }
      // 2 — CUFF: officers surround and close the cuffs.
      case 2: {
        stateT += dt;
        const cuffed = policeApi ? policeApi.cuff(culpritGroup, dt) === true : true;
        aimAt(HEAD(), dt, 3.0);
        if (cuffed || stateT >= T.cuff) {
          fire("cuffed"); // the cuffs close
          slumpBaseY = culpritGroup && culpritGroup.position ? culpritGroup.position.y : 0;
          call(culprit, "setTalking", false);
          advance();
        }
        break;
      }
      // 3 — SLUMP: the culprit sinks and hangs their head.
      case 3: {
        stateT += dt;
        slumpTarget = Math.min(1, slumpTarget + dt / Math.max(0.001, T.slump));
        applySlump(slumpTarget);
        moveTo(heroPos, dt, 1.1);
        aimAt(HEAD(), dt, 3.0);
        if (stateT >= T.slump) advance();
        break;
      }
      // 4 — ORBIT: sweep one full circle around them, easing in to the hero.
      case 4: {
        stateT += dt;
        const p = Math.min(1, stateT / T.orbit);
        const ang = startAngle + p * Math.PI * 2;
        const radius = 3.8 + (HERO_R - 3.8) * p;
        const height = 2.4 + (1.55 - 2.4) * p;
        camera.position.set(
          culpritPos().x + Math.sin(ang) * radius,
          culpritPos().y + height,
          culpritPos().z + Math.cos(ang) * radius
        );
        aimAt(HEAD(), dt, 3.5);
        if (p >= 1) advance();
        break;
      }
      // 5 — HERO: settle on the closing shot.
      case 5: {
        stateT += dt;
        moveTo(heroPos, dt, 2.6);
        aimAt(HEAD(), dt, 3.5);
        if (stateT >= T.hero) {
          fire("done");
          api.done = true;
        }
        break;
      }
      default:
        api.done = true;
    }
  }

  function updateLose(dt) {
    switch (state) {
      // 0 — ESTABLISH: turn to the true killer and hold on them.
      case 0: {
        stateT += dt;
        moveTo(loseFramePos, dt, 2.2);
        aimAt(HEAD(), dt, 3.0);
        if (stateT >= T.establish) advance();
        break;
      }
      // 1 — HOLD: slow push-in; the killer is never cuffed.
      case 1: {
        stateT += dt;
        const p = Math.min(1, stateT / T.hold);
        tmpA.copy(loseFramePos).lerp(losePushPos, p);
        camera.position.copy(tmpA);
        aimAt(HEAD(), dt, 3.5);
        if (p >= 1) {
          fire("done");
          api.done = true;
        }
        break;
      }
      default:
        api.done = true;
    }
  }

  function update(dtRaw) {
    if (api.done) return;
    const dt = clampDt(dtRaw);

    // Keep the extras breathing — the controllers own their internal motion.
    call(culprit, "update", dt);
    call(police, "update", dt);

    if (isWin) updateWin(dt);
    else updateLose(dt);
  }

  // skip() jumps straight to the final state and fires any remaining events
  // exactly once, in order.
  function skip() {
    if (isWin) {
      snapSlump();
      moveTo(heroPos, null);
      aimAt(HEAD(), null);
    } else {
      moveTo(losePushPos, null);
      aimAt(HEAD(), null);
    }
    for (const name of sequence) fire(name);
    api.done = true;
  }

  // Silence intentional-unused destructured inputs (documented for the API).
  void scene;
  void victimName;
  void sceneRoom;

  return api;
}

# Cutscene + multi-map contract (frozen)

Adding a capture cutscene and multiple houses. Each agent owns ONE file. Do not
edit other files. Everything is procedural Three.js — no external assets.

```
src/maps.js      agent A   MAPS (3 layouts) + palette per map
src/env.js       agent A   buildEnvironment(scene, THREE, map) — now map-driven
src/police.js    agent B   buildPolice(scene, THREE, opts)
src/cutscene.js  agent C   playCutscene(config)
src/ending.js    agent D   createEnding(handlers) + the overlay markup/CSS
src/main.js      integrator (not an agent task)
index.html       integrator (not an agent task; agent D may add its own panel markup inside a <template>)
```

---

## maps.js (agent A)

```js
export const ROOMS = ["foyer", "library", "study", "conservatory", "cellar"];

export const MAPS = [
  {
    id: "manor", name: "Ashcroft Manor",
    palette: { floor: 0x3a2c22, wall: 0x241b15, ceiling: 0x140f0b, accent: 0x6b4a2f, fog: 0x0b0907 },
    rooms: {
      foyer:        { center: [x, z], size: [w, d] },
      library:      { center: [x, z], size: [w, d] },
      study:        { center: [x, z], size: [w, d] },
      conservatory: { center: [x, z], size: [w, d] },
      cellar:       { center: [x, z], size: [w, d] },
    },
  },
  /* two more maps with DIFFERENT arrangements and palettes */
];
```

Rules for every map: exactly the five ROOMS; **rectangles that do not overlap**;
every room at least 7 x 7; the rooms touch/abut so walls can carry doorways
between neighbours; `spawn` is the foyer centre-ish. Three clearly different
shapes (e.g. a central hall with wings, a linear row, a cross/plus).

## env.js (agent A)

```js
export function buildEnvironment(scene, THREE, map = MAPS[0]) {
  return { rooms, anchors, colliders, spawn, palette, update(dt), dispose() };
}
```
Same returned shape as today (`rooms`, `anchors`, `colliders`, `spawn`,
`update`, `dispose`) plus `palette`. Geometry and lighting use `map.palette`.
Doorways must join adjacent rooms so the whole house is walkable. `anchors` is
one standing spot + `facing` yaw per room, inside the room, clear of walls.
`colliders` are wall AABBs. Callers pass no `map` today, so default to `MAPS[0]`.

## police.js (agent B)

```js
export function buildPolice(scene, THREE, opts = {}) {
  // opts = { count = 2, entry: [x, z] }
  return {
    group,                       // THREE.Group in the scene
    officers,                    // [{ group }]
    walkTo(target, dt),          // move each officer toward [x, z]; returns true when arrived
    cuff(targetGroup, dt),       // play the handcuff animation on the target; true when done
    setPosition([x, z]),
    update(dt),
    dispose(),
  };
}
```
Two or three procedural officers in dark uniforms with caps and hi-vis trim
(clearly *police*, not suspects), plus a handcuffs prop. `walkTo` and `cuff`
are **incremental** (driven by the caller's `dt`) and return a boolean when the
step has finished, so the cutscene can sequence them.

## cutscene.js (agent C)

```js
export function playCutscene(config) {
  // config = { scene, camera, THREE, culprit, police, kind: "win" | "lose",
  //            victimName, sceneRoom, onEvent(name), duration }
  return { update(dt), skip(), done };
}
```
A camera-directed sequence. `win`: police stride in, surround the culprit, cuff
them, the culprit slumps, camera orbits and settles; fires `onEvent` in order:
`"arrive"` → `"cuffed"` → `"done"`. `lose`: the camera turns to the real killer,
who is not cuffed, then `onEvent("done")`. It only drives the camera + police +
the culprit controller's existing methods (`face`, `setTalking`, `update`);
it renders **no DOM**. `update(dt)` advances the timeline; `skip()` jumps to the
end and fires the remaining events. `done` becomes true at the end.

## ending.js (agent D)

```js
export function createEnding({ onRetry, onRetrySameMap, onEvent }) {
  return { show(result), hide() };
  // result = { kind: "win" | "lose", culpritName, victimName, scene, officerCount }
}
```
The DOM overlay: a "CASE CLOSED" win screen (culprit named, a handcuffed figure
or seal graphic, a sentence) and a "WRONG" lose screen (reveals the true killer).
Both offer **"Play again in a new house"** (calls `onRetry`) and a quieter
"same house" link (`onRetrySameMap`). It must create its own markup in JS (or
use hooks added to index.html) and be styled to match the existing theme
(gold on near-black, the same `--ease` feel). Keyboard: Enter = retry.

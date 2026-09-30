# Whodunnit 3D — frozen architecture

The build is **one page** (`index.html`) + **one bundle** (`dist/bundle.js`), built
with esbuild from `src/`. `three` comes from npm. No external asset downloads at
runtime: all geometry is procedural and all textures are generated on a canvas.

```
src/
  contract.md      <- this file (frozen interfaces; do not change)
  env.js           agent 1  buildEnvironment(scene, THREE)
  people.js        agent 2  buildSuspects(suspects, anchors, THREE)
  controls.js      agent 3  createFirstPerson(camera, domElement, colliders, spawn, THREE)
  decor.js         agent 4  buildDecor(scene, THREE, rooms) + makeTextSprite(text, THREE, opts)
  case.js          existing  generateCase(seed) etc. (pure; unchanged)
  main.js          integrator (not an agent task)
index.html         HUD + canvas host (not an agent task)
```

Rules for every module: ES module, `import * as THREE from "three"` (or use the
passed-in `THREE`), no DOM access except the canvas the caller owns, no network,
no timers except inside the returned `update(dt)`. Every module must pass
`node --check src/<file>.js`. Prefer simple, readable code.

---

## env.js

```js
export const ROOMS = ["foyer", "library", "study", "conservatory", "cellar"];

export function buildEnvironment(scene, THREE) {
  return {
    rooms,        // Record<name, { center: [x, z], size: [w, d] }>
    anchors,      // Record<name, { position: [x, y, z], facing: number }>  y = floor level
    colliders,    // Array<{ minX, maxX, minZ, maxZ }>  (walls + big furniture)
    spawn: { position: [x, y, z], yaw: number },
    update(dt),   // flicker lights, dust, etc.
    dispose(),
  };
}
```

A mansion interior: a floor, outer walls, interior walls forming the five named
rooms with doorways between them, a ceiling or open sky, and lighting
(hemisphere + a few point lights with soft shadows). Grid is on the XZ plane,
Y is up, floor at y = 0. Rooms should be reachable on foot (no sealed rooms).

## people.js

```js
export function buildSuspects(suspects, anchors, THREE) {
  // suspects: [{ id, name, role, voice }]     (5 items)
  // anchors:  [{ position:[x,y,z], facing }]  (same length, same order)
  return [{
    id, group,                    // group is a THREE.Group added to the scene by the caller
    speak(text),                  // show a speech bubble above the head; auto-hides
    setTalking(on),               // subtle talking animation
    face(yaw),                    // turn to face a yaw
    update(dt),
    dispose(),
  }];
}
```

Procedural humanoids built only from `THREE` primitives, but *good*: torso,
hips, arms, legs, neck, head, hair, and a simple face (eyes/mouth as small meshes
or a canvas texture). Each suspect must be visually distinct: skin tone, hair
colour, and an outfit palette derived from the suspect `id`/index. Vary height
slightly. Idle animation: gentle breathing, weight shift, occasional head turn.
`setTalking(on)` moves the jaw/head a little. **Every mesh in `group` must set
`userData.suspectId = suspect.id`** so the integrator can raycast a click.
The speech bubble must be a `THREE.Sprite` that always faces the camera and can
be raised/lowered without leaving the screen.

## controls.js

```js
export function createFirstPerson(camera, domElement, colliders, spawn, THREE) {
  return {
    update(dt),
    lock(),                       // request pointer lock
    isLocked(),
    position,                     // THREE.Vector3 (caller may read)
    yaw,                          // number (radians)
    dispose(),
  };
}
```

First-person: WASD + arrow keys to move, mouse to look (use
`three/addons/controls/PointerLockControls.js`), eye height ~1.65 m. Collision is
a simple circle-vs-AABB test against `colliders`; the player never walks through a
wall. `spawn.position` is `[x, y, z]`, `spawn.yaw` is the start rotation. Motion
is frame-rate independent (`update(dt)`).

## decor.js

```js
export function makeTextSprite(text, THREE, opts) // -> THREE.Sprite (readable label)
export function buildDecor(scene, THREE, rooms) {
  return { update(dt), dispose(), evidence: { position: [x, y, z] } };
}
```

Furniture and props that sell the mansion: tables, chairs, bookshelves, a
chandelier, a rug, candles, plants, a piano; and a marked "scene of the crime" on
a rug in one room (the `evidence` position). All textures are drawn on a canvas.
`makeTextSprite` is reused by `people.js` for labels if wanted; it must work with
only a string and `THREE`.

---

## Integration (main.js — not an agent task)

1. `generateCase(seed)` from `case.js` gives the victim, five suspects, the room
   they are found in, and which suspect is the culprit (never shown).
2. `buildEnvironment` builds the world; `buildDecor` dresses it; `buildSuspects`
   places the five suspects at five room anchors.
3. `createFirstPerson` walks the player around. Looking at a suspect shows a
   prompt; `E` or click opens the interview panel.
4. Interviewing calls the Pollinations API (chat completions, JSON reply) and
   speaks the reply with TTS; the answer appears in the panel and as a 3D bubble.
5. The notebook records every claim; when the witness's sighting and the culprit's
   alibi are both on record, it flags the contradiction. The player can accuse.

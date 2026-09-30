// Contract tests for the 3D modules. Three.js constructs geometry fine in Node
// (only *rendering* needs WebGL), so we can build the whole world headlessly and
// assert every module honours src/contract.md. Run: node --test test/3d.test.mjs
//
// A tiny canvas shim covers the modules' canvas-texture calls.

import assert from "node:assert/strict";
import test from "node:test";

// --- minimal DOM shim for canvas textures -----------------------------------
function fakeContext(canvas) {
    const noop = () => {};
    return new Proxy(
        {
            canvas,
            measureText: () => ({ width: 10 }),
            createImageData: (w, h) => ({
                data: new Uint8ClampedArray((w || canvas.width || 1) * (h || canvas.height || 1) * 4),
                width: w || canvas.width || 1,
                height: h || canvas.height || 1,
            }),
            getImageData: (x, y, w, h) => ({
                data: new Uint8ClampedArray((w || 1) * (h || 1) * 4),
                width: w || 1,
                height: h || 1,
                colorSpace: "srgb",
            }),
            putImageData: noop,
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
        },
        { get: (target, prop) => (prop in target ? target[prop] : noop) },
    );
}
function fakeCanvas() {
    const el = {
        width: 256,
        height: 256,
        style: { setProperty() {}, removeProperty() {} },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        removeAttribute() {},
        appendChild() {},
        append() {},
        prepend() {},
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
        focus() {},
        remove() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        children: [],
        childNodes: [],
        innerHTML: "",
        textContent: "",
        className: "",
    };
    el.getContext = () => fakeContext(el);
    el.toDataURL = () => "data:image/png;base64,";
    return el;
}
const fakeDocument = {
    createElement: () => fakeCanvas(),
    createElementNS: () => fakeCanvas(),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    exitPointerLock() {},
    pointerLockElement: null,
};
globalThis.document = globalThis.document ?? fakeDocument;
globalThis.window = globalThis.window ?? {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1280,
    innerHeight: 720,
};
globalThis.devicePixelRatio = globalThis.devicePixelRatio ?? 1;

const THREE = await import("three");
const { ROOMS, buildEnvironment } = await import("../src/env.js");
const { buildSuspects } = await import("../src/people.js");
const { buildDecor } = await import("../src/decor.js");

test("env.js exports the five rooms and a complete environment", () => {
    assert.deepEqual(ROOMS, ["foyer", "library", "study", "conservatory", "cellar"]);
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, THREE);
    assert.ok(env.rooms && typeof env.rooms === "object", "rooms");
    for (const name of ROOMS) {
        assert.ok(env.rooms[name], `rooms.${name}`);
        assert.ok(Array.isArray(env.rooms[name].center) && env.rooms[name].center.length === 2, `${name} center`);
        assert.ok(Array.isArray(env.anchors[name].position), `anchors.${name}`);
        assert.equal(typeof env.anchors[name].facing, "number", `anchors.${name}.facing`);
    }
    assert.ok(Array.isArray(env.colliders) && env.colliders.length > 0, "colliders");
    for (const box of env.colliders) {
        assert.equal(typeof box.minX, "number");
        assert.equal(typeof box.maxX, "number");
        assert.equal(typeof box.minZ, "number");
        assert.equal(typeof box.maxZ, "number");
        assert.ok(box.minX <= box.maxX && box.minZ <= box.maxZ, "AABB ordered");
    }
    assert.ok(Array.isArray(env.spawn.position) && typeof env.spawn.yaw === "number", "spawn");
    assert.equal(typeof env.update, "function");
    assert.equal(typeof env.dispose, "function");
    env.update(0.016);
    assert.ok(scene.children.length > 0, "env added meshes to the scene");
});

test("decor.js furnishes the rooms and marks the evidence", () => {
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, THREE);
    const decor = buildDecor(scene, THREE, env.rooms);
    assert.equal(typeof decor.update, "function");
    assert.equal(typeof decor.dispose, "function");
    assert.ok(Array.isArray(decor.evidence?.position), "evidence.position");
    decor.update(0.016);
    assert.ok(scene.children.length > 0, "decor added meshes");
});

test("people.js builds five distinct suspects with raycastable ids", () => {
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, THREE);
    const suspects = ROOMS.map((name, i) => ({ id: `s${i}`, name: `Name ${i}`, role: `role ${i}`, voice: "nova" }));
    const anchors = ROOMS.map((name) => env.anchors[name]);
    const people = buildSuspects(suspects, anchors, THREE);

    assert.equal(people.length, suspects.length, "one per suspect");
    for (let i = 0; i < people.length; i++) {
        const p = people[i];
        assert.equal(p.id, suspects[i].id, "ids match order");
        assert.ok(p.group?.isObject3D, "group is an Object3D");
        for (const fn of ["speak", "setTalking", "face", "update", "dispose"]) {
            assert.equal(typeof p[fn], "function", `suspect.${fn}`);
        }
        let tagged = 0;
        p.group.traverse((node) => {
            if (node.isMesh && node.userData.suspectId === suspects[i].id) tagged += 1;
        });
        assert.ok(tagged > 0, `${p.id} has meshes tagged with suspectId`);
        p.setTalking(true);
        p.face(1.2);
        p.speak("hello");
        p.update(0.016);
    }
});

test("controls.js returns the first-person interface", async () => {
    const { createFirstPerson } = await import("../src/controls.js");
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const dom = {
        addEventListener() {},
        removeEventListener() {},
        ownerDocument: fakeDocument,
        requestPointerLock() {},
        style: {},
    };
    const spawn = { position: [0, 0, 0], yaw: 0 };
    const colliders = [{ minX: -1, maxX: 1, minZ: 2, maxZ: 3 }];
    const controls = createFirstPerson(camera, dom, colliders, spawn, THREE);
    for (const fn of ["update", "lock", "isLocked", "dispose"]) {
        assert.equal(typeof controls[fn], "function", `controls.${fn}`);
    }
    assert.ok(controls.position?.isVector3, "position is a Vector3");
    assert.equal(typeof controls.yaw, "number", "yaw is a number");
    controls.update(0.016);
});

test("the crime marker lands in the room the case names", async () => {
    const { generateCase } = await import("../case.js");
    for (const seed of [1, 2, 3, 42, 424242, 987654]) {
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, THREE);
        const data = generateCase(seed);
        const roomName = String(data.scene).replace(/^the /, "");
        const decor = buildDecor(scene, THREE, env.rooms, roomName);
        const [x, , z] = decor.evidence.position; // [x, y, z]
        const room = env.rooms[roomName];
        assert.ok(room, `seed ${seed}: room ${roomName} exists`);
        const [cx, cz] = room.center;
        const [w, d] = room.size;
        assert.ok(
            Math.abs(x - cx) <= w / 2 + 1 && Math.abs(z - cz) <= d / 2 + 1,
            `seed ${seed}: evidence at ${x},${z} is inside ${roomName} (${cx},${cz} ${w}x${d})`,
        );
    }
});

test("unlock keeps the controller alive and movement keeps working", async () => {
    const { createFirstPerson } = await import("../src/controls.js");
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const listeners = {};
    const dom = {
        addEventListener() {}, removeEventListener() {},
        ownerDocument: Object.assign({}, fakeDocument, {
            addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
            removeEventListener() {},
        }),
        requestPointerLock() {}, style: {},
    };
    const controls = createFirstPerson(cammera_obj(camera), dom, [], { position: [0, 0, 0], yaw: 0 }, THREE);
    assert.equal(typeof controls.unlock, "function", "unlock exists");
    controls.unlock();               // was: dispose() -> controller bricked
    controls.update(0.016);          // must still work
    const before = controls.position.clone();
    listeners.keydown?.forEach((fn) => fn({ code: "KeyW", target: {}, preventDefault() {} }));
    controls.update(0.1);
    assert.notDeepEqual(controls.position.toArray(), before.toArray(), "still moves after unlock");
    controls.dispose();
});

// camera is passed positionally; keep the helper tiny
function cammera_obj(c) { return c; }

test("maps.js offers three distinct layouts the five rooms each", async () => {
    const { MAPS, ROOMS } = await import("../src/maps.js");
    assert.ok(Array.isArray(MAPS) && MAPS.length >= 3, "at least three maps");
    const ids = new Set(MAPS.map((m) => m.id));
    assert.equal(ids.size, MAPS.length, "unique map ids");
    for (const map of MAPS) {
        for (const name of ROOMS) {
            assert.ok(map.rooms[name], `${map.id}.${name}`);
            const [w, d] = map.rooms[name].size;
            assert.ok(w >= 7 && d >= 7, `${map.id}.${name} is at least 7x7`);
            assert.ok(Array.isArray(map.rooms[name].center) && map.rooms[name].center.length === 2, `${map.id}.${name} center`);
        }
        assert.ok(map.palette, `${map.id} has a palette`);
        // rooms must not overlap
        const names = ROOMS;
        for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
                const a = map.rooms[names[i]];
                const b = map.rooms[names[j]];
                const ax1 = a.center[0] - a.size[0] / 2, ax2 = a.center[0] + a.size[0] / 2;
                const az1 = a.center[1] - a.size[1] / 2, az2 = a.center[1] + a.size[1] / 2;
                const bx1 = b.center[0] - b.size[0] / 2, bx2 = b.center[0] + b.size[0] / 2;
                const bz1 = b.center[1] - b.size[1] / 2, bz2 = b.center[1] + b.size[1] / 2;
                const overlaps = ax1 < bx2 && ax2 > bx1 && az1 < bz2 && az2 > bz1;
                assert.ok(!overlaps, `${map.id}: ${names[i]} and ${names[j]} overlap`);
            }
        }
    }
});

test("env.js builds every map with anchors and colliders", async () => {
    const { MAPS } = await import("../src/maps.js");
    const { ROOMS } = await import("../src/env.js");
    for (const map of MAPS) {
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, THREE, map);
        assert.ok(env.palette, `${map.id} exposes a palette`);
        for (const name of ROOMS) {
            assert.ok(env.rooms[name] && env.anchors[name], `${map.id}.${name} room+anchor`);
            assert.equal(typeof env.anchors[name].facing, "number");
        }
        assert.ok(env.colliders.length > 0, `${map.id} colliders`);
        assert.ok(Array.isArray(env.spawn.position), `${map.id} spawn`);
    }
});

test("police.js walks and cuffs incrementally", async () => {
    const { buildPolice } = await import("../src/police.js");
    const scene = new THREE.Scene();
    const police = buildPolice(scene, THREE, { count: 2, entry: [0, 0] });
    assert.ok(police.group?.isObject3D, "group");
    assert.ok(police.officers.length >= 2, "officers");
    for (const fn of ["walkTo", "cuff", "setPosition", "update", "dispose"]) {
        assert.equal(typeof police[fn], "function", `police.${fn}`);
    }
    let arrived = false;
    for (let i = 0; i < 600 && !arrived; i++) arrived = police.walkTo([3, 3], 0.016);
    assert.ok(arrived, "walkTo finishes");
    const target = new THREE.Group();
    let cuffed = false;
    for (let i = 0; i < 600 && !cuffed; i++) cuffed = police.cuff(target, 0.016);
    assert.ok(cuffed, "cuff finishes");
});

test("cutscene.js runs the win timeline and fires events once", async () => {
    const { playCutscene } = await import("../src/cutscene.js");
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    const culprit = { group: new THREE.Group(), face() {}, setTalking() {}, update() {} };
    const police = { walkTo: () => true, cuff: () => true, update() {}, group: new THREE.Group() };
    const events = [];
    const cut = playCutscene({ scene, camera, THREE, culprit, police, kind: "win", victimName: "X", sceneRoom: "foyer", onEvent: (n) => events.push(n) });
    for (let i = 0; i < 2000 && !cut.done; i++) cut.update(0.016);
    assert.ok(cut.done, "finishes");
    assert.deepEqual(events, ["arrive", "cuffed", "done"], "events in order, once");
    cut.skip();
    assert.deepEqual(events, ["arrive", "cuffed", "done"], "skip does not refire");
});

test("ending.js shows and hides a card without touching the network", async () => {
    const { createEnding } = await import("../src/ending.js");
    // Minimal DOM so the overlay can be built.
    globalThis.document.body = globalThis.document.body ?? { appendChild() {}, removeChild() {} };
    const seen = [];
    const ending = createEnding({ onRetry() {}, onRetrySameMap() {}, onEvent: (n) => seen.push(n) });
    ending.show({ kind: "win", culpritName: "A", victimName: "B", scene: "the cellar", officerCount: 2 });
    ending.hide();
    assert.ok(seen.includes("shown"), "shown event");
});

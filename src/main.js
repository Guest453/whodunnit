// Whodunnit 3D — integrator. Ties the case engine, the 3D modules and the API
// together, and sequences the capture cutscene + ending. Each 3D module owns one
// file; this file owns the wiring only.

import * as THREE from "three";
import { generateCase, gradeAccusation, replyRequest, resolveAccusation } from "../case.js";
import { api } from "./api.js";
import { ROOMS, MAPS } from "./maps.js";
import { buildEnvironment } from "./env.js";
import { buildSuspects } from "./people.js";
import { buildDecor } from "./decor.js";
import { createFirstPerson } from "./controls.js";
import { buildPolice } from "./police.js";
import { playCutscene } from "./cutscene.js";
import { createEnding } from "./ending.js";

const $ = (id) => document.getElementById(id);

const ui = {
    banner: $("banner"),
    splash: $("splash"),
    splashConnect: $("splash-connect"),
    splashStart: $("splash-start"),
    splashHint: $("splash-hint"),
    disconnect: $("disconnect"),
    top: $("top"),
    brief: $("brief"),
    status: $("status"),
    accuse: $("accuse"),
    crosshair: $("crosshair"),
    hint: $("hint"),
    panel: $("panel"),
    pName: $("p-name"),
    pRole: $("p-role"),
    log: $("log"),
    q: $("q"),
    ask: $("ask"),
    mic: $("mic"),
    voice: $("voice"),
    voiceToggle: $("voice-toggle"),
    voiceTrack: $("voice-track"),
    voiceFill: $("voice-fill"),
    voiceTime: $("voice-time"),
    close: $("close"),
    notes: $("notes"),
    noteList: $("note-list"),
    contradiction: $("contradiction"),
};

let bannerTimer = null;
function showError(message) {
    ui.banner.textContent = message;
    ui.banner.classList.remove("hidden");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.add("hidden"), 9000);
}

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------------- game state

const game = {
    seed: Number(new URLSearchParams(location.search).get("seed")) || (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
    mapIndex: Number(new URLSearchParams(location.search).get("map")) || 0,
    data: null,
    suspects: [],
    byId: new Map(),
    history: {},
    claimed: {},
    target: null,
    open: null,
};

// ---------------------------------------------------------------- renderer

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
const clock = new THREE.Clock();
const root = new THREE.Group();
scene.add(root);

// ---------------------------------------------------------------- world (per case)

let world = null; // { layer, env, decor, suspects, police, controls, map }
let cine = null; // active cutscene, or null

function disposeWorld() {
    if (!world) return;
    for (const part of [world.env, world.decor, world.police]) part?.dispose?.();
    for (const suspect of world.suspects) suspect.dispose?.();
    world.controls?.dispose?.();
    root.remove(world.layer);
    world = null;
}

function buildWorld(seed, mapIndex) {
    disposeWorld();
    const map = MAPS[mapIndex % MAPS.length];
    const layer = new THREE.Group();
    root.add(layer);

    const env = buildEnvironment(layer, THREE, map);
    game.data = generateCase(seed);
    const crimeScene = String(game.data.scene).replace(/^the /, "");
    const decor = buildDecor(layer, THREE, env.rooms, crimeScene);

    const anchors = ROOMS.map((name) => env.anchors[name]);
    const suspects = buildSuspects(game.data.suspects, anchors, THREE);
    for (const controller of suspects) layer.add(controller.group);

    const police = buildPolice(layer, THREE, { count: 2, entry: env.spawn.position });
    const controls = createFirstPerson(camera, renderer.domElement, env.colliders, env.spawn, THREE);

    world = { layer, env, decor, suspects, police, controls, map };
    game.suspects = suspects;
    game.byId = new Map(suspects.map((c) => [c.id, c]));
    game.history = {};
    game.claimed = {};
    game.target = null;
    game.open = null;
    ui.brief.textContent = game.data.intro;
    ui.noteList.innerHTML = "";
    ui.notes.classList.add("hidden");
    ui.panel.classList.add("hidden");
}

// ---------------------------------------------------------------- title camera

let title = true;
let titleAngle = Math.random() * Math.PI * 2;
let titleBounds = null;
let titleCenter = new THREE.Vector3();
let titleRadius = 6;
let parallax = { x: 0, y: 0 };
addEventListener("mousemove", (event) => {
    parallax.x = event.clientX / innerWidth - 0.5;
    parallax.y = event.clientY / innerHeight - 0.5;
});

function frameTitle() {
    const foyer = world.env.rooms.foyer ?? { center: [0, 0], size: [12, 12] };
    titleCenter.set(foyer.center[0], 1.35, foyer.center[1]);
    titleRadius = Math.max(2.4, Math.min(foyer.size[0], foyer.size[1]) / 2 - 1.6);
    titleBounds = {
        minX: foyer.center[0] - foyer.size[0] / 2 + 0.9,
        maxX: foyer.center[0] + foyer.size[0] / 2 - 0.9,
        minZ: foyer.center[1] - foyer.size[1] / 2 + 0.9,
        maxZ: foyer.center[1] + foyer.size[1] / 2 - 0.9,
    };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function updateTitleCamera(dt) {
    titleAngle += dt * 0.055;
    const drift = titleRadius * 0.12;
    const px = clamp(titleCenter.x + Math.sin(titleAngle) * titleRadius + parallax.x * drift, titleBounds.minX, titleBounds.maxX);
    const pz = clamp(titleCenter.z + Math.cos(titleAngle) * titleRadius + parallax.y * drift * 0.5, titleBounds.minZ, titleBounds.maxZ);
    camera.position.set(px, 1.8 - parallax.y * 0.35, pz);
    camera.lookAt(titleCenter.x, 1.3, titleCenter.z);
}

function enterHouse() {
    if (!api.signedIn()) {
        showError("Connect Pollen first — the suspects answer with your own Pollen.");
        return;
    }
    title = false;
    cine = null;
    ui.splash.classList.add("leaving");
    setTimeout(() => {
        ui.splash.classList.add("hidden");
        ui.top.classList.remove("hidden");
        ui.crosshair.classList.remove("hidden");
        ui.accuse.disabled = false;
        world.controls.lock();
    }, 700);
}

// ---------------------------------------------------------------- interaction

const raycaster = new THREE.Raycaster();
const centre = new THREE.Vector2(0, 0);

function pickSuspect() {
    raycaster.setFromCamera(centre, camera);
    const hits = raycaster.intersectObjects(game.suspects.map((s) => s.group), true);
    for (const hit of hits) {
        let node = hit.object;
        while (node && !node.userData.suspectId) node = node.parent;
        if (node?.userData.suspectId) return game.byId.get(node.userData.suspectId) ?? null;
    }
    return null;
}

function updateTarget() {
    if (game.open || cine) return;
    game.target = pickSuspect();
    ui.hint.classList.toggle("hidden", !game.target);
    ui.crosshair.classList.toggle("hot", Boolean(game.target));
}

addEventListener("keydown", (event) => {
    if (event.code === "KeyE" && game.target && !game.open && !cine) openInterview(game.target);
    if (event.code === "Escape" && game.open) closeInterview();
});

renderer.domElement.addEventListener("click", () => {
    if (!api.signedIn() || title || cine) return;
    if (!world.controls.isLocked()) world.controls.lock();
});

// ---------------------------------------------------------------- voice player

const clip = new Audio();
clip.preload = "auto";
let speaking = null;

const fmtTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "0:00";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};
function setPlaying(on) {
    ui.voice.classList.toggle("playing", on);
    ui.voiceToggle.textContent = on ? "Pause" : "Play";
    if (speaking) speaking.setTalking(on);
}
clip.addEventListener("timeupdate", () => {
    ui.voiceFill.style.width = `${clip.duration ? (clip.currentTime / clip.duration) * 100 : 0}%`;
    ui.voiceTime.textContent = fmtTime(clip.currentTime);
});
clip.addEventListener("play", () => setPlaying(true));
clip.addEventListener("pause", () => setPlaying(false));
clip.addEventListener("ended", () => {
    setPlaying(false);
    ui.voiceFill.style.width = "0%";
    ui.voiceTime.textContent = "0:00";
});
function playVoice(url, suspectController) {
    speaking = suspectController;
    ui.voice.classList.remove("hidden");
    clip.src = url;
    clip.currentTime = 0;
    clip.play().catch(() => setPlaying(false));
}
ui.voiceToggle.addEventListener("click", () => {
    if (clip.paused) clip.play().catch(() => {});
    else clip.pause();
});
ui.voiceTrack.addEventListener("click", (event) => {
    if (!clip.duration) return;
    const rect = ui.voiceTrack.getBoundingClientRect();
    clip.currentTime = ((event.clientX - rect.left) / rect.width) * clip.duration;
});

// ---------------------------------------------------------------- interview

function openInterview(controller) {
    game.open = controller;
    const suspect = game.data.suspects.find((s) => s.id === controller.id);
    ui.pName.textContent = suspect.name;
    ui.pRole.textContent = suspect.role;
    ui.log.innerHTML = "";
    for (const entry of game.history[controller.id] ?? []) {
        if (entry.role === "user") addLog("q", `You: ${entry.content}`);
        else {
            try {
                addLog("a", `${suspect.name}: ${JSON.parse(entry.content).say}`);
            } catch {
                addLog("a", `${suspect.name}: ${entry.content}`);
            }
        }
    }
    ui.panel.classList.remove("hidden");
    world.controls.unlock?.();
    ui.q.focus();
}

function closeInterview() {
    game.open = null;
    ui.panel.classList.add("hidden");
    clip.pause();
    world.controls.lock();
}

function addLog(kind, text) {
    const line = document.createElement("div");
    line.className = kind;
    line.textContent = text;
    ui.log.appendChild(line);
    ui.log.scrollTop = ui.log.scrollHeight;
}

async function ask(text) {
    const controller = game.open;
    if (!controller || !text.trim()) return;
    const suspect = game.data.suspects.find((s) => s.id === controller.id);
    addLog("q", `You: ${text}`);
    ui.q.value = "";
    const pending = document.createElement("div");
    pending.className = "dim";
    pending.textContent = `${suspect.name} considers the question…`;
    ui.log.appendChild(pending);

    try {
        const history = game.history[suspect.id] ?? [];
        const reply = await api.ask(replyRequest(game.data, suspect, text, history));
        history.push({ role: "user", content: text }, { role: "assistant", content: JSON.stringify(reply) });
        game.history[suspect.id] = history;
        pending.textContent = `${suspect.name} is finding their words…`;
        let voiceUrl = null;
        try {
            voiceUrl = await api.speak(reply.say, suspect.voice);
        } catch (error) {
            showError(error.message);
        }
        pending.remove();
        addLog("a", `${suspect.name}: ${reply.say}`);
        controller.speak(reply.say);
        if (reply.claim) (game.claimed[suspect.id] ??= []).push(String(reply.claim));
        renderNotebook();
        if (voiceUrl) playVoice(voiceUrl, controller);
    } catch (error) {
        pending.remove();
        showError(error.message);
    }
}

ui.ask.addEventListener("click", () => ask(ui.q.value));
ui.q.addEventListener("keydown", (event) => {
    if (event.key === "Enter") ask(ui.q.value);
});
ui.close.addEventListener("click", closeInterview);

// ---------------------------------------------------------------- notebook

function renderNotebook() {
    ui.noteList.innerHTML = "";
    let any = false;
    for (const suspect of game.data.suspects) {
        for (const claim of game.claimed[suspect.id] ?? []) {
            any = true;
            const li = document.createElement("li");
            li.innerHTML = `<strong>${escapeHtml(suspect.name)}:</strong> ${escapeHtml(claim)}`;
            ui.noteList.appendChild(li);
        }
    }
    ui.notes.classList.toggle("hidden", !any);

    const culprit = game.data.suspects.find((s) => s.isCulprit);
    const witness = game.data.suspects.find((s) => s.isWitness);
    const culpritClaimed = (game.claimed[culprit.id] ?? []).some((c) => c.toLowerCase().includes(game.data.coverRoom.toLowerCase()));
    const witnessSaw = (game.claimed[witness.id] ?? []).some((c) => c.toLowerCase().includes(culprit.name.toLowerCase().split(" ")[0]));
    ui.contradiction.innerHTML =
        culpritClaimed && witnessSaw
            ? `<div class="banner warn" style="position:static;transform:none;margin-top:0.6rem">
                 <span class="flag">Contradiction.</span> ${escapeHtml(culprit.name)} says they were in
                 ${escapeHtml(game.data.coverRoom)}, but ${escapeHtml(witness.name)} saw them at
                 ${escapeHtml(game.data.scene)}. One of them is lying.
               </div>`
            : "";
}

// ---------------------------------------------------------------- cutscene + ending

const ending = createEnding({
    onRetry: () => restart(true),
    onRetrySameMap: () => restart(false),
    onEvent: () => {},
});

function restart(newMap) {
    ending.hide();
    title = true;
    cine = null;
    clip.pause();
    const nextMap = newMap ? game.mapIndex + 1 : game.mapIndex;
    const nextSeed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    location.search = `?seed=${nextSeed}&map=${nextMap}`;
}

function startCutscene(kind, culpritController) {
    game.open = null;
    ui.panel.classList.add("hidden");
    ui.hint.classList.add("hidden");
    ui.crosshair.classList.add("hidden");
    ui.accuse.disabled = true;
    clip.pause();
    world.controls.unlock?.();

    const culprit = game.data.suspects.find((s) => s.id === game.data.culpritId);
    cine = playCutscene({
        scene,
        camera,
        THREE,
        culprit: culpritController,
        police: world.police,
        kind,
        victimName: game.data.victim.name,
        sceneRoom: String(game.data.scene).replace(/^the /, ""),
        onEvent: (name) => {
            if (name !== "done") return;
            cine = null;
            ending.show({
                kind,
                culpritName: culprit.name,
                victimName: game.data.victim.name,
                scene: game.data.scene,
                officerCount: world.police.officers?.length ?? 2,
            });
        },
    });
}

ui.accuse.addEventListener("click", () => {
    if (cine) return;
    const names = game.data.suspects.map((s) => s.name).join(", ");
    const answer = prompt(`Who is the killer?\n\n${names}`, "");
    if (answer === null) return;
    const id = resolveAccusation(game.data, answer);
    if (!id) return showError(`Name one of: ${names}.`);
    const result = gradeAccusation(game.data, id);
    const controller = game.byId.get(game.data.culpritId);
    ui.status.textContent = result.correct ? "case closed" : "wrong";
    startCutscene(result.correct ? "win" : "lose", controller);
});

// ---------------------------------------------------------------- auth + boot

ui.splashConnect.addEventListener("click", () => api.connect().catch((error) => showError(error.message)));
ui.splashStart.addEventListener("click", enterHouse);
ui.disconnect?.addEventListener("click", () => {
    api.disconnect();
    ui.status.textContent = "";
    ui.splashHint.textContent = "Signed out. Connect again to play.";
    showError("Signed out — the stored key was removed from this browser.");
});

(async () => {
    try {
        await api.handleCallback();
    } catch (error) {
        showError(error.message);
    }
    ui.status.textContent = api.signedIn() ? "connected" : "";
    ui.disconnect?.classList.toggle("hidden", !api.signedIn());
    ui.splashHint.textContent = api.signedIn()
        ? "Connected. Enter the house when you are ready."
        : "Sign in to begin — you pay with your own Pollen.";
})();

// ---------------------------------------------------------------- loop

addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// First world (also frames the title camera).
buildWorld(game.seed, game.mapIndex);
frameTitle();

renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (cine) {
        cine.update(dt);
    } else if (title) {
        updateTitleCamera(dt);
    } else {
        world.controls.update(dt);
    }
    world.env.update(dt);
    world.decor.update(dt);
    world.police.update(dt);
    for (const controller of world.suspects) controller.update(dt);
    if (!game.open && !cine && !title) updateTarget();
    renderer.render(scene, camera);
});

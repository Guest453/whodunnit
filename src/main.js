// Whodunnit 3D — integrator. Ties the case engine, the 3D modules and the API
// together. Each 3D module owns one file; this file owns the wiring only.

import * as THREE from "three";
import { generateCase, gradeAccusation, replyRequest, resolveAccusation } from "../case.js";
import { api } from "./api.js";
import { ROOMS, buildEnvironment } from "./env.js";
import { buildSuspects } from "./people.js";
import { buildDecor } from "./decor.js";
import { createFirstPerson } from "./controls.js";

const $ = (id) => document.getElementById(id);

const ui = {
    banner: $("banner"),
    splash: $("splash"),
    splashConnect: $("splash-connect"),
    splashStart: $("splash-start"),
    splashHint: $("splash-hint"),
    top: $("top"),
    brief: $("brief"),
    status: $("status"),
    disconnect: $("disconnect"),
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
    data: null,
    suspects: [], // controllers from people.js
    byId: new Map(),
    history: {}, // suspectId -> messages
    claimed: {}, // suspectId -> [claim strings]
    target: null,
    open: null, // suspect currently being interviewed
};

// ---------------------------------------------------------------- scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
const clock = new THREE.Clock();

const env = buildEnvironment(scene, THREE);
// The case decides which room is the crime scene, so build it before the decor.
game.data = generateCase(game.seed);
const crimeScene = String(game.data.scene).replace(/^the /, "");
const decor = buildDecor(scene, THREE, env.rooms, crimeScene);
const controls = createFirstPerson(camera, renderer.domElement, env.colliders, env.spawn, THREE);
const anchors = ROOMS.map((name) => env.anchors[name]);
game.suspects = buildSuspects(game.data.suspects, anchors, THREE);
for (const controller of game.suspects) {
    scene.add(controller.group);
    game.byId.set(controller.id, controller);
}

ui.brief.textContent = game.data.intro;
ui.status.textContent = api.signedIn() ? "connected" : "";
ui.splashStart.disabled = !api.signedIn();

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
    if (game.open) return;
    game.target = pickSuspect();
    ui.hint.classList.toggle("hidden", !game.target);
    ui.crosshair.classList.toggle("hot", Boolean(game.target));
}

addEventListener("keydown", (event) => {
    if (event.code === "KeyE" && game.target && !game.open) openInterview(game.target);
    if (event.code === "Escape" && game.open) closeInterview();
});

renderer.domElement.addEventListener("click", () => {
    if (!api.signedIn()) return;
    if (!controls.isLocked()) controls.lock();
});

// ---------------------------------------------------------------- voice player

const clip = new Audio();
clip.preload = "auto";
let speaking = null; // the suspect currently talking

const fmtTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
};

function setPlaying(on) {
    ui.voice.classList.toggle("playing", on);
    ui.voiceToggle.textContent = on ? "Pause" : "Play";
    if (speaking) speaking.setTalking(on);
}

clip.addEventListener("timeupdate", () => {
    const pct = clip.duration ? (clip.currentTime / clip.duration) * 100 : 0;
    ui.voiceFill.style.width = `${pct}%`;
    ui.voiceTime.textContent = fmtTime(clip.currentTime);
});
clip.addEventListener("play", () => setPlaying(true));
clip.addEventListener("pause", () => setPlaying(false));
clip.addEventListener("ended", () => {
    setPlaying(false);
    ui.voiceFill.style.width = "0%";
    ui.voiceTime.textContent = "0:00";
});

/** Load a clip and play it; the player UI is the only control surface. */
function playVoice(url, suspectController) {
    speaking = suspectController;
    ui.voice.classList.remove("hidden");
    clip.src = url;
    clip.currentTime = 0;
    clip.play().catch(() => {
        // Autoplay blocked (quick subsequent lines). The Play button is right there.
        setPlaying(false);
    });
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
    controls.unlock?.(); // free the cursor for typing; keep controls alive
    ui.q.focus();
}

function closeInterview() {
    game.open = null;
    ui.panel.classList.add("hidden");
    clip.pause();
    controls.lock(); // back to walking
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
        // Fetch the voice BEFORE showing the line, so the text and the speech
        // begin at the same moment instead of the words landing seconds early.
        pending.textContent = `${suspect.name} is finding their words…`;
        let voiceUrl = null;
        try {
            voiceUrl = await api.speak(reply.say, suspect.voice);
        } catch (error) {
            showError(error.message); // text still appears below
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

// ---------------------------------------------------------------- accuse

ui.accuse.addEventListener("click", () => {
    const names = game.data.suspects.map((s) => s.name).join(", ");
    const answer = prompt(`Who is the killer?\n\n${names}`, "");
    if (answer === null) return;
    const id = resolveAccusation(game.data, answer);
    if (!id) return showError(`Name one of: ${names}.`);
    const result = gradeAccusation(game.data, id);
    const culprit = game.data.suspects.find((s) => s.id === game.data.culpritId);
    if (result.correct) {
        ui.status.textContent = "case closed";
        alert(`You caught them. ${culprit.name} killed ${game.data.victim.name}.`);
    } else {
        const named = game.data.suspects.find((s) => s.id === id);
        ui.status.textContent = "wrong";
        alert(`Wrong. ${named.name} was innocent. The killer was ${culprit.name} — seen at ${game.data.scene}.`);
    }
    location.search = `?seed=${(Date.now() ^ (Math.random() * 0xffffffff)) >>> 0}`;
});

// ---------------------------------------------------------------- splash + auth

// ---- title screen: the menu sits on the left, the live house on the right ----
// A slow orbit with a little mouse parallax. It runs until the player enters.
let title = true;
let titleAngle = Math.random() * Math.PI * 2;
const foyer = env.rooms.foyer ?? { center: [0, 0], size: [12, 12] };
const titleCenter = new THREE.Vector3(foyer.center[0], 1.35, foyer.center[1]);
// Keep the orbit inside the room: radius from the smaller span, minus a margin.
const titleRadius = Math.max(2.4, Math.min(foyer.size[0], foyer.size[1]) / 2 - 1.6);
const titleBounds = {
    minX: foyer.center[0] - foyer.size[0] / 2 + 0.9,
    maxX: foyer.center[0] + foyer.size[0] / 2 - 0.9,
    minZ: foyer.center[1] - foyer.size[1] / 2 + 0.9,
    maxZ: foyer.center[1] + foyer.size[1] / 2 - 0.9,
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let parallax = { x: 0, y: 0 };
addEventListener("mousemove", (event) => {
    parallax.x = event.clientX / innerWidth - 0.5;
    parallax.y = event.clientY / innerHeight - 0.5;
});

function updateTitleCamera(dt) {
    titleAngle += dt * 0.055;
    const drift = titleRadius * 0.12; // small parallax, never enough to reach a wall
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
    ui.splash.classList.add("leaving"); // CSS fades the menu out over the 3D
    setTimeout(() => {
        ui.splash.classList.add("hidden");
        ui.top.classList.remove("hidden");
        ui.crosshair.classList.remove("hidden");
        ui.accuse.disabled = false;
        controls.lock();
    }, 700);
}

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
    ui.splashStart.disabled = false;
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

renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (title) updateTitleCamera(dt);
    else controls.update(dt);
    env.update(dt);
    decor.update(dt);
    for (const controller of game.suspects) controller.update(dt);
    if (!game.open) updateTarget();
    renderer.render(scene, camera);
});

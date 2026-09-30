// Whodunnit game — UI + voice. The case comes from case.js (generated in code),
// the suspects are played by a Pollinations text model, and their voices use TTS.

import { generateCase, gradeAccusation, replyRequest, resolveAccusation } from "./case.js";

const ENTER_URL = "https://enter.pollinations.ai";
const GEN_URL = "https://gen.pollinations.ai";
const CLIENT_ID = "pk_5drKIx9HHnvmdcqW";
const REDIRECT_URI = `${location.origin}${location.pathname}`;
const TTS_MODEL = "elevenlabs/eleven-v3";
const STT_MODEL = "openai/whisper-large-v3";

const $ = (id) => document.getElementById(id);

const state = {
    token: sessionStorage.getItem("wd_token") || null,
    data: null,
    history: {}, // suspectId -> messages
    claimed: {}, // suspectId -> [claims]
    questioning: null,
};

// ------------------------------------------------------------------ errors

function showError(message) {
    const box = $("error");
    box.textContent = message;
    box.classList.remove("hidden");
    clearTimeout(showError.timer);
    showError.timer = setTimeout(() => box.classList.add("hidden"), 8000);
}

function friendlyError(status, body) {
    if (status === 401) return "Your sign-in expired. Connect again to keep playing.";
    if (status === 402) return "Not enough Pollen. Top up at enter.pollinations.ai.";
    if (status === 429) return "Rate limited — wait a moment and try again.";
    return body?.error?.message || `Request failed (${status}). Check your connection and try again.`;
}

// ------------------------------------------------------------------ auth

const randomBase64Url = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const challengeFor = async (verifier) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function connect() {
    const verifier = randomBase64Url();
    const stateToken = randomBase64Url();
    sessionStorage.setItem("wd_v", verifier);
    sessionStorage.setItem("wd_s", stateToken);
    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "profile usage",
        budget: "3",
        expiry: "7",
        state: stateToken,
        code_challenge: await challengeFor(verifier),
        code_challenge_method: "S256",
    });
    location.href = `${ENTER_URL}/authorize?${params}`;
}

async function handleCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return false;
    if (params.get("state") !== sessionStorage.getItem("wd_s")) throw new Error("Sign-in state mismatch.");
    const verifier = sessionStorage.getItem("wd_v");
    sessionStorage.removeItem("wd_s");
    sessionStorage.removeItem("wd_v");
    history.replaceState({}, "", location.pathname);
    if (error) throw new Error(`Sign-in was declined or failed (${error}).`);
    const res = await fetch(`${ENTER_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description ?? data.error ?? "Token exchange failed.");
    state.token = data.access_token;
    sessionStorage.setItem("wd_token", state.token);
    return true;
}

function signedIn() {
    $("connect").classList.toggle("hidden", Boolean(state.token));
    $("who-ta").textContent = state.token ? "connected" : "";
    $("start-case").disabled = !state.token;
    $("start-hint").classList.toggle("hidden", Boolean(state.token));
    if (state.token) $("start-hint").textContent = "You're connected. Start a case.";
}

// ------------------------------------------------------------------ suspect calls

async function askSuspect(suspect, question) {
    const history = state.history[suspect.id] ?? [];
    const req = replyRequest(state.data, suspect, question, history);
    const res = await fetch(`${GEN_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(friendlyError(res.status, await res.json().catch(() => ({}))));
    const content = (await res.json()).choices?.[0]?.message?.content ?? "";
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        parsed = { say: content, claim: "" };
    }
    history.push({ role: "user", content: question }, { role: "assistant", content: JSON.stringify(parsed) });
    state.history[suspect.id] = history;
    if (parsed.claim) (state.claimed[suspect.id] ??= []).push(String(parsed.claim));
    return parsed;
}

async function speak(text, voice) {
    const res = await fetch(`${GEN_URL}/v1/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: TTS_MODEL, input: text, voice, response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(friendlyError(res.status, await res.json().catch(() => ({}))));
    return URL.createObjectURL(await res.blob());
}

async function transcribe(blob) {
    const form = new FormData();
    form.append("file", blob, "question.webm");
    form.append("model", STT_MODEL);
    const res = await fetch(`${GEN_URL}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: form,
    });
    if (!res.ok) throw new Error(friendlyError(res.status, await res.json().catch(() => ({}))));
    return (await res.json()).text ?? "";
}

// ------------------------------------------------------------------ voice input

let recorder = null;
let chunks = [];

async function toggleRecording(suspect) {
    if (recorder) {
        recorder.stop();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);
        chunks = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            recorder = null;
            const blob = new Blob(chunks, { type: "audio/webm" });
            try {
                const text = await transcribe(blob);
                if (text) await question(suspect, text);
            } catch (error) {
                showError(error.message);
            }
        };
        recorder.start();
    } catch {
        showError("Microphone unavailable — type your question instead.");
    }
}

// ------------------------------------------------------------------ notebook

function renderNotebook() {
    const list = $("notes");
    list.innerHTML = "";
    let any = false;
    for (const suspect of state.data.suspects) {
        const claims = state.claimed[suspect.id] ?? [];
        for (const claim of claims) {
            any = true;
            const li = document.createElement("li");
            li.innerHTML = `<span class="who">${suspect.name}:</span> ${escapeHtml(claim)}`;
            list.appendChild(li);
        }
    }
    $("note-hint").classList.toggle("hidden", any);
    renderContradictions();
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** The witness's sighting vs the culprit's claim — the crack the player must find. */
function renderContradictions() {
    const box = $("contradictions");
    box.innerHTML = "";
    const d = state.data;
    const culpritClaims = state.claimed[d.culpritId] ?? [];
    const witnessClaims = state.claimed[d.witnessId] ?? [];
    const culpritClaimed = culpritClaims.some((c) => c.toLowerCase().includes(d.coverRoom.toLowerCase()));
    const witnessSaw = witnessClaims.some((c) => c.toLowerCase().includes(culpritName().toLowerCase().split(" ")[0]));
    if (culpritClaimed && witnessSaw) {
        const div = document.createElement("div");
        div.className = "banner warn";
        div.innerHTML =
            `<span class="flag">Contradiction found.</span> ${escapeHtml(culpritName())} swears ` +
            `they were in ${escapeHtml(d.coverRoom)}, but someone saw them at ${escapeHtml(d.scene)}. Someone is lying.`;
        box.appendChild(div);
    }
}

const culpritName = () => state.data.suspects.find((s) => s.isCulprit).name;

// ------------------------------------------------------------------ flow

function startCase(seed) {
    state.data = generateCase(seed >>> 0);
    state.history = {};
    state.claimed = {};
    $("start").classList.add("hidden");
    $("end").classList.add("hidden");
    $("game").classList.remove("hidden");
    $("brief").innerHTML = `<div class="intro">${escapeHtml(state.data.intro)}</div>`;
    $("accuse").disabled = false;
    renderSuspects();
    renderNotebook();
}

function renderSuspects() {
    const wrap = $("suspects");
    wrap.innerHTML = "";
    for (const suspect of state.data.suspects) {
        const card = document.createElement("div");
        card.className = "card suspect";
        card.innerHTML = `
            <div>
                <span class="who">${escapeHtml(suspect.name)}</span>
                <span class="role">— ${escapeHtml(suspect.role)}</span>
            </div>
            <div class="row">
                <input type="text" placeholder="Ask ${escapeHtml(suspect.name.split(" ")[0])} something…" style="flex:1;min-width:12rem;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:0.5rem" />
                <button data-ask>Ask</button>
                <button data-mic class="ghost" title="Ask out loud">🎙</button>
            </div>
            <div class="log" data-log></div>
            <audio controls preload="none" data-audio></audio>
        `;
        const input = card.querySelector("input");
        const ask = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = "";
            await question(suspect, text);
        };
        card.querySelector("[data-ask]").addEventListener("click", ask);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") ask();
        });
        card.querySelector("[data-mic]").addEventListener("click", () => toggleRecording(suspect));
        wrap.appendChild(card);
    }
}

async function question(suspect, text) {
    if (state.questioning) return;
    state.questioning = suspect.id;
    const card = [...document.querySelectorAll(".suspect")][state.data.suspects.indexOf(suspect)];
    const log = card.querySelector("[data-log]");
    const audio = card.querySelector("[data-audio]");
    const qLine = document.createElement("div");
    qLine.className = "q";
    qLine.textContent = `You: ${text}`;
    log.appendChild(qLine);
    const pending = document.createElement("div");
    pending.className = "dim";
    pending.textContent = `${suspect.name} is thinking…`;
    log.appendChild(pending);
    log.scrollTop = log.scrollHeight;

    try {
        const reply = await askSuspect(suspect, text);
        pending.remove();
        const aLine = document.createElement("div");
        aLine.className = "a";
        aLine.textContent = `${suspect.name}: ${reply.say}`;
        log.appendChild(aLine);
        log.scrollTop = log.scrollHeight;
        renderNotebook();
        try {
            audio.src = await speak(reply.say, suspect.voice);
        } catch (error) {
            showError(error.message);
        }
    } catch (error) {
        pending.remove();
        showError(error.message);
    } finally {
        state.questioning = null;
    }
}

function accuse() {
    const names = state.data.suspects.map((s) => s.name).join(", ");
    const answer = prompt(`Who is the killer?\n\n${names}`, "");
    if (answer === null) return;
    const id = resolveAccusation(state.data, answer);
    if (!id) {
        showError(`I couldn't tell who that is. Name one of: ${names}.`);
        return;
    }
    const result = gradeAccusation(state.data, id);
    const culprit = state.data.suspects.find((s) => s.id === state.data.culpritId);
    $("game").classList.add("hidden");
    $("end").classList.remove("hidden");
    $("end").innerHTML = result.correct
        ? `<p class="big ok">You caught them.</p>
           <p>${escapeHtml(culprit.name)} killed ${escapeHtml(state.data.victim.name)}. ` +
          `They were seen leaving ${escapeHtml(state.data.scene)} — and they knew ${escapeHtml(state.data.tell)}.</p>
           <div class="row" style="justify-content:center"><button class="primary" id="again">New case</button></div>`
        : `<p class="big flag">Wrong.</p>
           <p>${escapeHtml(id ? state.data.suspects.find((s) => s.id === id).name : "That suspect")} was innocent. ` +
          `The killer was ${escapeHtml(culprit.name)} — seen leaving ${escapeHtml(state.data.scene)} around ${escapeHtml(state.data.murderTime)}.</p>
           <div class="row" style="justify-content:center"><button class="primary" id="again">New case</button></div>`;
    $("again").addEventListener("click", () => startCase(Date.now() ^ (Math.random() * 0xffffffff)));
}

// ------------------------------------------------------------------ boot

$("connect").addEventListener("click", () => connect().catch((error) => showError(error.message)));
$("start-case").addEventListener("click", () => startCase(Date.now() ^ (Math.random() * 0xffffffff)));
$("new-case").addEventListener("click", () => startCase(Date.now() ^ (Math.random() * 0xffffffff)));
$("accuse").addEventListener("click", accuse);

(async () => {
    try {
        await handleCallback();
    } catch (error) {
        showError(error.message);
    }
    signedIn();
    const seed = new URLSearchParams(location.search).get("seed");
    if (state.token && seed) startCase(Number(seed));
})();

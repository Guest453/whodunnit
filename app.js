// Whodunnit — a voice murder-mystery game. Players question AI suspects out
// loud (or by typing), catch contradictions, and accuse the culprit.
// Paying with their own Pollen via Connect User Wallets (BYOP).

const ENTER_URL = "https://enter.pollinations.ai";
const GEN_URL = "https://gen.pollinations.ai";
const CLIENT_ID = "pk_5drKIx9HHnvmdcqW";
const REDIRECT_URI = `${location.origin}${location.pathname}`;
const TEXT_MODEL = "openai/gpt-5.4-nano";
const TTS_MODEL = "google/gemini-3.8-flash-tts";
const STT_MODEL = "openai/whisper-large-v3";

const state = {
    token: sessionStorage.getItem("wd_token") || null,
    case: null,
    suspects: [],
    questions: 0,
    history: {}, // suspectId -> [{role, content}]
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- auth (BYOP)

const randomBase64Url = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
};

const challengeFor = async (verifier) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
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
    if (error) throw new Error(`Sign-in: ${error}`);
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

// -------------------------------------------------------------- model calls

function friendlyError(status, body) {
    if (status === 401) return "Your sign-in expired. Connect again to keep playing.";
    if (status === 402) return "Not enough Pollen. Top up at enter.pollinations.ai, or start a smaller case.";
    if (status === 429) return "Rate limited — wait a moment and try again.";
    return body?.error?.message || `Request failed (${status}). Check your connection and try again.`;
}

async function chat(model, messages) {
    const res = await fetch(`${GEN_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.8 }),
    });
    if (!res.ok) throw new Error(friendlyError(res.status, await res.json().catch(() => ({}))));
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
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

export { state, $, connect, handleCallback, chat, speak, TEXT_MODEL, STT_MODEL, GEN_URL, CLIENT_ID, REDIRECT_URI };

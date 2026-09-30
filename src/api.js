// Pollinations calls for the 3D game: BYOP sign-in, suspect replies, TTS, STT.
// Kept separate from the scene code so the 3D modules stay dependency-free.

const ENTER_URL = "https://enter.pollinations.ai";
const GEN_URL = "https://gen.pollinations.ai";
const CLIENT_ID = "pk_e9iOImghhPxaydHB";
const TTS_MODEL = "elevenlabs/eleven-v3";
const STT_MODEL = "openai/whisper-large-v3";

const REDIRECT_URI = `${location.origin}${location.pathname}`;

// Local persistence: prefer localStorage so a sign-in survives reloads and new
// tabs; fall back to sessionStorage where localStorage is unavailable.
const store = {
    get(key) {
        try {
            return localStorage.getItem(key) ?? sessionStorage.getItem(key);
        } catch {
            return sessionStorage.getItem(key);
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* private mode / quota */
        }
        try {
            sessionStorage.setItem(key, value);
        } catch {
            /* ignore */
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
        try {
            sessionStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    },
};

export const api = {
    token: store.get("wd_token") || null,

    signedIn() {
        return Boolean(this.token);
    },

    // ---- BYOP (Connect User Wallets), OAuth PKCE, browser-only ----

    async connect() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const verifier = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replaceAll("=", "");
        const state = crypto.randomUUID();
        store.set("wd_v", verifier);
        store.set("wd_s", state);
        const params = new URLSearchParams({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            scope: "profile usage",
            budget: "3",
            expiry: "7",
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        location.href = `${ENTER_URL}/authorize?${params}`;
    },

    async handleCallback() {
        const params = new URLSearchParams(location.search);
        const code = params.get("code");
        const error = params.get("error");
        if (!code && !error) return false;
        if (params.get("state") !== store.get("wd_s")) throw new Error("Sign-in state mismatch.");
        const verifier = store.get("wd_v");
        store.remove("wd_s");
        store.remove("wd_v");
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
        this.token = data.access_token;
        store.set("wd_token", this.token);
        return true;
    },

    disconnect() {
        this.token = null;
        store.remove("wd_token");
    },

    // ---- models ----

    friendlyError(status, body) {
        if (status === 401) return "Your sign-in expired. Connect again to keep playing.";
        if (status === 402) return "Not enough Pollen. Top up at enter.pollinations.ai.";
        if (status === 429) return "Rate limited. Wait a moment and try again.";
        return body?.error?.message || `Request failed (${status}). Check your connection and try again.`;
    },

    /** One suspect reply: { say, claim }. `request` comes from case.js. */
    async ask(request) {
        const res = await fetch(`${GEN_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
        if (!res.ok) throw new Error(this.friendlyError(res.status, await res.json().catch(() => ({}))));
        const content = (await res.json()).choices?.[0]?.message?.content ?? "";
        try {
            return JSON.parse(content);
        } catch {
            return { say: content, claim: "" };
        }
    },

    /** Speak a line in a suspect's voice; returns a playable object URL. */
    async speak(text, voice) {
        const res = await fetch(`${GEN_URL}/v1/audio/speech`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: TTS_MODEL, input: text, voice, response_format: "mp3" }),
        });
        if (!res.ok) throw new Error(this.friendlyError(res.status, await res.json().catch(() => ({}))));
        return URL.createObjectURL(await res.blob());
    },

    /** Transcribe a recorded question (optional voice input). */
    async transcribe(blob) {
        const form = new FormData();
        form.append("file", blob, "question.webm");
        form.append("model", STT_MODEL);
        const res = await fetch(`${GEN_URL}/v1/audio/transcriptions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.token}` },
            body: form,
        });
        if (!res.ok) throw new Error(this.friendlyError(res.status, await res.json().catch(() => ({}))));
        return (await res.json()).text ?? "";
    },
};

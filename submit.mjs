import { execFileSync } from "node:child_process";

const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const gh = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "whodunnit-submit",
            ...(init.headers ?? {}),
        },
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    return res.json();
};

const body = `### App Name
Whodunnit — a voice murder mystery

### App Description
A first-person 3D browser game: five AI suspects, one killer, and an alibi built to break. The player walks a mansion, questions the suspects out loud (voice input transcribed by Pollinations) or by typing, and watches each reply spoken aloud with Pollinations TTS. Suspects are played by Pollinations text models from facts the game generates in code, so the culprit's cover story is fixed and the mystery is always solvable. A notebook records every claim and flags the contradiction between the culprit and the witness. The player accuses; a cutscene shows police officers walking in to handcuff the killer, or turns to the real culprit, and a card offers a new case in a different house. Every playthrough is a new case in one of three houses, and the player pays with their own Pollen via Connect User Wallets.

Quest: #15724

### App URL
https://guest453.github.io/whodunnit/

### GitHub Repository URL
https://github.com/Guest453/whodunnit

### App Category
games

### App Language
en

### Discord Username
guest453

### Code evidence

- \`src/api.js\` — calls \`POST https://gen.pollinations.ai/v1/chat/completions\` (suspect replies), \`POST /v1/audio/speech\` (voices), \`POST /v1/audio/transcriptions\` (spoken questions), and \`https://enter.pollinations.ai\` for the BYOP sign-in.
- https://github.com/Guest453/whodunnit/blob/main/src/api.js
- \`case.js\` — the case engine (victim, suspects, culprit, witness, cover story).
- Live: https://guest453.github.io/whodunnit/`;

const created = await gh("/repos/pollinations/pollinations/issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        title: "[App Submission] Whodunnit — a voice murder mystery",
        labels: ["APP-SUBMISSION"],
        body,
    }),
});
console.log("submission:", created.html_url);

const comment = `Submitted via the app form: ${created.html_url}

**Whodunnit — a voice murder mystery** — built in my own public repository.

- Repo: https://github.com/Guest453/whodunnit
- Play: https://guest453.github.io/whodunnit/
- **Voice in and out**: questions by speech (\`/v1/audio/transcriptions\`) or typing; suspect replies spoken with the player's own Pollen (\`/v1/audio/speech\`).
- **Suspects are text models** (\`/v1/chat/completions\`) role-playing facts the game generates in **code** — the culprit's fixed cover story means they never contradict themselves and every case is solvable.
- **Notebook** logs claims and flags the culprit/witness contradiction; accusing triggers a police cutscene then a CASE CLOSED / WRONG card, with a **new case in a different house**.
- Three houses; world rebuilt per case. Tests: case invariants, 3D module contracts, HUD wiring.`;

await gh("/repos/pollinations/pollinations/issues/15724/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: comment }),
});
console.log("commented on #15724");

// End-to-end of the pieces game.js calls: a suspect reply (JSON), TTS, and the
// accusation grading — all live. Reports the TTS bytes so a real voice is proven.
// Run: POLLINATIONS_TEST_KEY=sk_... node e2e-game.mjs
import { generateCase, gradeAccusation, replyRequest, resolveAccusation } from "./case.js";

const key = process.env.POLLINATIONS_TEST_KEY;
if (!key) throw new Error("POLLINATIONS_TEST_KEY is required");
const BASE = "https://gen.pollinations.ai";

const c = generateCase(424242);
const culprit = c.suspects.find((s) => s.isCulprit);
const witness = c.suspects.find((s) => s.isWitness);
console.log(`Case seed ${c.seed}: ${c.intro}\n`);

async function say(suspect, question) {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(replyRequest(c, suspect, question, [])),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    return JSON.parse((await res.json()).choices[0].message.content);
}

// 1) a suspect answers
const reply = await say(culprit, "Where were you at the time of the death?");
console.log(`Q: Where were you at the time of the death?\n${culprit.name}: ${reply.say}\n`);

// 2) TTS gives that suspect a voice
const tts = await fetch(`${BASE}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "elevenlabs/eleven-v3", input: reply.say, voice: culprit.voice, response_format: "mp3" }),
});
console.log(`TTS (voice ${culprit.voice}): ${tts.status}, ${(await tts.arrayBuffer()).byteLength} bytes`);
if (!tts.ok) throw new Error("TTS failed");

// 3) the witness cracks the case
const witnessReply = await say(witness, "Did you see anything unusual that night?");
console.log(`\n${witness.name}: ${witnessReply.say}`);

// 4) accusation grading
const named = resolveAccusation(c, culprit.name);
console.log(`\nAccuse "${culprit.name}" -> ${JSON.stringify(gradeAccusation(c, named))}`);
const wrong = resolveAccusation(c, c.suspects.find((s) => !s.isCulprit && s.id !== c.witnessId).name);
console.log(`Accuse an innocent -> ${JSON.stringify(gradeAccusation(c, wrong))}`);

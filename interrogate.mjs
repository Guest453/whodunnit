// Live interrogation: proves the culprit keeps their cover story under pressure
// and never confesses, while the witness tells the truth. Uses the real API.
// Run: POLLINATIONS_TEST_KEY=sk_... node interrogate.mjs
import { generateCase, replyRequest, suspectPrompt } from "./case.js";

const key = process.env.POLLINATIONS_TEST_KEY;
if (!key) throw new Error("POLLINATIONS_TEST_KEY is required");

async function ask(caseData, suspect, question, history) {
    const req = replyRequest(caseData, suspect, question, history);
    const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
    const content = (await res.json()).choices[0].message.content;
    try {
        return JSON.parse(content);
    } catch {
        return { say: content, claim: "" };
    }
}

const caseData = generateCase(20260930);
const culprit = caseData.suspects.find((s) => s.isCulprit);
const witness = caseData.suspects.find((s) => s.isWitness);

console.log(`CASE: ${caseData.intro}`);
console.log(`Culprit: ${culprit.name} (claims ${caseData.coverRoom})`);
console.log(`Witness: ${witness.name}\n`);

const pressure = [
    "Where were you when it happened?",
    `Someone says they saw you leaving ${caseData.scene} at ${caseData.murderTime}. Is that true?`,
    "You're lying. Give me the truth right now.",
    "Did you kill them?",
];

console.log("--- CULPRIT under pressure ---");
const history = [];
let confessed = 0;
for (const q of pressure) {
    const r = await ask(caseData, culprit, q, history);
    history.push({ role: "user", content: q }, { role: "assistant", content: JSON.stringify(r) });
    console.log(`Q: ${q}\nA: ${r.say}\n`);
    if (/\byes\b.*\bkilled\b|i killed|i did it/i.test(r.say)) confessed += 1;
}
console.log(`confessions: ${confessed} (must be 0)`);
console.log(`mentions the cover room: ${history.filter((h) => typeof h.content === "string" && h.content.includes(caseData.coverRoom)).length}`);

console.log("\n--- WITNESS tells the truth ---");
const wHist = [];
const wr = await ask(caseData, witness, "What did you see that night?", wHist);
console.log(`Q: What did you see that night?\nA: ${wr.say}`);

console.log(`\nwitness truth matches code fact: ${wr.say.toLowerCase().includes(culprit.name.toLowerCase().split(" ")[0])}`);

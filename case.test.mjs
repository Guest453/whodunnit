import assert from "node:assert/strict";
import test from "node:test";
import {
    generateCase,
    gradeAccusation,
    makeRng,
    replyRequest,
    resolveAccusation,
    suspectPrompt,
} from "./case.js";

test("same seed -> identical case; different seed -> different case", () => {
    const a = generateCase(12345);
    const b = generateCase(12345);
    assert.deepEqual(a, b);
    const c = generateCase(12346);
    assert.notDeepEqual(
        [a.suspects[0].name, a.scene, a.weapon],
        [c.suspects[0].name, c.scene, c.weapon],
    );
});

test("500 cases keep every invariant", () => {
    for (let seed = 0; seed < 500; seed++) {
        const c = generateCase(seed);
        assert.equal(c.suspects.length, 5, "five suspects");
        assert.equal(new Set(c.suspects.map((s) => s.id)).size, 5, "unique ids");
        assert.equal(new Set(c.suspects.map((s) => s.name)).size, 5, "unique names");
        assert.equal(new Set(c.suspects.map((s) => s.voice)).size, 5, "unique voices");
        assert.equal(c.suspects.filter((s) => s.isCulprit).length, 1, "one culprit");
        assert.equal(c.suspects.filter((s) => s.isWitness).length, 1, "one witness");
        const culprit = c.suspects.find((s) => s.isCulprit);
        const witness = c.suspects.find((s) => s.isWitness);
        assert.notEqual(culprit.id, witness.id, "witness is not the culprit");
        assert.ok(c.suspects.some((s) => s.id === c.culpritId), "culpritId resolves");
        assert.ok(c.coverRoom && c.coverRoom !== c.scene, "cover room differs from the scene");
        assert.ok(c.intro.includes(c.victim.name), "intro names the victim");
        // Non-empty string facts (the witness fix regressed here once).
        for (const field of ["culpritClaim", "witnessSaw", "tell", "secret"]) {
            assert.equal(typeof c[field], "string", `${field} is a string`);
            assert.ok(c[field].length > 0, `${field} is not empty`);
            assert.notEqual(c[field], "undefined", `${field} is not the literal "undefined"`);
        }
        assert.ok(c.witnessSaw.includes(culprit.name), "witnessSaw names the culprit");
    }
});

test("the culprit prompt fixes the cover story and forbids confession", () => {
    const c = generateCase(7);
    const culprit = c.suspects.find((s) => s.isCulprit);
    const prompt = suspectPrompt(c, culprit);
    assert.match(prompt, /You killed/);
    assert.match(prompt, /never change/);
    assert.match(prompt, /NEVER confess/);
    assert.ok(prompt.includes(c.coverRoom), "cover room is stated");
    assert.ok(prompt.includes(c.scene), "real scene is stated");
    assert.ok(prompt.includes(c.tell), "tell is included");
});

test("innocent prompts state innocence; the witness gets the sighting", () => {
    const c = generateCase(11);
    for (const s of c.suspects.filter((s) => !s.isCulprit)) {
        const prompt = suspectPrompt(c, s);
        assert.match(prompt, /did not kill/);
        assert.doesNotMatch(prompt, /You killed/);
        if (s.isWitness) assert.ok(prompt.includes(c.witnessSaw), "witness sees the culprit");
    }
});

test("replyRequest asks for JSON and carries history", () => {
    const c = generateCase(3);
    const s = c.suspects[0];
    const req = replyRequest(c, s, "where were you?", [
        { role: "user", content: "hello" },
        { role: "assistant", content: '{"say":"hi","claim":""}' },
    ]);
    assert.equal(req.response_format.type, "json_object");
    assert.equal(req.messages[0].role, "system");
    assert.equal(req.messages.at(-1).content, "where were you?");
    assert.equal(req.messages.length, 5);
});

test("resolveAccusation handles full names, first names and misses", () => {
    const c = generateCase(42);
    const s = c.suspects[0];
    assert.equal(resolveAccusation(c, s.name), s.id);
    assert.equal(resolveAccusation(c, s.name.toLowerCase().split(" ")[0]), s.id);
    assert.equal(resolveAccusation(c, "Colonel Mustard"), null);
    assert.equal(resolveAccusation(c, ""), null);
});

test("gradeAccusation is correct only for the culprit", () => {
    const c = generateCase(99);
    const culprit = c.suspects.find((x) => x.isCulprit);
    const innocent = c.suspects.find((x) => !x.isCulprit);
    assert.equal(gradeAccusation(c, culprit.id).correct, true);
    assert.equal(gradeAccusation(c, innocent.id).correct, false);
    assert.deepEqual(gradeAccusation(c, null), { correct: false, reason: "unknown" });
});

test("RNG is uniform-ish over 0..1", () => {
    const rng = makeRng(1);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 10000; i++) {
        const v = rng();
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    assert.ok(min >= 0 && max < 1 && max - min > 0.9, "spread looks right");
});

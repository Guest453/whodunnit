// Static check: every $("id") used in game.js exists in index.html, and every
// id/class the game writes to exists. Catches the classic "null" runtime break.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync("C:/Users/cesus/whodunnit/game.js", "utf8");
const html = readFileSync("C:/Users/cesus/whodunnit/index.html", "utf8");

const used = [...game.matchAll(/\$\("([a-z-]+)"\)/g)].map((m) => m[1]);
const defined = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
// ids the game creates itself via innerHTML (e.g. the end-screen button)
const rendered = [...game.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]);
const known = new Set([...defined, ...rendered]);
const missing = [...new Set(used)].filter((id) => !known.has(id));

console.log(`ids used by game.js : ${[...new Set(used)].length}`);
console.log(`ids in index.html   : ${defined.length} (+${rendered.length} rendered by game.js)`);
if (missing.length) {
    console.log("MISSING:", missing.join(", "));
    process.exit(1);
}
console.log("all ids present");

// CSS classes the game relies on for behaviours
for (const cls of ["hidden", "suspect", "warn", "primary", "ghost", "ok", "flag"]) {
    assert.ok(html.includes(cls), `index.html defines .${cls}`);
}
console.log("classes present");

// every suspect field the UI reads is produced by case.js
const casejs = readFileSync("C:/Users/cesus/whodunnit/case.js", "utf8");
for (const field of ["isCulprit", "isWitness", "voice", "role", "name", "id"]) {
    assert.ok(casejs.includes(field), `case.js produces ${field}`);
}
console.log("case fields present");

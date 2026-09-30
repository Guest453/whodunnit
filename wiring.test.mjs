// Static check: every $("id") used in src/main.js exists in index.html (or is
// created by main.js itself). Catches the classic null-element runtime break.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync("C:/Users/cesus/whodunnit/src/main.js", "utf8");
const html = readFileSync("C:/Users/cesus/whodunnit/index.html", "utf8");

const used = [...main.matchAll(/\$\("([a-z-]+)"\)/g)].map((m) => m[1]);
const defined = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const rendered = [...main.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]);
const known = new Set([...defined, ...rendered]);
const missing = [...new Set(used)].filter((id) => !known.has(id));

console.log(`ids used by main.js : ${[...new Set(used)].length}`);
console.log(`ids in index.html   : ${defined.length} (+${rendered.length} rendered by main.js)`);
if (missing.length) {
    console.log("MISSING:", missing.join(", "));
    process.exit(1);
}
console.log("all ids present");

// index.html must load the built bundle
assert.ok(html.includes("dist/bundle.js"), "index.html loads dist/bundle.js");
console.log("bundle reference present");

// case.js still produces the fields the 3D flow reads
const casejs = readFileSync("C:/Users/cesus/whodunnit/case.js", "utf8");
for (const field of ["isCulprit", "isWitness", "voice", "role", "name", "id", "coverRoom", "scene"]) {
    assert.ok(casejs.includes(field), `case.js produces ${field}`);
}
console.log("case fields present");

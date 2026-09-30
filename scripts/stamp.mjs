import { readFileSync, writeFileSync } from "node:fs";

// Stamp the bundle URL so a browser refresh always fetches fresh code, even
// though GitHub Pages sets max-age=600 on files.
const p = new URL("../index.html", import.meta.url);
const h0 = readFileSync(p, "utf8");
const stamp = process.env.BUILD_STAMP || String(Date.now());
const h = h0.replace(/dist\/bundle\.js(\?v=[^"]*)?/g, `dist/bundle.js?v=${stamp}`);
writeFileSync(p, h);
console.log("bundle stamp:", stamp);

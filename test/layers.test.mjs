import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("C:/Users/cesus/whodunnit/index.html", "utf8");

function zIndexOf(selector) {
    // find "<selector> { ... z-index: N ... }" (first block that has z-index)
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*?z-index:\\s*(\\d+)`, "s");
    const m = html.match(re);
    return m ? Number(m[1]) : null;
}

test("stacking scale is sane (no element fights the banner)", () => {
    const canvas = zIndexOf("canvas");
    const hud = zIndexOf(".ux");
    const splash = zIndexOf("#splash");
    const banner = zIndexOf("#banner");
    assert.equal(canvas, 0, "canvas is the bottom layer");
    assert.equal(hud, 10, "HUD above canvas");
    assert.equal(splash, 30, "splash above HUD");
    assert.equal(banner, 40, "errors are the top layer");
    assert.ok(canvas < hud && hud < splash && splash < banner, "strictly increasing");
});

test("the 3D canvas is pinned, not in normal flow", () => {
    assert.match(html, /canvas\s*\{[^}]*position:\s*fixed/, "canvas is fixed");
    assert.match(html, /canvas\s*\{[^}]*inset:\s*0/, "canvas fills the viewport");
});

test("narrow screens turn the interview into a bottom sheet", () => {
    assert.match(html, /@media\s*\(max-width:\s*720px\)/, "mobile breakpoint exists");
    const mobile = html.slice(html.indexOf("@media (max-width: 720px)"));
    assert.match(mobile, /#panel\s*\{[^}]*bottom:\s*0/, "panel docks to the bottom");
});

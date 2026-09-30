// ending.js — agent D. The end-of-case DOM overlay for Whodunnit 3D.
//
//   import { createEnding } from "./ending.js";
//   const ending = createEnding({ onRetry, onRetrySameMap, onEvent });
//   ending.show({ kind, culpritName, victimName, scene, officerCount });
//   ending.hide();
//
// Self-contained: it injects its own <style> once, builds its markup in JS and
// appends a full-screen overlay to <body>. No network, no alerts. Styled to
// match index.html (gold on near-black, --gold/--ink/--dim, --ease, the same
// button sheen). Accessible: role="dialog", the primary button is focused,
// Enter = play again (new house), Escape = play again (new house).

const STYLE_ID = "ending-styles";

// A handcuffs seal, drawn as inline SVG (currentColor = gold via CSS).
const SEAL_SVG =
    '<svg viewBox="0 0 96 96" role="img" aria-label="Handcuffs seal" fill="none" stroke="currentColor">' +
    '<circle cx="48" cy="48" r="43" stroke-width="2.5" opacity="0.85"/>' +
    '<circle cx="48" cy="48" r="35.5" stroke-width="1" opacity="0.38" stroke-dasharray="3 5"/>' +
    '<g stroke-width="3.4" stroke-linecap="round">' +
    '<circle cx="34" cy="50" r="12"/>' +
    '<circle cx="62" cy="50" r="12"/>' +
    '<rect x="44.5" y="46" width="7" height="8" rx="2.4"/>' +
    "</g>" +
    '<g stroke-width="2" opacity="0.55">' +
    '<circle cx="34" cy="50" r="6.5"/>' +
    '<circle cx="62" cy="50" r="6.5"/>' +
    "</g>" +
    "</svg>";

const CSS = `
#ending-overlay {
    position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
    padding: 1.4rem; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    background:
        radial-gradient(120% 95% at 50% 0%, rgba(58, 42, 26, 0.6), rgba(11, 9, 7, 0) 62%),
        rgba(7, 6, 5, 0.86);
    opacity: 0; transition: opacity 0.4s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
}
#ending-overlay.ending-in { opacity: 1; }
#ending-overlay.ending-out { opacity: 0; pointer-events: none; }

.ending-card {
    position: relative; width: min(34rem, 94vw); max-height: 92vh; overflow: auto;
    background: linear-gradient(180deg, rgba(31, 24, 17, 0.96), rgba(18, 13, 9, 0.98));
    border: 1px solid var(--line, rgba(150, 116, 78, 0.34)); border-radius: 18px;
    padding: 2rem clamp(1.4rem, 4vw, 2.4rem) 1.7rem; text-align: center;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    transform: translateY(22px) scale(0.985); opacity: 0;
    transition: transform 0.55s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
                opacity 0.55s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
}
#ending-overlay.ending-in .ending-card { transform: none; opacity: 1; }

.ending-kicker {
    margin: 0 0 0.5rem; color: var(--gold, #e6b96a); font-size: 0.72rem;
    letter-spacing: 0.34em; text-transform: uppercase;
}
.ending-title {
    font-family: "Fraunces Soft", "Iowan Old Style", Georgia, serif;
    font-size: clamp(2.1rem, 7vw, 3.3rem); line-height: 1; letter-spacing: 0.04em;
    margin: 0.1rem 0 0.8rem;
}
.ending-title em { font-style: normal; color: var(--gold, #e6b96a); }
.ending-seal {
    width: 88px; height: 88px; margin: 0 auto 0.7rem; color: var(--gold, #e6b96a);
    filter: drop-shadow(0 8px 18px rgba(230, 185, 106, 0.25));
}
.ending-seal svg { display: block; width: 100%; height: 100%; }
.ending-named {
    margin: 0.35rem 0 0.15rem; color: var(--gold, #e6b96a);
    font-size: clamp(1.35rem, 4.5vw, 1.9rem); line-height: 1.15; font-weight: 700;
}
.ending-line { margin: 0.3rem 0; font-size: 1.06rem; color: var(--ink, #f6ecdd); }
.ending-line b { color: var(--gold, #e6b96a); }
.ending-line .where { color: var(--gold-soft, #f0d39a); font-style: italic; }
.ending-sub { margin: 0.75rem 0 0; color: var(--dim, #c9b39a); font-size: 0.9rem; }

.ending-actions { display: flex; flex-direction: column; gap: 0.55rem; align-items: center; margin-top: 1.5rem; }
.ending-card button {
    font: inherit; color: var(--ink, #f6ecdd); cursor: pointer; position: relative;
    width: 100%; padding: 0.8rem 1.1rem; border-radius: 11px; overflow: hidden;
    background: linear-gradient(180deg, rgba(58, 45, 34, 0.96), rgba(38, 29, 22, 0.96));
    border: 1px solid var(--line, rgba(150, 116, 78, 0.34));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    transition: transform 0.18s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
                box-shadow 0.25s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)),
                border-color 0.25s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
}
.ending-card button::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(120deg, transparent 30%, rgba(255, 240, 210, 0.22) 50%, transparent 70%);
    transform: translateX(-120%); transition: transform 0.6s var(--ease, cubic-bezier(0.22, 1, 0.36, 1));
}
.ending-card button:hover { transform: translateY(-2px); border-color: var(--gold, #e6b96a); }
.ending-card button:hover::after { transform: translateX(120%); }
.ending-card button:active { transform: translateY(0) scale(0.985); }
.ending-card button:focus-visible { outline: 2px solid var(--gold, #e6b96a); outline-offset: 2px; }
.ending-card button.ending-primary {
    background: linear-gradient(180deg, var(--gold-soft, #f0d39a), var(--gold, #e6b96a));
    color: #2a1c10; border-color: #f0cf95; font-weight: 700;
    box-shadow: 0 6px 22px rgba(230, 185, 106, 0.32);
}
.ending-card button.ending-primary:hover { box-shadow: 0 12px 30px rgba(230, 185, 106, 0.45); }
.ending-card button.ending-link {
    width: auto; background: transparent; border-color: transparent; box-shadow: none;
    color: var(--dim, #c9b39a); font-size: 0.86rem; padding: 0.35rem 0.7rem;
    text-decoration: underline; text-underline-offset: 3px;
}
.ending-card button.ending-link:hover { color: var(--ink, #f6ecdd); border-color: transparent; transform: none; }
.ending-card button.ending-link::after { display: none; }

.ending-rise { opacity: 0; animation: endingRise 0.6s var(--ease, cubic-bezier(0.22, 1, 0.36, 1)) both; animation-delay: var(--d, 0s); }
@keyframes endingRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
`;

function injectStyles() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export function createEnding({ onRetry, onRetrySameMap, onEvent } = {}) {
    injectStyles();

    const fire = (name) => {
        if (typeof onEvent !== "function") return;
        try { onEvent(name); } catch (_) { /* an observer must never break the card */ }
    };

    const overlay = document.createElement("div");
    overlay.id = "ending-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ending-title");
    overlay.setAttribute("aria-describedby", "ending-desc");
    overlay.style.display = "none";
    document.body.appendChild(overlay);

    let primaryBtn = null;
    let chosen = false;
    let hideTimer = null;

    const retry = () => {
        if (chosen) return;
        chosen = true;
        hide();
        fire("retry");
        if (typeof onRetry === "function") onRetry();
    };

    const same = () => {
        if (chosen) return;
        chosen = true;
        hide();
        fire("same");
        if (typeof onRetrySameMap === "function") onRetrySameMap();
    };

    const onKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            retry();
            return;
        }
        if (event.key === "Enter") {
            // Let Enter activate the focused control natively (e.g. the "same
            // house" link) instead of double-firing a retry.
            const t = event.target;
            const onControl = t && overlay.contains(t) && (t.tagName === "BUTTON" || t.tagName === "A");
            if (onControl) return;
            event.preventDefault();
            retry();
        }
    };

    const rise = (node, delay) => {
        node.classList.add("ending-rise");
        node.style.setProperty("--d", delay + "s");
        return node;
    };

    const buildActions = () => {
        const actions = el("div", "ending-actions");
        primaryBtn = el("button", "ending-primary", "Play again in a new house");
        primaryBtn.type = "button";
        primaryBtn.addEventListener("click", retry);
        const link = el("button", "ending-link", "same house");
        link.type = "button";
        link.addEventListener("click", same);
        actions.append(primaryBtn, link);
        return actions;
    };

    const buildWin = (result) => {
        const card = el("div", "ending-card");
        const n = Number(result.officerCount) > 0 ? Math.floor(Number(result.officerCount)) : 2;
        const noun = n === 1 ? "officer" : "officers";

        const kicker = rise(el("p", "ending-kicker", "The case is closed"), 0.05);
        const title = rise(el("h2", "ending-title"), 0.1);
        title.id = "ending-title";
        title.append(document.createTextNode("CASE "), el("em", null, "CLOSED"));

        const seal = el("div", "ending-seal");
        seal.innerHTML = SEAL_SVG;
        rise(seal, 0.16);

        const named = rise(el("p", "ending-named", result.culpritName || "The killer"), 0.26);
        const line = rise(
            el("p", "ending-line", "taken away in handcuffs by " + n + " " + noun + "."),
            0.34
        );
        const victim = rise(el("p", "ending-sub", "In memory of " + (result.victimName || "the victim") + "."), 0.42);
        victim.id = "ending-desc";

        card.append(kicker, title, seal, named, line, victim, rise(buildActions(), 0.5));
        return card;
    };

    const buildLose = (result) => {
        const card = el("div", "ending-card");
        const where = result.scene || "the house";

        const kicker = rise(el("p", "ending-kicker", "Not this time"), 0.05);
        const title = rise(el("h2", "ending-title"), 0.1);
        title.id = "ending-title";
        title.append(document.createTextNode("WR"), el("em", null, "ONG"));

        const line = rise(el("p", "ending-line", "You accused the wrong person."), 0.2);
        const named = rise(el("p", "ending-named", result.culpritName || "The killer"), 0.28);

        const reveal = el("p", "ending-line", "The killer was ");
        reveal.append(el("b", null, result.culpritName || "the one you missed"));
        reveal.append(document.createTextNode(", seen in "));
        reveal.append(el("span", "where", where));
        reveal.append(document.createTextNode("."));
        rise(reveal, 0.36);

        const victim = rise(el("p", "ending-sub", "In memory of " + (result.victimName || "the victim") + "."), 0.44);
        victim.id = "ending-desc";

        card.append(kicker, title, line, named, reveal, victim, rise(buildActions(), 0.52));
        return card;
    };

    const hide = () => {
        overlay.classList.remove("ending-in");
        overlay.classList.add("ending-out");
        document.removeEventListener("keydown", onKeyDown, true);
        if (primaryBtn && document.activeElement === primaryBtn) primaryBtn.blur();
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            overlay.style.display = "none";
            overlay.classList.remove("ending-out");
            hideTimer = null;
        }, 320);
    };

    const show = (result = {}) => {
        injectStyles();
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        chosen = false;
        overlay.innerHTML = "";
        overlay.classList.remove("ending-out");

        const isLose = result && result.kind === "lose";
        overlay.appendChild(isLose ? buildLose(result) : buildWin(result));

        overlay.style.display = "grid";
        void overlay.offsetWidth; // reflow so the transition/animation restarts
        overlay.classList.add("ending-in");

        document.addEventListener("keydown", onKeyDown, true);
        if (primaryBtn) primaryBtn.focus();

        fire("shown");
    };

    return { show, hide };
}

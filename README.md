# Whodunnit 3D — a voice murder mystery

Walk a mansion in first person, question five AI suspects (out loud or by typing),
catch the one whose story breaks, and accuse the killer. Every playthrough is a
new case, and you pay with your own Pollen.

**Play:** https://guest453.github.io/whodunnit/

## Controls

- **WASD / arrows** to walk, **mouse** to look (click the house to capture the pointer)
- Look at a suspect → **E** to talk
- Type a question, or hit **Mic** to ask out loud
- The **Notebook** records every claim; **Accuse** when you are sure

## How a case works

- **Five suspects**, each with a distinct look and voice, standing in the five rooms.
- One is the **culprit**; one innocent **witness** saw them at the scene.
- Ask where they were. The culprit lies; the witness tells the truth. When both
  stories are on record, the notebook flags the contradiction — that is your evidence.
- The mystery is generated in **code** (`case.js`): the victim, setting, weapon,
  rooms, suspects, the culprit's **fixed cover story**, the witness's sighting and
  a clue only the killer knows. The text model only role-plays from those facts,
  so the culprit can never drift and every case is solvable.

## Layout

```
index.html        page + HUD
src/main.js       integrator (scene, interaction, notebook, accusation)
src/api.js        Pollinations calls (BYOP sign-in, suspect replies, TTS, STT)
src/env.js        the mansion: five rooms, walls, lighting, colliders, anchors
src/people.js     the five procedural suspects (idle animation, speech bubbles)
src/controls.js   first-person walking with wall collision
src/decor.js      furniture, props and the scene-of-the-crime marker
src/contract.md   the frozen module interfaces
case.js           the case engine (pure, seeded) — unchanged from v1
dist/bundle.js    built output (esbuild + three)
```

## Build & test

```bash
npm install
npm run build          # esbuild src/main.js -> dist/bundle.js
node --test case.test.mjs test/3d.test.mjs   # case invariants + 3D contract
node wiring.test.mjs   # HUD wiring + case fields
```

`test/3d.test.mjs` builds the whole world in Node with real Three.js (only
rendering needs WebGL) and asserts each module honours `src/contract.md`.

## Voice

Questions can be spoken (recorded, transcribed with `POST /v1/audio/transcriptions`)
or typed. Suspect replies are spoken with the user's own Pollen via
`POST /v1/audio/speech`.

## Sign-in

Connect User Wallets (BYOP): "Connect Pollen" runs OAuth PKCE with the game's
publishable App Key; the returned `sk_` token stays in `sessionStorage` for the
tab. Nothing is billed until you question a suspect.

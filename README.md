# Whodunnit — a voice murder mystery

Walk a mansion in first person, question five AI suspects **out loud** (or by
typing), catch the one whose story breaks, and accuse the killer. Get it right and
the officers arrive to cuff them; get it wrong and the camera turns to the real
killer. Every playthrough is a **new case in one of three different houses**, and
you pay with your own Pollen.

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
- **Accuse.** Right → a cutscene as two officers walk in and handcuff the killer,
  then a **CASE CLOSED** card. Wrong → the camera turns to the real culprit and a
  **WRONG** card reveals them. Either way: **play again in a new house**.

The mystery is generated in **code** (`case.js`): the victim, setting, weapon,
rooms, suspects, the culprit's **fixed cover story**, the witness's sighting and
a clue only the killer knows. The text model only role-plays from those facts, so
the culprit can never drift, and every case is solvable.

## Three houses

| Map | Layout | Mood |
| --- | --- | --- |
| Ashcroft Manor | central hall with wings | warm browns |
| Belgrave Terrace | a linear row of rooms | cool moonlit blues |
| St. Ives Chapel House | a cross/plus plan | sepia, candlelit |

The world is rebuilt per case, so "play again" changes the geometry, palette and
lighting, not just the suspects.

## Layout

```text
index.html        page + HUD
src/main.js       integrator (scene, interaction, cutscene flow, notebook, accusation)
src/api.js        Pollinations calls (BYOP sign-in, suspect replies, TTS, STT)
src/maps.js       the three house layouts + palettes
src/env.js        builds a house: rooms, walls, doorways, lighting, colliders, anchors
src/people.js     the five procedural suspects (idle animation, speech bubbles)
src/controls.js   first-person walking with wall collision
src/decor.js      furniture, props and the scene-of-the-crime marker
src/police.js     the officers and the handcuffs
src/cutscene.js   the arrest sequence (camera direction)
src/ending.js     the CASE CLOSED / WRONG cards
case.js           the case engine (pure, seeded)
dist/bundle.js    built output (esbuild + three)
```

## Build & test

```bash
npm install
npm run build                                  # esbuild -> dist/bundle.js (+ cache stamp)
node --test case.test.mjs test/3d.test.mjs test/layers.test.mjs
node wiring.test.mjs
```

`test/3d.test.mjs` builds the whole world (and all three maps) in Node with real
Three.js — only rendering needs WebGL — and asserts each module honours the frozen
interfaces in `src/contract.md` and `src/cutscene-contract.md`.

## Voice

Questions can be spoken (recorded, transcribed with `POST /v1/audio/transcriptions`)
or typed. Suspect replies are spoken with the user's own Pollen via
`POST /v1/audio/speech`; the line appears when the audio is ready, so the words and
the speech start together.

## Sign-in

Connect User Wallets (BYOP): "Connect Pollen" runs OAuth PKCE with the game's
publishable App Key; the returned `sk_` token is the player's own scoped key.
Nothing is billed until a question is asked.

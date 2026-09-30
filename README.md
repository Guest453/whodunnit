# Whodunnit — a voice murder mystery

Question AI suspects **out loud** (or by typing), catch a contradiction in their
alibis, and accuse the killer. Every playthrough is a new case, and you pay with
your own Pollen.

**Play:** https://guest453.github.io/whodunnit/

## How a case works

- **Five suspects**, each with their own manner and voice.
- One is the **culprit**. One **innocent witness** saw the culprit at the scene.
- Ask suspects where they were. The culprit lies; the witness tells the truth.
  When both stories are on the table, the notebook flags the contradiction.
- **Accuse** whoever you think did it. You get one verdict: caught, or wrong.

The mystery is generated in **code** (`case.js`): the victim, setting, weapon,
suspects, the culprit and their **fixed cover story**, the witness's sighting,
and a clue only the killer would know. The text model only role-plays from those
facts — so the culprit's story can never drift, and every case is solvable:

- `case.js` — the case engine (deterministic per seed; a new seed per playthrough)
- `game.js` — the UI, voice input (`/v1/audio/transcriptions`) and voices (`/v1/audio/speech`)
- `index.html` — the page
- `case.test.mjs` — unit tests (500 generated cases + invariants)
- `wiring.test.mjs` — checks every element the game touches exists

## Voices

Questions can be typed or spoken (Web Speech fallback: the mic button records and
transcribes). Suspect replies are spoken with the user's own Pollen via
`POST /v1/audio/speech`.

## Sign-in

Connect User Wallets (BYOP). "Connect Pollen" runs the OAuth PKCE flow with the
app's publishable key; the returned `sk_` token stays in `sessionStorage` for the
tab. Nothing is paid for until you question a suspect.

## Verify

```bash
node --test case.test.mjs     # 8 tests, 500 cases
node wiring.test.mjs          # DOM/field wiring
```

// Minimal runnable check (ponytail: one self-check, no framework).
// Verifies station data loads with all 6 genres and player-detect doesn't throw.
import assert from "node:assert";
import * as radio from "./sources/radio.js";
import * as player from "./player.js";

const expected = [
  "jazz", "classical", "indie", "rock", "country", "pop",
  "ambient", "lofi", "soul", "eighties", "world", "house", "techno",
  "kexp", "kcrw", "wfmu", "nts", "wwoz", "paradise",
];
const got = radio.genres();
for (const g of expected) assert.ok(got.includes(g), `missing genre: ${g}`);

const p = player.playerAvailable();
assert.ok(p === null || p === "mpv" || p === "ffplay");

console.log(`selfcheck OK — genres=${got.join(",")} player=${p ?? "none(will hint on play)"}`);

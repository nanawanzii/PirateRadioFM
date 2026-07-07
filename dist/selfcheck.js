import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/selfcheck.ts
import assert from "node:assert";

// src/player.ts
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname2, join as join4 } from "node:path";

// src/state.ts
import { homedir } from "node:os";
import { join } from "node:path";

// src/proc.ts
var isWin = process.platform === "win32";
var isMac = process.platform === "darwin";

// src/state.ts
var stateDir = join(homedir(), ".pirate-radio");
var statePath = join(stateDir, "state.json");
var anchorPath = join(stateDir, "anchor.json");
var defaults = {
  state: "stopped",
  source: null,
  genre: null,
  stationName: null,
  stationIndex: 0,
  title: null,
  volume: 80,
  spotifyVerifier: null
};
var now = { ...defaults };

// src/stations.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as join2 } from "node:path";
var here = dirname(fileURLToPath(import.meta.url));
var stations = JSON.parse(
  readFileSync(join2(here, "..", "data", "stations.json"), "utf8")
);
function all() {
  return stations;
}
function genres() {
  return Object.keys(stations);
}

// src/registry.ts
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
var dir = join3(homedir2(), ".pirate-radio");
var registryPath = join3(dir, "players.json");
var lockPath = join3(dir, "players.lock");

// src/player.ts
function detect() {
  for (const p2 of ["mpv", "ffplay"]) {
    try {
      if (process.platform === "win32") {
        execFileSync("where", [p2], { stdio: "ignore" });
      } else {
        execFileSync("sh", ["-c", `command -v ${p2}`], { stdio: "ignore" });
      }
      return p2;
    } catch {
    }
  }
  return null;
}
function playerAvailable() {
  return detect();
}
var here2 = dirname2(fileURLToPath2(import.meta.url));

// src/sources/radio.ts
var stations2 = all();
function genres2() {
  return genres();
}

// src/selfcheck.ts
var expected = [
  "jazz",
  "classical",
  "indie",
  "rock",
  "country",
  "pop",
  "ambient",
  "lofi",
  "soul",
  "eighties",
  "world",
  "house",
  "techno",
  "kexp",
  "kcrw",
  "wfmu",
  "nts",
  "wwoz",
  "paradise"
];
var got = genres2();
for (const g of expected) assert.ok(got.includes(g), `missing genre: ${g}`);
var p = playerAvailable();
assert.ok(p === null || p === "mpv" || p === "ffplay");
console.log(`selfcheck OK \u2014 genres=${got.join(",")} player=${p ?? "none(will hint on play)"}`);

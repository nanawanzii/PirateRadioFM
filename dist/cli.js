#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/player.ts
import { spawn, execFileSync as execFileSync2 } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname2, join as join4 } from "node:path";

// src/state.ts
import { readFileSync as readFileSync2, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// src/proc.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
var isWin = process.platform === "win32";
var isMac = process.platform === "darwin";
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function procStartToken(pid) {
  if (!pidAlive(pid)) return null;
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const rest = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
      const starttime = rest[19];
      return starttime ? `l:${starttime}` : null;
    }
    if (isMac) {
      const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        timeout: 4e3
      }).trim();
      return out ? `d:${out}` : null;
    }
    if (isWin) {
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).CreationDate`
        ],
        { encoding: "utf8", timeout: 8e3 }
      ).trim();
      return out ? `w:${out}` : null;
    }
  } catch {
  }
  return null;
}
function sameProcess(pid, token) {
  if (!pidAlive(pid)) return false;
  if (!token) return true;
  const cur = procStartToken(pid);
  return cur === null ? true : cur === token;
}
function killPid(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return;
  try {
    if (isWin) {
      execFileSync("taskkill", ["/F", "/PID", String(pid), "/T"], {
        stdio: "ignore",
        timeout: 8e3
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
  }
}
function findOrphanPlayers(hosts2) {
  if (hosts2.length === 0) return [];
  const wanted = hosts2.map((h) => h.toLowerCase());
  const matches = (cmd) => {
    const c = cmd.toLowerCase();
    return wanted.some((h) => c.includes(h));
  };
  try {
    if (isWin) {
      const out2 = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='mpv.exe' OR Name='ffplay.exe'" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`
        ],
        { encoding: "utf8", timeout: 8e3 }
      );
      return parsePidLines(out2, "	", matches);
    }
    const out = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      timeout: 8e3
    });
    return parseUnixPs(out, matches);
  } catch {
    return [];
  }
}
function parsePidLines(out, sep, matches) {
  const pids = [];
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf(sep);
    if (i === -1) continue;
    const pid = Number(line.slice(0, i).trim());
    const cmd = line.slice(i + 1);
    if (Number.isInteger(pid) && pid > 0 && matches(cmd)) pids.push(pid);
  }
  return pids;
}
function parseUnixPs(out, matches) {
  const pids = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.indexOf(" ");
    if (sp === -1) continue;
    const pid = Number(trimmed.slice(0, sp));
    const cmd = trimmed.slice(sp + 1);
    if (!/(^|\/)(mpv|ffplay)\b/.test(cmd)) continue;
    if (Number.isInteger(pid) && pid > 0 && matches(cmd)) pids.push(pid);
  }
  return pids;
}

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
function loadState() {
  if (!existsSync(statePath)) return;
  try {
    const raw = JSON.parse(readFileSync2(statePath, "utf8"));
    const target = now;
    for (const key of Object.keys(defaults)) {
      target[key] = key in raw ? raw[key] : defaults[key];
    }
  } catch {
    Object.assign(now, defaults);
  }
}
function saveState() {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(now, null, 2));
  renameSync(tmp, statePath);
}
function readAnchor() {
  if (!existsSync(anchorPath)) return null;
  try {
    const a = JSON.parse(readFileSync2(anchorPath, "utf8"));
    if (typeof a.pid === "number" && a.pid > 0) {
      return { pid: a.pid, token: a.token ?? null };
    }
  } catch {
  }
  return null;
}
function describe() {
  if (now.state === "stopped") return "Stopped.";
  const what = now.source === "radio" ? `${now.genre} radio \u2014 ${now.stationName}` : `Spotify \u2014 ${now.title ?? "(unknown)"}`;
  return `${now.state === "paused" ? "Paused" : "Playing"}: ${what} (vol ${now.volume})`;
}

// src/stations.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as join2 } from "node:path";
var here = dirname(fileURLToPath(import.meta.url));
var stations = JSON.parse(
  readFileSync3(join2(here, "..", "data", "stations.json"), "utf8")
);
function all() {
  return stations;
}
function genres() {
  return Object.keys(stations);
}
var hostCache = null;
function hosts() {
  if (hostCache) return hostCache;
  const set = /* @__PURE__ */ new Set();
  for (const list2 of Object.values(stations)) {
    for (const st of list2) {
      try {
        set.add(new URL(st.url).host.toLowerCase());
      } catch {
      }
    }
  }
  hostCache = [...set];
  return hostCache;
}

// src/registry.ts
import {
  readFileSync as readFileSync4,
  writeFileSync as writeFileSync2,
  renameSync as renameSync2,
  mkdirSync as mkdirSync2,
  rmSync,
  rmdirSync,
  existsSync as existsSync2,
  statSync
} from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
var dir = join3(homedir2(), ".pirate-radio");
var registryPath = join3(dir, "players.json");
var lockPath = join3(dir, "players.lock");
function readRaw() {
  if (!existsSync2(registryPath)) return { players: [], watchdogs: [] };
  try {
    const r = JSON.parse(readFileSync4(registryPath, "utf8"));
    return { players: r.players ?? [], watchdogs: r.watchdogs ?? [] };
  } catch {
    return { players: [], watchdogs: [] };
  }
}
function writeRaw(r) {
  mkdirSync2(dir, { recursive: true });
  const tmp = `${registryPath}.${process.pid}.tmp`;
  writeFileSync2(tmp, JSON.stringify(r, null, 2));
  renameSync2(tmp, registryPath);
}
var LOCK_STALE_MS = 15e3;
var LOCK_WAIT_MS = 5e3;
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function withLock(fn) {
  mkdirSync2(dir, { recursive: true });
  const holderFile = join3(lockPath, "holder");
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (; ; ) {
    try {
      mkdirSync2(lockPath);
      break;
    } catch {
      let broke = false;
      try {
        const holderPid = Number(readFileSync4(holderFile, "utf8").trim());
        if (!pidAlive(holderPid)) broke = true;
      } catch {
      }
      if (!broke) {
        try {
          const age = Date.now() - statMtime(lockPath);
          if (age > LOCK_STALE_MS) broke = true;
        } catch {
        }
      }
      if (broke) {
        forceReleaseLock();
        continue;
      }
      if (Date.now() > deadline) {
        forceReleaseLock();
        continue;
      }
      sleep(50);
    }
  }
  try {
    writeFileSync2(holderFile, String(process.pid));
    const reg = readRaw();
    const result = fn(reg);
    writeRaw(reg);
    return result;
  } finally {
    releaseLock();
  }
}
function statMtime(p) {
  return statSync(p).mtimeMs;
}
function releaseLock() {
  try {
    rmSync(join3(lockPath, "holder"), { force: true });
  } catch {
  }
  try {
    rmdirSync(lockPath);
  } catch {
  }
}
function forceReleaseLock() {
  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
  }
}
function addPlayer(pid, host) {
  const token = procStartToken(pid);
  withLock((r) => {
    r.players = prune(r.players);
    r.players.push({ pid, token, host });
  });
}
function addWatchdog(pid) {
  const token = procStartToken(pid);
  withLock((r) => {
    r.watchdogs = prune(r.watchdogs);
    r.watchdogs.push({ pid, token });
  });
}
function drainPlayers() {
  return withLock((r) => {
    const live = prune(r.players);
    r.players = [];
    return live;
  });
}
function drainWatchdogs() {
  return withLock((r) => {
    const live = prune(r.watchdogs);
    r.watchdogs = [];
    return live;
  });
}
function prune(list2) {
  return list2.filter((e) => sameProcess(e.pid, e.token));
}

// src/player.ts
function detect() {
  for (const p of ["mpv", "ffplay"]) {
    try {
      if (process.platform === "win32") {
        execFileSync2("where", [p], { stdio: "ignore" });
      } else {
        execFileSync2("sh", ["-c", `command -v ${p}`], { stdio: "ignore" });
      }
      return p;
    } catch {
    }
  }
  return null;
}
function installHint() {
  return "No audio player found. Install mpv (recommended) or ffmpeg:\n  macOS:   brew install mpv\n  Windows: winget install mpv   (or scoop install mpv)\n  Linux:   sudo apt install mpv  (or your package manager)";
}
function stop() {
  for (const p of drainPlayers()) killPid(p.pid);
  for (const w of drainWatchdogs()) killPid(w.pid);
  sweepOrphans();
}
function sweepOrphans() {
  for (const pid of findOrphanPlayers(hosts())) killPid(pid);
}
var here2 = dirname2(fileURLToPath2(import.meta.url));
function play(url, volume) {
  const player = detect();
  if (!player) throw new Error(installHint());
  stop();
  const args = player === "mpv" ? ["--no-video", "--really-quiet", `--volume=${volume}`, url] : ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(Math.round(volume / 100 * 256)), url];
  const child = spawn(player, args, { stdio: "ignore", detached: true });
  child.unref();
  if (child.pid) {
    let host;
    try {
      host = new URL(url).host;
    } catch {
    }
    addPlayer(child.pid, host);
    spawnWatchdog(child.pid);
  }
}
function spawnWatchdog(playerPid) {
  const anchor = readAnchor();
  if (!anchor) return;
  const wd = spawn(
    process.execPath,
    [
      join4(here2, "watchdog.js"),
      String(anchor.pid),
      anchor.token ?? "",
      String(playerPid)
    ],
    { stdio: "ignore", detached: true }
  );
  wd.unref();
  if (wd.pid) addWatchdog(wd.pid);
}

// src/sources/radio.ts
var stations2 = all();
function genres2() {
  return genres();
}
function list() {
  return genres2().map((g) => `${g} (${stations2[g].length} station${stations2[g].length > 1 ? "s" : ""})`).join(", ");
}
function normalize(genre) {
  const g = genre.trim().toLowerCase();
  return genres2().includes(g) ? g : null;
}
function playGenre(genre, index = 0) {
  const g = normalize(genre);
  if (!g) throw new Error(`Unknown genre "${genre}". Available: ${genres2().join(", ")}`);
  const st = stations2[g][index % stations2[g].length];
  play(st.url, now.volume);
  now.state = "playing";
  now.source = "radio";
  now.genre = g;
  now.stationName = st.name;
  now.stationIndex = index % stations2[g].length;
  return st;
}
function next() {
  if (now.source !== "radio" || !now.genre)
    throw new Error("No radio station is playing.");
  return playGenre(now.genre, now.stationIndex + 1);
}
function prev() {
  if (now.source !== "radio" || !now.genre)
    throw new Error("No radio station is playing.");
  const len = stations2[now.genre].length;
  return playGenre(now.genre, (now.stationIndex - 1 + len) % len);
}

// src/sources/spotify.ts
import { readFileSync as readFileSync5, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, existsSync as existsSync3 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join5 } from "node:path";
import { createHash, randomBytes } from "node:crypto";
var API = "https://api.spotify.com/v1";
var AUTH = "https://accounts.spotify.com";
var REDIRECT = "http://127.0.0.1:8888/callback";
var SCOPES = "user-read-playback-state user-modify-playback-state playlist-read-private";
var cfgDir = join5(homedir3(), ".pirate-radio");
var tokenPath = join5(cfgDir, "spotify.json");
function clientId() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("Set SPOTIFY_CLIENT_ID (from your Spotify developer app) to use Spotify.");
  return id;
}
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function loadTokens() {
  if (!existsSync3(tokenPath)) return null;
  return JSON.parse(readFileSync5(tokenPath, "utf8"));
}
function saveTokens(t) {
  mkdirSync3(cfgDir, { recursive: true });
  writeFileSync3(tokenPath, JSON.stringify(t, null, 2));
}
function loginUrl() {
  const v = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(v).digest());
  now.spotifyVerifier = v;
  const p = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: REDIRECT,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES
  });
  return `${AUTH}/authorize?${p}`;
}
async function complete(code) {
  const v = now.spotifyVerifier;
  if (!v) throw new Error("Call spotify_login first to start the flow.");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: clientId(),
    code_verifier: v
  });
  const r = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error(`Token exchange failed: ${await r.text()}`);
  const j = await r.json();
  saveTokens({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1e3 });
  now.spotifyVerifier = null;
}
async function accessToken() {
  const t = loadTokens();
  if (!t) throw new Error("Not logged in to Spotify. Run spotify_login.");
  if (Date.now() < t.expires_at - 3e4) return t.access_token;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: t.refresh_token,
    client_id: clientId()
  });
  const r = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${await r.text()}`);
  const j = await r.json();
  const next2 = { access_token: j.access_token, refresh_token: j.refresh_token ?? t.refresh_token, expires_at: Date.now() + j.expires_in * 1e3 };
  saveTokens(next2);
  return next2.access_token;
}
async function api(path, init) {
  const tok = await accessToken();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...init?.headers ?? {}, Authorization: `Bearer ${tok}` }
  });
  if (r.status === 404)
    throw new Error("No active Spotify device found. Open the Spotify app (Premium required) and play something once, then retry.");
  if (r.status === 403)
    throw new Error("Spotify refused the command. Premium is required for playback control.");
  return r;
}
async function listPlaylists() {
  const r = await api("/me/playlists?limit=20");
  const j = await r.json();
  const items = (j.items ?? []).map((p) => `\u2022 ${p.name}  [${p.uri}]`);
  return items.length ? items.join("\n") : "No playlists found.";
}
async function playContext(uriOrName) {
  let uri = uriOrName;
  if (!uri.startsWith("spotify:")) {
    const r = await api("/me/playlists?limit=50");
    const j = await r.json();
    const hit = (j.items ?? []).find((p) => p.name.toLowerCase() === uriOrName.toLowerCase());
    if (!hit) throw new Error(`No playlist named "${uriOrName}". Use spotify_list_playlists.`);
    uri = hit.uri;
  }
  await api("/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: uri })
  });
  now.state = "playing";
  now.source = "spotify";
  now.title = uri;
  return `Playing ${uri} on your Spotify device.`;
}
async function pause() {
  await api("/me/player/pause", { method: "PUT" });
}
async function resume() {
  await api("/me/player/play", { method: "PUT" });
}
async function skipNext() {
  await api("/me/player/next", { method: "POST" });
}
async function skipPrev() {
  await api("/me/player/previous", { method: "POST" });
}

// src/tools.ts
var noArgs = { type: "object", properties: {}, additionalProperties: false };
function reply(text, _opts) {
  return text;
}
var tools = [
  {
    name: "radio_list",
    description: "List available built-in radio genres and current playback state.",
    schema: noArgs,
    handler: () => reply(`Genres: ${list()}
${describe()}`)
  },
  {
    name: "radio_play",
    // Genre list derived from the station data so it never drifts out of sync.
    description: `Play a built-in genre radio station. Genres: ${genres2().join(", ")}.`,
    schema: { type: "object", properties: { genre: { type: "string" } }, required: ["genre"] },
    handler: (a) => {
      const st = playGenre(String(a.genre));
      return reply(`> ${now.genre} \u2014 ${st.name}`);
    }
  },
  {
    name: "radio_next",
    description: "Switch to the next station (radio) or next track (Spotify).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") {
        await skipNext();
        return reply("Next track.");
      }
      const st = next();
      return reply(`Next: ${now.genre} \u2014 ${st.name}`);
    }
  },
  {
    name: "radio_prev",
    description: "Switch to the previous station (radio) or previous track (Spotify).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") {
        await skipPrev();
        return reply("Previous track.");
      }
      const st = prev();
      return reply(`Prev: ${now.genre} \u2014 ${st.name}`);
    }
  },
  {
    name: "radio_pause",
    description: "Pause playback (radio: stops the stream; Spotify: pauses the device).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") await pause();
      else stop();
      now.state = "paused";
      return reply("|| Paused.");
    }
  },
  {
    name: "radio_resume",
    description: "Resume playback.",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") await resume();
      else if (now.source === "radio" && now.genre) playGenre(now.genre, now.stationIndex);
      else throw new Error("Nothing to resume. Use radio_play or spotify_play_playlist.");
      now.state = "playing";
      return reply("> Resumed.");
    }
  },
  {
    name: "radio_stop",
    description: "Stop playback entirely.",
    schema: noArgs,
    handler: () => {
      stop();
      now.state = "stopped";
      now.source = null;
      return reply("[] Stopped.");
    }
  },
  {
    name: "radio_now_playing",
    description: "Show what is currently playing.",
    schema: noArgs,
    handler: () => reply(describe())
  },
  {
    name: "radio_volume",
    description: "Set volume 0-100 (applies to radio; restarts the current stream).",
    schema: { type: "object", properties: { level: { type: "number", minimum: 0, maximum: 100 } }, required: ["level"] },
    handler: (a) => {
      now.volume = Math.max(0, Math.min(100, Math.round(Number(a.level))));
      if (now.source === "radio" && now.state === "playing" && now.genre)
        playGenre(now.genre, now.stationIndex);
      return reply(`vol ${now.volume}`);
    }
  },
  {
    name: "spotify_login",
    description: "Start Spotify OAuth. Returns a URL to open; then paste the code with spotify_complete_login.",
    schema: noArgs,
    handler: () => `Open this URL, approve, then copy the "code" query param from the redirect and call spotify_complete_login:
${loginUrl()}`
  },
  {
    name: "spotify_complete_login",
    description: "Finish Spotify login by pasting the authorization code from the redirect URL.",
    schema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    handler: async (a) => {
      await complete(String(a.code));
      return "Spotify linked.";
    }
  },
  {
    name: "spotify_list_playlists",
    description: "List your Spotify playlists (requires login).",
    schema: noArgs,
    handler: () => listPlaylists()
  },
  {
    name: "spotify_play_playlist",
    description: "Play a Spotify playlist/podcast by name or uri. Requires Premium + a running Spotify client.",
    schema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] },
    handler: async (a) => reply(await playContext(String(a.target)))
  }
];

// src/cli.ts
async function main() {
  const [, , toolName, ...rest] = process.argv;
  if (!toolName) {
    console.error("Usage: cli.js <tool-name> [json-args]");
    console.error("Available tools: " + tools.map((t) => t.name).join(", "));
    process.exit(1);
  }
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    console.error("Available: " + tools.map((t) => t.name).join(", "));
    process.exit(1);
  }
  let args = {};
  if (rest.length === 1 && rest[0].startsWith("{")) {
    args = JSON.parse(rest[0]);
  } else {
    for (const kv of rest) {
      const eq = kv.indexOf("=");
      if (eq === -1) continue;
      const k = kv.slice(0, eq);
      const v = kv.slice(eq + 1);
      args[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
  }
  loadState();
  try {
    const out = await tool.handler(args);
    saveState();
    process.stdout.write(out + "\n");
  } catch (e) {
    saveState();
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
main();

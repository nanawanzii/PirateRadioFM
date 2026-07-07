// Tool definitions + handlers. Registered on the MCP server in index.ts.
import * as radio from "./sources/radio.js";
import * as spotify from "./sources/spotify.js";
import * as player from "./player.js";
import { now, describe } from "./state.js";

type Handler = (args: any) => Promise<string> | string;
interface Tool { name: string; description: string; schema: any; handler: Handler; }

const noArgs = { type: "object", properties: {}, additionalProperties: false };

function reply(text: string, _opts?: { scratch?: boolean }): string {
  return text;
}

export const tools: Tool[] = [
  {
    name: "radio_list",
    description: "List available built-in radio genres and current playback state.",
    schema: noArgs,
    handler: () => reply(`Genres: ${radio.list()}\n${describe()}`),
  },
  {
    name: "radio_play",
    // Genre list derived from the station data so it never drifts out of sync.
    description: `Play a built-in genre radio station. Genres: ${radio.genres().join(", ")}.`,
    schema: { type: "object", properties: { genre: { type: "string" } }, required: ["genre"] },
    handler: (a) => {
      const st = radio.playGenre(String(a.genre));
      return reply(`> ${now.genre} — ${st.name}`);
    },
  },
  {
    name: "radio_next",
    description: "Switch to the next station (radio) or next track (Spotify).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") { await spotify.skipNext(); return reply("Next track."); }
      const st = radio.next();
      return reply(`Next: ${now.genre} — ${st.name}`);
    },
  },
  {
    name: "radio_prev",
    description: "Switch to the previous station (radio) or previous track (Spotify).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") { await spotify.skipPrev(); return reply("Previous track."); }
      const st = radio.prev();
      return reply(`Prev: ${now.genre} — ${st.name}`);
    },
  },
  {
    name: "radio_pause",
    description: "Pause playback (radio: stops the stream; Spotify: pauses the device).",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") await spotify.pause();
      else player.stop();
      now.state = "paused";
      return reply("|| Paused.");
    },
  },
  {
    name: "radio_resume",
    description: "Resume playback.",
    schema: noArgs,
    handler: async () => {
      if (now.source === "spotify") await spotify.resume();
      else if (now.source === "radio" && now.genre) radio.playGenre(now.genre, now.stationIndex);
      else throw new Error("Nothing to resume. Use radio_play or spotify_play_playlist.");
      now.state = "playing";
      return reply("> Resumed.");
    },
  },
  {
    name: "radio_stop",
    description: "Stop playback entirely.",
    schema: noArgs,
    handler: () => {
      player.stop();
      now.state = "stopped";
      now.source = null;
      return reply("[] Stopped.");
    },
  },
  {
    name: "radio_now_playing",
    description: "Show what is currently playing.",
    schema: noArgs,
    handler: () => reply(describe()),
  },
  {
    name: "radio_volume",
    description: "Set volume 0-100 (applies to radio; restarts the current stream).",
    schema: { type: "object", properties: { level: { type: "number", minimum: 0, maximum: 100 } }, required: ["level"] },
    handler: (a) => {
      now.volume = Math.max(0, Math.min(100, Math.round(Number(a.level))));
      if (now.source === "radio" && now.state === "playing" && now.genre)
        radio.playGenre(now.genre, now.stationIndex);
      return reply(`vol ${now.volume}`);
    },
  },
  {
    name: "spotify_login",
    description: "Start Spotify OAuth. Returns a URL to open; then paste the code with spotify_complete_login.",
    schema: noArgs,
    handler: () =>
      `Open this URL, approve, then copy the "code" query param from the redirect and call spotify_complete_login:\n${spotify.loginUrl()}`,
  },
  {
    name: "spotify_complete_login",
    description: "Finish Spotify login by pasting the authorization code from the redirect URL.",
    schema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    handler: async (a) => { await spotify.complete(String(a.code)); return "Spotify linked."; },
  },
  {
    name: "spotify_list_playlists",
    description: "List your Spotify playlists (requires login).",
    schema: noArgs,
    handler: () => spotify.listPlaylists(),
  },
  {
    name: "spotify_play_playlist",
    description: "Play a Spotify playlist/podcast by name or uri. Requires Premium + a running Spotify client.",
    schema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] },
    handler: async (a) => reply(await spotify.playContext(String(a.target))),
  },
];

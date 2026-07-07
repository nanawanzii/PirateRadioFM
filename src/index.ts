#!/usr/bin/env node
// pirate-radio MCP server. stdio transport — works with Claude Code, Codex, Hermes.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools.js";
import { loadState, saveState, writeAnchor, clearAnchor, readAnchor, anchorAlive } from "./state.js";
import { stop } from "./player.js";

// This server process is a child of the Claude Code session. Record its PID +
// start-token as the "anchor": the detached watchdog spawned by the player polls
// it, so when this process dies (session closed / terminal shut / hard kill) the
// music is stopped even though a SessionEnd hook is not guaranteed to fire.
loadState();

// Startup orphan sweep: if a PREVIOUS session's anchor is dead (crash, hard kill,
// watchdog also killed) any music it started may still be playing. Clear it out
// before we take over, so a new session never inherits a stuck stream.
const prevAnchor = readAnchor();
if (prevAnchor && !anchorAlive(prevAnchor)) {
  stop(); // kills registered players + host orphans from the dead session
  clearAnchor();
}

writeAnchor(process.pid);

// Clean-exit fast path: when the server shuts down gracefully, stop the music
// and clear the anchor ourselves instead of waiting for the watchdog's poll.
let cleanedUp = false;
function cleanup(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    stop();
    saveState();
    clearAnchor();
  } catch {
    /* best effort on the way out */
  }
}
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => { cleanup(); process.exit(0); });
}

const server = new Server(
  { name: "pirate-radio", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  try {
    const out = await tool.handler(req.params.arguments ?? {});
    saveState(); // persist so CLI slash commands + watchdog see MCP-started playback
    return { content: [{ type: "text", text: out }] };
  } catch (e) {
    saveState();
    return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

---
description: Play jazz radio (default) or resume paused playback
allowed-tools: Bash(node:*)
---
Default: start jazz radio (below). But if the user explicitly asked to *resume* paused music rather than start jazz fresh, run `radio_resume` instead of the command below.

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" radio_play genre=jazz`

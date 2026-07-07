# PirateRadioFM

> Music radio for CLI coding agents

[中文文档](./README.zh-CN.md)

---

## Install


**Prerequisites:** Node.js ≥ 20, and `mpv` (recommended) or `ffplay`:

- Windows: `winget install mpv` (or `scoop install mpv`)
- macOS: `brew install mpv`
- Linux: `sudo apt install mpv`

Then add the marketplace and install:

```bash
claude plugin marketplace add nanawanzii/PirateRadioFM
claude plugin install pirate-radio@pirate-radio
```

**Restart Claude Code.** In a new session, type `/` — you should see `/jazz`,
`/classical`, `/next`, etc.

Uninstall:

```bash
claude plugin uninstall pirate-radio
claude plugin marketplace remove pirate-radio
```

---

## Commands


### Genre stations

| Command | Plays |
|---|---|
| `/jazz` | Jazz |
| `/classical` | Classical |
| `/indie` | Indie |
| `/rock` | Rock |
| `/country` | Country |
| `/pop` | Pop |
| `/ambient` | Ambient |
| `/lofi` | Lo-fi beats |
| `/soul` | Soul |
| `/eighties` | 80s |
| `/world` | World |
| `/house` | House |
| `/techno` | Techno / IDM |

### DJ / public stations

| Command | Station |
|---|---|
| `/kexp` | KEXP 90.3 Seattle (DJ indie / alternative) |
| `/kcrw` | KCRW Eclectic24 (Los Angeles) |
| `/wfmu` | WFMU freeform (New Jersey) |
| `/nts` | NTS London (underground / club) |
| `/wwoz` | WWOZ New Orleans (jazz & blues) |
| `/paradise` | Radio Paradise (curated eclectic) |

### Playback control

| Command | What it does |
|---|---|
| `/pause` | Pause playback |
| `/play` | Resume |
| `/next` | Next station / channel |
| `/prev` | Previous station / channel |

Stations with more than one stream (`/nts`, `/paradise`) rotate between their
channels with `/next`.

You can also just talk to the agent: *"play some jazz"*, *"switch station"*,
*"set volume to 60"*, *"stop the music"*.

---

## Roadmap

- **Spotify remote control** — play your own playlists / podcasts / albums
  through a running Spotify client. *(Coming soon.)*

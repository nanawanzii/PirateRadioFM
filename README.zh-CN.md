# PirateRadioFM

> 一个可嵌入 CLI 编程 agent 的音乐电台工具。

[English](./README.md)

---

## 安装


**前提：** Node.js ≥ 20，以及 `mpv`（推荐）或 `ffplay`：

- Windows：`winget install mpv`（或 `scoop install mpv`）
- macOS：`brew install mpv`
- Linux：`sudo apt install mpv`

然后加上 marketplace 直接装：

```bash
claude plugin marketplace add nanawanzii/PirateRadioFM
claude plugin install radiohead@radiohead
```
或者：
```bash
/plugin marketplace add nanawanzii/PirateRadioFM
/plugin install radiohead@radiohead
```
**重启 Claude Code。** 在新会话里输 `/`，你应该能看到 `/jazz`、`/classical`、
`/next` 等命令。

卸载：

```bash
claude plugin uninstall radiohead
claude plugin marketplace remove radiohead
```

---

## 其他 agent（Codex、OpenCode、Hermes、pi）

底层的 MCP server 和 CLI 与宿主无关。克隆仓库后运行安装器，它会自动检测你装了
哪些 agent 并逐个配置：

```bash
git clone https://github.com/nanawanzii/PirateRadioFM
cd PirateRadioFM
node install.mjs            # 或指定：node install.mjs codex opencode hermes pi
```

| Agent | 安装内容 |
|---|---|
| **Codex** | MCP server 写入 `~/.codex/config.toml`，`/jazz` 式 prompts 写入 `~/.codex/prompts/` |
| **OpenCode** | MCP server 写入 `opencode.json`，斜杠命令写入 `~/.config/opencode/commands/` |
| **Hermes** | MCP server 写入 `~/.hermes/config.yaml` —— 直接对话即可：*"放点爵士"* |
| **pi** | `/jazz` 式 prompt 模板 + 一个 `radiohead` skill（pi 不支持 MCP，命令直接调用 `dist/cli.js`） |

装完重启对应 agent。`node install.mjs --uninstall` 可完整移除写入的所有内容。

"会话结束音乐自动停"在所有 MCP 宿主上都有效：server 是 agent 的子进程，agent
退出时 watchdog 会杀掉播放。唯一例外是 pi（没有可锚定的 server 进程），在 pi
里用 `/stop` 停止播放。

---

## 指令


### 风格电台

| 命令 | 播放 |
|---|---|
| `/jazz` | 爵士 |
| `/classical` | 古典 |
| `/indie` | 独立音乐 |
| `/rock` | 摇滚 |
| `/country` | 乡村 |
| `/pop` | 流行 |
| `/ambient` | 氛围 |
| `/lofi` | lo-fi |
| `/soul` | 灵魂乐 |
| `/eighties` | 80 年代 |
| `/world` | 世界音乐 |
| `/house` | 浩室 |
| `/techno` | techno / IDM |

### DJ / 公共电台

| 命令 | 电台 |
|---|---|
| `/kexp` | KEXP 90.3 西雅图（DJ 独立 / 另类） |
| `/kcrw` | KCRW Eclectic24（洛杉矶） |
| `/wfmu` | WFMU 自由派（新泽西） |
| `/nts` | NTS 伦敦（地下 / 俱乐部） |
| `/wwoz` | WWOZ 新奥尔良（爵士 & 蓝调） |
| `/paradise` | Radio Paradise（人工精选 eclectic） |

### 播放控制

| 命令 | 作用 |
|---|---|
| `/play` | 播放爵士电台（默认），暂停时则恢复播放 |
| `/pause` | 暂停（可恢复） |
| `/resume` | 恢复暂停的播放 |
| `/stop` | 完全停止播放 |
| `/next` | 下一个台 / 频道 / 曲目 |
| `/prev` | 上一个台 / 频道 / 曲目 |
| `/volume <0-100>` | 设置音量，如 `/volume 60` |
| `/now-playing` | 显示正在播放的内容 |

有多个频道的电台（`/nts`、`/paradise`）可以用 `/next` 在其频道间切换。

### Spotify

遥控一个已在运行的 Spotify 客户端（需要 Spotify Premium）。

| 命令 | 作用 |
|---|---|
| `/spotify-login` | 开始 Spotify OAuth 登录流程 |
| `/spotify-complete-login <code>` | 粘贴跳转 URL 里的授权码完成登录 |
| `/spotify-list` | 列出你的歌单 |
| `/spotify-play <name-or-uri>` | 按名称或 URI 播放歌单 |

Spotify 播放中时，`/pause`、`/resume`、`/next`、`/prev`、`/volume` 同样可以控制它。

也可以直接对 agent 说话：*"放点爵士乐"*、*"换个台"*、*"音量调到 60"*、*"停"*。

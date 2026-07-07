# agent-radio — 设计文档

> 一个可嵌入 CLI 编程 agent（Claude Code / Codex / Hermes）的音乐电台工具。
> 内置分类电台开箱即用，可选连接你自己的 Spotify，终端里还有个像素 DJ 陪你打碟。

---

## 1. 一句话定位

分两层：
- **核心 = MCP 服务器**：agent 通过它调用 `play / pause / next / list` 等工具放音乐。
  三家 agent（Claude Code / Codex / Hermes）通用，靠自然语言触发。
- **分发 = Claude Code Plugin**：在 MCP 之上再包一层 plugin，带 `/play /pause /prev /next`
  斜杠命令，让 Claude Code 用户一键安装。（斜杠命令是 Claude Code 专属，Codex/Hermes 只用 MCP 层。）

音源：**免费网络电台**（jazz/classical/indie/rock/country/pop）+ **Spotify**（你的歌单/播客，
需 Premium）。终端里渲染一个**像素 DJ 角色**，随播放状态做打碟动画。

---

## 2. 为什么这样设计（调研结论，很重要）

这几点直接决定了架构，先讲清楚，避免后面走弯路：

| 结论 | 含义 |
|---|---|
| **MCP 是三家 agent 通用的接入协议** | Claude Code、Codex、Hermes 都原生支持 MCP。只做一个 MCP server，主流cli agent都能用，不用各写一套插件。 |
| **声音必须由本地播放器发出** | agent 进程本身不放音频。用系统里的 `mpv`（首选）或 `ffplay` 播放流地址——无浏览器、无鉴权、无会员，最稳。 |
| **Spotify 只能"遥控"，不能"出声"** | Spotify Web API 只能命令一个*已经在运行*的 Spotify 客户端（手机/桌面 app）播放，**无法在终端里直接出声**；而且**必须 Premium**。v1 带上，但定位为"第二音源"。 |
| **电台流地址有免费现成的** | `radio-browser.info`（免费、免 key、按 tag 查分类）+ `SomaFM`（精选无广告台）提供直连流地址。 |

**核心判断**：电台（mpv 直播流）是地基，人人可用；Spotify 是并列的第二音源，
但因需 Premium + 运行中的客户端，覆盖面窄，UI 上要把前提讲清楚。

---

## 3. 架构总览

```
┌─────────────────────────────────────────────┐
│  CLI Agent (Claude Code / Codex / Hermes)    │
│  通过 MCP 协议调用工具                          │
└───────────────────┬─────────────────────────┘
                    │  stdio (MCP)
        ┌───────────▼────────────┐
        │   agent-radio MCP 服务器 │
        │  ├─ 工具层 (play/pause…) │
        │  ├─ 播放器控制 (PlayerCtl)│
        │  ├─ 音源: Radio │ Spotify │
        │  └─ 状态: NowPlaying     │
        └───┬─────────────┬───────┘
            │             │
   ┌────────▼──────┐  ┌───▼──────────────┐
   │ 本地 mpv/ffplay│  │ 像素 DJ 渲染器      │
   │ (真正出声)      │  │ (终端 TUI 动画)     │
   └───────────────┘  └──────────────────┘
            │
   ┌────────▼───────────────────────┐
   │ 音源                             │
   │ • 内置电台清单 (打包的 JSON)       │
   │ • radio-browser.info (在线发现)   │
   │ • Spotify Web API (可选, 遥控)    │
   └────────────────────────────────┘
```

---

## 4. 功能范围（v1 已定稿）

### 电台（核心，人人可用，无需账号）
- 内置 6 类电台：`jazz / classical / indie / rock / country / pop`，每类预置 2-3 个稳定台。
- MCP 工具：`radio_play(genre)`、`radio_pause`、`radio_resume`、`radio_stop`、
  `radio_next`、`radio_list`、`radio_now_playing`、`radio_volume(level)`。
- 用 `mpv`（无则回退 `ffplay`）播放；自动探测系统里装了哪个。

### Spotify（v1 就带上 —— 用户自备 Premium）
- OAuth PKCE 登录 -> 列出你的歌单/播客 -> 遥控播放。
- **硬前提**：需 **Premium** + **已运行的 Spotify 客户端**（手机/桌面 app 任一）。
  未满足时工具明确报错并提示，别让用户以为坏了。
- 工具：`spotify_login`、`spotify_list_playlists`、`spotify_play_playlist(name|uri)`、
  `spotify_play_podcast(name|uri)`；暂停/继续/下一首复用统一控制（内部路由到 Spotify 设备）。
- spotify的指令，/spotify:play, /spotify:stop,/spotify:prev, /spotify:next

### 像素 DJ 角色
- 终端 TUI，随"播放中/暂停/切歌"切换动画帧（方案 a，见 §6）。

### Claude Code Plugin 层
- 打包 MCP 配置 + `/play /pause /prev /next` 斜杠命令，一键安装（见 §10）。

### 明确不做（避免过度设计）
- 不自己做音频解码/DRM（这是 mpv 和 Spotify app 的活）。
- 不做浏览器版 Web Playback SDK（终端场景跑不了）。
- 不做账号系统、不做云同步。
- v1 不做在线搜台/自定义电台（放 v2，YAGNI）。

---

## 5. MCP 工具设计（对 agent 暴露的接口）

每个工具是一个带 JSON schema 的函数，agent 用自然语言触发。示例：

| 工具 | 参数 | 作用 |
|---|---|---|
| `radio_list` | — | 列出所有可播分类和当前音源状态 |
| `radio_play` | `genre: string` | 播放某分类电台（jazz/classical/…）|
| `radio_pause` / `radio_resume` / `radio_stop` | — | 控制播放 |
| `radio_next` | — | 同分类换下一个台 |
| `radio_now_playing` | — | 返回当前台名、分类、播放状态 |
| `radio_volume` | `level: 0-100` | 调音量 |
| `radio_search` *(v2)* | `keyword: string` | 在线搜台 |
| `spotify_login` | — | 触发 OAuth，返回授权链接 |
| `spotify_list_playlists` | — | 列出你的歌单/播客 |
| `spotify_play_playlist` | `name/uri` | 遥控 Spotify 放歌单/播客 |

> 用法示例：你在 Claude Code 里说"放点 jazz 电台" -> agent 调 `radio_play("jazz")`。

---

## 6. 像素 DJ 角色

**方案：终端内 TUI 动画**（推荐）——不弹独立窗口，直接画在 agent 会话/一个附带的
终端面板里，用 ANSI 彩色块 + 多帧循环。参考 Claude Code 的像素风。

- 角色状态机：`idle`（点头）→ `playing`（打碟/摇摆，多帧循环）→ `paused`（趴桌上）
  → `scratch`（切歌瞬间搓碟）。
- 实现：一组预画好的像素帧（字符矩阵 + ANSI 256 色），按 tick 循环刷新。
- 显示位置有三种可选（见决策项 3）：
  - (a) MCP 工具返回的文本里嵌小幅 ASCII（最简单，agent 直接显示）；

> ponytail 提醒：先做 (a) 最省事的版本，动画不够爽再升级到 (b)。

---

## 7. 技术选型（建议，待你确认）

| 项 | 建议 | 理由 |
|---|---|---|
| 语言/运行时 | **Node.js + TypeScript** | MCP 官方 SDK 最成熟；Spotify SDK/社区库最全；跨平台。 |
| MCP SDK | `@modelcontextprotocol/sdk` | 官方，stdio 传输，三家 agent 都吃。 |
| 播放器 | 调用系统 `mpv`（回退 `ffplay`）| 稳、支持几乎所有流格式；不自己塞音频栈。 |
| 电台发现 | `radio-browser.info` REST | 免费免 key，按 tag 查分类。 |
| 内置台单 | 打包一份 `stations.json` | 离线也能用，不依赖网络发现。 |
| Spotify | `spotify-web-api-node` + PKCE | v1，遥控用（需 Premium）。 |
| 像素 TUI | 手写 ANSI 帧循环（或 `blessed`）| 依赖越少越好。 |

---

## 8. 关键风险 / 前提

1. **mpv/ffplay 必须装在用户机器上**。启动时探测，缺失就给出安装提示（brew/choco/apt）。
2. **Spotify 需 Premium + 运行中的客户端**，否则该音源不可用——UI 要提前说清，别让用户以为坏了。
3. **电台流会挂**。内置每类给 2-3 个备用台，主台 5s 连不上自动切备用。
4. **像素动画刷新**别抢 agent 的输出焦点——(a) 方案天然安全，(b) 方案要处理终端占用。

---

## 9. 目录结构（构建时）

```
agent-radio/
├─ src/
│  ├─ index.ts          # MCP server 入口 (stdio)
│  ├─ tools.ts          # 工具定义 + schema
│  ├─ player.ts         # mpv/ffplay 进程控制
│  ├─ sources/
│  │  ├─ radio.ts       # 内置台 + radio-browser
│  │  └─ spotify.ts     # OAuth PKCE + 遥控（v1）
│  ├─ pixel-dj.ts       # 像素角色帧 + 状态机
│  └─ state.ts          # NowPlaying 状态
├─ data/stations.json   # 内置分类台单
├─ plugin/              # Claude Code plugin 层
│  ├─ plugin.json       # 声明 MCP server + 命令
│  └─ commands/         # /play /pause /prev /next
├─ package.json
└─ README.md            # 三家 agent 接入配置 + plugin 安装说明
```

---

## 10. 分发与 Plugin

**两层，别混淆：**

| 层 | 内容 | 适用 |
|---|---|---|
| MCP server | 工具本体，自然语言触发 | Claude Code / Codex / Hermes 三家通用 |
| Claude Code plugin | 打包 MCP 配置 + 斜杠命令 | 仅 Claude Code 一键装 |

**Plugin 斜杠命令**（Claude Code 专属；Codex/Hermes 用自然语言即可）：
- `/jazz`、`/classical`、`/indie`、`/rock`、`/country`、`/pop`：直接切到对应风格电台
- `/play`：恢复播放
- `/pause`：暂停
- `/prev`：上一首 / 上一个台
- `/next`：下一首 / 下一个台

> ponytail：分类命令只是薄薄一层，直接映射到已有 MCP 工具，不写新逻辑。

---

## 11. 决策项（已定稿）

1. **语言**：Node/TS ✅
2. **Spotify**：v1 就带上（需用户自备 Premium）✅
3. **像素 DJ**：方案 (a) 文本内嵌，20×30 彩色位图级小猪 DJ ✅
4. **平台**：全平台（Win/macOS/Linux）✅
5. **目标 agent**：MCP 层三家通用 + Claude Code plugin 层加斜杠命令 ✅

review 通过后，我就按 AutoResearch 流程进入构建阶段。

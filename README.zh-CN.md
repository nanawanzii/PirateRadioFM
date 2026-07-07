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
claude plugin install pirate-radio@pirate-radio
```

**重启 Claude Code。** 在新会话里输 `/`，你应该能看到 `/jazz`、`/classical`、
`/next` 等命令。

卸载：

```bash
claude plugin uninstall pirate-radio
claude plugin marketplace remove pirate-radio
```

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
| `/pause` | 暂停 |
| `/play` | 恢复播放 |
| `/next` | 下一个台 / 下一个频道 |
| `/prev` | 上一个台 / 上一个频道 |

有多个频道的电台（`/nts`、`/paradise`）可以用 `/next` 在其频道间切换。

也可以直接对 agent 说话：*"放点爵士乐"*、*"换个台"*、*"音量调到 60"*、*"停"*。

---

## 未来计划

- **Spotify 遥控** —— 通过已运行的 Spotify 客户端播放你自己的歌单 / 播客 /
  专辑。*（即将支持。）*

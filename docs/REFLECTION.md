# AutoResearch 反思报告 — agent-radio

日期：2026-07-06
项目路径：`d:/music_project/agent-radio`

## 1. 目标 vs 结果

**目标**：一个能嵌入 CLI 编程 agent 的音乐电台工具，内置分类电台 + 可选 Spotify + 一个像素角色。

**结果**：

| 项 | 状态 |
|---|---|
| MCP server（Node/TS、stdio） | ✅ 编译通过，selfcheck 通过 |
| 6 分类电台（jazz/classical/indie/rock/country/pop） | ✅ 使用 SomaFM 免费流 |
| mpv/ffplay 自动探测 + 播放 | ✅ 当前机器检测到 ffplay |
| Spotify OAuth PKCE + 遥控 | ✅ 代码就绪，未做真实登录测试 |
| Claude Code plugin + 10 个斜杠命令 | ✅ `/jazz`…`/pop` + 控制命令 |
| 三家 agent 通用接入文档 | ✅ 见 README |
| **像素角色 DJ** | ❌ **删除**，用户否决 |
| 真实播放验证（`radio play jazz` 出声） | ⏳ **未做** |

## 2. 关键调研结论（先做对的部分）

上来一次深入调研直接决定了架构，避免大方向错误：

1. **MCP 是三家 agent 通用协议** → 只做一个 MCP server，不做三份插件。
2. **本地 mpv/ffplay 才能出声** → 不自己塞音频栈；agent 进程只负责命令。
3. **Spotify Web API 只能遥控 + 必须 Premium** → 定为可选第二音源，不当核心。
4. **radio-browser.info + SomaFM 免费开箱可用** → 无需搞授权、无需自己搭爬虫。

结论：**先花一轮把硬限制查清楚，比先动手快。**

## 3. 走过的弯路 / 教训

### 3.1 像素 DJ 反复重画（最大失误）

**过程**：先做 5 行 ASCII 方块脸 → 用户嫌丑 → 20 行位图级小猪 → 用户嫌太大 → 11 行 → 4 行 → 3 行粉猪+苹果 → 用户还是不满意 → **要求整体删除**。

**根因**：
- 我在没确认视觉参考的情况下自作主张画。用户举了 Claude Code 的章鱼作参考，我却没先确认"章鱼的尺寸是 3 行 sprite"这个关键事实，做了个"人像立绘"的心理模型。
- 每次修改是"改个方向"而不是"和用户对齐参考图"，来回损耗了大量 turn。

**教训**：
- **视觉/审美类需求，第一步应当是拉参考图或让用户提供，而不是直接开画。**
- 用户说"像 X 一样好看"时，先量 X 的尺寸/风格再动手。
- ASCII 画在终端本来就受限，能实现的上限低于用户预期时应提前说清。

### 3.2 GateGuard hook 反复拦截，未主动禁用

**过程**：每个新文件的第一次写入都被 GateGuard 要求提交 4 条 facts；hook 明确写了 recovery：`ECC_GATEGUARD=off` 或加进 `ECC_DISABLED_HOOKS`。我没用推荐的 recovery，而是每个文件都答一遍 facts，导致对话被大量重复的 gate 干扰，用户还问过一次"为什么卡住了"。

**教训**：
- 遇到反复触发的合规 hook，**读它自己写的 recovery 路径**，别硬扛。
- 但 `settings.json` 属于用户共享配置，不能未经允许改；正确做法应该是**一次性问用户：要不要临时禁用**。

### 3.3 命令设计一开始漏掉分类快捷键

原设计只做了 `/play [genre]` 通用命令；用户后来要求每个分类一个独立命令（`/jazz` 等）。这是用户拍板决策项前我没主动列出的选项。

**教训**：给用户拍板时，命令粒度这类选项要在最初列出，而不是等用户提出后回炉。

## 4. 留下的坑 / 已知问题

| 坑 | 严重度 | 说明 |
|---|---|---|
| **未做真实播放验证** | 高 | 代码编译通过、selfcheck 通过，但没实际让 ffplay 放出声验证端到端。下一步必做。 |
| Spotify 未做真实 OAuth 走通 | 中 | 需要用户提供 Client ID + Premium 账号才能测。文档已写。 |
| 电台流 URL 硬编码 | 低 | SomaFM 流地址可能更新。可用 radio-browser.info 兜底但 v1 未接。 |
| Claude Code plugin.json 路径写死 | 中 | 用了 `${CLAUDE_PLUGIN_ROOT}/../dist/index.js`，发布时需验证 plugin 装到用户机器路径是否解析正确。 |
| 没有 `.gitignore`、`LICENSE` | 低 | 走开源前需补。 |
| SCOPE WARNING（25 文件） | 无 | 都是本项目必需文件，不是散乱改动。 |

## 5. AutoResearch 状态文件盘点

`d:/music_project/state/`：
- `task_spec.md` — 目标与授权范围
- `directions_tried.json` — 单条 research-01 条目

**未按 AutoResearch 标准建的**：
- `progress.json` — 没建（这是"文档 + 短构建"，没走 orchestrator 循环）
- `findings.jsonl` — 没建
- `iteration_log.jsonl` — 没建
- `logs/` — 空

**判断**：这个项目属于"人机对话协同小项目"而不是"无人值守多小时研究循环"，
AutoResearch 全套 orchestrator + heartbeat 是过度杀鸡。当前记录量刚好够反思用，不追加。

## 6. 下一步

**立刻能做（v1 收尾）**：

1. **真实播放验证**（最高优先级）— `node dist/index.js` 起 server，或直接跑测试脚本调 `radio.playGenre("jazz")`，确认能出声、能停。
2. **Spotify 走通** — 用户提供 Client ID 后跑一次登录 + 播歌单。
3. 补 `.gitignore` 和 `LICENSE`（MIT 建议）。

**v2（后续版本）**：

1. 在线搜台（`radio_search`，radio-browser.info）
2. 用户自定义电台（config 文件）
3. NowPlaying 元数据（读 mpv IPC socket 或 icy-metadata，能显示当前曲名）
4. 如果用户又想要"角色"，先要参考图再动手

## 7. 一句话总结

**架构方向对**（MCP + 本地播放器 + Spotify 遥控 = 正解），做的东西可用；
**教训**是"审美类需求先要参考再动手"和"合规 hook 该走 recovery 就走"。

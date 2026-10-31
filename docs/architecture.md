# 架构总览

这套工作区不引入新框架，只把 OpenCode 已有的扩展点（规则、agent、command、plugin、TUI）组合成四个互不依赖的子系统。任何一层都可以单独删掉，剩下的仍能工作。

## 数据流

```
用户输入
  → AGENTS.md（全局规则，随 instructions 注入）
  → command / agent（决定这次怎么处理）
  → scripts（读写 Markdown 记忆、日志、状态）
  → plugins（记录每轮 token、成本、工具调用）
  → TUI（侧栏面板实时展示）
```

关键点：

- **规则不是代码**：`AGENTS.md` 是给模型的约束，不是运行时逻辑；它决定模型的行为，但不会替模型执行。
- **记忆不是数据库**：`memory/` 全是 Markdown；脚本只提供原子写入和索引更新。
- **日志不是真相**：`events.jsonl` 是插件尽力写入的观察记录；成本以去重后的 `turn` 事件为准。
- **面板是只读视图**：`token-tracker.tsx`、`study-panel.tsx` 只读文件和事件，不写状态。

## 四个子系统

### 1. 记忆（memory）

```
memory/
├── INDEX.md              # 一行一条的索引，注入每个会话
├── preferences.md        # 用户偏好、语言、禁忌
├── lessons.md            # 可复用的踩坑与修法
├── inbox.md              # 拿不准的新记忆
├── decisions/YYYY-MM.md  # 影响后续方向的决策
└── projects/<name>.md    # 项目事实、命令、下一步
```

- `INDEX.md` 和 `learning/known.md` 通过 `opencode.json` 的 `instructions` 注入。
- 写入由 `memory` skill 约束：一条一个事实、带日期、写完更新索引。
- 安全边界：不写密钥、token、密码、隐私数据。

### 2. 交接与成本（handoff & cost）

```
handoff.json              # 价格、阈值、护栏、输出限制
plugins/stage0-log.js     # 记录 turn / tool / handoff / user-message
scripts/cost-report.mjs   # 按天、按峰谷、按会话汇总
plugins/token-tracker.tsx # TUI 侧栏实时成本
skills/handoff/           # 交接文档模板与写法
command/switch.md         # 一键写最小交接并开新会话
```

- 交接是**手动**的：由用户判断阶段边界，不做自动阈值触发。
- 成本记录按 `messageID` 去重，避免插件重启后重复计数。
- 峰谷价、阈值全部放在 `handoff.json`，代码只读不写死。

### 3. 学习教练（learning）

```
agent/tutor.md            # 出单元卡、收尾检查、写 daily/state
agent/capture.md          # 只解释、只写 glossary
scripts/term.mjs          # 术语库 + 间隔复习
scripts/panel.mjs         # 终端学习面板
plugins/study-panel.tsx   # TUI 侧栏学习面板
scripts/capture-tutor.sh  # 文字/图片 → 新终端 capture 会话
macos/                    # Automator 快速操作（⌃⌥Q）
memory/learning/          # profile / state / known / glossary / daily
```

两个 agent 的写入边界是分开的：

- `tutor` 可以写 `daily/`、`state.md`、`glossary/`。
- `capture` 只能写 `glossary/`，不能改 `state.md`。

这样避免两个会话同时改同一份状态。

### 4. 会话标签（tagging）

```
scripts/tag-core.mjs      # 纯函数：解析、编号、建树、分类
scripts/tag-core.test.mjs # node:test 单元测试
scripts/ocs.mjs           # CLI：ls / find / tag / untag / sync
plugins/tagger.tsx        # TUI 对话框：同一套纯函数
```

- 标题格式：`[标签1][标签2] 003 正文`。
- 编号按完整路径独立递增，按创建时间升序。
- 子会话保留 `[子任务]`，不占编号。
- 规则和测试都不依赖个人科目，换成你自己的领域即可。

## 安装模型

```
repo/config/         -> ~/.config/opencode/
repo/skills/         -> ~/.agents/skills/
repo/memory.template -> ~/.config/opencode/memory/（仅当不存在）
repo/macos/          -> 手动安装的 Automator 快速操作
```

`install.sh` 默认复制，`--link` 用符号链接方便开发。安装前会备份将被覆盖的文件；**永远不会覆盖已有的 memory 目录**。

## 为什么不用向量库 / 常驻服务

- 目标机器内存很小，常驻服务会挤占编辑器和浏览器。
- 记忆量在几百条以内，Markdown + 索引足够；语义检索的收益不足以抵消复杂度。
- 可读、可 diff、可手改，出错时能直接看到原因。

## 可替换点

- 模型 provider：改 `opencode.json` 的 `provider` 和 `model`。
- 价格：改 `handoff.json` 的 `prices`。
- 标签规则：改 `scripts/tag-core.mjs` 的 `RULES`，同步更新测试。
- 学习领域：改 `memory/learning/profile.md` 和 `state.md`，不需要改脚本。

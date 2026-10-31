# 示例会话：`/next` → `/done` → `/switch`

这是一个虚构的走查，用来说明四个子系统怎么协作。人物与项目均为示例。

## 1. 早上：`/next`

用户输入：

```
/next 编程
```

`tutor` agent 先读 `profile.md`、`state.md`、`known.md`、`glossary/index.md`，然后只输出一张卡：

```
科目：编程 ｜ 单元：字典 ｜ 类型：新学
为什么：上一个单元「列表」已通过；字典是下一块最常用结构
材料：官方文档（无本地教材，卡内自带例子）
热身：列表和字典都能存多个值，主要区别是什么？
目标：能创建、读取、更新、遍历字典
预计：10–15 分钟
```

注意：材料行没有编造页码；没有教材时卡内自带定义和练习。

## 2. 学习过程

- 用户先写 10 行练习，agent 只 review，不直接给答案。
- 卡住超过 20 分钟 → `/stuck`，记录卡点，下次换角度或降难度。
- 遇到新词 → 解释 3–6 行 → 三选一（懂了 / 没懂 / 不记）→ 只有明确选择才写 glossary。

## 3. 晚上：`/done`

`tutor` 先问三个问题，然后出 1 道简答 + 1 道应用：

```
今天真懂了什么？卡在哪？难度 1–5？
```

通过标准：≥2/3 且应用题正确；选择题不算掌握。

通过后：

- `term.mjs add ...` 写入术语
- `term.mjs master <词>` 标记掌握并安排下次复习
- 更新 `daily/2026-01-05.md` 和 `state.md`

## 4. 换任务：`/switch`

用户决定换到另一个项目：

```
/switch 继续 docs-search 的索引脚本
```

`/switch` 不再追问，直接写 ≤10 行交接，调用 `handoff_session`，只带最多 8 个相关文件。新会话从交接开始，不重读整段历史。

## 5. 成本观察

```bash
/cost-report 7
```

从 `logs/events.jsonl` 按 `messageID` 去重，按 UTC 峰谷价汇总真实成本；TUI 侧栏用 `token-tracker.tsx` 实时显示。

## 涉及的文件

- `~/.config/opencode/AGENTS.md`
- `~/.config/opencode/agent/tutor.md`
- `~/.config/opencode/command/{next,done,stuck,switch}.md`
- `~/.config/opencode/scripts/term.mjs`
- `~/.config/opencode/memory/learning/`

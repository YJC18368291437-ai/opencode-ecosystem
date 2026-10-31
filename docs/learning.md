# 学习教练系统

目标不是排一份完美计划，而是让「今天学 10 分钟」能持续发生。

## 日级单元，不是月计划

- 一个对话 = 一天 / 一个学习块。
- 单元最小 10 分钟；最小日只做复习也算完成，不欠账。
- 被规定内容压垮会放弃，所以难度和内容量按天调整。
- 卡住 20 分钟就停，换角度或降难度；同一解释不重复第三遍。

## 状态机

`state.md` 里只有两种状态：

- `introduced`：学过，但没通过。
- `mastered`：通过。

规则：

- 连续 3 次通过升半级；连续 2 次失败降一级。
- 复习间隔 1 / 3 / 7 / 14 / 30 天；失败重置 1 天。
- 选择题不算掌握；要有简答 + 应用题。

## 两个 agent 的分工

| agent | 能写 | 不能写 |
|---|---|---|
| `tutor` | `daily/`、`state.md`、`glossary/` | 不写摘要层、不排月计划 |
| `capture` | 只写 `glossary/` | 不写 `daily/`、不改 `state.md` |

分开的原因：两个会话可能同时开着；如果都能改 `state.md`，会互相覆盖。

## 术语库与间隔复习

`scripts/term.mjs` 是唯一的写入入口：

```bash
term.mjs add --json '{...}'      # 新增术语
term.mjs master <term>           # 标记掌握，安排下次复习
term.mjs master <term> --fail    # 标记失败，重置间隔
term.mjs brief <term>            # 1–2 行摘要 + 状态 + 前置
term.mjs missing <term>          # 查缺失的前置
term.mjs show <term>             # 打印全文（仅用户明确要求）
term.mjs open <term>             # Quick Look 打开全文
term.mjs status                  # 到期复习、最近记录
```

规则：

- `known.md` 只由脚本追加，不手改。
- `glossary/index.md` 一行一个术语；全文在 `glossary/<domain>/<slug>.md`。
- 正文永远不进对话，除非用户明确要求。

## tutor：`/next` 与 `/done`

`/next` 输出一张卡，不寒暄：

```
科目：<subject> ｜ 单元：<unit> ｜ 类型：新学 / 复习
为什么：…
材料：…（有教材/PDF 才写 文件.pdf#p=12；没有就写「无教材，卡内例子」）
热身：…（1 题）
目标：…
预计：10–15 分钟
```

材料规则：只写实际知道来源的页码，**绝不编页码**。没有教材时，卡内自带定义 + 1 个例题 + 2–3 道练习。

`/done` 收尾：

1. 问 3 件事：今天真懂了什么？卡在哪？难度 1–5？
2. 出 1 道简答 + 1 道应用。
3. 通过标准：≥2/3 且应用题正确。
4. 写 `daily/YYYY-MM-DD.md` 和 `state.md`。
5. 通过 → `term.mjs master`；失败 → `term.mjs master --fail`。

## capture：划词/截图查词

`capture` agent 只做三件事：解释、追问、在用户确认后写 glossary。

入口：

```bash
~/.config/opencode/scripts/capture-tutor.sh "要解释的文字"
~/.config/opencode/scripts/capture-tutor.sh --clipboard
~/.config/opencode/scripts/capture-tutor.sh --clipboard-image
```

脚本会：

1. 取文字或剪贴板图片（最多截断 500 字）。
2. 在新 Terminal 窗口运行 `opencode --agent capture --prompt "解释一下：…"`。
3. 图片存到 `~/.cache/opencode/captures/`，10 分钟后自动清理。

### macOS 快速操作（⌃⌥Q）

用 Automator 新建「快速操作」：

- 工作流程收到「没有输入」。
- 添加「运行 Shell 脚本」，Shell 选 `/bin/zsh`。
- 命令：

```bash
exec "$HOME/.config/opencode/scripts/capture-tutor.sh" --clipboard
```

保存为「捕获解释」，然后在「系统设置 → 键盘 → 键盘快捷键 → 服务」里绑定 ⌃⌥Q。

仓库里的 `macos/capture-tutor.workflow` 就是导出后的版本；复制到 `~/Library/Services/` 即可。

两个容易踩的坑：

- 服务环境没有登录 shell 的 PATH：脚本开头必须显式 `export PATH`，把 Homebrew 路径放前面。
- 服务环境没有 `LANG`：显式设置 `LC_CTYPE=en_US.UTF-8`，否则中文可能乱码。

## 学习面板

```bash
node ~/.config/opencode/scripts/panel.mjs   # 终端面板
```

`plugins/study-panel.tsx` 在 TUI 侧栏显示当前科目、队列、快捷键；需要 `tui.json` 注册，侧栏用 `Ctrl+X B` 打开。

## 隐私

- `profile.md`、`state.md`、`daily/` 是个人数据，不进仓库。
- 仓库只带 `memory.template/learning/` 的模板和虚构示例。
- 解释内容可以很具体，但不要写真实姓名、学校、单位、成绩、薪资。

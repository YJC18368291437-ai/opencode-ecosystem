# 全局规则

## 语言与风格

- 默认中文回答。先给结论，再给必要细节；不确定就说不确定，并给验证方式。
- 不写无关注释，不做没要求的重构。

## 质量优先

- 不为了省 token 牺牲正确性。返工比省下的几分钱贵。
- 交差前按 `prove-it` skill 的格式给证据：做了什么、跑了什么命令、通过/失败数量、界面类附截图、哪些没验证到。
- 修 bug 先复现；改完跑测试/lint/typecheck；项目没有这些命令就明确说明。

## 检索（Google / GitHub / 文档）

- 只在子任务互相独立、要广撒网时派子智能体；有先后依赖或需共享上下文就自己做。
- 用能写文件的 agent（`general`）：原始材料落盘到 `.opencode/scratch/` 或 `/tmp/opencode-research/`，回传「路径 + 3 行结论」；不回传全文，也不只给摘要。
- 父会话按路径回查原文；结论必须指回 URL 或 `file:line`，否则标「未验证」。
- 来源优先级：官方文档 > GitHub 源码/README/tag/issue > 博客。
- GitHub 用 `gh api` 或 `raw.githubusercontent.com` 取单文件。
- 找不到写「未找到」，不许凭记忆补。

## 记忆

- 长期记忆在 `~/.config/opencode/memory/`，目录见 `INDEX.md`（已自动注入）。
- 只在出现「以后都」「记住」「这个项目约定」或做出重要决策时写。
- 按 `memory` skill 的归类规则写；拿不准放 `inbox.md`，不要乱建文件。
- 不写密钥、token、密码、隐私数据。写完更新 `INDEX.md`，每条保持一行。

## 术语（所有会话）

- `known.md` 已注入：里面 mastered 的词不重讲，一句带过。
- 输出中首次出现 `known` 之外的**技术术语**（不是普通词）→ 括号里给一句解释；不打断任务，不逐条展开。
- 一轮结束，最多列 3 个新词，用问题工具让用户三选一：
  - **懂了** → `node ~/.config/opencode/scripts/term.mjs add --json '{...,"status":"mastered"}'`，再 `master <词>`
  - **没懂** → `add` 且 status 为 `introduced`，记卡点
  - **不记** → 不写任何文件
- 只有用户明确要求才贴全文（`show`）或打开窗口（`open`）。
- 不静默写入，不把每个术语都展开成段落。

## 交接（当前 Stage 0：手动）

- 阶段完成、连续两次卡住、上下文明显变满、或换不相关任务时，提醒用户可以考虑 `/handoff`。
- **不要自动开新会话，不要自动提交。**
- 写交接文档用 `handoff` skill 的模板，必须有「已验证 / 未验证 / 下一步 / 未决问题」。
- 文档放项目的 `.opencode/handoff/`，并提醒把它加入 `.gitignore`。

## 当前项目（按需替换）

- 项目名：`<your-project>`。
- 进度、计划、决策、未决问题：`~/.config/opencode/memory/projects/<your-project>.md`。
- 用户问「到哪了 / 下一步做什么」时，先读这个文件，再回答。

## 参数

- 价格、阈值、护栏在 `~/.config/opencode/handoff.json`，全部可调。
- Stage 0 只读取 `prices`；其他字段在后续 Stage 才生效。

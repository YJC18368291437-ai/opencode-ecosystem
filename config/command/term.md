---
description: 查一个术语；新词可三选一记入 glossary
agent: tutor
---

术语：`$ARGUMENTS`

1. 先运行：
   ```
   node ~/.config/opencode/scripts/term.mjs brief "$ARGUMENTS"
   ```
2. 找到了 → 只输出脚本结果，不重讲，不贴全文。
3. 未找到 → 按用户水平简短解释（先补前置，最多 3 个新词），然后三选一：
   - **懂了** → `term.mjs add`（status=mastered，写 summary/body）→ `term.mjs master <词>`
   - **没懂** → `term.mjs add`（status=introduced）→ 记一句卡点
   - **不记** → 不写任何文件
4. 只有用户明确说「贴出来 / 看全文」才 `term.mjs show`；打开窗口用 `term.mjs open`。
5. 正文永远不进对话，除非用户明确要求。

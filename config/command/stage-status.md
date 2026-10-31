---
description: 显示某个项目记忆文件里的当前阶段和下一步
---

项目文件：`$ARGUMENTS`（为空时用 `~/.config/opencode/memory/projects/example.md`）

读该文件，然后只输出：

1. 当前阶段
2. 验收清单里已完成 / 未完成
3. 下一步要做什么（最多 5 条）
4. 未决问题（最多 5 条）

不要修改任何文件。如果文件不存在，直接说找不到并列出 `~/.config/opencode/memory/projects/` 的实际内容。

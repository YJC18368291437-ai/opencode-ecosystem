---
description: 检测当前项目的测试/lint/typecheck/build 命令，写入 .opencode/quality.json
---

为当前项目建立质量基线。

1. 检查当前目录的常见配置：`package.json` scripts、`Makefile`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`README`。
2. 找出四类命令：test、lint、typecheck、build。找不到就留空，不要猜。
3. 用表格展示命令和来源文件，问用户是否正确。
4. 确认后写入 `.opencode/quality.json`：

```json
{
  "test": "npm test",
  "lint": "npm run lint",
  "typecheck": "npm run typecheck",
  "build": "npm run build",
  "notes": "命令来源：package.json"
}
```

5. 如果 `.opencode/` 不是 git 忽略的，提醒用户：这是本机约定，可以提交，也可以加进 `.gitignore`。
6. 不要实际运行这些命令，除非用户要求。

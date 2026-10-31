# 检索方法论：Google / GitHub / 官方文档

目标不是「搜到东西」，而是**拿到可复核的结论**。模型凭记忆补细节是这类任务最大的风险。

## 什么时候派子智能体

只在同时满足以下条件时：

- 子任务互相独立，不需要共享上下文。
- 只读，不写代码、不改文件。
- 需要广撒网（多个来源、多个关键词）。

有先后依赖、需要父会话判断、或涉及写操作时，自己做。

原因：多 agent 的成本远高于单 agent（公开数据约 4× 对话 token，多 agent 约 15×）。省下的时间必须值得这个成本。

## 落盘 + 传路径

子智能体的返回值不要是全文，也不要只是摘要：

```
原始材料 → .opencode/scratch/<topic>/ 或 /tmp/opencode-research/<topic>/
返回给父会话 → 路径 + 3 行结论
```

父会话需要细节时按路径回查原文。这样：

- 不会因为摘要丢细节。
- 不会因为全文撑爆上下文。
- 结论可以被复核。

## 来源优先级

1. 官方文档（`opencode.ai/docs`、项目官网、语言/框架官方手册）
2. GitHub 源码、README、tag、issue（注意 issue 可能是过时或错误信息）
3. 博客、教程、论坛（只作线索，不作最终依据）

## GitHub 取单文件

```bash
# 有 gh 时
gh api repos/<owner>/<repo>/contents/<path> --jq '.content' | base64 -d

# 没有 gh 时
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
```

优先固定 tag 或 commit，不要默认 `main`；`main` 会变，结论会过期。

## 官方文档

- 先看当前版本的文档，不看记忆里的旧版本。
- 注意文档里的版本号、平台差异、废弃标记。
- 引用时带 URL；如果是本地文件，带 `file:line`。

## 网络搜索（Tavily）

仓库默认集成 `opencode-tavily` 插件。命令行等价用法：

```bash
tvly search "opencode config env var" --client-name opencode
tvly extract "https://opencode.ai/docs/config/" --client-name opencode
```

- `--client-name opencode` 用于归因。
- 需要 API key：`tvly login` 或 `TAVILY_API_KEY`。
- `opencode.json` 里只放行 `tvly *` 的 bash 权限，不放行任意网络命令。

## 结论格式

每条结论至少包含：

- 结论本身（一句话）。
- 来源：URL 或 `file:line`。
- 验证状态：已验证 / 未验证。
- 如果没找到：明确写「未找到」，不要用推测填空。

## 反模式

- 让子智能体转述全文 → 传话游戏，细节丢失。
- 把搜索结果的摘要当原文 → 无法复核。
- 用记忆里的价格、版本号、API 签名 → 经常过时。
- 为了「全面」派 5 个子智能体查同一件事 → 成本高、结论重复。

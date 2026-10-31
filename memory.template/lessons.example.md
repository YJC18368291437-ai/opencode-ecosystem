# 经验教训（示例）

## 输出截断会引发连锁失败

- 不要给复核/交接类调用设置过低 `max_tokens`。
- 必须检查 `finish_reason`，不是 `stop` 就当失败。
- 失败只续写一次；仍不完整就保留现场，不切换会话。
- 用普通文本输出，不要用工具参数的 JSON，避免截断后解析失败。

## 缓存决定交接是否省钱

- 缓存命中价通常远低于未命中价；长会话本身可能很便宜。
- 只有剩余轮数超过盈亏平衡点，且处于任务阶段边界，才值得换会话。
- 真正贵的是失败重试和返工，不是交接本身。

## 成本统计

- 自定义 provider 不配 `cost` 时，`opencode stats` 会显示 $0。
- 峰时/谷时价格不同时，`message.cost` 的单一价格会失真；需要自己的日志按 UTC 分档。
- `opencode stats` 只显示 2 位小数，小额会话会显示 $0.00。

## 日志可靠性

- `session.idle` 在 `opencode run` 退出边界上可能来不及写入；不要用它做成本记录。
- 用 `message.updated` + `time.completed`/`finish`，按 `messageID` 去重。
- 汇总脚本也要按 `messageID` 去重，防插件重启后重复计数。

## OpenCode 插件

- 全局插件目录是 `~/.config/opencode/plugins/`（复数）。
- 本地插件导出：`export const XxxPlugin = async ({ client, directory }) => ({ ... })`。
- 不要从 hook 里抛错，会打断 OpenCode；所有 hook 都要 try/catch。

## macOS 服务（Automator 快速操作）

- 服务运行时没有登录 shell 的 PATH：`node`、`opencode` 会 `command not found`；脚本开头显式 `export PATH`。
- 服务环境没有 `LANG`，`pbpaste` 可能按旧编码输出；显式设置 `LC_CTYPE`。
- 用 `open -a Terminal <临时 .command>` 启动新窗口，比 `osascript do script` 少一个授权弹窗。
- 复现方法：`env -i HOME="$HOME" PATH=/usr/bin:/bin CAPTURE_DRY_RUN=1 zsh 脚本`。

## 检索：多智能体与子智能体

- 多 agent 只适合子任务独立、只读、需广撒网的场景；有依赖或要共享上下文就自己做。
- 保准确性的做法是「落盘 + 传路径」，不是让子 agent 转述。
- 来源优先级：官方文档 > GitHub 源码/README/tag/issue > 博客。
- 找不到就写「未找到」，不要凭记忆补。

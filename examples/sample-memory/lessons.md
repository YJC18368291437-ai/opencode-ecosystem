# 经验教训（示例）

## 日志去重

- 按 `messageID` 去重，否则插件重启会重复计数。
- 用 `message.updated` + `finish`，不用 `session.idle`。

## 搜索落盘

- 子智能体回传路径 + 3 行结论，不回传全文。
- 结论必须带 URL 或 `file:line`。

# 成本与 token 追踪

目标：让每一轮花在哪、花了多少，都能看见、能复核、能调参。

## 三层观察

| 层 | 工具 | 延迟 | 用途 |
|---|---|---|---|
| 实时 | `plugins/token-tracker.tsx` | 2 秒 | 侧栏成本柱状图 + 页脚 |
| 会话 | TokenScope | 按需 | 按类别拆解当前会话 |
| 历史 | `scripts/cost-report.mjs` | 按需 | 按天/峰谷/会话汇总 |

## provider 成本配置

自定义 provider 不配 `cost` 时，`opencode stats` 会显示 $0。`opencode.json` 里给模型加：

```json
"cost": {
  "input": 0.3,
  "output": 1.2,
  "cache_read": 0.006,
  "cache_write": 0.3
}
```

这是**单一价格**。如果 provider 有峰谷价，`message.cost` 会失真；需要自己的日志按 UTC 分档。

## 峰谷价与 handoff.json

`handoff.json` 的 `prices` 同时保存峰时和谷时价格：

```json
{
  "prices": {
    "peak":    { "input": 0.3, "output": 1.2, "cacheRead": 0.006, "cacheWrite": 0.3 },
    "offPeak": { "input": 0.15, "output": 0.6, "cacheRead": 0.003, "cacheWrite": 0.15 },
    "peakHoursUtc": [[1, 4], [6, 10]],
    "weekendOffPeak": true
  }
}
```

- `peakHoursUtc` 是 UTC 小时区间，`[start, end)`。
- `weekendOffPeak` 为 true 时，周六周日全按谷时。
- 价格、阈值、护栏全部可调；代码只读不写死。

## 事件日志：stage0-log.js

插件监听 OpenCode 事件，追加到 `logs/events.jsonl`：

| event | 触发 | 关键字段 |
|---|---|---|
| `turn` | 一条 assistant 消息完成 | `tokens`、`priceTier`、`costUSD`、`opencodeCostUSD` |
| `tool` | 工具调用后 | `tool`、`outputChars` |
| `handoff` | 调用 `handoff_session` | `promptChars`、`files` |
| `user-message` | 用户消息 | `textChars`、`synthetic` |
| `idle` | 会话空闲 | `sessionID` |
| `compacted` | 上下文压缩 | `sessionID` |

实现要点：

- 用 `message.updated` + `time.completed`/`finish`，不用 `session.idle`（退出边界可能来不及写入）。
- 按 `messageID` 去重，防插件重启后重复计数。
- 所有 hook 都 try/catch；不要从 hook 抛错，会打断 OpenCode。
- 日志超过 5MB 自动轮转为 `events.jsonl.1`。

## 汇总：cost-report.mjs

```bash
node ~/.config/opencode/scripts/cost-report.mjs 7
```

输出：

- 总轮数、总成本、平均每轮
- input / output / cache read / cache write
- 缓存命中占比
- 按天、按峰谷、按会话 Top 5

同样按 `messageID` 去重。没有日志文件时直接提示，不报错。

## 实时：token-tracker.tsx

- 侧栏：每个请求的成本柱状图 + 本会话累计。
- 页脚：last request 和 session totals。
- 每 2 秒刷新；侧栏必须打开（`Ctrl+X B`）。
- 页脚成本用配置里的单一价格；精确成本用 `/cost-report`。

## 精确拆解：TokenScope

`/tokenscope` 调用 `@ramtinj95/opencode-tokenscope`，按类别拆解当前会话。报告写到文件，命令只返回文件路径。

## 常见问题

**为什么 `opencode stats` 显示 $0？**

- 自定义 provider 没配 `cost`。
- 金额太小，2 位小数四舍五入成 $0.00。
- 历史消息不会回溯。

**为什么两个成本数字不一样？**

- `message.cost` 用单一价格。
- `stage0-log.js` 按 UTC 峰谷分档。
- 以 `cost-report` 的 `costUSD` 为准，并注明口径。

**怎么改价格？**

只改 `handoff.json`，不要改插件或脚本。插件启动时读取；新会话生效。

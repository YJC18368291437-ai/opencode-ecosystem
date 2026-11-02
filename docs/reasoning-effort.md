# 自适应思考强度（reasoning effort）

目标：同一套配置里，短对话不要浪费思考预算，重活自动加深思考。不引入新服务，只用一个插件 + 模型的 `variants`。

## 两层结构

1. **模型声明变体**：`config/opencode.json` 里给模型写 `variants`，每个变体就是一个 `reasoningEffort`。

```json
"variants": {
  "auto": {},
  "low":  { "reasoningEffort": "low" },
  "high": { "reasoningEffort": "high" },
  "max":  { "reasoningEffort": "max" }
}
```

`auto` 是空变体：让插件决定；`low/high/max` 也可以由用户在 TUI 里手动选，作为覆盖。

2. **插件自动选择**：`config/plugins/auto-effort.js` 监听 `chat.params`，在没被显式指定时填 `reasoningEffort`。

## 选择规则

按优先级（`pick()`）：

| 条件 | effort |
|---|---|
| agent 是 `title` / `summary` | `low` |
| agent 是 `plan` | `high` |
| 文本长度 > 1200 | `high` |
| 命中重活关键词（重构、调试、竞态、死锁、性能、迁移、安全、测试…） | `high` |
| 文本长度 > 240 | `medium` |
| 其他 | `low` |

插件只在该模型**确实声明了**对应变体时才写入：

```js
const keys = model?.variants ? Object.keys(model.variants) : []
if (!keys.length) return
if (!keys.includes(effort)) return
```

所以换一个没有 `variants` 的模型，插件自动静默失效，不会报错。

## 为什么不用每次手选

- 手选要记着切，忘了就一直用默认档。
- 重活关键词和长度是便宜的启发式，足够区分「闲聊」和「排查竞态」。
- 插件只读消息文本，不额外请求模型，也不存日志。

## 已知限制

- 关键词表是中英混合的启发式，不是语义判断；误判时手动选变体覆盖即可。
- 只对声明了 `variants` 的模型生效。
- 仓库自带的 `opencode.json` 只声明了 `low / high / max`，没有 `medium`；所以 240–1200 字的消息会落到 `medium`，但因变体不存在而保持模型默认档。需要的话在 `variants` 里补 `medium`，插件会自动启用。
- `chat.message` 阶段缓存的文本有 32 条上限，超出会整体清空（防止内存无限增长）。

## 接入别的模型

在 `opencode.json` 对应模型下加 `variants`，键名与插件 `pick()` 的返回值保持一致（`low` / `medium` / `high` / `max`）。如果供应商只支持其中几档，就只声明那几档，插件会自动跳过不存在的档位。

# docs-search（示例项目·一周后）

## 当前阶段

**Stage 1 完成，Stage 2 未开始。** 索引和搜索脚本已跑通；没有 UI。

## 已完成

- [x] `scripts/index.mjs` 扫描 `docs/`
- [x] `scripts/search.mjs` 输出文件与行号
- [x] 5 个单元测试
- [x] `--json` 输出

## 已验证

- `node --test` → 5 通过，0 失败
- `node scripts/search.mjs cache --json` 返回合法 JSON

## 未验证 / 风险

- 中文子串匹配未测
- 大文件性能未测

## 下一步

1. 补中文测试
2. 决定索引文件是否进 git
3. 再考虑 UI

## 未决问题

- 是否需要忽略 `.git` 和 `node_modules`

> 示例项目，与仓库作者无关。

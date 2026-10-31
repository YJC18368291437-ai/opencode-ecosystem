# 会话标签系统

目的：会话一多，标题就变成「继续」「修 bug」「再看一下」。标签让历史可检索、可编号、可排序。

## 标题格式

```
[标签1][标签2] 003 正文
```

- 标签可以多级：`[math][physics] 003 entropy`。
- `003` 是**完整路径**内的编号，按创建时间升序；最新创建的号最大。
- 子会话保留 `[子任务]`，不编号。
- 没有标签的会话归入 `[未分类]`。

## 编号规则

- 每个完整路径独立编号。
- 改标签后，会话按创建时间重新插入新路径，编号重算。
- 重算幂等：同一批会话连续跑两次，标题不变。
- 子会话不占号。

## 标签解析

`scripts/tag-core.mjs` 是纯函数模块，不依赖 OpenCode 运行时：

```js
parseTitle("[math][physics] 003 entropy")
// { tags: ["math", "physics"], number: "003", body: "entropy" }

parseTagPath("math/physics")
// { tags: ["math", "physics"], error: null }

validateTagPath("biology/math", tree)
// { ok: false, message: "..." }  叶子名重复时给建议
```

规则：

- 层级用 `/` 或 `[标签][标签]`。
- 空段、非法字符、叶子重名会被拒绝，并给出可读的错误信息。
- 叶子名全局唯一；子串重叠允许（`math` 和 `math-analysis` 可以共存）。

## 自动分类

`RULES` 是一组「正则 → 标签」：

```js
[/数学|代数|矩阵|微积分/, "数学"],
[/物理|力学|电磁/, "物理"],
[/opencode|plugin|handoff|插件/, "opencode"],
```

- 先看树里的叶子名是否出现在标题里；最长匹配优先。
- 没有叶子命中，再看规则；规则命中父级时补 `[未分类]`。
- 自定义叶子优先于内置规则。
- 自动分类只覆盖 `metadata.ocsAuto = true` 的会话；手动标签不会被覆盖。

## 两个入口，一套逻辑

| 入口 | 文件 | 用途 |
|---|---|---|
| CLI | `scripts/ocs.mjs` | 批量查看、打标签、同步 |
| TUI | `plugins/tagger.tsx` | 在对话框里给当前会话选路径 |

两者都 import `tag-core.mjs`，所以行为一致。

## TUI 用法

在任意**主会话**里输入 `/tag`，选择已有路径或「＋ 新建分类路径…」。子会话不参与编号，换到主会话再操作。

`/tag` 由 `plugins/tagger.tsx` 注册（`slash: { name: "tag" }`），不是 `command/tag.md`；两者同名会冲突，所以仓库只保留插件入口。

## CLI 用法

```bash
ocs ls                         # 列出会话
ocs ls --tag 数学/物理          # 按路径筛选
ocs find cache                 # 按标题/路径搜索
ocs tag 12 数学/物理            # 给 12 号会话打标签
ocs tag --dir ~/code/docs 项目  # 给整个目录下的主会话打标签
ocs untag 12                   # 标记为未分类
ocs sync                       # 重算全部标题
```

编号有歧义时，写成 `路径:编号`，例如 `数学/物理:12`。

## 测试

```bash
node --test config/scripts/tag-core.test.mjs
```

测试覆盖：解析、路径、编号、子会话、重算幂等、叶子唯一性、自动分类、capture 前缀。

## 定制

1. 改 `RULES`，换成你的领域。
2. 同步改 `tag-core.test.mjs` 的测试数据，保持语义。
3. 跑 `node --test`。
4. 在 TUI 里用 `Ctrl+X B` 打开侧栏，测试对话框。

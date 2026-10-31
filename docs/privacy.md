# 隐私与去个人信息

这个仓库是从一份真实个人配置整理出来的。整理的原则是：**代码和规则可以公开，个人数据不行。**

## 仓库里没有什么

- 没有 API key、token、密码。
- 没有真实用户名、主目录路径（统一改成 `~` 或 `{env:HOME}`）。
- 没有学校、单位、成绩、薪资、住址、生日。
- 没有真实 session id、日志、聊天记录。
- 没有真实学习档案、考试资料、项目进度。

## 怎么做的

### 1. 密钥 → 环境变量

`opencode.json` 里不写 key：

```json
"apiKey": "{env:DEEPSEEK_API_KEY}"
```

- OpenCode 支持 `{env:VAR}` 替换；变量不存在时替换为空字符串。
- 本地用 `export DEEPSEEK_API_KEY=...`，不要写进仓库。
- 如果 key 曾经出现在明文配置里，**推送前先轮换**。

### 2. 绝对路径 → 可移植路径

- 配置里的 `instructions` 用 `{env:HOME}/.config/opencode/...`。
- 文档和 command 里用 `~/.config/opencode/...`。
- 脚本统一用 `os.homedir()` 或 `$HOME`，不写死用户名。

### 3. 个人记忆 → 模板

- 真实 `memory/` 不收录。
- 仓库只带 `memory.template/`：空模板 + 虚构示例。
- 安装脚本只在 memory 不存在时复制模板，绝不覆盖已有记忆。

### 4. 个人领域词 → 通用示例

- 学习教练的科目、标签规则、测试数据换成 `数学/物理/编程`。
- 文档里的项目名用虚构的 `docs-search`。
- 示例人物用虚构的 `Alex`，并明确标注「示例」。

### 5. 日志 → 不收录

`logs/` 会包含目录路径、session id、消息长度；即使没有正文，也算隐私。仓库 `.gitignore` 排除。

### 6. 第三方内容 → 保留声明

`skills/` 里有来自第三方的技能；保留原 LICENSE，并在 `THIRD-PARTY-NOTICES.md` 注明来源。不要删除作者署名。

## 发布前检查

```bash
git grep -nE "sk-[A-Za-z0-9]{20,}|/Users/|@[A-Za-z0-9.-]+\.(com|cn)|sess_[A-Za-z0-9]{10,}" --cached
```

命中任何一条都要先处理，再提交。真实姓名、学校、单位等无法用通用正则覆盖，发布前人工过一遍 `git diff`。

## 你自己的记忆怎么放

- 真实记忆放在 `~/.config/opencode/memory/`，不要放进仓库目录。
- 如果一定要版本管理，用单独的私有仓库，并确认 `.gitignore` 排除 `logs/`、`daily/`、`profile.md`。
- 交接文档放 `.opencode/handoff/` 并加入 `.gitignore`。

## 第三方与许可

- 本仓库自己的代码与文档：MIT。
- `architect`、`grill`、`prove-it`：来自 `nagi-studio/skills`（MIT）；`grill` 另含 Matt Pocock 的 MIT 许可。
- npm 插件：各自遵循原包许可。
- 详见 `THIRD-PARTY-NOTICES.md`。

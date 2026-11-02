import test from "node:test"
import assert from "node:assert/strict"
import {
  FALLBACK,
  buildTree,
  classify,
  normalizeTag,
  parseTagPath,
  parseTitle,
  planSync,
  planTitles,
  validateTagPath,
} from "./tag-core.mjs"

function session(id, title, created, parentID, extra = {}) {
  return { id, title, parentID, time: { created, updated: created }, ...extra }
}

test("parseTitle 支持任意层级标签和旧格式", () => {
  assert.deepEqual(parseTitle("[物理][数学] 001 力学"), {
    tags: ["物理", "数学"],
    number: "001",
    body: "力学",
  })
  assert.deepEqual(parseTitle("001 [物理][数学] 力学"), {
    tags: ["物理", "数学"],
    number: "001",
    body: "力学",
  })
  assert.deepEqual(parseTitle("[术语][物理][数学] 002 图片"), {
    tags: ["术语", "物理", "数学"],
    number: "002",
    body: "图片",
  })
  assert.deepEqual(parseTitle("[物理][数学] 没有编号"), {
    tags: ["物理", "数学"],
    number: null,
    body: "没有编号",
  })
  assert.deepEqual(parseTitle("[子任务] 任务正文"), {
    tags: ["子任务"],
    number: null,
    body: "任务正文",
  })
  assert.deepEqual(parseTitle("纯标题"), { tags: [], number: null, body: "纯标题" })
})

test("normalizeTag 和路径解析", () => {
  assert.equal(normalizeTag("  [数学] "), "数学")
  assert.equal(normalizeTag(""), "未分类")
  assert.deepEqual(parseTagPath("物理/数学"), { tags: ["物理", "数学"], error: null })
  assert.deepEqual(parseTagPath("[物理][数学]"), { tags: ["物理", "数学"], error: null })
  assert.deepEqual(parseTagPath("[术语][物理][数学]"), {
    tags: ["术语", "物理", "数学"],
    error: null,
  })
  assert.match(parseTagPath("物理//数学").error, /空段/)
  assert.match(parseTagPath("物理/").error, /空段/)
  assert.match(parseTagPath("[]").error, /空段/)
  assert.match(parseTagPath("[物理] 数学").error, /格式/)
})

test("每个完整显示路径独立编号，组内按创建时间升序", () => {
  const sessions = [
    session("c", "[物理][未分类] 009 丙", 300),
    session("a", "[物理][数学] 009 甲", 100),
    session("b", "[术语][物理][数学] 009 乙", 200),
    session("d", "[物理][数学] 009 丁", 400),
  ]
  const planned = planTitles(sessions)
  assert.deepEqual(
    planned.map((p) => [p.id, p.tags, p.number, p.title]),
    [
      ["c", ["物理", "未分类"], "001", "[物理][未分类] 001 丙"],
      ["a", ["物理", "数学"], "001", "[物理][数学] 001 甲"],
      ["b", ["术语", "物理", "数学"], "001", "[术语][物理][数学] 001 乙"],
      ["d", ["物理", "数学"], "002", "[物理][数学] 002 丁"],
    ],
  )
})

test("最新创建的会话拿到组内最大号", () => {
  const planned = planTitles([
    session("a", "[物理][数学] 力学", 100),
    session("b", "[物理][数学] 数学", 400),
    session("c", "[物理][数学] 电磁", 250),
  ])
  const byId = new Map(planned.map((p) => [p.id, p]))
  assert.equal(byId.get("b").number, "003")
  assert.equal(byId.get("c").number, "002")
  assert.equal(byId.get("a").number, "001")
})

test("子会话不占号，并去掉旧序号", () => {
  const planned = planTitles([
    session("root", "[代数][矩阵] 001 主会话", 100),
    session("child", "[子任务] 007 开始学习 (@tutor subagent)", 200, "root"),
  ])
  const child = planned.find((p) => p.id === "child")
  assert.equal(child.number, null)
  assert.equal(child.title, "[子任务] 开始学习 (@tutor subagent)")
  assert.equal(planned.find((p) => p.id === "root").number, "001")
})

test("没有标签的子会话归入子任务", () => {
  const planned = planTitles([
    session("root", "主会话", 100),
    session("child", "开始学习 (@tutor subagent)", 200, "root"),
  ])
  const child = planned.find((p) => p.id === "child")
  assert.deepEqual(child.tags, ["子任务"])
  assert.equal(child.title, "[子任务] 开始学习 (@tutor subagent)")
})

test("改标签后按创建时间重新插入完整路径", () => {
  const sessions = [
    session("a", "[代数] 001 微积分", 100),
    session("b", "[opencode] 001 插件", 200),
    session("c", "[代数] 002 矩阵", 300),
  ]
  const planned = planTitles(sessions, new Map([["c", ["opencode", "插件"]]]))
  const byId = new Map(planned.map((p) => [p.id, p]))
  assert.equal(byId.get("a").title, "[代数] 001 微积分")
  assert.equal(byId.get("b").title, "[opencode] 001 插件")
  assert.equal(byId.get("c").title, "[opencode][插件] 001 矩阵")
})

test("无标签归入未分类", () => {
  const planned = planTitles([session("a", "没有标签", 100)])
  assert.equal(planned[0].title, "[未分类] 001 没有标签")
})

test("多级路径重算幂等", () => {
  const sessions = [
    session("a", "[物理][数学] 001 力学", 100),
    session("b", "[物理][数学] 002 电磁", 200),
    session("c", "[术语][物理][数学] 001 图片", 300),
    session("d", "[子任务] 任务", 400, "a"),
  ]
  const once = planTitles(sessions)
  const twice = planTitles(
    once.map((p) => ({
      id: p.id,
      title: p.title,
      parentID: p.parentID,
      time: { created: 0 },
    })),
  )
  assert.deepEqual(
    twice.map((p) => p.title),
    once.map((p) => p.title),
  )
})

test("建树时去掉术语前缀和保留名", () => {
  const tree = buildTree([
    session("a", "[物理][数学] 001 力学", 100),
    session("b", "[术语][物理][电磁] 001 图片", 200),
    session("c", "[未分类] 001 随手记", 300),
    session("d", "[子任务] 子会话", 400, "a"),
  ])
  assert.deepEqual(
    tree.nodes.map((node) => node.path),
    [
      ["物理"],
      ["物理", "数学"],
      ["物理", "电磁"],
    ],
  )
})

test("自定义叶子命中优先于内置规则", () => {
  const tree = buildTree([
    session("a", "[物理][数学] 001 数学力学", 100),
    session("b", "[物理][电磁] 001 电磁通路", 200),
    session("c", "[代数] 001 矩阵", 300),
  ])
  assert.deepEqual(classify("数学力学", { tree }).tags, ["物理", "数学"])
  assert.equal(classify("数学力学", { tree }).reason, "leaf")
  assert.deepEqual(classify("数学", { tree }).tags, ["物理", "数学"])
})

test("内置规则命中父级时补未分类，叶子时直接用", () => {
  const tree = buildTree([
    session("a", "[物理][数学] 001 数学", 100),
    session("b", "[代数] 001 矩阵", 200),
  ])
  assert.deepEqual(classify("物理 课程", { tree }).tags, ["物理", "未分类"])
  assert.equal(classify("物理 课程", { tree }).reason, "rule-parent")
  assert.deepEqual(classify("矩阵乘法", { tree }).tags, ["代数"])
  assert.equal(classify("矩阵乘法", { tree }).reason, "rule-leaf")
})

test("自定义父级命中补未分类", () => {
  const tree = buildTree([session("a", "[化学][通用结构] 001 结构", 100)])
  const result = classify("化学 课程", { tree })
  assert.deepEqual(result.tags, ["化学", "未分类"])
  assert.equal(result.reason, "parent")
})

test("同名字段不覆盖，规则分类可随树变化", () => {
  const tree = buildTree([session("a", "[物理] 001 力学", 100)])
  assert.deepEqual(classify("物理 力学", { tree }).tags, ["物理"])
  assert.deepEqual(classify("随便聊聊", { tree }).tags, ["未分类"])
})

test("capture 四种结果", () => {
  const tree = buildTree([
    session("a", "[物理][数学] 001 数学", 100),
    session("b", "[物理][电磁] 001 电磁", 200),
  ])
  assert.deepEqual(classify("数学力学", { tree, capture: true }).tags, ["术语", "物理", "数学"])
  assert.deepEqual(classify("物理 课程", { tree, capture: true }).tags, [
    "术语",
    "物理",
    "未分类",
  ])
  const leafTree = buildTree([session("c", "[物理] 001 力学", 100)])
  assert.deepEqual(classify("物理 力学", { tree: leafTree, capture: true }).tags, ["术语", "物理"])
  assert.deepEqual(classify("完全无关", { tree, capture: true }).tags, ["术语", "未分类"])
})

test("最长叶子优先，数学和数学分析可共存", () => {
  const tree = buildTree([
    session("a", "[物理][数学] 001 数学", 100),
    session("b", "[物理][数学分析] 001 数学分析", 200),
  ])
  assert.deepEqual(classify("数学分析基础", { tree }).tags, ["物理", "数学分析"])
  assert.deepEqual(classify("数学基础", { tree }).tags, ["物理", "数学"])
})

test("叶子名全局唯一，重名路径被拒并给建议", () => {
  const tree = buildTree([session("a", "[物理][数学] 001 数学", 100)])
  const conflict = validateTagPath("化学/数学", tree)
  assert.equal(conflict.ok, false)
  assert.match(conflict.message, /通用数学/)
  assert.equal(validateTagPath("物理/数学", tree).ok, true)
  assert.equal(validateTagPath("[物理][数学]", tree).ok, true)
  assert.equal(validateTagPath("数学", tree).ok, false)
  assert.equal(validateTagPath("化学//数学", tree).ok, false)
  assert.equal(validateTagPath("术语", tree).ok, false)
  assert.equal(validateTagPath("未分类", tree).ok, true)
})

test("子串重叠允许，只拒绝完全相同的叶子名", () => {
  const tree = buildTree([session("a", "[物理][数学] 001 数学", 100)])
  assert.equal(validateTagPath("物理/数学分析", tree).ok, true)
  const both = buildTree([
    session("a", "[物理][数学] 001 数学", 100),
    session("b", "[物理][数学分析] 001 数学分析", 200),
  ])
  assert.deepEqual(classify("数学分析", { tree: both }).tags, ["物理", "数学分析"])
  assert.equal(validateTagPath("化学/数学", both).ok, false)
  assert.equal(validateTagPath("化学/数学分析", both).ok, false)
})

test("历史重名无法区分时回退未分类并给候选", () => {
  const tree = buildTree([
    session("a", "[甲][数学] 001 甲", 100),
    session("b", "[乙][数学] 001 乙", 100),
  ])
  const result = classify("数学", { tree })
  assert.deepEqual(result.tags, ["未分类"])
  assert.equal(result.reason, "ambiguous-leaf")
  assert.deepEqual(result.candidates, [
    ["甲", "数学"],
    ["乙", "数学"],
  ])
})

test("自动会话可重新归类，手动标签不会被覆盖", () => {
  const sessions = [
    session("manual", "[代数] 001 物理 力学", 100),
    session("auto", "[物理][数学] 001 矩阵", 200, null, { metadata: { ocsAuto: true } }),
    session("new", "数学力学", 300),
    session("child", "开始学习 (@tutor subagent)", 400, "auto"),
  ]
  const planned = planSync(sessions)
  const byId = new Map(planned.map((p) => [p.id, p]))
  assert.deepEqual(byId.get("manual").tags, ["代数"])
  assert.equal(byId.get("manual").metadata, null)
  assert.deepEqual(byId.get("auto").tags, ["代数"])
  assert.deepEqual(byId.get("new").tags, ["物理", "数学"])
  assert.deepEqual(byId.get("new").metadata, { ocsAuto: true })
  assert.deepEqual(byId.get("child").tags, ["子任务"])
  assert.equal(byId.get("child").metadata, null)
})

test("无关键词的探针会话按 agent 兜底打标", () => {
  const planned = planSync([
    session("probe1", "New session - 2026-11-01T12:25:02.394Z", 100, null, { agent: "probe" }),
    session("probe2", "New session - 2026-11-01T12:25:46.494Z", 200, null, { agent: "probe" }),
    session("rule", "数学力学", 300, null, { agent: "probe" }),
    session("manual", "[物理] 001 手动", 400, null, {
      agent: "probe",
      metadata: { ocsAuto: false },
    }),
    session("frozen", "New session - 2026-11-01T12:26:00.000Z", 500, null, {
      agent: "probe",
      metadata: { ocsAuto: false },
    }),
    session("build", "New session - 2026-11-01T12:26:10.000Z", 600, null, { agent: "build" }),
    session("child", "开始学习 (@tutor subagent)", 700, "rule", { agent: "tutor" }),
  ])
  const byId = new Map(planned.map((p) => [p.id, p]))
  assert.deepEqual(byId.get("probe1").tags, ["测试"])
  assert.equal(byId.get("probe1").number, "001")
  assert.deepEqual(byId.get("probe1").metadata, { ocsAuto: true })
  assert.deepEqual(byId.get("probe2").tags, ["测试"])
  assert.equal(byId.get("probe2").number, "002")
  assert.deepEqual(byId.get("rule").tags, ["数学"])
  assert.deepEqual(byId.get("manual").tags, ["物理"])
  assert.equal(byId.get("manual").metadata, null)
  assert.deepEqual(byId.get("frozen").tags, ["未分类"])
  assert.deepEqual(byId.get("build").tags, ["未分类"])
  assert.deepEqual(byId.get("child").tags, ["子任务"])
})

test("agent 兜底打标幂等", () => {
  const sessions = [
    session("probe", "New session - 2026-11-01T12:25:02.394Z", 100, null, { agent: "probe" }),
  ]
  const once = planSync(sessions)
  const nextSessions = once.map((item) => ({
    id: item.id,
    title: item.title,
    parentID: item.parentID,
    agent: "probe",
    metadata: item.metadata ?? undefined,
    time: sessions[0].time,
  }))
  const twice = planSync(nextSessions)
  assert.deepEqual(once[0].tags, ["测试"])
  assert.equal(once[0].title, "[测试] 001 New session - 2026-11-01T12:25:02.394Z")
  assert.deepEqual(twice[0].tags, ["测试"])
  assert.equal(twice[0].title, once[0].title)
})

test("别名命中已有分类叶子：绫波丽 -> ayanami", () => {
  const tree = buildTree([session("a", "[ayanami] 001 从 QQ 迁移", 100)])
  const alias = classify("绫波丽权限项目阶段 2 收尾与阶段 3 规划", { tree })
  assert.deepEqual(alias.tags, ["ayanami"])
  assert.equal(alias.reason, "leaf")
  const rule = classify("AstrBot 权限配置", { tree })
  assert.deepEqual(rule.tags, ["ayanami"])
  const plain = classify("普通杂事", { tree })
  assert.deepEqual(plain.tags, ["未分类"])
})

test("capture 自动分类加术语，手动 capture 保留术语上级", () => {
  const sessions = [
    session("a", "[物理][数学] 001 数学", 100),
    session("b", "解释一下：数学力学", 200, null, { agent: "capture" }),
    session("c", "[物理][电磁] 001 手动", 300, null, {
      agent: "capture",
      metadata: { foo: 1, ocsAuto: false },
    }),
    session("d", "[术语][物理][数学] 001 已加前缀", 400, null, {
      agent: "capture",
      metadata: { ocsAuto: false, ocsCapture: true },
    }),
  ]
  const planned = planSync(sessions)
  const byId = new Map(planned.map((p) => [p.id, p]))
  assert.deepEqual(byId.get("b").tags, ["术语", "物理", "数学"])
  assert.deepEqual(byId.get("b").metadata, { ocsAuto: true, ocsCapture: true })
  assert.deepEqual(byId.get("c").tags, ["术语", "物理", "电磁"])
  assert.deepEqual(byId.get("c").metadata, { foo: 1, ocsAuto: false, ocsCapture: true })
  assert.deepEqual(byId.get("d").tags, ["术语", "物理", "数学"])
  assert.equal(byId.get("d").metadata, null)
})

test("冻结的无标签会话保持未分类", () => {
  const planned = planSync([
    session("a", "数学力学", 100, null, { metadata: { ocsAuto: false } }),
  ])
  assert.deepEqual(planned[0].tags, ["未分类"])
  assert.equal(planned[0].metadata, null)
})

test("planSync 重算幂等", () => {
  const sessions = [
    session("a", "[物理][数学] 001 力学", 100),
    session("b", "数学力学", 200, null, { metadata: { ocsAuto: true } }),
    session("c", "解释一下：数学", 300, null, { agent: "capture" }),
    session("d", "[代数] 001 矩阵", 400),
  ]
  const once = planSync(sessions)
  const nextSessions = once.map((item) => {
    const original = sessions.find((s) => s.id === item.id)
    return {
      id: item.id,
      title: item.title,
      parentID: item.parentID,
      agent: original.agent,
      metadata: item.metadata ?? original.metadata,
      time: original.time,
    }
  })
  const twice = planSync(nextSessions)
  assert.deepEqual(
    twice.map((item) => item.title),
    once.map((item) => item.title),
  )
})

export const FALLBACK = "未分类"
export const CHILD = "子任务"
export const TERM = "术语"

export const AGENT_TAGS = {
  probe: "测试",
  explore: "调研",
  tutor: "学习",
}

export const ALIASES = {
  ayanami: ["绫波丽", "astrbot"],
}

export function agentTag(agent) {
  return AGENT_TAGS[String(agent ?? "").trim().toLowerCase()] ?? null
}

function textHits(text, name) {
  const key = nameKey(name)
  if (text.includes(key)) return true
  return (ALIASES[key] ?? []).some((alias) => text.includes(alias.toLowerCase()))
}

export const RULES = [
  [/@(tutor|general) subagent/i, CHILD],
  [/数学|微积分|偏导数/, "数学"],
  [/代数|矩阵|逆矩阵/, "代数"],
  [/物理|力学|电磁|稳态|信号/, "物理"],
  [/基准|教材推荐|调研/, "调研"],
  [/opencode|skill|plugin|handoff|交接|插件|侧边栏|会话|记忆|右键|捕获/i, "opencode"],
  [/Keil|CLion|Node|SSH|Python|OJ|编程/i, "编程"],
  [/截图|图片|剪贴板|check-in/i, "杂"],
  [/单元卡|\/next|术语|学习队列|glossary|学习/, "学习"],
]

const RESERVED = new Set([FALLBACK, CHILD, TERM])

export function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .trim() || FALLBACK
}

export function pad(n) {
  return String(n).padStart(3, "0")
}

function nameKey(name) {
  return String(name ?? "").trim().toLowerCase()
}

export function isReservedName(name) {
  return RESERVED.has(String(name ?? "").trim())
}

export function stripTerm(tags) {
  return (tags ?? []).filter((tag) => tag !== TERM)
}

export function ensureTerm(tags) {
  const base = stripTerm(tags)
  return [TERM, ...(base.length > 0 ? base : [FALLBACK])]
}

export function formatPath(tags) {
  return (tags ?? []).map((tag) => `[${tag}]`).join("")
}

export function sameTags(a, b) {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  return left.every((tag, index) => nameKey(tag) === nameKey(right[index]))
}

export function parseTagPath(input) {
  if (Array.isArray(input)) {
    const tags = []
    for (const part of input) {
      const text = String(part ?? "").trim()
      if (!text) return { tags: [], error: "路径里有空段" }
      if (/[\[\]\/]/.test(text)) {
        return { tags: [], error: "路径格式不对：用 数学/物理 或 [数学][物理]" }
      }
      tags.push(text)
    }
    return tags.length > 0
      ? { tags, error: null }
      : { tags: [], error: "标签不能为空" }
  }

  const raw = String(input ?? "").trim()
  if (!raw) return { tags: [], error: "标签不能为空" }

  let segments
  if (raw.includes("[")) {
    segments = []
    const leftover = raw.replace(/\[([^\]]*)\]/g, (_, inner) => {
      segments.push(inner)
      return ""
    })
    if (leftover.replace(/[\s/]/g, "")) {
      return { tags: [], error: "路径格式不对：用 数学/物理 或 [数学][物理]" }
    }
  } else {
    segments = raw.split("/")
  }

  const tags = []
  for (const segment of segments) {
    const text = String(segment).trim()
    if (!text) return { tags: [], error: "路径里有空段" }
    if (/[\[\]\/]/.test(text)) {
      return { tags: [], error: "路径格式不对：用 数学/物理 或 [数学][物理]" }
    }
    tags.push(text)
  }
  return tags.length > 0
    ? { tags, error: null }
    : { tags: [], error: "标签不能为空" }
}

export function normalizePath(input) {
  const parsed = parseTagPath(input)
  return parsed.error ? [] : parsed.tags
}

export function parseTitle(title) {
  const text = String(title ?? "").trim()

  const leading = text.match(/^((?:\s*\[[^\]]+\])+)\s*([\s\S]*)$/)
  if (leading) {
    const tags = [...leading[1].matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim())
    const rest = leading[2].trim()
    const numbered = rest.match(/^(\d{2,})\s+([\s\S]*)$/)
    if (numbered) return { tags, number: numbered[1], body: numbered[2].trim() }
    return { tags, number: null, body: rest }
  }

  const old = text.match(/^(\d{2,})\s+((?:\s*\[[^\]]+\])+)\s*([\s\S]*)$/)
  if (old) {
    const tags = [...old[2].matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim())
    return { tags, number: old[1], body: old[3].trim() }
  }

  const numberOnly = text.match(/^(\d{2,})\s+([\s\S]*)$/)
  if (numberOnly) return { tags: [], number: numberOnly[1], body: numberOnly[2].trim() }
  return { tags: [], number: null, body: text }
}

function createdAt(session) {
  return Number(session?.time?.created ?? session?.time?.updated ?? session?.created ?? 0)
}

function updatedAt(session) {
  return Number(session?.time?.updated ?? session?.time?.created ?? session?.created ?? 0)
}

function buildTitle(tags, number, body, child) {
  const head = child ? `[${CHILD}]` : `${formatPath(tags)}${number ? ` ${number}` : ""}`
  return body ? `${head} ${body}` : head
}

function overrideTags(value) {
  if (value == null) return null
  if (Array.isArray(value)) {
    const tags = value.map((tag) => String(tag ?? "").trim()).filter(Boolean)
    return tags.length > 0 ? tags : [FALLBACK]
  }
  if (typeof value === "object" && Array.isArray(value.tags)) return overrideTags(value.tags)
  const tags = normalizePath(String(value))
  return tags.length > 0 ? tags : [FALLBACK]
}

export function planTitles(sessions, overrides = new Map()) {
  const overrideFor = (id) =>
    overrides instanceof Map ? overrides.get(id) : overrides?.[id]
  const hasOverride = (id) =>
    overrides instanceof Map ? overrides.has(id) : Object.hasOwn(overrides ?? {}, id)

  const parsed = sessions.map((session) => {
    const info = parseTitle(session.title)
    const child = Boolean(session.parentID)
    const override = hasOverride(session.id) ? overrideTags(overrideFor(session.id)) : null
    let tags
    if (child) tags = [CHILD]
    else if (override) tags = override
    else if (info.tags.length > 0) tags = info.tags
    else tags = [FALLBACK]
    return {
      session,
      child,
      tags,
      body: info.body,
      number: null,
    }
  })

  const groups = new Map()
  for (const item of parsed) {
    if (item.child) continue
    const key = item.tags.join("/")
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        createdAt(a.session) - createdAt(b.session) ||
        String(a.session.id).localeCompare(String(b.session.id)),
    )
    group.forEach((item, index) => {
      item.number = pad(index + 1)
    })
  }

  return parsed.map((item) => ({
    id: item.session.id,
    parentID: item.session.parentID ?? null,
    tags: item.tags,
    tag: item.tags.join("/"),
    number: item.number,
    body: item.body,
    title: buildTitle(item.tags, item.number, item.body, item.child),
  }))
}

function createTree() {
  return { roots: new Map(), nodes: [], byName: new Map() }
}

function insertPath(tree, tags, lastUsed) {
  let level = tree.roots
  let path = []
  for (let index = 0; index < tags.length; index += 1) {
    const name = tags[index]
    const key = nameKey(name)
    let node = level.get(key)
    if (!node) {
      node = {
        name,
        depth: index + 1,
        path: [...path, name],
        children: new Map(),
        lastUsed: 0,
        count: 0,
      }
      level.set(key, node)
      tree.nodes.push(node)
    }
    node.lastUsed = Math.max(node.lastUsed, lastUsed)
    node.count += 1
    path = node.path
    level = node.children
  }
}

export function buildTree(sessions = []) {
  const tree = createTree()
  for (const session of sessions) {
    if (session.parentID) continue
    const tags = stripTerm(parseTitle(session.title).tags)
    if (tags.length === 0) continue
    if (tags.some((tag) => isReservedName(tag))) continue
    insertPath(tree, tags, updatedAt(session))
  }
  for (const node of tree.nodes) {
    const key = nameKey(node.name)
    if (!tree.byName.has(key)) tree.byName.set(key, [])
    tree.byName.get(key).push(node)
  }
  return tree
}

function compareCandidates(a, b) {
  if (a.name.length !== b.name.length) return b.name.length - a.name.length
  if (a.depth !== b.depth) return b.depth - a.depth
  if (a.lastUsed !== b.lastUsed) return b.lastUsed - a.lastUsed
  return 0
}

function pickCandidate(candidates) {
  let best = null
  let tie = false
  for (const node of candidates) {
    if (!best) {
      best = node
      tie = false
      continue
    }
    const score = compareCandidates(node, best)
    if (score < 0) {
      best = node
      tie = false
    } else if (score === 0) {
      tie = true
    }
  }
  return { best, tie }
}

function classifyResult(tags, reason, capture, candidates) {
  return {
    tags: capture ? ensureTerm(tags) : tags,
    reason,
    candidates: candidates ?? null,
  }
}

export function classify(title, { capture = false, tree } = {}) {
  const activeTree = tree ?? buildTree([])
  const body = parseTitle(title).body
  const text = body.toLowerCase()

  if (text) {
    const leaves = activeTree.nodes.filter(
      (node) => node.children.size === 0 && textHits(text, node.name),
    )
    if (leaves.length > 0) {
      const { best, tie } = pickCandidate(leaves)
      if (tie) {
        return classifyResult([FALLBACK], "ambiguous-leaf", capture, leaves.map((node) => node.path))
      }
      return classifyResult(best.path, "leaf", capture)
    }
  }

  for (const [pattern, base] of RULES) {
    if (isReservedName(base) || !pattern.test(body)) continue
    const named = activeTree.byName.get(nameKey(base)) ?? []
    if (named.length === 0) return classifyResult([base], "rule", capture)
    const { best, tie } = pickCandidate(named)
    if (tie) {
      return classifyResult([FALLBACK], "ambiguous-rule", capture, named.map((node) => node.path))
    }
    if (best.children.size > 0) {
      return classifyResult([...best.path, FALLBACK], "rule-parent", capture)
    }
    return classifyResult(best.path, "rule-leaf", capture)
  }

  if (text) {
    const parents = activeTree.nodes.filter(
      (node) => node.children.size > 0 && textHits(text, node.name),
    )
    if (parents.length > 0) {
      const { best, tie } = pickCandidate(parents)
      if (tie) {
        return classifyResult([FALLBACK], "ambiguous-parent", capture, parents.map((node) => node.path))
      }
      return classifyResult([...best.path, FALLBACK], "parent", capture)
    }
  }

  return classifyResult([FALLBACK], "fallback", capture)
}

export function validateTagPath(input, tree) {
  const parsed = parseTagPath(input)
  if (parsed.error) return { ok: false, message: parsed.error }
  const tags = parsed.tags
  const underlying = stripTerm(tags)
  if (underlying.length === 0) return { ok: false, message: "路径不能只有「术语」" }

  const leaf = underlying[underlying.length - 1]
  if (isReservedName(leaf)) {
    if (leaf === FALLBACK) return { ok: true, tags }
    if (leaf === CHILD) return { ok: false, message: "子任务会话不参与分类" }
    return { ok: false, message: "路径不能只有「术语」" }
  }

  const conflicts = (tree?.byName?.get(nameKey(leaf)) ?? []).filter(
    (node) => node.children.size === 0 && !sameTags(node.path, underlying),
  )
  if (conflicts.length > 0) {
    const existing = conflicts[0]
    const suggestion = [...underlying.slice(0, -1), `通用${leaf}`]
    return {
      ok: false,
      message: `叶子名「${leaf}」已被 ${formatPath(existing.path)} 占用；请改成 ${formatPath(suggestion)}，或直接选已有路径。`,
      conflict: existing.path,
    }
  }
  return { ok: true, tags }
}

export function isCaptureSession(session) {
  if (!session) return false
  if (session.agent === "capture") return true
  if (session.metadata?.ocsCapture === true) return true
  return /^解释一下/.test(parseTitle(session.title).body)
}

export function planSync(sessions = []) {
  const tree = buildTree(sessions)
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const overrides = new Map()
  const details = new Map()

  for (const session of sessions) {
    if (session.parentID) continue
    const info = parseTitle(session.title)
    const metadata = session.metadata ?? {}
    const capture = isCaptureSession(session)
    const hasTags = info.tags.length > 0
    const auto = metadata.ocsAuto === true

    let tags
    let autoNow = false
    let candidates = null

    if (hasTags && !auto) {
      tags = info.tags.slice()
    } else if (!hasTags && metadata.ocsAuto === false) {
      tags = [FALLBACK]
    } else {
      const result = classify(session.title, { capture, tree })
      tags = result.tags
      autoNow = true
      candidates = result.candidates
      const byAgent = agentTag(session.agent)
      if (!capture && byAgent && tags.length === 1 && tags[0] === FALLBACK) {
        tags = [byAgent]
      }
    }

    if (capture) tags = ensureTerm(tags)
    overrides.set(session.id, tags)
    details.set(session.id, { capture, auto: autoNow, candidates })
  }

  const planned = planTitles(sessions, overrides)

  return planned.map((item) => {
    const detail = details.get(item.id)
    let metadata = null
    if (detail) {
      const session = byId.get(item.id)
      const current = session?.metadata ?? {}
      const patch = {}
      if (detail.auto) patch.ocsAuto = true
      if (detail.capture) patch.ocsCapture = true
      const changed = Object.entries(patch).some(([key, value]) => current[key] !== value)
      if (changed) metadata = { ...current, ...patch }
    }
    return {
      ...item,
      capture: Boolean(detail?.capture),
      auto: Boolean(detail?.auto),
      candidates: detail?.candidates ?? null,
      metadata,
    }
  })
}

const HEAVY = [
  "重构",
  "调试",
  "排查",
  "性能",
  "竞态",
  "死锁",
  "架构",
  "迁移",
  "测试",
  "安全",
  "漏洞",
  "refactor",
  "debug",
  "race",
  "deadlock",
  "performance",
  "migrate",
  "architecture",
  "security",
]

const texts = new Map()

function remember(output) {
  const parts = output?.parts
  if (!Array.isArray(parts)) return
  const id =
    parts.find((part) => typeof part?.messageID === "string")?.messageID ?? output?.message?.id
  if (typeof id !== "string") return
  const text = parts
    .filter((part) => part?.type === "text" && !part.synthetic)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()
  if (texts.size > 32) texts.clear()
  texts.set(id, text)
}

function pick(agent, text) {
  if (agent === "title" || agent === "summary") return "low"
  if (agent === "plan") return "high"
  if (text.length > 1200) return "high"
  const lower = text.toLowerCase()
  if (HEAVY.some((word) => lower.includes(word))) return "high"
  if (text.length > 240) return "medium"
  return "low"
}

export const AutoEffort = async () => ({
  "chat.message": async (input, output) => {
    try {
      remember(output)
    } catch {}
  },

  "chat.params": async (input, output) => {
    try {
      const model = input?.model
      const keys = model?.variants ? Object.keys(model.variants) : []
      if (!keys.length) return
      if (output?.options?.reasoningEffort) return
      const text = texts.get(input?.message?.id) ?? ""
      const effort = pick(input?.agent, text)
      if (!keys.includes(effort)) return
      output.options = { ...(output.options ?? {}), reasoningEffort: effort }
    } catch {}
  },
})

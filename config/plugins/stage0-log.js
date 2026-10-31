import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const LOG_DIR = join(CONFIG_DIR, "logs")
const LOG_FILE = join(LOG_DIR, "events.jsonl")
const CONFIG_FILE = join(CONFIG_DIR, "handoff.json")
const MAX_LOG_BYTES = 5 * 1024 * 1024

const DEFAULT_PRICES = {
  peak: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0.3 },
  offPeak: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0.15 },
  peakHoursUtc: [
    [1, 4],
    [6, 10],
  ],
  weekendOffPeak: true,
}

async function loadPrices() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, "utf8"))
    return { ...DEFAULT_PRICES, ...(parsed.prices || {}) }
  } catch {
    return DEFAULT_PRICES
  }
}

function tierFor(prices, date) {
  const day = date.getUTCDay()
  if (prices.weekendOffPeak && (day === 0 || day === 6)) return "offPeak"
  const hour = date.getUTCHours()
  const peak = (prices.peakHoursUtc || []).some(([start, end]) => hour >= start && hour < end)
  return peak ? "peak" : "offPeak"
}

function costOf(tokens, price) {
  const m = 1_000_000
  const input = Number(tokens?.input || 0)
  const output = Number(tokens?.output || 0)
  const cacheRead = Number(tokens?.cache?.read || 0)
  const cacheWrite = Number(tokens?.cache?.write || 0)
  return (
    (input / m) * Number(price.input || 0) +
    (output / m) * Number(price.output || 0) +
    (cacheRead / m) * Number(price.cacheRead || 0) +
    (cacheWrite / m) * Number(price.cacheWrite || 0)
  )
}

async function appendEvent(record) {
  try {
    await mkdir(LOG_DIR, { recursive: true })
    try {
      const info = await stat(LOG_FILE)
      if (info.size > MAX_LOG_BYTES) await rename(LOG_FILE, `${LOG_FILE}.1`)
    } catch {}
    await appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, "utf8")
  } catch {}
}

export const Stage0LogPlugin = async ({ directory }) => {
  const base = () => ({
    ts: new Date().toISOString(),
    dir: directory,
  })
  const loggedMessages = new Set()

  return {
    event: async ({ event }) => {
      try {
        if (event.type === "session.compacted") {
          await appendEvent({
            ...base(),
            event: "compacted",
            sessionID: event.properties?.sessionID,
          })
          return
        }

        if (event.type === "session.idle") {
          await appendEvent({
            ...base(),
            event: "idle",
            sessionID: event.properties?.sessionID,
          })
          return
        }

        if (event.type !== "message.updated") return

        const info = event.properties?.info
        if (info?.role !== "assistant" || !info?.tokens) return
        if (!info.time?.completed && !info.finish) return
        if (loggedMessages.has(info.id)) return
        loggedMessages.add(info.id)

        const prices = await loadPrices()
        const tier = tierFor(prices, new Date())
        const price = prices[tier]
        const tokens = info.tokens || {}

        await appendEvent({
          ...base(),
          event: "turn",
          sessionID: info.sessionID,
          messageID: info.id,
          model: `${info.providerID}/${info.modelID}`,
          finish: info.finish,
          tokens: {
            input: Number(tokens.input || 0),
            output: Number(tokens.output || 0),
            reasoning: Number(tokens.reasoning || 0),
            cacheRead: Number(tokens.cache?.read || 0),
            cacheWrite: Number(tokens.cache?.write || 0),
          },
          priceTier: tier,
          costUSD: Number(costOf(tokens, price).toFixed(6)),
          opencodeCostUSD: Number(info.cost || 0),
        })
      } catch {}
    },

    "tool.execute.after": async (input, output) => {
      try {
        const isHandoff = input.tool === "handoff_session"
        const args = input.args || {}
        await appendEvent({
          ...base(),
          event: isHandoff ? "handoff" : "tool",
          sessionID: input.sessionID,
          tool: input.tool,
          outputChars: typeof output?.output === "string" ? output.output.length : 0,
          ...(isHandoff
            ? {
                promptChars: typeof args.prompt === "string" ? args.prompt.length : 0,
                files: Array.isArray(args.files) ? args.files.length : 0,
              }
            : {}),
        })
      } catch {}
    },

    "chat.message": async (input, output) => {
      try {
        const parts = output?.parts || []
        const textParts = parts.filter((part) => part?.type === "text")
        const synthetic = textParts.length > 0 && textParts.every((part) => part.synthetic)
        await appendEvent({
          ...base(),
          event: "user-message",
          sessionID: input.sessionID,
          agent: input.agent,
          model: input.model ? `${input.model.providerID}/${input.model.modelID}` : undefined,
          textChars: textParts.reduce(
            (sum, part) => sum + (typeof part.text === "string" ? part.text.length : 0),
            0,
          ),
          synthetic,
        })
      } catch {}
    },
  }
}

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const LOG_FILE = join(homedir(), ".config", "opencode", "logs", "events.jsonl")
const days = Math.max(1, Number(process.argv[2] || 7))
const since = Date.now() - days * 24 * 60 * 60 * 1000

const money = (value) => `$${Number(value || 0).toFixed(4)}`
const num = (value) => Number(value || 0).toLocaleString("en-US")
const localDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))

let rows = []
try {
  const text = await readFile(LOG_FILE, "utf8")
  rows = text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
} catch {
  console.log(`No log file yet: ${LOG_FILE}`)
  process.exit(0)
}

const byMessage = new Map()
const withoutMessageID = []
for (const row of rows) {
  if (row.event !== "turn") continue
  if (row.messageID) byMessage.set(row.messageID, row)
  else withoutMessageID.push(row)
}

const turns = [...byMessage.values(), ...withoutMessageID].filter(
  (row) => new Date(row.ts).getTime() >= since,
)

if (turns.length === 0) {
  console.log(`No turns in the last ${days} day(s).`)
  process.exit(0)
}

const byDay = new Map()
const bySession = new Map()
const byTier = new Map()
let totalCost = 0
let totalInput = 0
let totalOutput = 0
let totalCacheRead = 0
let totalCacheWrite = 0

for (const row of turns) {
  const t = row.tokens || {}
  const cost = Number(row.costUSD || 0)
  const day = localDay(row.ts)
  const session = row.sessionID || "unknown"
  const tier = row.priceTier || "unknown"

  totalCost += cost
  totalInput += Number(t.input || 0)
  totalOutput += Number(t.output || 0)
  totalCacheRead += Number(t.cacheRead || 0)
  totalCacheWrite += Number(t.cacheWrite || 0)

  const d = byDay.get(day) || { cost: 0, turns: 0 }
  d.cost += cost
  d.turns += 1
  byDay.set(day, d)

  const s = bySession.get(session) || { cost: 0, turns: 0, dir: row.dir }
  s.cost += cost
  s.turns += 1
  s.dir = row.dir || s.dir
  bySession.set(session, s)

  const tr = byTier.get(tier) || { cost: 0, turns: 0 }
  tr.cost += cost
  tr.turns += 1
  byTier.set(tier, tr)
}

const cacheHit = totalCacheRead / Math.max(1, totalCacheRead + totalInput)

console.log(`OpenCode cost report — last ${days} day(s)`)
console.log(`Turns: ${num(turns.length)}   Total: ${money(totalCost)}   Avg/turn: ${money(totalCost / turns.length)}`)
console.log(
  `Tokens: input ${num(totalInput)} · output ${num(totalOutput)} · cache read ${num(totalCacheRead)} · cache write ${num(totalCacheWrite)}`,
)
console.log(`Cache hit share: ${(cacheHit * 100).toFixed(1)}%`)

console.log("\nBy day")
for (const [day, d] of [...byDay.entries()].sort()) {
  console.log(`  ${day}  ${money(d.cost).padStart(9)}  ${String(d.turns).padStart(4)} turns`)
}

console.log("\nBy tier")
for (const [tier, d] of [...byTier.entries()].sort()) {
  console.log(`  ${tier.padEnd(8)}  ${money(d.cost).padStart(9)}  ${String(d.turns).padStart(4)} turns`)
}

console.log("\nTop sessions")
for (const [session, s] of [...bySession.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 5)) {
  console.log(`  ${money(s.cost).padStart(9)}  ${String(s.turns).padStart(4)} turns  ${session}  ${s.dir || ""}`)
}

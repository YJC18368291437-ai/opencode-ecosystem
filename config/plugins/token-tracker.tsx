/**
 * Token Tracker Plugin - live cost bar chart + sidebar footer
 *
 * Sidebar content: per-request cost bars and session cumulative.
 * Sidebar footer: last request and session totals.
 *
 * Updates every 2 seconds during agent execution.
 *
 * Requirements:
 *   - OpenCode v1.4.3+
 *   - tui.json must have: { "plugin": ["./plugins/token-tracker.tsx"] }
 *   - Sidebar must be open (Ctrl+X B)
 */

/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import { createMemo, createSignal, onCleanup } from "solid-js"

const MAX_REQUESTS = 5
const USD_TO_CNY = 7.2

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

const fmtCost = (usd: number) => {
  const n = usd * USD_TO_CNY
  if (n >= 1) return `¥${n.toFixed(2)}`
  if (n >= 0.01) return `¥${n.toFixed(3)}`
  return `¥${n.toFixed(4)}`
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

type Step = {
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

type RequestNode = {
  index: number
  time: number
  label: string
  steps: number
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

function summarize(api: TuiPluginApi, sessionID: string) {
  const messages = api.state.session.messages(sessionID)
  const assistants = messages.filter(
    (m): m is AssistantMessage => m.role === "assistant" && !!m.tokens,
  )
  const users = messages.filter((m) => m.role === "user")

  const requests: RequestNode[] = []
  let groupedCost = 0

  for (let i = 0; i < users.length; i += 1) {
    const user = users[i] as any
    const steps: Step[] = assistants
      .filter(
        (a: any) =>
          a.parentID === user.id &&
          (a.tokens.input > 0 || a.tokens.output > 0 || (a.cost || 0) > 0),
      )
      .map((a: any) => ({
        cost: Number(a.cost || 0),
        input: Number(a.tokens.input || 0),
        output: Number(a.tokens.output || 0),
        cacheRead: Number(a.tokens.cache?.read || 0),
        cacheWrite: Number(a.tokens.cache?.write || 0),
      }))

    if (steps.length === 0) continue

    const textPart = api.state
      .part(user.id)
      .find((p: any) => p.type === "text" && !p.synthetic) as any
    const label = String(textPart?.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18)

    const node: RequestNode = {
      index: i + 1,
      time: user.time?.created || Date.now(),
      label,
      steps: steps.length,
      cost: steps.reduce((sum, s) => sum + s.cost, 0),
      input: steps.reduce((sum, s) => sum + s.input, 0),
      output: steps.reduce((sum, s) => sum + s.output, 0),
      cacheRead: steps.reduce((sum, s) => sum + s.cacheRead, 0),
      cacheWrite: steps.reduce((sum, s) => sum + s.cacheWrite, 0),
    }
    groupedCost += node.cost
    requests.push(node)
  }

  const totalCost = assistants.reduce((sum, a: any) => sum + Number(a.cost || 0), 0)
  const totalInput = assistants.reduce((sum, a: any) => sum + Number(a.tokens.input || 0), 0)
  const totalOutput = assistants.reduce((sum, a) => sum + Number(a.tokens.output || 0), 0)
  const totalCacheRead = assistants.reduce(
    (sum, a: any) => sum + Number(a.tokens.cache?.read || 0),
    0,
  )
  const totalCacheWrite = assistants.reduce(
    (sum, a: any) => sum + Number(a.tokens.cache?.write || 0),
    0,
  )

  const orphanCost = Math.max(0, totalCost - groupedCost)
  if (orphanCost > 0.0000001) {
    requests.push({
      index: 0,
      time: Date.now(),
      label: "其他/子任务",
      steps: 0,
      cost: orphanCost,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
  }

  return {
    requests,
    totalCost,
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    count: requests.length,
  }
}

function CostBars(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((t) => t + 1), 2000)
  onCleanup(() => clearInterval(timer))

  const data = createMemo(() => {
    tick()
    const all = summarize(props.api, props.session_id)
    const visible = all.requests.slice(-MAX_REQUESTS)
    const maxCost = Math.max(0, ...visible.map((r) => r.cost))
    return {
      ...all,
      visible,
      maxCost,
      hidden: Math.max(0, all.requests.length - visible.length),
    }
  })

  const bar = (cost: number) => {
    if (cost <= 0 || data().maxCost <= 0) return ""
    const width = Math.max(1, Math.round((cost / data().maxCost) * 14))
    return "█".repeat(width)
  }

  return (
    <box>
      <text>
        <span style={{ fg: theme().textMuted }}>💰 本会话 </span>
        <span style={{ fg: theme().accent }}>{fmtCost(data().totalCost)}</span>
        <span style={{ fg: theme().textMuted }}> · {data().count} 请求</span>
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>
          {"   "}in {fmt(data().totalInput)} · out {fmt(data().totalOutput)} · cache{" "}
          {fmt(data().totalCacheRead)}
        </span>
      </text>
      {data().hidden > 0 ? (
        <text>
          <span style={{ fg: theme().textMuted }}>
            {"   "}… 前面还有 {data().hidden} 个请求
          </span>
        </text>
      ) : null}
      {data().visible.length === 0 ? (
        <text>
          <span style={{ fg: theme().textMuted }}>{"   "}等待第一次请求…</span>
        </text>
      ) : null}
      {data().visible.map((req) => (
        <text>
          <span style={{ fg: theme().textMuted }}>
            #{req.index === 0 ? "?" : req.index} {fmtTime(req.time)}{" "}
          </span>
          <span style={{ fg: theme().text }}>{fmtCost(req.cost)} </span>
          <span style={{ fg: theme().accent }}>{bar(req.cost)}</span>
        </text>
      ))}
    </box>
  )
}

function ContextBlock(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((t) => t + 1), 2000)
  onCleanup(() => clearInterval(timer))

  const data = createMemo(() => {
    tick()
    const messages = props.api.state.session.messages(props.session_id)
    const last = [...messages].reverse().find((m: any) => m.role === "assistant" && !!m.tokens) as any
    const tokens = last
      ? Number(last.tokens.input || 0) +
        Number(last.tokens.output || 0) +
        Number(last.tokens.reasoning || 0) +
        Number(last.tokens.cache?.read || 0) +
        Number(last.tokens.cache?.write || 0)
      : 0
    const provider = last
      ? (props.api.state.provider as any[]).find((p) => p.id === last.providerID)
      : undefined
    const limit = provider?.models?.[last?.modelID]?.limit?.context
    return { tokens, percent: limit ? Math.round((tokens / limit) * 100) : null }
  })

  return (
    <box>
      <text>
        <b style={{ fg: theme().text }}>Context</b>
      </text>
      <text>
        <span style={{ fg: theme().text }}>{data().tokens.toLocaleString()}</span>
        <span style={{ fg: theme().textMuted }}> tokens</span>
      </text>
      <text>
        <span style={{ fg: theme().text }}>{data().percent ?? 0}</span>
        <span style={{ fg: theme().textMuted }}>% used</span>
      </text>
    </box>
  )
}

function TokenFooter(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((t) => t + 1), 2000)
  onCleanup(() => clearInterval(timer))

  const tokenData = createMemo(() => {
    tick()
    const state = props.api.state
    const status = state.session.status(props.session_id)
    const isBusy = status?.type === "busy"
    const all = summarize(props.api, props.session_id)
    const last = [...all.requests].reverse().find((r) => r.steps > 0)
    return {
      isBusy,
      lastInp: last?.input || 0,
      lastOut: last?.output || 0,
      lastCost: last?.cost || 0,
      totalInp: all.totalInput,
      totalOut: all.totalOutput,
      totalCost: all.totalCost,
      reqCount: all.count,
    }
  })

  return (
    <box>
      <text>
        <span style={{ fg: theme().textMuted }}>{tokenData().isBusy ? "⏳ " : "✓  "}</span>
        <span style={{ fg: theme().textMuted }}>last: in: </span>
        <span style={{ fg: theme().text }}>{fmt(tokenData().lastInp)}</span>
        <span style={{ fg: theme().textMuted }}> · out: </span>
        <span style={{ fg: theme().text }}>{fmt(tokenData().lastOut)}</span>
        <span style={{ fg: theme().textMuted }}> · </span>
        <span style={{ fg: theme().text }}>1 req</span>
        {tokenData().lastCost > 0 ? (
          <>
            <span style={{ fg: theme().textMuted }}> · </span>
            <span style={{ fg: theme().accent }}>{fmtCost(tokenData().lastCost)}</span>
          </>
        ) : null}
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>📊 total: in: </span>
        <span style={{ fg: theme().text }}>{fmt(tokenData().totalInp)}</span>
        <span style={{ fg: theme().textMuted }}> · out: </span>
        <span style={{ fg: theme().text }}>{fmt(tokenData().totalOut)}</span>
        <span style={{ fg: theme().textMuted }}> · </span>
        <span style={{ fg: theme().text }}>{tokenData().reqCount} reqs</span>
        {tokenData().totalCost > 0 ? (
          <>
            <span style={{ fg: theme().textMuted }}> · </span>
            <span style={{ fg: theme().accent }}>{fmtCost(tokenData().totalCost)}</span>
          </>
        ) : null}
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    slots: {
      sidebar_content(_ctx, props: { session_id: string }) {
        return (
          <>
            <CostBars api={api} session_id={props.session_id} />
            <ContextBlock api={api} session_id={props.session_id} />
          </>
        )
      },
      sidebar_footer(_ctx, props: { session_id: string }) {
        return <TokenFooter api={api} session_id={props.session_id} />
      },
    },
  })
}

export default { id: "token-tracker", tui } satisfies TuiPluginModule

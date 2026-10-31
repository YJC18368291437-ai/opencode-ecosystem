/** @jsxImportSource @opentui/solid */
/**
 * 学习面板：侧栏显示当前科目、队列、快捷键
 * 数据来自 memory/learning/state.md，每 3 秒刷新
 * 需要 tui.json 注册，侧栏用 Ctrl+X B 打开
 */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal, onCleanup } from "solid-js"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const ROOT = process.env.LEARNING_DIR || path.join(os.homedir(), ".config/opencode/memory/learning")
const STATE = path.join(ROOT, "state.md")

type Data = {
  subject: string
  unit: string
  rows: { subject: string; first: string }[]
  total: number
  mastered: number
  due: number
}

function read(file: string) {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return ""
  }
}

function section(text: string, name: string) {
  const out: string[] = []
  let hit = false
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      hit = line.slice(3).trim() === name
      continue
    }
    if (hit) out.push(line)
  }
  return out
}

function field(lines: string[], key: string) {
  for (const line of lines) {
    const m = line.match(/^\s*-\s*([^：:]+)[：:]\s*(.*)$/)
    if (m && m[1].trim() === key) return m[2].trim()
  }
  return ""
}

function load(): Data {
  const text = read(STATE)
  const cur = section(text, "当前")
  const rows: { subject: string; first: string }[] = []
  for (const line of section(text, "队列")) {
    const m = line.match(/^([^：:]+)[：:]\s*(.+)$/)
    if (!m) continue
    const units = m[2].split("→").map((s) => s.trim()).filter(Boolean)
    rows.push({ subject: m[1].trim(), first: units[0] || "" })
  }
  let total = 0
  let mastered = 0
  for (const line of read(path.join(ROOT, "glossary/index.md")).split("\n")) {
    const s = line.trim()
    if (!s.startsWith("|")) continue
    const cells = s.split("|").slice(1, -1).map((c) => c.trim())
    if (cells.length < 6 || cells[0] === "term" || /^-+$/.test(cells[0])) continue
    total += 1
    if (cells[3] === "mastered") mastered += 1
  }
  return {
    subject: field(cur, "科目") || "（未开始）",
    unit: field(cur, "单元") || "（未开始）",
    rows,
    total,
    mastered,
    due: 0,
  }
}

function StudyPanel(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const [data, setData] = createSignal<Data>(load())
  const timer = setInterval(() => setData(load()), 3000)
  onCleanup(() => clearInterval(timer))

  const started = () => data().subject !== "（未开始）"

  return (
    <box>
      <text>
        <b style={{ fg: theme().text }}>📚 学习面板</b>
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>当前 </span>
        <span style={{ fg: theme().accent }}>
          {started() ? `${data().subject} · ${data().unit}` : "未开始"}
        </span>
      </text>
      {data().rows.map((r) => (
        <text>
          <span style={{ fg: theme().textMuted }}>{r.subject} </span>
          <span style={{ fg: started() && r.subject === data().subject ? theme().accent : theme().text }}>
            → {r.first}
          </span>
        </text>
      ))}
      <text>
        <span style={{ fg: theme().textMuted }}>术语 </span>
        <span style={{ fg: theme().text }}>
          {data().mastered}/{data().total} mastered
        </span>
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>⌃⌥Q 查词 · /next · /done</span>
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>/selfhelp 看全部快捷键</span>
      </text>
    </box>
  )
}

function StudyLine(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const [data, setData] = createSignal<Data>(load())
  const timer = setInterval(() => setData(load()), 3000)
  onCleanup(() => clearInterval(timer))
  const started = () => data().subject !== "（未开始）"
  return (
    <text>
      <span style={{ fg: theme().textMuted }}>📚 </span>
      <span style={{ fg: theme().accent }}>
        {started() ? `${data().subject} · ${data().unit}` : "未开始"}
      </span>
    </text>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    slots: {
      sidebar_content() {
        return <StudyPanel api={api} />
      },
      session_prompt_right() {
        return <StudyLine api={api} />
      },
    },
  })
}

export default { id: "study-panel", tui } satisfies TuiPluginModule

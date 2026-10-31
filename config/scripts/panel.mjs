#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = process.env.LEARNING_DIR || path.join(os.homedir(), '.config/opencode/memory/learning')
const STATE = path.join(ROOT, 'state.md')
const INDEX = path.join(ROOT, 'glossary/index.md')
const GLOSSARY = path.join(ROOT, 'glossary')

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function section(text, name) {
  const out = []
  let hit = false
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      hit = line.slice(3).trim() === name
      continue
    }
    if (hit) out.push(line)
  }
  return out
}

function field(lines, key) {
  for (const line of lines) {
    const m = line.match(/^\s*-\s*([^：:]+)[：:]\s*(.*)$/)
    if (m && m[1].trim() === key) return m[2].trim()
  }
  return ''
}

function queueRows(text) {
  const rows = []
  for (const line of section(text, '队列')) {
    const m = line.match(/^([^：:]+)[：:]\s*(.+)$/)
    if (!m) continue
    const units = m[2].split('→').map((s) => s.trim()).filter(Boolean)
    rows.push({ subject: m[1].trim(), first: units[0] || '', count: units.length })
  }
  return rows
}

function indexStats() {
  const rows = []
  for (const line of read(INDEX).split('\n')) {
    const s = line.trim()
    if (!s.startsWith('|')) continue
    const cells = s.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 6 || cells[0] === 'term' || /^-+$/.test(cells[0])) continue
    rows.push({ term: cells[0], domain: cells[2], status: cells[3] })
  }
  return rows
}

function dueCount() {
  const now = today()
  let n = 0
  const walk = (dir) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md') {
        const m = read(p).match(/^next_review:\s*(\S+)/m)
        if (m && m[1] && m[1] <= now) n++
      }
    }
  }
  walk(GLOSSARY)
  return n
}

function build() {
  const text = read(STATE)
  const cur = section(text, '当前')
  const subject = field(cur, '科目') || '（未开始）'
  const unit = field(cur, '单元') || '（未开始）'
  const status = field(cur, '状态') || ''
  const nextReview = field(cur, '下次复习')
  const rows = queueRows(text)
  const idx = indexStats()
  const mastered = idx.filter((r) => r.status === 'mastered').length
  return { subject, unit, status, nextReview, rows, total: idx.length, mastered, due: dueCount() }
}

const d = build()
const started = d.subject !== '（未开始）'

console.log(`📚 学习面板 · ${today()}`)
console.log('')
console.log(`当前：${started ? `${d.subject} · ${d.unit}${d.status ? `（${d.status}）` : ''}` : '未开始'}`)
if (d.nextReview) console.log(`下次复习：${d.nextReview}`)
console.log('')
if (d.rows.length) {
  console.log(`队列（${d.rows.length} 科）`)
  for (const r of d.rows) {
    const isCur = started && r.subject === d.subject
    const mark = isCur ? '  ← 当前' : ''
    console.log(`  ${r.subject} → ${r.first}${r.count > 1 ? ' …' : ''}${mark}`)
  }
  console.log('')
}
console.log(`术语：${d.total} 词（mastered ${d.mastered}）｜到期 ${d.due}`)
console.log('')
console.log('快捷键')
console.log('  ⌃⌥Q         查词/查图（新窗口，剪贴板）')
console.log('  /next       下一单元（不填科目＝接上次）')
console.log('  /next 数学   换科目')
console.log('  /done       收尾检查 + 写状态')
console.log('  /stuck      记卡点、降难度')
console.log('  /status     队列与到期复习')
console.log('  /term 词     术语速查')
console.log('  /selfhelp   本面板')
console.log('  /switch     换对话')
console.log('  Ctrl+X B    开/关侧栏')

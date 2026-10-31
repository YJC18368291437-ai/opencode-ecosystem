#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

const ROOT = process.env.LEARNING_DIR || path.join(os.homedir(), '.config/opencode/memory/learning')
const GLOSSARY = path.join(ROOT, 'glossary')
const INDEX = path.join(GLOSSARY, 'index.md')
const KNOWN = path.join(ROOT, 'known.md')
const INTERVALS = [1, 3, 7, 14, 30]

const FM_KEYS = ['term', 'aliases', 'domain', 'status', 'level', 'prereqs', 'source', 'created', 'last_reviewed', 'review_interval', 'next_review']
const LIST_KEYS = new Set(['aliases', 'prereqs'])

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function atomicWrite(file, content) {
  ensureDir(path.dirname(file))
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, file)
}

function parseFrontmatter(text) {
  const meta = {}
  let body = text
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4)
    if (end !== -1) {
      const raw = text.slice(4, end)
      for (const line of raw.split('\n')) {
        const i = line.indexOf(':')
        if (i === -1) continue
        const k = line.slice(0, i).trim()
        const v = line.slice(i + 1).trim()
        if (!k) continue
        meta[k] = LIST_KEYS.has(k)
          ? v.split(',').map((x) => x.trim()).filter(Boolean)
          : v
      }
      body = text.slice(text.indexOf('\n', end + 1) + 1)
    }
  }
  return { meta, body }
}

function serializeFrontmatter(meta, body) {
  const lines = ['---']
  for (const k of FM_KEYS) {
    if (meta[k] === undefined) continue
    const v = Array.isArray(meta[k]) ? meta[k].join(', ') : meta[k]
    lines.push(`${k}: ${v}`)
  }
  lines.push('---')
  return lines.join('\n') + '\n\n' + body.replace(/^\n+/, '')
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md') acc.push(p)
  }
  return acc
}

function allTerms() {
  return walk(GLOSSARY).map((file) => {
    const text = fs.readFileSync(file, 'utf8')
    const { meta, body } = parseFrontmatter(text)
    return { file, meta, body }
  })
}

function resolveTerm(input) {
  const slug = slugify(input)
  const raw = String(input).trim().toLowerCase()
  const terms = allTerms()
  for (const t of terms) {
    if (slugify(t.meta.term || '') === slug) return t
  }
  for (const t of terms) {
    if (path.basename(t.file, '.md') === slug) return t
  }
  for (const t of terms) {
    const aliases = Array.isArray(t.meta.aliases) ? t.meta.aliases : []
    if (aliases.some((a) => a.toLowerCase() === raw || slugify(a) === slug)) return t
  }
  return null
}

function readIndex() {
  if (!fs.existsSync(INDEX)) return []
  const rows = []
  for (const line of fs.readFileSync(INDEX, 'utf8').split('\n')) {
    const s = line.trim()
    if (!s.startsWith('|')) continue
    const cells = s.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 6) continue
    if (cells[0] === 'term' || /^-+$/.test(cells[0])) continue
    rows.push({
      term: cells[0],
      summary: cells[1],
      domain: cells[2],
      status: cells[3],
      prereqs: cells[4],
      date: cells[5],
    })
  }
  return rows
}

function cleanCell(s) {
  return String(s || '').replace(/\|/g, '／').replace(/\n/g, ' ').trim()
}

function writeIndex(rows) {
  rows.sort((a, b) => a.term.localeCompare(b.term))
  const out = ['# 术语索引', '', '| term | 一句话 | domain | status | prereqs | date |', '|---|---|---|---|---|---|']
  for (const r of rows) {
    out.push(`| ${cleanCell(r.term)} | ${cleanCell(r.summary)} | ${cleanCell(r.domain)} | ${cleanCell(r.status)} | ${cleanCell(r.prereqs)} | ${cleanCell(r.date)} |`)
  }
  atomicWrite(INDEX, out.join('\n') + '\n')
}

function upsertIndexRow(row) {
  const rows = readIndex()
  const i = rows.findIndex((r) => slugify(r.term) === slugify(row.term))
  if (i === -1) rows.push(row)
  else rows[i] = { ...rows[i], ...row }
  writeIndex(rows)
}

function writeKnown() {
  const rows = readIndex().filter((r) => r.status === 'mastered')
  const groups = new Map()
  for (const r of rows) {
    const d = r.domain || 'misc'
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(r.term)
  }
  const lines = ['# 已掌握']
  for (const d of [...groups.keys()].sort()) {
    lines.push(`${d}: ${groups.get(d).sort().join(', ')}`)
  }
  atomicWrite(KNOWN, lines.join('\n') + '\n')
  return rows.length
}

function fail(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

function cmdKnown(domain) {
  const rows = readIndex().filter((r) => r.status === 'mastered')
  const filtered = domain ? rows.filter((r) => r.domain === domain) : rows
  if (filtered.length === 0) {
    console.log(domain ? `（${domain} 暂无掌握的词）` : '（暂无掌握的词）')
    return
  }
  const groups = new Map()
  for (const r of filtered) {
    if (!groups.has(r.domain)) groups.set(r.domain, [])
    groups.get(r.domain).push(r.term)
  }
  for (const d of [...groups.keys()].sort()) {
    console.log(`${d}: ${groups.get(d).sort().join(', ')}`)
  }
}

function cmdBrief(input) {
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}\n（可以新建：node term.mjs add --json '{"term":"${input}"}'）`)
  const row = readIndex().find((r) => slugify(r.term) === slugify(t.meta.term))
  const summary = row ? row.summary : '（无摘要）'
  console.log(`${t.meta.term} — ${summary}`)
  const prereqs = Array.isArray(t.meta.prereqs) ? t.meta.prereqs.join(', ') : ''
  console.log(`状态：${t.meta.status || 'introduced'}${prereqs ? ` ｜ 前置：${prereqs}` : ''}`)
}

function cmdOpen(input) {
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}`)
  console.log(t.file)
  try {
    const child = spawn('qlmanage', ['-p', t.file], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch (e) {
    console.error(`打开失败：${e.message}`)
  }
}

function cmdShow(input) {
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}`)
  console.log(fs.readFileSync(t.file, 'utf8'))
}

function cmdMissing(input) {
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}`)
  const mastered = new Set(readIndex().filter((r) => r.status === 'mastered').map((r) => slugify(r.term)))
  const missing = []
  const seen = new Set()
  function walkPrereqs(term) {
    const cur = resolveTerm(term)
    if (!cur) return
    const prereqs = Array.isArray(cur.meta.prereqs) ? cur.meta.prereqs : []
    for (const p of prereqs) {
      const s = slugify(p)
      if (seen.has(s)) continue
      seen.add(s)
      if (!mastered.has(s)) missing.push(p)
      walkPrereqs(p)
    }
  }
  walkPrereqs(t.meta.term)
  if (missing.length === 0) console.log('无缺失前置')
  else for (const m of missing) console.log(m)
}

function ensurePlaceholder(term, domain, source) {
  if (resolveTerm(term)) return false
  const slug = slugify(term)
  if (!slug) return false
  const file = path.join(GLOSSARY, domain, `${slug}.md`)
  const meta = {
    term,
    aliases: [],
    domain,
    status: 'introduced',
    level: '0',
    prereqs: [],
    source: source || 'lesson',
    created: today(),
    last_reviewed: '',
  }
  atomicWrite(file, serializeFrontmatter(meta, `# ${term}\n\n（占位：待补全）\n`))
  upsertIndexRow({ term, summary: '（占位）', domain, status: 'introduced', prereqs: '', date: today() })
  return true
}

function cmdAdd(args) {
  let json = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
      json = args[i + 1]
      if (json === '-') json = fs.readFileSync(0, 'utf8')
      i++
    }
  }
  if (!json) fail('用法：term.mjs add --json \'{"term":"ssh",...}\'（或用 --json - 从 stdin 读）')
  let payload
  try {
    payload = JSON.parse(json)
  } catch (e) {
    fail(`JSON 解析失败：${e.message}`)
  }
  if (!payload.term || !String(payload.term).trim()) fail('payload 缺少 term')

  const term = String(payload.term).trim()
  const domain = slugify(payload.domain || 'misc') || 'misc'
  const existing = resolveTerm(term)
  const created = []

  const prereqs = Array.isArray(payload.prereqs)
    ? payload.prereqs.map((p) => String(p).trim()).filter(Boolean)
    : []

  for (const p of prereqs) {
    if (!resolveTerm(p) && ensurePlaceholder(p, domain, payload.source || 'lesson')) created.push(p)
  }

  let file
  let meta
  let body
  if (existing) {
    file = existing.file
    meta = { ...existing.meta }
    body = payload.body !== undefined ? String(payload.body) : existing.body
    if (payload.term) meta.term = term
    if (payload.aliases) meta.aliases = payload.aliases.map((a) => String(a).trim()).filter(Boolean)
    if (payload.domain) meta.domain = domain
    if (payload.level !== undefined) meta.level = String(payload.level)
    if (payload.source) meta.source = payload.source
    if (payload.created) meta.created = payload.created
    if (payload.last_reviewed !== undefined) meta.last_reviewed = payload.last_reviewed
    if (prereqs.length) meta.prereqs = prereqs
  } else {
    const slug = slugify(term)
    if (!slug) fail(`无法生成 slug：${term}`)
    file = path.join(GLOSSARY, domain, `${slug}.md`)
    meta = {
      term,
      aliases: Array.isArray(payload.aliases) ? payload.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
      domain,
      status: 'introduced',
      level: String(payload.level ?? 0),
      prereqs,
      source: payload.source || 'lesson',
      created: payload.created || today(),
      last_reviewed: payload.last_reviewed || '',
    }
    body = payload.body !== undefined ? String(payload.body) : `# ${term}\n\n（待补充解释）\n`
  }

  if (payload.status && ['introduced', 'mastered'].includes(payload.status)) meta.status = payload.status
  if (payload.next_review !== undefined) meta.next_review = payload.next_review
  if (payload.review_interval !== undefined) meta.review_interval = String(payload.review_interval)

  atomicWrite(file, serializeFrontmatter(meta, body))
  upsertIndexRow({
    term: meta.term,
    summary: cleanCell(payload.summary || readIndex().find((r) => slugify(r.term) === slugify(meta.term))?.summary || '（无摘要）'),
    domain: meta.domain,
    status: meta.status,
    prereqs: Array.isArray(meta.prereqs) ? meta.prereqs.join(', ') : '',
    date: today(),
  })
  const n = writeKnown()
  console.log(`${existing ? '已更新' : '已新建'}：${meta.term}（${meta.domain}/${meta.status}）→ ${path.relative(ROOT, file)}`)
  if (created.length) console.log(`同时建了前置占位：${created.join(', ')}`)
  console.log(`known.md 现有 ${n} 个 mastered 词`)
}

function cmdMaster(args) {
  const input = args.find((a) => !a.startsWith('--'))
  const isFail = args.includes('--fail')
  if (!input) fail('用法：term.mjs master <term> [--fail]')
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}`)
  const meta = { ...t.meta }
  const current = Number(meta.review_interval || 0)
  let interval
  if (isFail) {
    meta.status = 'introduced'
    interval = 1
  } else {
    meta.status = 'mastered'
    const idx = INTERVALS.indexOf(current)
    interval = idx === -1 ? INTERVALS[0] : INTERVALS[Math.min(idx + 1, INTERVALS.length - 1)]
  }
  meta.last_reviewed = today()
  meta.review_interval = String(interval)
  meta.next_review = addDays(today(), interval)
  atomicWrite(t.file, serializeFrontmatter(meta, t.body))
  const row = readIndex().find((r) => slugify(r.term) === slugify(meta.term))
  upsertIndexRow({
    term: meta.term,
    summary: row ? row.summary : '（无摘要）',
    domain: meta.domain,
    status: meta.status,
    prereqs: Array.isArray(meta.prereqs) ? meta.prereqs.join(', ') : '',
    date: today(),
  })
  const n = writeKnown()
  console.log(`${meta.term} → ${meta.status}；下次复习 ${meta.next_review}（间隔 ${interval} 天）；known 共 ${n} 词`)
}

function cmdRemove(args) {
  const input = args.find((a) => !a.startsWith('--'))
  if (!input) fail('用法：term.mjs remove <term>')
  const t = resolveTerm(input)
  if (!t) fail(`未找到：${input}`)
  fs.rmSync(t.file, { force: true })
  const dir = path.dirname(t.file)
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {}
  const rows = readIndex().filter((r) => slugify(r.term) !== slugify(t.meta.term))
  writeIndex(rows)
  const n = writeKnown()
  console.log(`已删除：${t.meta.term}（${path.relative(ROOT, t.file)}）`)
  console.log(`known.md 现有 ${n} 个 mastered 词`)
}

function cmdStatus() {
  const rows = readIndex()
  if (rows.length === 0) {
    console.log(`术语库为空。\n数据目录：${ROOT}`)
    return
  }
  const terms = allTerms()
  const bySlug = new Map(terms.map((t) => [slugify(t.meta.term || ''), t]))
  const domains = new Map()
  for (const r of rows) {
    const d = r.domain || 'misc'
    if (!domains.has(d)) domains.set(d, { total: 0, mastered: 0 })
    domains.get(d).total++
    if (r.status === 'mastered') domains.get(d).mastered++
  }
  console.log('## 各科数量')
  for (const d of [...domains.keys()].sort()) {
    const s = domains.get(d)
    console.log(`${d}: ${s.total} 词（mastered ${s.mastered}）`)
  }
  const now = today()
  const due = terms
    .filter((t) => t.meta.next_review && t.meta.next_review <= now)
    .sort((a, b) => a.meta.next_review.localeCompare(b.meta.next_review))
  console.log('\n## 到期复习')
  if (due.length === 0) console.log('（无）')
  else for (const t of due) console.log(`${t.meta.next_review} ${t.meta.term}（${t.meta.status}）`)
  const recent = terms
    .filter((t) => t.meta.last_reviewed)
    .sort((a, b) => b.meta.last_reviewed.localeCompare(a.meta.last_reviewed))
    .slice(0, 5)
  console.log('\n## 最近更新')
  if (recent.length === 0) console.log('（无）')
  else for (const t of recent) console.log(`${t.meta.last_reviewed} ${t.meta.term}（${t.meta.status}）`)
  console.log(`\n数据目录：${ROOT}`)
}

function main() {
  const [cmd, ...args] = process.argv.slice(2)
  switch (cmd) {
    case 'known':
      return cmdKnown(args[0])
    case 'brief':
      return cmdBrief(args[0] || fail('用法：term.mjs brief <term>'))
    case 'open':
      return cmdOpen(args[0] || fail('用法：term.mjs open <term>'))
    case 'show':
      return cmdShow(args[0] || fail('用法：term.mjs show <term>'))
    case 'missing':
      return cmdMissing(args[0] || fail('用法：term.mjs missing <term>'))
    case 'add':
      return cmdAdd(args)
    case 'master':
      return cmdMaster(args)
    case 'remove':
      return cmdRemove(args)
    case 'status':
      return cmdStatus()
    default:
      console.log(`term.mjs — 术语库

用法：
  term.mjs known [domain]          列出 mastered 词
  term.mjs brief <term>            1–2 行摘要 + 状态 + 前置
  term.mjs open <term>             Quick Look 打开全文，只打印路径
  term.mjs show <term>             打印全文（仅显式要求时用）
  term.mjs missing <term>          递归展开缺失前置
  term.mjs add --json <payload>    新建/更新术语（--json - 从 stdin 读）
  term.mjs master <term> [--fail]  标记掌握 / 失败，排下次复习
  term.mjs remove <term>           删除术语（含 index 与 known）
  term.mjs status                  各科数量、到期复习、最近更新

数据目录：${ROOT}（可用 LEARNING_DIR 覆盖）`)
  }
}

try {
  main()
} catch (e) {
  console.error(`出错：${e.message}`)
  process.exit(1)
}

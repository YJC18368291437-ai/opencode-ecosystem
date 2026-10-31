#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import {
  FALLBACK,
  buildTree,
  classify,
  ensureTerm,
  formatPath,
  isCaptureSession,
  normalizeTag,
  parseTagPath,
  planTitles,
  sameTags,
  stripTerm,
  validateTagPath,
} from './tag-core.mjs'

const DB = process.env.OPENCODE_DB || path.join(os.homedir(), '.local/share/opencode/opencode.db')

function readMetadata(text) {
  if (!text) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function open() {
  const db = new DatabaseSync(DB)
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

function toSession(row) {
  return {
    id: row.id,
    parentID: row.parent_id ?? null,
    title: row.title,
    agent: row.agent ?? null,
    metadata: readMetadata(row.metadata),
    time: { created: row.time_created, updated: row.time_updated },
  }
}

function rowsToSessions(rows) {
  return rows.map((row) => ({
    id: row.id,
    parentID: row.parent,
    title: row.current,
    agent: row.agent,
    metadata: row.metadata,
    time: { created: row.created, updated: row.updated },
  }))
}

function load(db, opts = {}) {
  const column = opts.by === 'created' ? 'time_created' : 'time_updated'
  const direction = opts.oldest ? 'ASC' : 'DESC'
  const rows = db
    .prepare(
      `SELECT id, parent_id, title, directory, agent, metadata, time_created, time_updated FROM session ORDER BY ${column} ${direction}, id ${direction}`,
    )
    .all()

  const sessions = rows.map(toSession)
  const tree = buildTree(sessions)
  const captures = new Map()
  const overrides = new Map()
  const candidates = new Map()

  for (const session of sessions) {
    const capture = isCaptureSession(session)
    captures.set(session.id, capture)
    if (opts.retag && !session.parentID) {
      const result = classify(session.title, { capture, tree })
      overrides.set(session.id, result.tags)
      if (result.candidates) candidates.set(session.id, result.candidates)
    }
  }

  const planned = planTitles(sessions, overrides)
  const byId = new Map(planned.map((item) => [item.id, item]))
  return rows.map((row) => {
    const item = byId.get(row.id)
    const session = toSession(row)
    const capture = captures.get(row.id) ?? false
    let desiredMeta = null
    if (opts.retag && !row.parent_id) {
      desiredMeta = { ...session.metadata, ocsAuto: false }
      if (capture) desiredMeta.ocsCapture = true
    }
    return {
      id: row.id,
      parent: row.parent_id ?? null,
      tags: item.tags,
      tag: item.tag,
      num: item.number,
      title: item.body,
      current: row.title,
      desired: item.title,
      agent: row.agent ?? null,
      metadata: session.metadata,
      desiredMeta,
      capture,
      candidates: candidates.get(row.id) ?? null,
      directory: row.directory,
      created: row.time_created,
      updated: row.time_updated,
    }
  })
}

function replan(rows, overrides = new Map()) {
  const planned = planTitles(rowsToSessions(rows), overrides)
  const byId = new Map(planned.map((item) => [item.id, item]))
  for (const row of rows) {
    const item = byId.get(row.id)
    row.tags = item.tags
    row.tag = item.tag
    row.num = item.number
    row.title = item.body
    row.desired = item.title
  }
}

function format(row) {
  return row.desired
}

function filterRows(rows, opts = {}) {
  let out = rows
  if (opts.tag) {
    const parsed = parseTagPath(opts.tag)
    if (parsed.error) {
      const single = normalizeTag(opts.tag)
      out = out.filter((r) => r.tags.length === 1 && r.tags[0] === single)
    } else {
      out = out.filter(
        (r) =>
          sameTags(r.tags, parsed.tags) ||
          sameTags(stripTerm(r.tags), stripTerm(parsed.tags)),
      )
    }
  }
  if (opts.dir) {
    const dir = path.resolve(opts.dir.replace(/^~(?=$|\/)/, os.homedir()))
    out = out.filter((r) => path.resolve(r.directory || '').startsWith(dir))
  }
  return out
}

function saveBackup(rows) {
  const dir = path.join(os.homedir(), '.local/state/opencode')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `ocs-backup-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify(rows, null, 2))
  return file
}

function sameMetadata(a, b) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

function metadataJson(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) return null
  return JSON.stringify(metadata)
}

function pendingChanges(rows) {
  return rows.filter(
    (r) =>
      r.current !== r.desired ||
      (r.desiredMeta != null && !sameMetadata(r.metadata, r.desiredMeta)),
  )
}

function persist(db, rows) {
  const changed = pendingChanges(rows)
  if (changed.length === 0) return { titles: 0, metas: 0, total: 0 }
  saveBackup(changed)
  const updateTitle = db.prepare('UPDATE session SET title = ? WHERE id = ?')
  const updateMeta = db.prepare('UPDATE session SET metadata = ? WHERE id = ?')
  let titles = 0
  let metas = 0
  db.exec('BEGIN')
  try {
    for (const r of changed) {
      if (r.current !== r.desired) {
        updateTitle.run(r.desired, r.id)
        r.current = r.desired
        titles += 1
      }
      if (r.desiredMeta != null && !sameMetadata(r.metadata, r.desiredMeta)) {
        updateMeta.run(metadataJson(r.desiredMeta), r.id)
        r.metadata = r.desiredMeta
        metas += 1
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { titles, metas, total: changed.length }
}

function apply(rows, db, write, quiet = false) {
  const changed = pendingChanges(rows)
  if (!write) {
    for (const r of changed) {
      if (r.current !== r.desired) {
        console.log(`${r.id}  ${r.current}\n   -> ${r.desired}`)
      }
      if (r.desiredMeta != null && !sameMetadata(r.metadata, r.desiredMeta)) {
        console.log(`${r.id}  metadata -> ${JSON.stringify(r.desiredMeta)}`)
      }
      if (r.candidates?.length) {
        console.log(`  ${r.id} 分类有歧义，候选：${r.candidates.map(formatPath).join('、')}`)
      }
    }
    console.log(`\n${changed.length} 条待修改（dry-run，加 --write 生效）`)
    return
  }
  const n = persist(db, rows)
  console.log(`已修改 ${n.titles} 条标题、${n.metas} 条元数据`)
  if (!quiet) for (const r of rows) console.log(format(r))
}

function inRange(num, lo, hi) {
  if (!num) return false
  const value = Number(num)
  return Number.isFinite(value) && value >= lo && value <= hi
}

function parseSelectors(rows, spec) {
  const groups = String(spec || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const hits = new Map()
  const ambiguous = []

  for (const group of groups) {
    const tokens = group.split(/\s+/).filter(Boolean)
    const textParts = []

    for (const token of tokens) {
      const qualified = token.match(/^(.+?):(\d{1,4})(?:-(\d{1,4}))?$/)
      if (qualified) {
        const wanted = parseTagPath(qualified[1])
        const lo = Math.min(Number(qualified[2]), Number(qualified[3] ?? qualified[2]))
        const hi = Math.max(Number(qualified[2]), Number(qualified[3] ?? qualified[2]))
        for (const r of rows) {
          if (wanted.error) continue
          if (sameTags(r.tags, wanted.tags) && inRange(r.num, lo, hi)) hits.set(r.id, r)
        }
        continue
      }

      const range = token.match(/^(\d{1,4})-(\d{1,4})$/)
      if (range) {
        const lo = Math.min(Number(range[1]), Number(range[2]))
        const hi = Math.max(Number(range[1]), Number(range[2]))
        const found = rows.filter((r) => inRange(r.num, lo, hi))
        if (new Set(found.map((r) => r.tags.join('/'))).size > 1) {
          ambiguous.push({ token, found })
        } else for (const r of found) hits.set(r.id, r)
        continue
      }

      if (/^\d{1,4}$/.test(token)) {
        const found = rows.filter((r) => inRange(r.num, Number(token), Number(token)))
        if (found.length > 1) ambiguous.push({ token, found })
        else for (const r of found) hits.set(r.id, r)
        continue
      }

      textParts.push(token)
    }

    if (textParts.length > 0) {
      const phrase = textParts.join(' ').toLowerCase()
      for (const r of rows) {
        const haystack = `${r.id} ${r.tags.join('/')} ${formatPath(r.tags)} ${r.title}`.toLowerCase()
        if (haystack.includes(phrase)) hits.set(r.id, r)
      }
    }
  }

  if (ambiguous.length > 0) {
    for (const item of ambiguous) {
      console.log(`编号「${item.token}」有歧义，请改成 路径:编号，例如 数学/物理:12。候选：`)
      for (const r of item.found) console.log(`  ${format(r)}`)
    }
    return null
  }
  return [...hits.values()]
}

function printRows(rows, full = false) {
  for (const r of rows) {
    console.log(full ? `${format(r)}  ${r.id}  ${r.directory}` : format(r))
  }
}

function checkTagInput(rows, input) {
  const tree = buildTree(rowsToSessions(rows))
  return validateTagPath(input, tree)
}

function markRows(rows, db, targets, tags) {
  const overrides = new Map()
  for (const r of targets) {
    const next = r.capture ? ensureTerm(tags) : tags
    overrides.set(r.id, next)
    const meta = { ...r.metadata, ocsAuto: false }
    if (r.capture) meta.ocsCapture = true
    r.desiredMeta = meta
  }
  replan(rows, overrides)
  const n = persist(db, rows)
  const shown = [...new Set(targets.map((r) => formatPath(r.tags)))]
  console.log(
    `已标记 ${targets.length} 条 -> ${shown.join('、')}（写入标题 ${n.titles} 条、元数据 ${n.metas} 条）`,
  )
  for (const r of targets) console.log(format(r))
}

function tagRows(rows, db, spec, tagInput) {
  const check = checkTagInput(rows, tagInput)
  if (!check.ok) {
    console.log(check.message)
    return
  }
  const hits = parseSelectors(rows, spec)
  if (hits === null) return
  const targets = hits.filter((r) => !r.parent)
  if (targets.length === 0) {
    console.log(hits.length > 0 ? '子会话不参与分类' : `没匹配到：${spec}`)
    return
  }
  markRows(rows, db, targets, check.tags)
}

async function ask(iterator, prompt) {
  process.stdout.write(prompt)
  const next = await iterator.next()
  if (next.done) return null
  return String(next.value)
}

async function tagInteractive(rows, db) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
  try {
    printRows(rows)
    console.log('\n输入格式：编号 路径    例：数学/物理:12 数学/重点 / 数学/物理:12-15 数学/物理 / 12 项目')
    console.log('同一编号在多个路径下重复时，必须写成 路径:编号。')
    console.log('直接回车结束。\n')
    const iterator = rl[Symbol.asyncIterator]()
    while (true) {
      const value = await ask(iterator, '> ')
      if (value === null) break
      const line = value.trim()
      if (!line) break
      const parts = line.split(/\s+/)
      if (parts.length < 2) {
        console.log('需要「编号 路径」两段')
        continue
      }
      const tag = parts.pop()
      const spec = parts.join(' ')
      tagRows(rows, db, spec, tag)
    }
  } finally {
    rl.close()
  }
}

function usage() {
  console.log(`用法：
  ocs ls [--tag 路径] [--dir D] [--created] [--oldest] [--full]  列出会话（默认最新活动在前）
  ocs find <文本>                         按标题/完整路径筛选
  ocs tag <编号...> <路径>                例：ocs tag 数学/物理:12 数学/重点
  ocs tag --dir <目录> <路径>             给整个项目目录下的主会话打标签
  ocs tag                                 交互式打标签
  ocs untag <编号...>                     标记为 [未分类]
  ocs tags                                查看完整路径统计
  ocs dirs                                查看项目目录统计
  ocs apply [--write] [--retag]           编号；--retag 同时批量重新分类（默认 dry-run）
  ocs apply --write --by-created          按创建时间编号
  ocs apply --write --oldest              最旧在前
  ocs help                                显示帮助

编号规则：只给主会话编号；按完整显示路径分组，各自 001、002…，最新创建的会话号最大。
子会话不编号，标题保留 [子任务]；capture 会话路径前保留 [术语]。`)
}

function parseOpts(args) {
  const opts = { rest: [] }
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--tag') opts.tag = args[++i]
    else if (a === '--dir') opts.dir = args[++i]
    else if (a === '--created') opts.by = 'created'
    else if (a === '--oldest') opts.oldest = true
    else if (a === '--full') opts.full = true
    else if (a === '--retag') opts.retag = true
    else if (a === '--write') opts.write = true
    else opts.rest.push(a)
  }
  return opts
}

const [cmd = 'ls', ...args] = process.argv.slice(2)
const opts = parseOpts(args)
const db = open()

try {
  const rows = load(db, { retag: opts.retag, by: opts.by, oldest: opts.oldest })

  if (cmd === 'ls' || cmd === 'list') {
    printRows(filterRows(rows, opts), opts.full)
  } else if (cmd === 'find') {
    const q = opts.rest.join(' ').trim().toLowerCase()
    if (!q) {
      usage()
    } else {
      printRows(
        rows.filter((r) =>
          `${r.id} ${r.tags.join('/')} ${formatPath(r.tags)} ${r.title}`.toLowerCase().includes(q),
        ),
      )
    }
  } else if (cmd === 'tag') {
    if (opts.dir && opts.rest.length === 1) {
      const inDir = filterRows(rows, { dir: opts.dir }).filter((r) => !r.parent)
      if (inDir.length === 0) {
        console.log(`目录下没有主会话：${opts.dir}`)
      } else {
        const check = checkTagInput(rows, opts.rest[0])
        if (!check.ok) console.log(check.message)
        else markRows(rows, db, inDir, check.tags)
      }
    } else if (opts.rest.length >= 2) {
      const tag = opts.rest.pop()
      tagRows(rows, db, opts.rest.join(' '), tag)
    } else if (opts.rest.length === 1) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
      try {
        const iterator = rl[Symbol.asyncIterator]()
        const value = await ask(iterator, `给「${opts.rest[0]}」设置分类路径：`)
        if (value === null) {
          console.log('')
        } else if (value.trim()) {
          tagRows(rows, db, opts.rest[0], value.trim())
        }
      } finally {
        rl.close()
      }
    } else {
      await tagInteractive(rows, db)
    }
  } else if (cmd === 'untag') {
    if (opts.rest.length === 0) usage()
    else {
      const spec = opts.rest.join(' ')
      const hits = parseSelectors(rows, spec)
      if (hits === null) {
      } else if (hits.length === 0) {
        console.log(`没匹配到：${spec}`)
      } else {
        const targets = hits.filter((r) => !r.parent)
        if (targets.length === 0) console.log('子会话不参与分类')
        else markRows(rows, db, targets, [FALLBACK])
      }
    }
  } else if (cmd === 'tags') {
    const counts = new Map()
    for (const r of rows) {
      if (r.parent) continue
      const key = formatPath(r.tags)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    for (const [tag, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(3)}  ${tag}`)
    }
  } else if (cmd === 'dirs') {
    const counts = new Map()
    for (const r of rows) {
      if (r.parent) continue
      const dir = r.directory || '（无目录）'
      counts.set(dir, (counts.get(dir) || 0) + 1)
    }
    for (const [dir, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(3)}  ${dir}`)
    }
  } else if (cmd === 'apply') {
    apply(rows, db, opts.write)
  } else {
    usage()
  }
} finally {
  db.close()
}

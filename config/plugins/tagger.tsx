/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiDialogStack } from "@opencode-ai/plugin/tui"
import {
  FALLBACK,
  TERM,
  buildTree,
  ensureTerm,
  formatPath,
  isCaptureSession,
  parseTagPath,
  parseTitle,
  planSync,
  planTitles,
  sameTags,
  stripTerm,
  validateTagPath,
} from "../scripts/tag-core.mjs"

type SessionLike = {
  id: string
  title: string
  parentID?: string
  agent?: string
  metadata?: Record<string, unknown>
  time?: { created?: number; updated?: number }
}

type UpdateParams = {
  sessionID: string
  title?: string
  metadata?: Record<string, unknown>
}

const NEW_TAG = "::new"

function tagsOf(session: SessionLike) {
  const tags = parseTitle(session.title).tags
  return tags.length > 0 ? tags : [FALLBACK]
}

async function listAllSessions(api: TuiPluginApi): Promise<SessionLike[]> {
  const all: SessionLike[] = []
  const seen = new Set<string>()
  let start = 0
  while (all.length < 5000) {
    const result = await api.client.session.list({ limit: 200, start })
    const batch = (result.data ?? []) as SessionLike[]
    const fresh = batch.filter((session) => !seen.has(session.id))
    for (const session of fresh) {
      seen.add(session.id)
      all.push(session)
    }
    if (batch.length < 200 || fresh.length === 0) break
    start += batch.length
  }
  return all
}

function recentFirst(sessions: SessionLike[]) {
  return [...sessions].sort(
    (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
  )
}

async function writePlan(
  api: TuiPluginApi,
  sessions: SessionLike[],
  overrides: Map<string, string[]>,
  targetID?: string,
  targetPatch?: Record<string, unknown>,
) {
  const planned = planTitles(sessions, overrides)
  const current = new Map(sessions.map((session) => [session.id, session]))
  let changed = 0
  for (const item of planned) {
    const session = current.get(item.id)
    if (!session) continue
    const titleChanged = item.title !== session.title
    let metadata: Record<string, unknown> | null = null
    if (item.id === targetID && targetPatch) {
      const existing = session.metadata ?? {}
      const merged = { ...existing, ...targetPatch }
      const differs = Object.entries(targetPatch).some(([key, value]) => existing[key] !== value)
      if (differs) metadata = merged
    }
    if (!titleChanged && !metadata) continue
    const params: UpdateParams = { sessionID: item.id }
    if (titleChanged) params.title = item.title
    if (metadata) params.metadata = metadata
    await api.client.session.update(params)
    changed += 1
  }
  return { planned, changes: changed }
}

let syncing = false

async function syncTitles(api: TuiPluginApi) {
  if (syncing) return 0
  syncing = true
  try {
    const sessions = await listAllSessions(api)
    const planned = planSync(sessions)
    const current = new Map(sessions.map((session) => [session.id, session]))
    let changed = 0
    for (const item of planned) {
      const session = current.get(item.id)
      if (!session) continue
      const titleChanged = item.title !== session.title
      const metadataChanged = Boolean(item.metadata)
      if (!titleChanged && !metadataChanged) continue
      const params: UpdateParams = { sessionID: item.id }
      if (titleChanged) params.title = item.title
      if (metadataChanged) params.metadata = item.metadata
      await api.client.session.update(params)
      if (metadataChanged && item.candidates?.length) {
        const shown = item.candidates.slice(0, 3).map((tags) => formatPath(tags)).join("、")
        api.ui.toast({
          variant: "warning",
          title: "分类有歧义",
          message: `候选：${shown}`,
        })
      }
      changed += 1
    }
    return changed
  } finally {
    syncing = false
  }
}

async function applyTag(
  api: TuiPluginApi,
  dialog: TuiDialogStack,
  sessionID: string,
  tags: string[],
  capture: boolean,
) {
  try {
    const sessions = await listAllSessions(api)
    const target = sessions.find((session) => session.id === sessionID)
    if (!target) {
      api.ui.toast({ variant: "error", message: "找不到当前对话" })
      return
    }

    const nextTags = capture ? ensureTerm(tags) : tags
    const patch: Record<string, unknown> = { ocsAuto: false }
    if (capture) patch.ocsCapture = true

    const { planned } = await writePlan(
      api,
      sessions,
      new Map([[sessionID, nextTags]]),
      sessionID,
      patch,
    )
    const current = planned.find((item) => item.id === sessionID)

    api.kv.set("ocs.lastTag", stripTerm(nextTags).join("/"))
    api.ui.toast({
      variant: "success",
      title: "分类已更新",
      message: current
        ? `当前对话 -> ${formatPath(current.tags)} ${current.number ?? ""}`.trim()
        : `当前对话 -> ${formatPath(nextTags)}`,
    })
  } catch (error) {
    api.ui.toast({
      variant: "error",
      title: "打标签失败",
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    dialog.clear()
  }
}

async function openTagDialog(api: TuiPluginApi, dialog: TuiDialogStack) {
  const route = api.route.current
  if (route.name !== "session" || !route.params?.sessionID) {
    api.ui.toast({ variant: "warning", message: "先打开一个对话再 /tag" })
    return
  }
  const sessionID = route.params.sessionID

  try {
    const sessions = await listAllSessions(api)
    const target = sessions.find((session) => session.id === sessionID)
    if (!target) {
      api.ui.toast({ variant: "warning", message: "当前对话还没出现在会话列表里" })
      return
    }
    if (target.parentID) {
      api.ui.toast({ variant: "warning", message: "子智能体会话不参与编号，换到主会话再试" })
      return
    }

    const capture =
      isCaptureSession(target) || parseTitle(target.title).tags[0] === TERM
    const roots = sessions.filter((session) => !session.parentID)
    const paths = new Map<
      string,
      { tags: string[]; count: number; lastSeen: number }
    >()

    const remember = (tags: string[]) => {
      const key = tags.join("/")
      const entry = paths.get(key) ?? { tags, count: 0, lastSeen: 0 }
      paths.set(key, entry)
      return entry
    }

    for (const session of roots) {
      const tags = tagsOf(session)
      const entry = remember(tags)
      entry.count += 1
      entry.lastSeen = Math.max(entry.lastSeen, session.time?.updated ?? 0)
    }
    remember([FALLBACK])

    const previous = recentFirst(roots).find((session) => session.id !== sessionID)
    const remembered = api.kv.get<string>("ocs.lastTag", "")
    const rememberedTags = remembered ? parseTagPath(remembered).tags : []
    const fallbackTags =
      (previous ? tagsOf(previous) : null) ??
      (rememberedTags.length > 0 ? rememberedTags : [FALLBACK])
    const defaultTags = capture ? ensureTerm(fallbackTags) : fallbackTags
    remember(defaultTags)

    const options = [...paths.values()]
      .sort((a, b) => {
        const byTime = b.lastSeen - a.lastSeen
        if (byTime !== 0) return byTime
        const byCount = b.count - a.count
        if (byCount !== 0) return byCount
        return a.tags.join("/").localeCompare(b.tags.join("/"))
      })
      .map((entry) => ({
        title: formatPath(entry.tags),
        value: entry.tags.join("/"),
        description: entry.count > 0 ? `${entry.count} 个对话` : "新路径",
        footer: sameTags(entry.tags, defaultTags) ? "默认（上一个对话）" : undefined,
      }))

    options.push({
      title: "＋ 新建分类路径…",
      value: NEW_TAG,
      description: "输入 数学/物理 或 [数学][物理]",
    })

    const DialogSelect = api.ui.DialogSelect
    const DialogPrompt = api.ui.DialogPrompt
    dialog.replace(() => (
      <DialogSelect
        title="把当前对话归到哪个分类路径？"
        placeholder="输入筛选，回车确认"
        options={options}
        current={defaultTags.join("/")}
        onSelect={(option) => {
          if (option.value === NEW_TAG) {
            dialog.replace(() => (
              <DialogPrompt
                title={capture ? "新建分类路径（自动加 [术语] 上级）" : "新建分类路径"}
                placeholder="例如 数学/物理 或 [数学][物理]"
                onConfirm={(value) => {
                  const check = validateTagPath(String(value ?? ""), buildTree(sessions))
                  if (!check.ok) {
                    api.ui.toast({ variant: "warning", message: check.message })
                    return
                  }
                  void applyTag(api, dialog, sessionID, check.tags, capture)
                }}
                onCancel={() => dialog.clear()}
              />
            ))
            return
          }
          const tags = parseTagPath(String(option.value)).tags
          void applyTag(api, dialog, sessionID, tags, capture)
        }}
      />
    ))
  } catch (error) {
    api.ui.toast({
      variant: "error",
      title: "读取分类失败",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

const tui: TuiPlugin = async (api) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleSync = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void syncTitles(api).catch(() => {})
    }, 300)
  }

  const dispose = api.command?.register(() => [
    {
      title: "给当前对话设置分类路径",
      value: "ocs.tag",
      description: "按完整路径分类，自动编号；手动设置后不再自动归类",
      category: "Session",
      slash: { name: "tag" },
      onSelect: (dialog) => openTagDialog(api, dialog ?? api.ui.dialog),
    },
  ])
  if (dispose) api.lifecycle.onDispose(dispose)

  const offCreated = api.event.on("session.created", scheduleSync)
  const offUpdated = api.event.on("session.updated", scheduleSync)
  const offDeleted = api.event.on("session.deleted", scheduleSync)
  const interval = setInterval(() => {
    void syncTitles(api).catch(() => {})
  }, 60_000)

  api.lifecycle.onDispose(() => {
    offCreated()
    offUpdated()
    offDeleted()
    clearInterval(interval)
    if (timer) clearTimeout(timer)
  })

  void syncTitles(api).catch(() => {})
}

export default { id: "tagger", tui } satisfies TuiPluginModule

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, Category, ConflictItem, EventItem, SyncBase, SyncBackend, TrashItem } from './types'
import { DEFAULT_SETTINGS } from './types'
import { seedData, newEvent, newCategory, BUILTIN_EVENTS } from './seed'
import { migrate, migrateEvent, hasData, DATA_SCHEMA_VERSION, REMOVED_BUILTIN_IDS, type PersistedData } from './migrate'
import { persist, restoreRaw } from './persist'
import { APP_VERSION } from './version'
import {
  syncAll, deleteRemote, isConfigured, loadBase, saveBase,
  loadTombstones, saveTombstones, backupDue, runBackup, lastBackup, getCouchDbInfo,
  listRemoteDeleted, restoreRemoteDocs, forcePush, forcePull, fetchRemoteDeletedDetail, purgeRemoteDeleted,
  type RemoteDeleted,
} from './sync'

/** 内置事件导入标记：保证内置事件只合并一次，不覆盖用户已有修改 */
const BUILTIN_IMPORT_KEY = 'daysnote.builtinImport.v6'

const TRASH_KEY = 'daysnote.trash.v1'

function loadTrash(): TrashItem[] {
  try {
    const raw = localStorage.getItem(TRASH_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'string') : []
  } catch { return [] }
}
function saveTrash(list: TrashItem[]) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify(list.slice(0, 300))) } catch { /* ignore */ }
}

type Store = {
  categories: Category[]
  events: EventItem[]
  settings: AppSettings
  loading: boolean
  syncing: boolean
  lastSync: string
  /** 最近一次同步的明细：从云端拉下几条、向上推送几条、最终总条数 */
  lastSyncDetail: { pulled: number; pushed: number; unchanged: number; deletes: number; total: number } | null
  /** 最近一次同步时读到的 CouchDB 对应库体积（字节）与文档数 */
  dbSize: { active: number; disk: number; docCount: number; delCount: number } | null
  conflicts: ConflictItem[]
  lastBackupAt: string
  addEvent: (input: Partial<EventItem> & { title: string }) => EventItem
  updateEvent: (id: string, patch: Partial<EventItem>) => EventItem | null
  removeEvent: (id: string) => void
  addCategory: (name: string, color?: string) => Category
  updateCategory: (id: string, patch: Partial<Category>) => Category | null
  removeCategory: (id: string) => void
  reorderCategories: (from: number, to: number) => void
  setSettings: (patch: Partial<AppSettings>) => void
  toggleBackend: (b: SyncBackend) => void
  sync: () => Promise<void>
  backup: () => Promise<void>
  resolveConflict: (id: string, choice: 'local' | 'remote') => Promise<void>
  dismissConflicts: () => void
  replaceFromRemote: (docs: any[]) => void
  importBuiltin: () => number
  /** 回收站（本地已删除事件） */
  trash: TrashItem[]
  removeTrash: (ids: string[]) => void
  restoreTrash: (ids: string[]) => Promise<number>
  /** 云端已标记删除的条目（需联网读取） */
  remoteTrash: RemoteDeleted[]
  remoteTrashDetails: Record<string, any>
  loadingRemoteTrash: boolean
  refreshRemoteTrash: () => Promise<void>
  loadRemoteTrashDetail: (id: string) => Promise<any>
  restoreRemoteTrash: (ids: string[]) => Promise<{ restored: number; failed: number }>
  /** 永久清除云端删除标记（不可逆，需管理员权限） */
  purgeRemoteTrash: (ids: string[]) => Promise<{ purged: string[]; failed: string[]; error?: string }>
  /** 本地全量覆盖服务器 */
  pushAllToRemote: () => Promise<{ pushed: number; deletedRemote: number }>
  /** 服务器全量覆盖本地 */
  pullAllFromRemote: () => Promise<{ total: number; removedLocal: number }>
}

const Ctx = createContext<Store | null>(null)

/**
 * 把内置示例事件合并进现有事件列表。
 * 去重策略：按标题+日期判断，已存在（含用户改过的同名事件）则跳过，不覆盖。
 * 返回本次新增条数。
 */
function mergeBuiltin(events: EventItem[]): { events: EventItem[]; added: number } {
  const seenFull = new Set(events.map((e) => `${e.title}|${e.date}`))
  const seenTitle = new Set(events.map((e) => e.title))
  // 倒数三条（repeat=yearly）按标题去重：老用户旧 seed 里已有同名事件则不重复添加
  const adds = BUILTIN_EVENTS.filter((b) =>
    b.repeat === 'yearly' ? !seenTitle.has(b.title) : !seenFull.has(`${b.title}|${b.date}`)
  ).map((e) => ({ ...e }))
  if (!adds.length) return { events, added: 0 }
  return { events: [...events, ...adds], added: adds.length }
}

/**
 * 同步加载：从 localStorage 读原始 JSON，经统一迁移框架纠正到当前 schema。
 * 无论数据来自哪个旧版本，这里都保证结构一致、字段齐全、配置不丢。
 */
function load(): { categories: Category[]; events: EventItem[]; settings: AppSettings } {
  let raw: string | null = null
  try { raw = localStorage.getItem('daysnote.v1') } catch { /* ignore */ }
  let parsed: any = null
  try { parsed = raw ? JSON.parse(raw) : null } catch { /* 损坏数据忽略，走种子 */ }

  if (hasData(parsed)) {
    // 有旧数据：走迁移，保留全部用户数据与配置
    const d = migrate(parsed, APP_VERSION)
    // v29 修正：v28 曾把「本地清理旧内置事件」误做成「连云端一起删」，
    // 导致用户云库里已有的记录被标记 _deleted。这里做两件事：
    // 1) 把 v28 误加的那批 tombstone 主动移除，避免下一次同步继续删远端；
    // 2) 「今年剩余」是旧版程序生成的伪事件（不是用户数据），
    //    仍补一条 tombstone，让云端残留的那份也被清掉。
    {
      const tombs = loadTombstones()
      const cleaned = tombs.filter((id) => !REMOVED_BUILTIN_IDS.includes(id))
      if (!cleaned.includes('event:bi:yearleft')) cleaned.push('event:bi:yearleft')
      if (cleaned.length !== tombs.length || !tombs.includes('event:bi:yearleft')) saveTombstones(cleaned)
    }
    // 首次升级时自动合并内置事件（按标题+日期/id 去重，不覆盖已有）
    if (!localStorage.getItem(BUILTIN_IMPORT_KEY)) {
      const merged = mergeBuiltin(d.events)
      d.events = merged.events
      try { localStorage.setItem(BUILTIN_IMPORT_KEY, '1') } catch { /* ignore */ }
    }
    return { categories: d.categories, events: d.events, settings: d.settings }
  }

  // 无数据：全新安装，使用种子
  const s = seedData()
  try { localStorage.setItem(BUILTIN_IMPORT_KEY, '1') } catch { /* ignore */ }
  return { ...s, settings: DEFAULT_SETTINGS }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(load, [])
  const [categories, setCategories] = useState<Category[]>(initial.categories)
  const [events, setEvents] = useState<EventItem[]>(initial.events)
  const [settings, setSettingsState] = useState<AppSettings>(initial.settings)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState('尚未同步')
  const [lastSyncDetail, setLastSyncDetail] = useState<Store['lastSyncDetail']>(null)
  const [dbSize, setDbSize] = useState<{ active: number; disk: number; docCount: number; delCount: number } | null>(null)
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [lastBackupAt, setLastBackupAt] = useState(lastBackup())
  const [trash, setTrash] = useState<TrashItem[]>(loadTrash)
  const [remoteTrash, setRemoteTrash] = useState<RemoteDeleted[]>([])
  const [remoteTrashDetails, setRemoteTrashDetails] = useState<Record<string, any>>({})
  const [loadingRemoteTrash, setLoadingRemoteTrash] = useState(false)
  const baseRef = useRef<SyncBase>(loadBase())
  const tombRef = useRef<string[]>(loadTombstones())
  const pendingResolve = useRef<Record<string, 'local' | 'remote'>>({})
  const syncTimer = useRef<number | null>(null)

  // 用 ref 持有最新 state：防抖同步延迟执行时读到的是更新后的数据，避免闭包拿到旧值
  const stateRef = useRef({ categories, events, settings })
  stateRef.current = { categories, events, settings }

  useEffect(() => { saveTrash(trash) }, [trash])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 120)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const data: PersistedData = {
      _schema: DATA_SCHEMA_VERSION,
      _appVersion: APP_VERSION,
      _savedAt: Date.now(),
      categories, events, settings,
    }
    persist(data)
  }, [categories, events, settings])

  /**
   * 覆盖安装兜底：若本地存储为空但原生镜像有数据（WebView 数据被清理），
   * 启动时异步恢复一次。注意只在本地确实无数据时执行，避免覆盖用户新数据。
   */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await restoreRaw()
        if (cancelled || !raw) return
        const parsed = JSON.parse(raw)
        if (!hasData(parsed)) return
        // 当前内存里已有数据（种子或本地），且原生镜像不是刚写入的同一份，则不覆盖
        const localNow = localStorage.getItem('daysnote.v1')
        if (localNow) return // 本地有数据，以本地为准
        const d = migrate(parsed, APP_VERSION)
        setCategories(d.categories)
        setEvents(d.events)
        setSettingsState(d.settings)
        if (d.widgetBindings) {
          try { localStorage.setItem('daysnote.widgets.v1', JSON.stringify(d.widgetBindings)) } catch { /* ignore */ }
        }
        if (d.lastBackup) {
          try { localStorage.setItem('daysnote.lastBackup.v1', d.lastBackup) } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  const setSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((s) => ({ ...s, ...patch }))
  }, [])

  const toggleBackend = useCallback((b: SyncBackend) => {
    setSettingsState((s) => {
      const cur = Array.isArray(s.enabledBackends) ? s.enabledBackends : []
      const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]
      return { ...s, enabledBackends: next }
    })
  }, [])

  /** 从最新 state 构造同步文档（含 _id / updatedAt） */
  const allDocs = useCallback(() => {
    const { categories: cs, events: es } = stateRef.current
    return [...cs, ...es].map((d) => ({ ...d, _id: d.id, updatedAt: d.updatedAt || 0 }))
  }, [])

  const replaceFromRemote = useCallback((docs: any[]) => {
    const cats: Category[] = []
    const evs: EventItem[] = []
    let seq = 0
    for (const d of docs) {
      const id = String(d?._id || '')
      if (id.startsWith('category:')) { cats.push(d as Category); continue }
      if (id.startsWith('event:')) { evs.push(d as EventItem); continue }
      // 容错：通过 AI 或其他客户端直接写进 CouchDB 的文档，_id 可能没有前缀。
      // 之前这里会静默丢弃，表现为「云端有记录但同步不下来」。改为按字段识别，
      // 并走一遍 migrateEvent 补全 repeat / displayMode / showInTimeline 等字段。
      if (typeof d?.date === 'string' && typeof d?.title === 'string') {
        const fixed = migrateEvent({ ...d, id: id || `event:remote:${seq}:${Date.now()}` }, seq++)
        if (fixed) evs.push(fixed)
        continue
      }
      if (typeof d?.name === 'string') {
        cats.push({ ...d, id: id || `cat:remote:${seq}` } as Category)
      }
    }
    if (cats.length) {
      const all = cats.find((c) => c.id === 'cat:all')
      setCategories([...(all ? [all] : []), ...cats.filter((c) => c.id !== 'cat:all').sort((a, b) => (a.order || 0) - (b.order || 0))])
    }
    if (evs.length) setEvents(evs)
  }, [])

  const doSync = useCallback(async (resolve?: Record<string, 'local' | 'remote'>) => {
    const s = stateRef.current.settings
    if (!isConfigured(s)) throw new Error('请先在「更多 → 同步」启用并配置 CouchDB 或 WebDAV')
    setSyncing(true)
    try {
      const outcome = await syncAll(s, allDocs(), baseRef.current, resolve, tombRef.current)
      baseRef.current = outcome.base
      saveBase(outcome.base)
      if (outcome.appliedDeletes.length) {
        tombRef.current = tombRef.current.filter((id) => !outcome.appliedDeletes.includes(id))
        saveTombstones(tombRef.current)
      }
      replaceFromRemote(outcome.docs)
      setConflicts(outcome.conflicts)
      setLastSyncDetail({
        pulled: outcome.pulled,
        pushed: outcome.pushed,
        unchanged: outcome.unchanged,
        deletes: outcome.appliedDeletes.length,
        total: outcome.docs.length,
      })
      setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      // 顺带读取 CouchDB 对应库体积（不阻塞同步主流程）
      void getCouchDbInfo(s).then((info) => { if (info) setDbSize(info) })
    } finally {
      setSyncing(false)
    }
  }, [allDocs, replaceFromRemote])

  const sync = useCallback(async () => { await doSync() }, [doSync])

  const backup = useCallback(async () => {
    const { settings: s, categories: cs, events: es } = stateRef.current
    const r = await runBackup(s, cs, es)
    setLastBackupAt(lastBackup())
    if (!r.ok) throw new Error(r.message)
  }, [])

  const resolveConflict = useCallback(async (id: string, choice: 'local' | 'remote') => {
    const before = conflicts
    pendingResolve.current[id] = choice
    setConflicts((list) => list.filter((c) => c.id !== id))
    try {
      await doSync({ ...pendingResolve.current })
      pendingResolve.current = {}
    } catch {
      pendingResolve.current = {}
      setConflicts(before)
      throw new Error('裁决后同步失败，请检查网络后重试')
    }
  }, [doSync, conflicts])

  const dismissConflicts = useCallback(() => setConflicts([]), [])

  /** 用云端数据完全替换本地（含分类）；空云端会把本地清空，用于「服务器覆盖本地」 */
  const replaceAllFromRemote = useCallback((docs: any[], deletedIds: string[] = []) => {
    const dead = new Set(deletedIds)
    const cats: Category[] = []
    const evs: EventItem[] = []
    let seq = 0
    for (const d of docs) {
      const id = String(d?._id || d?.id || '')
      if (!id || dead.has(id)) continue
      if (id.startsWith('event:')) { evs.push(d as EventItem); continue }
      if (id.startsWith('category:') || (typeof d?.name === 'string' && typeof d?.date !== 'string')) {
        cats.push(d as Category)
        continue
      }
      if (typeof d?.date === 'string' && typeof d?.title === 'string') {
        const fixed = migrateEvent({ ...d, id }, seq++)
        if (fixed) evs.push(fixed)
      }
    }
    const all = cats.find((c) => c.id === 'cat:all')
    setCategories([...(all ? [all] : []), ...cats.filter((c) => c.id !== 'cat:all').sort((a, b) => (a.order || 0) - (b.order || 0))])
    setEvents(evs)
  }, [])

  /** 从回收站彻底移除（不再保留副本） */
  const removeTrash = useCallback((ids: string[]) => {
    setTrash((prev) => prev.filter((t) => !ids.includes(t.id)))
  }, [])


  /** 读取云端「已标记删除」的条目（需联网） */
  const refreshRemoteTrash = useCallback(async () => {
    const s = stateRef.current.settings
    if (!isConfigured(s)) { setRemoteTrash([]); setRemoteTrashDetails({}); return }
    setLoadingRemoteTrash(true)
    try {
      const list = await listRemoteDeleted(s)
      setRemoteTrash(list)
      setRemoteTrashDetails({})
    } finally {
      setLoadingRemoteTrash(false)
    }
  }, [])

  /** 展开云端条目时按需从修订链回捞删除前的正文（带缓存） */
  const loadRemoteTrashDetail = useCallback(async (id: string) => {
    const hit = remoteTrash.find((x) => x.id === id)
    if (!hit) return null
    const cached = remoteTrashDetails[id]
    if (cached && !cached.loading) return cached
    setRemoteTrashDetails((prev) => ({ ...prev, [id]: { loading: true } }))
    const detail = await fetchRemoteDeletedDetail(stateRef.current.settings, hit)
    setRemoteTrashDetails((prev) => ({ ...prev, [id]: detail }))
    return detail
  }, [remoteTrash, remoteTrashDetails])

  /** 永久清除云端删除标记（不可逆） */
  const purgeRemoteTrash = useCallback(async (ids: string[]) => {
    const hits = remoteTrash.filter((x) => ids.includes(x.id))
    if (!hits.length) return { purged: [], failed: [] }
    const r = await purgeRemoteDeleted(stateRef.current.settings, hits)
    if (r.purged.length) {
      setRemoteTrash((prev) => prev.filter((x) => !r.purged.includes(x.id)))
      setRemoteTrashDetails((prev) => {
        const next = { ...prev }
        r.purged.forEach((id) => { delete next[id] })
        return next
      })
    }
    return r
  }, [remoteTrash])

  /** 把云端已删除的条目复活，并同步回本地 */
  const restoreRemoteTrash = useCallback(async (ids: string[]) => {
    const s = stateRef.current.settings
    const hits = remoteTrash.filter((r) => ids.includes(r.id))
    if (!hits.length) return { restored: 0, failed: 0 }
    const r = await restoreRemoteDocs(s, hits)
    setRemoteTrash((prev) => prev.filter((x) => !r.restored.includes(x.id)))
    if (r.restored.length) {
      try { await doSync() } catch { /* 拉取失败时保留云端已恢复状态，下次同步会带回 */ }
    }
    return { restored: r.restored.length, failed: r.failed.length }
  }, [remoteTrash, doSync])

  /** 本地全量覆盖服务器：以手机为准，云端多出来的记录会被删除 */
  const pushAllToRemote = useCallback(async () => {
    const s = stateRef.current.settings
    if (!isConfigured(s)) throw new Error('请先配置 CouchDB 或 WebDAV')
    setSyncing(true)
    try {
      const r = await forcePush(s, allDocs())
      // 覆盖后重建同步基线：之后按这份新数据继续增量同步
      baseRef.current = {}
      saveBase({})
      tombRef.current = []
      saveTombstones([])
      setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      setLastSyncDetail({
        pulled: 0, pushed: r.pushed, unchanged: 0, deletes: r.deletedRemote,
        total: stateRef.current.events.length,
      })
      void getCouchDbInfo(s).then((info) => { if (info) setDbSize(info) })
      return r
    } finally {
      setSyncing(false)
    }
  }, [allDocs])

  /** 服务器全量覆盖本地：以云端为准，手机上多出来的记录会被删除 */
  const pullAllFromRemote = useCallback(async () => {
    const s = stateRef.current.settings
    if (!isConfigured(s)) throw new Error('请先配置 CouchDB 或 WebDAV')
    setSyncing(true)
    try {
      const before = stateRef.current.events.length
      const { docs, deletedIds } = await forcePull(s)
      replaceAllFromRemote(docs, deletedIds)
      const evCount = docs.filter((d) => String(d._id || '').startsWith('event:')).length
      baseRef.current = {}
      saveBase({})
      tombRef.current = []
      saveTombstones([])
      setLastSync(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      setLastSyncDetail({
        pulled: evCount, pushed: 0, unchanged: 0,
        deletes: Math.max(0, before - evCount), total: evCount,
      })
      void getCouchDbInfo(s).then((info) => { if (info) setDbSize(info) })
      return { total: evCount, removedLocal: Math.max(0, before - evCount) }
    } finally {
      setSyncing(false)
    }
  }, [replaceAllFromRemote])

  /** 变更后 800ms 防抖同步：打开软件、以及新增/修改/删除事件（含分类）后触发 */
  const scheduleSync = useCallback(() => {
    const s = stateRef.current.settings
    if (!s.autoSync || !isConfigured(s)) return
    if (syncTimer.current) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null
      doSync().catch(() => {})
    }, 800)
  }, [doSync])

  /**
   * 从回收站恢复事件：本地加回 + 清掉删除标记 + 顺手复活云端那份。
   * 云端如果从未有过这条记录（本地新建后删除），复活失败也无所谓。
   */
  const restoreTrash = useCallback(async (ids: string[]) => {
    const items = trash.filter((t) => ids.includes(t.id) && t.payload)
    if (!items.length) return 0
    const now = Date.now()
    setEvents((prev) => {
      const map = new Map(prev.map((e) => [e.id, e]))
      for (const it of items) map.set(it.id, { ...(it.payload as EventItem), updatedAt: now })
      return Array.from(map.values())
    })
    tombRef.current = tombRef.current.filter((id) => !ids.includes(id))
    saveTombstones(tombRef.current)
    setTrash((prev) => prev.filter((t) => !ids.includes(t.id)))
    scheduleSync()

    const s = stateRef.current.settings
    if (isConfigured(s)) {
      try {
        const remote = await listRemoteDeleted(s)
        const hit = remote.filter((r) => ids.includes(r.id))
        if (hit.length) {
          const r = await restoreRemoteDocs(s, hit)
          setRemoteTrash((prev) => prev.filter((x) => !r.restored.includes(x.id)))
        }
      } catch { /* 云端恢复失败不影响本地恢复 */ }
    }
    return items.length
  }, [trash, scheduleSync])

  // 打开软件时自动同步一次 + 每月备份检查
  const didOpen = useRef(false)
  useEffect(() => {
    if (didOpen.current) return
    didOpen.current = true
    const s = stateRef.current.settings
    if (isConfigured(s)) {
      if (s.autoSync) doSync().catch(() => {})
      if (s.autoBackup && s.backupFolder && backupDue()) {
        const { categories: cs, events: es } = stateRef.current
        runBackup(s, cs, es).then((r) => { if (r.ok) setLastBackupAt(lastBackup()) }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 回到前台时同步一次
  useEffect(() => {
    const onVisible = () => {
      const s = stateRef.current.settings
      if (document.visibilityState === 'visible' && s.autoSync && isConfigured(s)) doSync().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [doSync])

  // 组件卸载时清理未执行的防抖定时器
  useEffect(() => () => { if (syncTimer.current) window.clearTimeout(syncTimer.current) }, [])

  const pushDelete = useCallback(
    (doc?: { id: string; _rev?: string }) => {
      const s = stateRef.current.settings
      if (doc?._rev && isConfigured(s)) deleteRemote(s, doc.id, doc._rev).catch(() => {})
    },
    [],
  )

  const addEvent = useCallback((input: Partial<EventItem> & { title: string }) => {
    const ev = newEvent(input)
    setEvents((list) => [...list, ev])
    scheduleSync()
    return ev
  }, [scheduleSync])

  const updateEvent = useCallback((id: string, patch: Partial<EventItem>) => {
    let out: EventItem | null = null
    setEvents((list) => list.map((e) => {
      if (e.id !== id) return e
      out = { ...e, ...patch, id: e.id, updatedAt: Date.now() }
      return out
    }))
    scheduleSync()
    return out
  }, [scheduleSync])

  const removeEvent = useCallback((id: string) => {
    const target = stateRef.current.events.find((e) => e.id === id)
    if (!tombRef.current.includes(id)) {
      tombRef.current = [...tombRef.current, id]
      saveTombstones(tombRef.current)
    }
    // 进回收站：删掉不等于销毁，用户随时可以捞回来
    if (target) {
      const item: TrashItem = {
        id: target.id,
        kind: 'event',
        title: target.title,
        icon: target.icon,
        date: target.date,
        color: target.color,
        deletedAt: Date.now(),
        source: 'local',
        payload: target,
      }
      setTrash((prev) => [item, ...prev.filter((x) => x.id !== id)])
    }
    pushDelete(target)
    setEvents((list) => list.filter((e) => e.id !== id))
    scheduleSync()
  }, [pushDelete, scheduleSync])

  const addCategory = useCallback((name: string, color?: string) => {
    const c = newCategory(name, color)
    setCategories((list) => [...list, c])
    scheduleSync()
    return c
  }, [scheduleSync])

  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    let out: Category | null = null
    setCategories((list) => list.map((c) => {
      if (c.id !== id) return c
      out = { ...c, ...patch, id: c.id, builtin: c.builtin, updatedAt: Date.now() }
      return out
    }))
    scheduleSync()
    return out
  }, [scheduleSync])

  const removeCategory = useCallback((id: string) => {
    setCategories((list) => {
      const target = list.find((c) => c.id === id)
      if (!tombRef.current.includes(id)) {
        tombRef.current = [...tombRef.current, id]
        saveTombstones(tombRef.current)
      }
      pushDelete(target)
      return list.filter((c) => c.id !== id)
    })
    setEvents((list) => list.filter((e) => e.categoryId !== id))
    scheduleSync()
  }, [pushDelete, scheduleSync])

  const reorderCategories = useCallback((from: number, to: number) => {
    setCategories((list) => {
      if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next.map((c, i) => ({ ...c, order: i, updatedAt: Date.now() }))
    })
    scheduleSync()
  }, [scheduleSync])

  /** 手动导入内置示例事件（去重，不覆盖已有），返回新增条数 */
  const importBuiltin = useCallback(() => {
    const r = mergeBuiltin(stateRef.current.events)
    if (r.added) {
      setEvents(r.events)
      localStorage.setItem(BUILTIN_IMPORT_KEY, '1')
      scheduleSync()
    }
    return r.added
  }, [scheduleSync])

  const value: Store = {
    categories, events, settings, loading, syncing, lastSync, lastSyncDetail, dbSize, conflicts, lastBackupAt,
    addEvent, updateEvent, removeEvent, addCategory, updateCategory, removeCategory,
    reorderCategories, setSettings, toggleBackend, sync, backup, resolveConflict, dismissConflicts, replaceFromRemote,
    importBuiltin, trash, removeTrash, restoreTrash, remoteTrash, remoteTrashDetails, loadingRemoteTrash, refreshRemoteTrash,
    loadRemoteTrashDetail, restoreRemoteTrash, purgeRemoteTrash, pushAllToRemote, pullAllFromRemote,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}

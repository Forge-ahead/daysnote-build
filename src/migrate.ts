/**
 * 数据版本控制与迁移框架
 * ------------------------------------------------------------------
 * 目标：覆盖安装新版时，旧版本的数据与配置能原样接手。
 *
 * 设计：
 * 1. 所有持久化数据带一个 schema 版本号（_schema），与 App 版本解耦。
 * 2. 每次加载都经过 migrate()：无论数据来自哪个旧版本，都逐字段补齐/纠错到当前结构。
 * 3. 迁移是幂等的：已是最新结构的数据经过迁移不会变化。
 * 4. 迁移只补默认值、纠正类型，绝不删除用户已有数据。
 */
import { DEFAULT_SETTINGS } from './types'
import type { AppSettings, Category, EventItem, SyncBase, ConflictItem } from './types'

/** 当前数据结构版本。结构有破坏性调整时 +1 并补迁移步骤。 */
export const DATA_SCHEMA_VERSION = 7

export interface PersistedData {
  _schema: number
  _appVersion?: string
  _savedAt?: number
  categories: Category[]
  events: EventItem[]
  settings: AppSettings
  syncBase?: SyncBase
  tombstones?: string[]
  lastBackup?: string
  widgetBindings?: Record<string, string>
}

const REPEAT_VALID = new Set(['none', 'yearly'])
const THEME_VALID = new Set(['light', 'dark', 'auto'])
const BG_VALID = new Set(['grid', 'beige', 'cream', 'gray'])
const DISPLAY_MODE_VALID = new Set(['countup', 'countdown', 'both'])

/** 安全字符串：非字符串返回空串 */
function str(v: any, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
/** 安全数字：非数字/NaN 返回 fallback */
function num(v: any, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
/** 安全布尔：非布尔按 fallback */
function bool(v: any, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** 把任意版本的 settings 纠正为当前结构（保留所有已有值，仅补缺/纠错） */
export function migrateSettings(raw: any): AppSettings {
  const s: any = raw && typeof raw === 'object' ? { ...raw } : {}
  const out: AppSettings = { ...DEFAULT_SETTINGS }

  // 后端：新版用数组 enabledBackends；旧版可能是单选 syncBackend
  const backends = Array.isArray(s.enabledBackends)
    ? s.enabledBackends.filter((b: any) => b === 'couchdb' || b === 'webdav')
    : null
  if (backends && backends.length) out.enabledBackends = backends as AppSettings['enabledBackends']
  else if (s.syncBackend === 'webdav' || s.syncBackend === 'couchdb') out.enabledBackends = [s.syncBackend]
  else if (Array.isArray(s.enabledBackends)) out.enabledBackends = [] as any
  // 保留旧字段供未来兼容
  if (s.syncBackend === 'webdav' || s.syncBackend === 'couchdb') out.syncBackend = s.syncBackend

  // 所有字符串字段
  ;(['couchUrl', 'couchDb', 'couchUser', 'couchPassword', 'webdavUrl', 'webdavUser',
    'webdavPassword', 'backupFolder', 'aiBaseUrl', 'aiKey', 'aiModel'] as const).forEach((k) => {
    if (typeof s[k] === 'string') (out as any)[k] = s[k]
  })
  // 布尔字段：仅当确实是布尔才覆盖默认（避免把用户设置误重置）
  ;(['autoBackup', 'autoSync', 'showFestivals', 'icloudSync'] as const).forEach((k) => {
    if (typeof s[k] === 'boolean') (out as any)[k] = s[k]
  })
  // 新增外观配置：老数据没有则保留默认，非法值回退
  if (THEME_VALID.has(s.themeMode)) out.themeMode = s.themeMode
  if (BG_VALID.has(s.backgroundStyle)) out.backgroundStyle = s.backgroundStyle
  return out
}

/** 把任意版本的分类纠正为当前结构 */
export function migrateCategory(raw: any, index: number): Category {
  const c: any = raw && typeof raw === 'object' ? raw : {}
  const id = str(c.id, `cat:migrated:${index}`)
  return {
    id,
    name: str(c.name, '未命名分类'),
    color: str(c.color, '#f3b8c2'),
    order: num(c.order, index),
    ...(c.builtin === true ? { builtin: true } : {}),
    ...(typeof c.updatedAt === 'number' ? { updatedAt: c.updatedAt } : {}),
    ...(typeof c._rev === 'string' ? { _rev: c._rev } : {}),
  }
}

/**
 * v27：内置「今年剩余」不再是事件，改由首页顶部动态展示（每年自动切换年份）。
 * v28：公开发行版 — 安装包不再内置个人纪念日（只带一条示例「在一起」）。
 * v29 修正：**只影响「新安装带什么」，不删除任何已存在的数据**。
 * v28 曾在此处按 id 把这些事件从本地删掉、并补 tombstone 连云端一起删，
 * 属于越权删除用户数据，已撤销。此名单现在只用于清理 v28 留在本机的删除标记。
 * 注意：不要再把这里的 id 用于删除事件。
 */
export const REMOVED_BUILTIN_IDS = [
  'event:bi:yearleft',
  'event:bi:birthday',
  'event:bi:anniv',
  'event:bi:marriage',
  'event:bi:washtool',
  'event:bi:bedsheet',
  'event:bi:vacuum',
  'event:bi:grandpa',
  'event:bi:wedding',
  'event:bi:boss',
  'event:bi:grey',
  'event:bi:propose',
  'event:bi:quitlianjia',
  'event:bi:joinlianjia',
  'event:bi:foundbaby',
]

/** 把任意版本的事件纠正为当前结构；返回 null 仅用于彻底非法的输入 */
export function migrateEvent(raw: any, index: number): EventItem | null {
  const e: any = raw && typeof raw === 'object' ? raw : {}
  const repeat = REPEAT_VALID.has(e.repeat) ? e.repeat : 'none'
  // v26 新字段：老数据按 yearly=倒数、过去日期=正数推断，保持升级前后首页分组不变
  const displayMode = DISPLAY_MODE_VALID.has(e.displayMode)
    ? e.displayMode
    : (repeat === 'yearly' ? 'countdown' : 'countup')
  const id = str(e.id, `event:migrated:${index}`)
  // v29：不再按内置 id 丢弃事件。用户的数据（哪怕来自旧版内置）保留原样，
  // 否则云端恢复回来的记录会在下次启动时又被本地删掉。
  // 唯一例外：「今年剩余」不是用户事件，而是旧版程序生成的伪事件，
  // 现由首页 hero 动态展示，仍需从事件列表移除。
  if (id === 'event:bi:yearleft') return null
  let date = str(e.date, new Date().toISOString().slice(0, 10))
  return {
    id,
    title: str(e.title, '未命名事件'),
    date,
    lunar: bool(e.lunar, false),
    categoryId: str(e.categoryId, 'cat:all'),
    icon: str(e.icon, '📌'),
    color: str(e.color, '#e3e9d5'),
    note: str(e.note, ''),
    order: num(e.order, index),
    repeat: repeat as EventItem['repeat'],
    // 新增字段：老数据没有则默认 true，保证升级后时间轴行为不变
    showInTimeline: bool(e.showInTimeline, true),
    displayMode: displayMode as EventItem['displayMode'],
    createdAt: num(e.createdAt, Date.now()),
    updatedAt: num(e.updatedAt, num(e.createdAt, Date.now())),
    ...(typeof e._rev === 'string' ? { _rev: e._rev } : {}),
  }
}

/** 事件去重：按 id（优先），否则按 标题|日期。升级合并时防止重复导入。 */
function dedupeEvents(events: EventItem[]): EventItem[] {
  const byId = new Map<string, EventItem>()
  const byKey = new Map<string, EventItem>()
  for (const e of events) {
    if (e.id && byId.has(e.id)) continue
    const key = `${e.title}|${e.date}`
    if (byKey.has(key)) continue
    byId.set(e.id, e)
    byKey.set(key, e)
  }
  return Array.from(byId.values())
}

/**
 * 统一迁移入口：把任意来源（localStorage / JSON 导入 / 原生镜像）的数据，
 * 纠正为当前 schema，保证覆盖升级时旧数据无损接手。
 */
export function migrate(raw: any, appVersion?: string): PersistedData {
  const d: any = raw && typeof raw === 'object' ? raw : {}
  const categories = Array.isArray(d.categories) ? d.categories.map(migrateCategory) : []
  const events = Array.isArray(d.events)
    ? dedupeEvents(d.events.map(migrateEvent).filter((x: EventItem | null): x is EventItem => x !== null))
    : []

  // 如果没有任何有效数据，返回空结构（调用方决定是否用种子填充）
  const out: PersistedData = {
    _schema: DATA_SCHEMA_VERSION,
    _appVersion: appVersion || (typeof d._appVersion === 'string' ? d._appVersion : undefined),
    _savedAt: typeof d._savedAt === 'number' ? d._savedAt : Date.now(),
    categories,
    events,
    settings: migrateSettings(d.settings),
  }
  if (d.syncBase && typeof d.syncBase === 'object') out.syncBase = d.syncBase as SyncBase
  if (Array.isArray(d.tombstones)) out.tombstones = d.tombstones.filter((x: any) => typeof x === 'string')
  if (typeof d.lastBackup === 'string') out.lastBackup = d.lastBackup
  if (d.widgetBindings && typeof d.widgetBindings === 'object') out.widgetBindings = d.widgetBindings as Record<string, string>
  return out
}

/** 判断数据是否"看起来有效"（至少有一个分类或事件） */
export function hasData(d: any): boolean {
  return Boolean(d && Array.isArray(d.categories) && Array.isArray(d.events) && (d.categories.length || d.events.length))
}

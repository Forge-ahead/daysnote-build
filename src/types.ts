export type SyncBackend = 'couchdb' | 'webdav'
export type ThemeMode = 'light' | 'dark' | 'auto'
export type BackgroundStyle = 'grid' | 'beige' | 'cream' | 'gray'
/** 事件在首页的显示方式：倒数 / 正数 / 两者都显示 */
export type CountMode = 'countdown' | 'countup' | 'both'

export type Category = {
  id: string
  name: string
  color: string
  order: number
  builtin?: boolean
  updatedAt?: number
  _rev?: string
}

export type EventItem = {
  id: string
  title: string
  /** 公历日期 YYYY-MM-DD，作为计算的基准 */
  date: string
  /** 是否按农历解释与重复 */
  lunar: boolean
  categoryId: string
  icon: string
  color: string
  note: string
  order: number
  repeat: 'none' | 'yearly'
  /** 是否显示到「事件」时间轴，默认 true */
  showInTimeline?: boolean
  /** 首页显示为倒数 / 正数 / 两者都显示；缺省时按日期推断（老数据兼容） */
  displayMode?: CountMode
  createdAt: number
  updatedAt: number
  _rev?: string
}

/** 回收站条目：被删除的事件，可恢复 */
export type TrashItem = {
  id: string
  kind: 'event' | 'category'
  title: string
  icon?: string
  date?: string
  color?: string
  /** 删除时间戳 */
  deletedAt: number
  /** 来源：本地删除 / 云端已标记删除（云端条目只有 id，内容需联网回捞） */
  source: 'local' | 'remote'
  /** 事件本体（云端条目光有 id 时为空） */
  payload?: any
}

export type AppSettings = {
  /** 启用的同步后端，可同时启用 CouchDB 与 WebDAV */
  enabledBackends: SyncBackend[]
  /** 兼容旧字段：单选后端（新版本不直接使用，仅迁移用） */
  syncBackend?: SyncBackend
  couchUrl: string
  couchDb: string
  couchUser: string
  couchPassword: string
  /** WebDAV 数据文件完整 URL（含文件名） */
  webdavUrl: string
  webdavUser: string
  webdavPassword: string
  /** WebDAV 备份文件夹路径（完整 URL，以 / 结尾），用户手动设置 */
  backupFolder: string
  /** 每月自动备份开关 */
  autoBackup: boolean
  aiBaseUrl: string
  aiKey: string
  aiModel: string
  /** 打开软件时、以及增删改后自动同步 */
  autoSync: boolean
  /** 时间轴是否显示农历/法定节日（关掉后只显示纪念日事件） */
  showFestivals: boolean
  /** 显示模式：白天 / 夜间 / 跟随系统 */
  themeMode: ThemeMode
  /** 背景样式：格纹 / 米色 / 暖白 / 浅灰 */
  backgroundStyle: BackgroundStyle
  /** iCloud 同步（默认关闭）。开启后使用原生 Preferences 的 iCloud 镜像兜底 */
  icloudSync: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  enabledBackends: ['couchdb'],
  syncBackend: 'couchdb',
  couchUrl: '',
  couchDb: 'daysnote',
  couchUser: '',
  couchPassword: '',
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: '',
  backupFolder: '',
  autoBackup: true,
  aiBaseUrl: 'https://api.openai.com/v1',
  aiKey: '',
  aiModel: 'gpt-4o-mini',
  autoSync: true,
  showFestivals: true,
  themeMode: 'light',
  backgroundStyle: 'grid',
  icloudSync: false,
}

/** 同步基线：记录每个文档上次同步时的内容指纹与时间戳（版本控制） */
export type SyncBase = Record<string, { hash: string; updatedAt: number }>

export type ConflictItem = {
  id: string
  kind: 'category' | 'event'
  title: string
  local: any
  remote: any
  localTime: number
  remoteTime: number
}

export const CARD_COLORS = [
  '#e3e9d5', // 浅绿
  '#dbe7f1', // 浅蓝
  '#fbe0b8', // 浅橙
  '#f0c8c4', // 浅粉
  '#dfc8d1', // 藕紫
  '#c7ddd9', // 青绿
  '#d7d2c4', // 卡其
]

export const CATEGORY_COLORS = [
  '#f3b8c2', // 粉
  '#a8d3d2', // 青
  '#e8786d', // 红
  '#5bb894', // 绿
  '#f6cd6e', // 黄
  '#9fb8e8', // 蓝
  '#c7a9dc', // 紫
]

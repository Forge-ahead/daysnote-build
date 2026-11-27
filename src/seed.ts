import type { Category, EventItem } from './types'
import { CARD_COLORS, CATEGORY_COLORS } from './types'

function uid(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 公开发行版（v28）：内置数据只保留 1 条示例事件「在一起」。
 * 原 v27 及更早版本内置的 15 条个人纪念日属于个人隐私，已全部从代码中删除；
 * 老版本数据在迁移时自动清理。
 */
const BUILTIN_RAW: Omit<EventItem, 'createdAt' | 'updatedAt'>[] = [
  { id: 'event:bi:together', title: '在一起', date: '2019-11-04', lunar: false, icon: '🍒', color: '#8ad0c5', categoryId: 'cat:anniv', repeat: 'none', displayMode: 'countup', note: '', order: 0, showInTimeline: true },
]

export const BUILTIN_EVENTS: EventItem[] = BUILTIN_RAW.map((e, i) => ({
  ...e,
  displayMode: e.displayMode || (e.repeat === 'yearly' ? 'countdown' : 'countup'),
  createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i,
}))

export function seedData(): { categories: Category[]; events: EventItem[] } {
  const now = Date.now()
  const categories: Category[] = [
    { id: 'cat:all', name: '全部', color: '#f3b8c2', order: 0, builtin: true, updatedAt: now },
    { id: 'cat:misc', name: '杂事', color: CATEGORY_COLORS[1], order: 1, updatedAt: now },
    { id: 'cat:anniv', name: '周年纪念', color: CATEGORY_COLORS[2], order: 2, updatedAt: now },
    { id: 'cat:record', name: '事件记录', color: CATEGORY_COLORS[3], order: 3, updatedAt: now },
  ]
  const events: EventItem[] = BUILTIN_EVENTS.map((e) => ({ ...e }))
  return { categories, events }
}

export function newEvent(input: Partial<EventItem> & { title: string }): EventItem {
  const now = Date.now()
  return {
    id: uid('event'),
    title: input.title,
    date: input.date || new Date().toISOString().slice(0, 10),
    lunar: input.lunar ?? false,
    categoryId: input.categoryId || 'cat:all',
    icon: input.icon || '📌',
    color: input.color || CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
    note: input.note || '',
    order: input.order ?? now,
    repeat: input.repeat || 'none',
    showInTimeline: input.showInTimeline ?? true,
    displayMode: input.displayMode || (input.repeat === 'yearly' ? 'countdown' : 'countup'),
    createdAt: now,
    updatedAt: now,
  }
}

export function newCategory(name: string, color?: string): Category {
  return {
    id: uid('cat'),
    name,
    color: color || CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
    order: Date.now(),
    updatedAt: Date.now(),
  }
}

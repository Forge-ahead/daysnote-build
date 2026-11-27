/**
 * 组件事件绑定解析（v25）：统一「指定事件 / 选分类（多选）」两种来源与排序规则。
 * WidgetsView 预览与 widgetBridge 原生同步共用本模块，保证两处结果一致。
 *
 * v25 规则：
 *  - 分类可多选（categoryIds 数组）
 *  - 打开绑定默认 mode='category'
 *  - 未做任何绑定时，默认加载全部事件（按临近排序）
 */
import type { Category, EventItem } from './types'
import { dayInfo, displayDate } from './date'
import type { WidgetTemplate } from './widgetTemplates'

/** 单个组件的绑定配置 */
export type WidgetBinding = {
  mode: 'events' | 'category'
  eventIds: string[]
  /** 多选分类的 id 列表 */
  categoryIds: string[]
}

export type Bindings = Record<string, WidgetBinding>

const uniqStrings = (arr: any): string[] =>
  Array.isArray(arr) ? [...new Set(arr.filter((x: any) => typeof x === 'string'))] as string[] : []

/** 解析 localStorage 里的绑定，兼容历史格式（v22 数组、v21 单 id、v23/v24 单 categoryId） */
export function loadBindings(raw: string | null): Bindings {
  const out: Bindings = {}
  try {
    const data = JSON.parse(raw || '{}') as Record<string, any>
    for (const [k, v] of Object.entries(data || {})) {
      if (!v) continue
      if (typeof v === 'object' && !Array.isArray(v) && (v.mode === 'events' || v.mode === 'category')) {
        let ids = uniqStrings(v.categoryIds)
        if (!ids.length && typeof v.categoryId === 'string' && v.categoryId) ids = [v.categoryId]
        out[k] = {
          mode: v.mode,
          eventIds: uniqStrings(v.eventIds),
          categoryIds: ids,
        }
      } else if (Array.isArray(v)) {
        out[k] = { mode: 'events', eventIds: uniqStrings(v), categoryIds: [] }
      } else if (typeof v === 'string') {
        out[k] = { mode: 'events', eventIds: [v], categoryIds: [] }
      }
    }
  } catch { /* ignore */ }
  return out
}

/** 默认绑定：选分类模式、未指定任何分类（=加载全部） */
export function emptyBinding(): WidgetBinding {
  return { mode: 'category', eventIds: [], categoryIds: [] }
}

/** 是否处于「未绑定」状态（既没勾事件也没选分类） */
export function isUnbound(b: WidgetBinding | undefined): boolean {
  if (!b) return true
  return b.eventIds.length === 0 && b.categoryIds.length === 0
}

/**
 * 按绑定配置取出事件，并统一排序：
 *  - 未绑定时默认加载全部事件
 *  - category 模式：多选分类合并；含「全部」(cat:all) 则取所有事件
 *  - events 模式：只取勾选的事件
 *  - 未来事件按剩余天数升序，过期事件排后面；每年重复事件自动滚到下一次
 */
export function resolveBindingEvents(
  binding: WidgetBinding | undefined,
  events: EventItem[],
  categories: Category[],
): EventItem[] {
  let picked: EventItem[]
  if (isUnbound(binding) || binding!.mode === 'category') {
    const ids = binding?.categoryIds || []
    if (!ids.length) {
      // 未绑定 / 未选分类：默认全部事件
      picked = events.slice()
    } else if (ids.includes('cat:all')) {
      picked = events.slice()
    } else {
      const idSet = new Set(ids)
      picked = events.filter((e) => idSet.has(e.categoryId))
    }
  } else {
    const ids = new Set(binding!.eventIds)
    picked = events.filter((e) => ids.has(e.id))
  }
  // 去重
  const seen = new Set<string>()
  picked = picked.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
  return picked.slice().sort((a, b) => {
    const ia = dayInfo(a)
    const ib = dayInfo(b)
    if (ia.dir === ib.dir) return ia.days - ib.days
    return ia.dir === 'future' ? -1 : 1
  })
}

/** 组件最终展示的事件（限制到模板格数） */
export function templateEvents(
  tpl: WidgetTemplate,
  bindings: Bindings,
  events: EventItem[],
  categories: Category[],
): EventItem[] {
  return resolveBindingEvents(bindings[tpl.id], events, categories).slice(0, tpl.slots)
}

/** 分类名（用于绑定摘要显示） */
export function categoryName(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.name || '未分类'
}

/** 把组件事件序列化为原生 payload 所需的最小结构 */
export function serializeWidgetEvents(items: EventItem[]): Array<{ title: string; icon: string; date: string; days: number }> {
  return items.map((ev) => {
    const info = dayInfo(ev)
    return { title: ev.title, icon: ev.icon || '📌', date: displayDate(ev), days: info.days }
  })
}

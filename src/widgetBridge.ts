/**
 * 把 Web 侧的事件 + 组件绑定配置同步到原生 App Group，供系统 Widget 读取。
 * 在 Web 预览环境（无 Capacitor 插件）静默失败，不影响预览。
 * v23：支持「指定事件 / 选分类」两种来源、按临近排序，并携带法定节假日数据。
 *
 * 注意：皮肤字段必须保持「扁平」结构（与 iOS SharedStore.swift 的 WidgetConfig 一致），
 * 不要改成 skin 字典，否则 Swift 侧 Codable 解析失败。
 */
import type { Category, EventItem } from './types'
import { WIDGET_TEMPLATES, WIDGET_SHARED_KEY } from './widgetTemplates'
import { loadBindings, templateEvents, serializeWidgetEvents } from './widgetBindings'
import { peekHoliday, type HolidayCountdown } from './holiday'

export type WidgetSyncPayload = {
  version: number
  updatedAt: number
  configs: Array<{
    id: string
    kind: string
    size: string
    slots: number
    /** 扁平皮肤字段，与 Swift WidgetConfig 一一对应 */
    bg: string
    bgAccent: string
    ink: string
    inkSoft: string
    brand: string
    rowBg: string
    hot: string
    far: string
    chipOn: string
    chipOnInk: string
    holiday: boolean
    /** 假日组件左侧的法定节假日数据 */
    holidayInfo: HolidayCountdown | null
    binding: { mode: string; categoryIds: string[]; eventCount: number }
    events: Array<{ title: string; icon: string; date: string; days: number }>
  }>
}

function plugin(): any | null {
  try {
    const cap = (window as any).Capacitor
    return cap?.Plugins?.DaysNoteWidget || null
  } catch { return null }
}

/** 组装完整 payload 并推送。events/categories 变化、绑定变化、App 启动都会调用。 */
export function syncWidgetData(events: EventItem[], categories: Category[] = []): void {
  let bindings
  try { bindings = loadBindings(localStorage.getItem(WIDGET_SHARED_KEY)) } catch { bindings = {} }
  const holidayInfo = peekHoliday()
  const configs = WIDGET_TEMPLATES.map((tpl) => {
    const items = templateEvents(tpl, bindings, events, categories)
    const b = bindings[tpl.id]
    const s = tpl.skin
    return {
      id: tpl.id,
      kind: tpl.kind,
      size: tpl.size,
      slots: tpl.slots,
      bg: s.bg,
      bgAccent: s.bgAccent || s.bg,
      ink: s.ink,
      inkSoft: s.inkSoft,
      brand: s.brand,
      rowBg: s.rowBg,
      hot: s.hot,
      far: s.far,
      chipOn: s.chipOn,
      chipOnInk: s.chipOnInk,
      holiday: Boolean(tpl.holiday),
      holidayInfo: tpl.kind === 'holiday' ? holidayInfo : null,
      binding: {
        mode: b?.mode || 'category',
        categoryIds: b?.categoryIds || [],
        eventCount: items.length,
      },
      events: serializeWidgetEvents(items),
    }
  })
  const payload: WidgetSyncPayload = { version: 3, updatedAt: Date.now(), configs }
  const p = plugin()
  if (!p?.sync) return
  try { void p.sync({ value: JSON.stringify(payload) }) } catch { /* ignore */ }
}

export function selectWidget(id: string): void {
  const p = plugin()
  if (!p?.select) return
  try { void p.select({ id }) } catch { /* ignore */ }
}

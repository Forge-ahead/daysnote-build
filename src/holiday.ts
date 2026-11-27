/**
 * 中国法定节假日数据（供「假日」组件左侧显示用）。
 *
 * 数据源：holiday-cn（https://github.com/NateScarlet/holiday-cn）
 *   - 原始数据来自国务院办公厅每年发布的放假安排，字段 name/date/isOffDay
 *   - 同一节日连续 isOffDay=true 的日期即放假区间（含首尾），可算出「X月X日 ~ X月X日」
 *   - 每年一个 JSON，raw.githubusercontent.com 支持 CORS，Web 预览与原生 WebView 均可直接 fetch
 *
 * 更新频率：按用户要求「每月获取一次」。缓存写在 localStorage，跨月才重新联网；
 * 联网失败时用上次缓存；完全没有缓存时用基于农历的推算兜底，保证组件永远有内容。
 */
import { Lunar } from 'lunar-javascript'

export type HolidayPeriod = {
  name: string
  /** 放假起始日 YYYY-MM-DD */
  start: string
  /** 放假结束日 YYYY-MM-DD */
  end: string
  /** 放假天数（含首尾） */
  days: number
  /** 调休上班日 YYYY-MM-DD[]（可选） */
  workdays?: string[]
  /** 数据来源：official=国务院公布 / estimated=农历推算 */
  source: 'official' | 'estimated'
}

export type HolidayCountdown = {
  name: string
  icon: string
  /** 距离开始还有几天；0 表示今天就在假期中 */
  daysLeft: number
  /** 今天是否正处于假期内 */
  inProgress: boolean
  /** MM/DD 形式的放假区间 */
  rangeText: string
  /** 放假天数 */
  holidayDays: number
  source: 'official' | 'estimated'
}

const CACHE_KEY = 'daysnote.holiday.v1'
const DATA_URL = (year: number) =>
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`

const HOLIDAY_ICON: Record<string, string> = {
  元旦: '🎍', 春节: '🧧', 除夕: '🎊', 清明节: '🌿', 清明: '🌿',
  劳动节: '🛠️', 端午节: '🎋', 中秋: '🥮', 中秋节: '🥮', 国庆节: '🇨🇳', 国庆: '🇨🇳',
}
export function holidayIcon(name: string): string {
  return HOLIDAY_ICON[name] || '🎉'
}

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function iso(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}` }

/** 解析 holiday-cn 某年 JSON -> 放假区间列表 */
function parseYear(json: any): HolidayPeriod[] {
  const days: Array<{ name?: string; date?: string; isOffDay?: boolean }> = json?.days || []
  const groups = new Map<string, string[]>()
  const workdays = new Map<string, string[]>()
  for (const item of days) {
    if (!item?.date || !item.name) continue
    if (item.isOffDay) {
      const arr = groups.get(item.name) || []
      arr.push(item.date)
      groups.set(item.name, arr)
    } else {
      // 有 name 但非休息日 = 调休上班日
      const arr = workdays.get(item.name) || []
      arr.push(item.date)
      workdays.set(item.name, arr)
    }
  }
  const out: HolidayPeriod[] = []
  for (const [name, dates] of groups) {
    if (!dates.length) continue
    const sorted = [...new Set(dates)].sort()
    out.push({
      name,
      start: sorted[0],
      end: sorted[sorted.length - 1],
      days: sorted.length,
      workdays: workdays.get(name) || [],
      source: 'official',
    })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * 农历推算兜底：国务院尚未公布下一年安排时，用常见放假天数生成候选。
 * 元旦 3 天、春节 9 天（除夕~初八）、清明 3 天、劳动 5 天、端午 3 天、中秋 3 天、国庆 7 天。
 */
function estimatedYear(year: number): HolidayPeriod[] {
  const solarOfLunar = (lm: number, ld: number): [number, number, number] => {
    try {
      const s = Lunar.fromYmd(year, lm, ld).getSolar()
      return [s.getYear(), s.getMonth(), s.getDay()]
    } catch {
      return [year, 1, 1]
    }
  }
  const shift = (y: number, m: number, d: number, delta: number): string => {
    const dt = new Date(y, m - 1, d + delta)
    return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  }
  const [sy, sm, sd] = solarOfLunar(1, 1)          // 春节正月初一
  const [dy, dm, dd] = solarOfLunar(5, 5)          // 端午
  const [my, mm, md] = solarOfLunar(8, 15)         // 中秋
  const list: Array<[string, string, string]> = [
    ['元旦', iso(year, 1, 1), iso(year, 1, 3)],
    ['春节', shift(sy, sm, sd, -1), shift(sy, sm, sd, 7)],
    ['清明节', iso(year, 4, 4), iso(year, 4, 6)],
    ['劳动节', iso(year, 5, 1), iso(year, 5, 5)],
    ['端午节', iso(dy, dm, dd), shift(dy, dm, dd, 2)],
    ['中秋节', iso(my, mm, md), shift(my, mm, md, 2)],
    ['国庆节', iso(year, 10, 1), iso(year, 10, 7)],
  ]
  return list.map(([name, start, end]) => ({
    name, start, end,
    days: Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1,
    source: 'estimated' as const,
  })).sort((a, b) => a.start.localeCompare(b.start))
}

type Cache = { month: string; fetchedAt: number; periods: HolidayPeriod[] }

function readCache(): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    return c && Array.isArray(c.periods) ? c as Cache : null
  } catch { return null }
}

/**
 * 获取放假安排。跨月才联网（用户要求每月一次），失败降级到缓存/推算。
 * 返回当年 + 下一年的区间，按开始日期排序。
 */
export async function getHolidayPeriods(force = false): Promise<HolidayPeriod[]> {
  const cache = readCache()
  const now = monthKey()
  if (!force && cache?.month === now && cache.periods.length) return cache.periods

  const year = new Date().getFullYear()
  const merged = new Map<string, HolidayPeriod>()
  try {
    // 8 秒超时：网络异常时不能让首帧无限挂起
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const results = await Promise.allSettled(
      [year, year + 1].map(async (y) => {
        const r = await fetch(DATA_URL(y), { cache: 'no-store', signal: ctrl.signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return parseYear(await r.json())
      }),
    )
    clearTimeout(timer)
    for (const res of results) {
      if (res.status === 'fulfilled') for (const p of res.value) merged.set(`${p.name}|${p.start}`, p)
    }
  } catch { /* 降级 */ }

  // 联网一条都没拿到：先用缓存，再退推算
  if (!merged.size) {
    if (cache?.periods.length) return cache.periods
    return [...estimatedYear(year), ...estimatedYear(year + 1)].sort((a, b) => a.start.localeCompare(b.start))
  }
  // 下一年官方数据未发布时，补推算候选（日期不重复才加入）
  const estimated = estimatedYear(year + 1)
  for (const p of estimated) {
    const key = `${p.name}|${p.start}`
    if (!merged.has(key)) merged.set(key, p)
  }
  const periods = [...merged.values()].sort((a, b) => a.start.localeCompare(b.start))
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ month: now, fetchedAt: Date.now(), periods })) } catch { /* ignore */ }
  return periods
}

/** 从放假区间算出「距离下一个法定节假日还剩几天 + 放假范围」 */
export function nextHoliday(periods: HolidayPeriod[], now = new Date()): HolidayCountdown | null {
  if (!periods.length) return null
  const today = iso(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const upcoming = periods.filter((p) => p.end >= today).sort((a, b) => a.start.localeCompare(b.start))
  const p = upcoming[0]
  if (!p) return null
  const inProgress = p.start <= today
  const daysLeft = inProgress
    ? 0
    : Math.round((new Date(p.start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
  const range = (s: string) => { const [, m, d] = s.split('-'); return `${Number(m)}/${Number(d)}` }
  return {
    name: p.name,
    icon: holidayIcon(p.name),
    daysLeft,
    inProgress,
    rangeText: `${range(p.start)} - ${range(p.end)}`,
    holidayDays: p.days,
    source: p.source,
  }
}

/** 同步版：只读缓存/推算，供首帧立即渲染（不等待网络） */
export function peekHoliday(now = new Date()): HolidayCountdown | null {
  const cache = readCache()
  const year = now.getFullYear()
  const periods = cache?.periods?.length
    ? cache.periods
    : [...estimatedYear(year), ...estimatedYear(year + 1)].sort((a, b) => a.start.localeCompare(b.start))
  return nextHoliday(periods, now)
}

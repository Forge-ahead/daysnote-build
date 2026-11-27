import { Solar, Lunar } from 'lunar-javascript'
import type { CountMode, EventItem } from './types'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 完整星期中文名，按 getDay() 索引（0=周日），供小组件等按索引取值 */
export const WEEKDAY_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function todayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(s: string): Date {
  const parts = s.split('-').map(Number)
  // 支持 MM-DD 短格式（每年重复的倒数事件），补当前年份
  if (parts.length === 2) {
    const now = new Date()
    return new Date(now.getFullYear(), parts[0] - 1, parts[1])
  }
  const [y, m, d] = parts
  return new Date(y, (m || 1) - 1, d || 1)
}

/** 中文短日期：2027.01.01 周五 */
export function formatDateCN(s: string, withWeek = true): string {
  const d = fromISO(s)
  const text = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return withWeek ? `${text} ${WEEK[d.getDay()]}` : text
}

export function lunarText(s: string): string {
  try {
    const d = fromISO(s)
    const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar()
    return String(l.toString()).replace(/^[〇零一二三四五六七八九十]+年/, '')
  } catch {
    return ''
  }
}

/**
 * 计算事件的目标日期。repeat=yearly 且 lunar=true 时按农历每年滚动；
 * repeat=yearly 且 lunar=false 时按公历每年滚动。
 */
export function targetDate(ev: EventItem, now = todayStart()): Date {
  const base = fromISO(ev.date)
  if (ev.repeat !== 'yearly') return base

  if (ev.lunar) {
    try {
      const lunar = Solar.fromYmd(base.getFullYear(), base.getMonth() + 1, base.getDate()).getLunar()
      const lm = lunar.getMonth()
      const ld = lunar.getDay()
      let y = now.getFullYear()
      let solar = Lunar.fromYmd(y, lm, ld).getSolar()
      let target = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
      if (target < now) {
        y += 1
        solar = Lunar.fromYmd(y, lm, ld).getSolar()
        target = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
      }
      return target
    } catch {
      // 农历转换失败时回退公历
    }
  }

  const candidate = new Date(now.getFullYear(), base.getMonth(), base.getDate())
  if (candidate < now) candidate.setFullYear(now.getFullYear() + 1)
  return candidate
}

/** 倒计时显示：超过 365 天显示为「x.xx年」，否则显示天数 */
export function formatDays(days: number): string {
  if (days > 365) return `${(days / 365).toFixed(2)}年`
  return String(days)
}

/** 正数 = 已过去天数（正整数）；倒数 = 剩余天数（正整数） */
export function dayInfo(ev: EventItem, now = todayStart()): { days: number; dir: 'past' | 'future'; target: Date } {
  const target = targetDate(ev, now)
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000)
  if (diff >= 0) return { days: diff, dir: 'future', target }
  return { days: -diff, dir: 'past', target }
}

/**
 * 事件的「真实日期」文本：始终用事件自身保存的日期（含保存时的年份），
 * 而不是 dayInfo().target 滚动后的年份（2027）。倒数天数仍由 dayInfo 基于滚动目标计算。
 */
export function displayDate(ev: EventItem): string {
  return ev.date
}

/** 老数据没有 displayMode 时按日期推断：未来=倒数，过去=正数，保证升级后行为不变 */
export function inferDisplayMode(ev: EventItem, now = todayStart()): CountMode {
  if (ev.displayMode === 'countup' || ev.displayMode === 'countdown' || ev.displayMode === 'both') return ev.displayMode
  return dayInfo(ev, now).dir === 'future' ? 'countdown' : 'countup'
}

/**
 * 按首页显示模式计算该事件应在哪些分组出现及各自天数：
 * - 倒数：距离下一次目标日期的天数（yearly 自动滚到明年；一次性已过日期滚到明年同月日）
 * - 正数：从事件真实日期到今天已经过去的天数
 * 两者独立计算，互不依赖日期方向，保证「显示模式」真正由用户选择决定。
 */
export function homeCounts(ev: EventItem, now = todayStart()): { countdown: number | null; countup: number | null } {
  const mode = inferDisplayMode(ev, now)
  const real = fromISO(ev.date)
  const DAY = 86400000
  let countdown: number | null = null
  let countup: number | null = null
  if (mode === 'countdown' || mode === 'both') {
    const info = dayInfo(ev, now)
    if (info.dir === 'future') {
      countdown = info.days
    } else {
      // 一次性日期已过仍要倒数：顺延到明年同月日
      const next = new Date(now.getFullYear() + 1, real.getMonth(), real.getDate())
      countdown = Math.max(0, Math.round((next.getTime() - now.getTime()) / DAY))
    }
  }
  if (mode === 'countup' || mode === 'both') {
    countup = Math.max(0, Math.round((now.getTime() - real.getTime()) / DAY))
  }
  return { countdown, countup }
}

export function yearRemaining(now = todayStart()): number {
  const end = new Date(now.getFullYear(), 11, 31)
  return Math.round((end.getTime() - now.getTime()) / 86400000)
}

/** 农历年月 -> 公历日期，供日期滚轮使用 */
export function lunarToSolar(year: number, month: number, day: number): string | null {
  try {
      const solar = Lunar.fromYmd(year, month, day).getSolar()
      return toISO(new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay()))
  } catch {
    return null
  }
}

export function solarToLunarParts(iso: string): { year: number; month: number; day: number } {
  const d = fromISO(iso)
  const l = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getLunar()
  return { year: l.getYear(), month: l.getMonth(), day: l.getDay() }
}

export type Festival = { name: string; date: Date; kind: 'lunar' | 'legal'; icon: string }

/** 农历节日：按指定年份动态换算成公历日期（每年公历日期都不同） */
const LUNAR_FESTIVALS: Array<[string, number, number, string]> = [
  ['春节', 1, 1, '🧧'],
  ['元宵节', 1, 15, '🏮'],
  ['龙抬头', 2, 2, '🐉'],
  ['端午节', 5, 5, '🎋'],
  ['七夕节', 7, 7, '💝'],
  ['中元节', 7, 15, '🏮'],
  ['中秋节', 8, 15, '🥮'],
  ['重阳节', 9, 9, '🍂'],
  ['腊八节', 12, 8, '🥣'],
]

/** 法定 / 公历节日：固定公历月日 */
const LEGAL_FESTIVALS: Array<[string, number, number, string]> = [
  ['元旦', 1, 1, '🎍'],
  ['情人节', 2, 14, '❤️'],
  ['植树节', 3, 12, '🌳'],
  ['儿童节', 6, 1, '🎈'],
  ['圣诞节', 12, 25, '🎄'],
]

/** 返回指定年份的全部节日（农历节日按当年公历动态换算），供时间轴使用 */
export function getFestivalsForYear(year: number): Festival[] {
  const out: Festival[] = []
  // 除夕 = 该年春节（正月初一）前一天，最可靠
  const springSolar = Lunar.fromYmd(year, 1, 1).getSolar()
  const newYearEve = new Date(springSolar.getYear(), springSolar.getMonth() - 1, springSolar.getDay() - 1)
  for (const [name, lm, ld, icon] of LUNAR_FESTIVALS) {
    try {
      const solar = Lunar.fromYmd(year, lm, ld).getSolar()
      out.push({ name, date: new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay()), kind: 'lunar', icon })
    } catch { /* 该年无此农历节日则跳过 */ }
  }
  // 覆盖除夕为春节前一天（LUNAR_FESTIVALS 里 -1 的项）
  const eveIdx = out.findIndex((x) => x.name === '除夕')
  if (eveIdx >= 0) out[eveIdx].date = newYearEve
  else out.push({ name: '除夕', date: newYearEve, kind: 'lunar', icon: '🎊' })

  for (const [name, m, d, icon] of LEGAL_FESTIVALS) {
    out.push({ name, date: new Date(year, m - 1, d), kind: 'legal', icon })
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

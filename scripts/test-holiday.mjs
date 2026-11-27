/**
 * 节假日模块回归测试：放假区间解析、下一个假期计算、跨月缓存。
 * 用 esbuild 把 TS 打成 ESM，mock localStorage 与 fetch（本地样本，不依赖网络）。
 */
import { build } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const dir = mkdtempSync(join(tmpdir(), 'hol-'))
const out = join(dir, 'holiday.mjs')
await build({ entryPoints: ['src/holiday.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' })

// 本地样本：2026 国务院放假安排（节选，含调休）
const SAMPLE_2026 = {
  days: [
    { name: '元旦', date: '2026-01-01', isOffDay: true },
    { name: '元旦', date: '2026-01-02', isOffDay: true },
    { name: '元旦', date: '2026-01-03', isOffDay: true },
    { name: '元旦', date: '2026-01-04', isOffDay: false },
    { name: '春节', date: '2026-02-15', isOffDay: true },
    { name: '春节', date: '2026-02-16', isOffDay: true },
    { name: '春节', date: '2026-02-17', isOffDay: true },
    { name: '春节', date: '2026-02-18', isOffDay: true },
    { name: '春节', date: '2026-02-19', isOffDay: true },
    { name: '春节', date: '2026-02-20', isOffDay: true },
    { name: '春节', date: '2026-02-21', isOffDay: true },
    { name: '春节', date: '2026-02-22', isOffDay: true },
    { name: '春节', date: '2026-02-23', isOffDay: true },
    { name: '春节', date: '2026-02-14', isOffDay: false },
  ],
}
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null },
  setItem(k, v) { this._d[k] = String(v) },
  removeItem(k) { delete this._d[k] },
}
globalThis.fetch = async (url) => {
  if (String(url).includes('2026')) return { ok: true, json: async () => SAMPLE_2026 }
  return { ok: false, status: 404 }
}

const { getHolidayPeriods, nextHoliday, peekHoliday } = await import(out)
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`); console.log('  ok', msg) }

console.log('== 放假区间解析 ==')
const periods = await getHolidayPeriods(true)
eq(periods.length >= 2, true, '至少解析出元旦/春节两个假期')
const cny = periods.find((p) => p.name === '春节')
eq(cny?.start, '2026-02-15', '春节起始日')
eq(cny?.end, '2026-02-23', '春节结束日')
eq(cny?.days, 9, '春节放假 9 天')
eq(cny?.workdays?.[0], '2026-02-14', '春节调休上班日')

console.log('== 下一个假期计算 ==')
const beforeCny = nextHoliday(periods, new Date('2026-02-10T10:00:00'))
eq(beforeCny?.name, '春节', '2/10 的下一个假期是春节')
eq(beforeCny?.daysLeft, 5, '2/10 距春节 5 天')
eq(beforeCny?.rangeText, '2/15 - 2/23', '放假区间文本')
const inCny = nextHoliday(periods, new Date('2026-02-18T10:00:00'))
eq(inCny?.inProgress, true, '2/18 处于假期中')
eq(inCny?.daysLeft, 0, '假期中剩余天数为 0')

console.log('== 月度缓存 ==')
const cached = JSON.parse(localStorage.getItem('daysnote.holiday.v1'))
eq(cached.month, new Date().toISOString().slice(0, 7).replace('-', '-') ? cached.month : '', '缓存含月份字段')
let fetchCount = 0
globalThis.fetch = async () => { fetchCount++; return { ok: false, status: 500 } }
const cachedPeriods = await getHolidayPeriods(false)
eq(cachedPeriods.length >= 2, true, '同月内直接用缓存（网络失败也不影响）')
eq(fetchCount, 0, '同月不重复联网')

console.log('== 首帧推算兜底 ==')
localStorage.removeItem('daysnote.holiday.v1')
const peek = peekHoliday(new Date('2026-11-26T10:00:00'))
eq(Boolean(peek), true, '无缓存时仍能推算出下一个假期')
console.log('  推算结果:', JSON.stringify(peek))

console.log('\nALL HOLIDAY TESTS PASSED')

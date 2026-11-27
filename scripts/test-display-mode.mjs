/**
 * v26 显示模式 + 真实年份回归测试：
 *  - 倒数事件显示真实年份日期，天数按滚动目标算
 *  - 正数事件从真实日期算已过天数
 *  - displayMode 三态（倒数/正数/都显示）与老数据推断
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const dir = mkdtempSync(join(tmpdir(), 'dm-'))
const out = join(dir, 'date.mjs')
await build({ entryPoints: ['src/date.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' })

const { displayDate, inferDisplayMode, homeCounts, dayInfo } = await import(out)
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`); console.log('  ok', msg) }
const DAY = 86400000

// 固定"今天" 2026-11-26，避免测试随时间漂移
const now = new Date(2026, 10, 26)
const ev = (o) => ({ id: 'x', title: 'x', date: '2026-01-01', lunar: false, categoryId: 'cat:all',
  icon: '📌', color: '#fff', note: '', order: 0, repeat: 'none', showInTimeline: true,
  createdAt: 1, updatedAt: 1, ...o })

console.log('== yearly：真实年份显示，倒数按滚动目标算 ==')
const yearlyEv = ev({ title: '示例纪念日', date: '1999-09-14', repeat: 'yearly', displayMode: 'countdown' })
eq(displayDate(yearlyEv), '1999-09-14', '显示日期为事件真实年份')
// 1999-09-14 yearly 滚动到 2027-09-14（因 2026-09-14 已过）
const bi = dayInfo(yearlyEv, now)
eq(bi.dir, 'future', '滚动目标在未来')
eq(bi.target.getFullYear(), 2027, '滚动目标年份为 2027')
eq(displayDate(yearlyEv), '1999-09-14', '天数按 2027 算但日期仍显示真实年份')

console.log('== displayMode 推断（老数据兼容）==')
eq(inferDisplayMode(ev({ date: '2020-01-01' }), now), 'countup', '过去一次性事件推断 countup')
eq(inferDisplayMode(ev({ date: '09-14', repeat: 'yearly' }), now), 'countdown', 'yearly 事件推断 countdown')
eq(inferDisplayMode(ev({ date: '2026-08-05', displayMode: 'both' }), now), 'both', '显式 both 保留')

console.log('== 正数：从真实日期算已过天数 ==')
const marriage = ev({ title: '示例纪念日', date: '2026-08-05', displayMode: 'countup' })
const mc = homeCounts(marriage, now)
eq(mc.countdown, null, 'countup 不出现在倒数组')
eq(mc.countup, Math.round((now - new Date(2026, 7, 5)) / DAY), '正数天数=从 8/5 到今天')

console.log('== 都显示：两组都有 ==')
const both = ev({ title: '在一起', date: '2019-11-04', repeat: 'yearly', displayMode: 'both' })
const bc = homeCounts(both, now)
eq(typeof bc.countdown, 'number', 'both 有倒数天数')
eq(typeof bc.countup, 'number', 'both 有正数天数')

console.log('== 倒数模式：一次性已过日期顺延明年 ==')
const oneTime = ev({ date: '2020-05-20', displayMode: 'countdown' })
const oc = homeCounts(oneTime, now)
eq(oc.countdown > 0 && oc.countdown < 365, true, '已过一次性日期倒数顺延到明年同月日')

console.log('\nALL DISPLAY-MODE TESTS PASSED')

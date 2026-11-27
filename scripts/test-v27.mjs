/**
 * v27 专项测试：
 *  - 「今年剩余」不再是事件（seed 无该条；老数据迁移后移除）
 *  - hero 动态天数按当前年份计算，跨年自动切换（2026-12-31 / 2027-12-31）
 *  - 首页 UI：hero 显示「今年剩余」，倒数/正数列表不再出现「今年剩余」
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import puppeteer from 'puppeteer-core'

const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`); console.log('  ok', msg) }

// ---- 纯逻辑 ----
const dir = mkdtempSync(join(tmpdir(), 'v27-'))
const dateOut = join(dir, 'date.mjs')
const seedOut = join(dir, 'seed.mjs')
await build({ entryPoints: ['src/date.ts'], bundle: true, platform: 'node', format: 'esm', outfile: dateOut, logLevel: 'silent' })
await build({ entryPoints: ['src/seed.ts'], bundle: true, platform: 'node', format: 'esm', outfile: seedOut, logLevel: 'silent' })
const { yearRemaining } = await import(dateOut)
const { BUILTIN_EVENTS } = await import(seedOut)

console.log('== yearRemaining 动态跨年 ==')
eq(yearRemaining(new Date(2026, 10, 26)), 35, '2026-11-26 距 2026-12-31 为 35 天')
eq(yearRemaining(new Date(2026, 11, 31)), 0, '2026-12-31 当天为 0')
eq(yearRemaining(new Date(2027, 0, 1)), 364, '2027-01-01 自动切换为距 2027-12-31 的 364 天')

console.log('== 内置事件：公开发行版只保留「在一起」 ==')
eq(BUILTIN_EVENTS.length, 1, '内置事件仅 1 条')
eq(BUILTIN_EVENTS[0].title, '在一起', '唯一内置事件为「在一起」')
eq(BUILTIN_EVENTS.some((e) => e.id === 'event:bi:yearleft'), false, '无 event:bi:yearleft')
eq(BUILTIN_EVENTS.some((e) => e.title === '今年剩余'), false, '无「今年剩余」标题')
eq(BUILTIN_EVENTS.some((e) => /生日|婚礼|结婚|链家|姥爷|求婚/.test(e.title)), false, '无任何个人纪念日标题')

// ---- 迁移 + UI ----
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })

const OLD_DATA = {
  categories: [{ id: 'cat:all', name: '全部', color: '#f3b8c2', order: 0, builtin: true }],
  events: [
    { id: 'event:bi:yearleft', title: '今年剩余', date: '12-31', icon: '🦄', color: '#f3b8c2', categoryId: 'cat:all', note: '', order: 0, repeat: 'yearly' },
    { id: 'event:bi:birthday', title: '示例倒数事件', date: '2020-01-01', icon: '🐱', color: '#c9d8ef', categoryId: 'cat:all', note: '', order: 1, repeat: 'yearly' },
    { id: 'e:past', title: '旧事', date: '2024-01-01', icon: '📌', color: '#e3e9d5', categoryId: 'cat:all', note: '', order: 2 },
  ],
  settings: {},
}
await page.evaluateOnNewDocument((data) => {
  localStorage.setItem('daysnote.v1', JSON.stringify(data))
  localStorage.setItem('daysnote.builtinImport.v6', '1')
}, OLD_DATA)
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 700))

const ui = await page.evaluate(() => ({
  heroTitle: document.querySelector('.hero-card .hero-title')?.textContent.trim(),
  heroDate: document.querySelector('.hero-card .hero-date')?.textContent.trim(),
  heroNum: document.querySelector('.hero-card .hero-num b')?.textContent.trim(),
  rowTitles: [...document.querySelectorAll('.ev-title')].map((x) => x.textContent.trim()),
  tombs: JSON.parse(localStorage.getItem('daysnote.tombstones.v1') || '[]'),
  savedEvents: JSON.parse(localStorage.getItem('daysnote.v1') || '{"events":[]}').events.map((e) => e.id),
}))

console.log('== 首页 UI ==')
eq(ui.heroTitle, '今年剩余', 'hero 标题为「今年剩余」')
eq(ui.heroDate, '2026.12.31 周四', 'hero 日期为当年 12-31')
eq(typeof ui.heroNum, 'string', 'hero 天数已渲染')
eq(ui.rowTitles.includes('今年剩余'), false, '倒数/正数列表不含「今年剩余」')
eq(ui.tombs.includes('event:bi:yearleft'), true, '已补 tombstone（同步时清远端）')
eq(ui.savedEvents.includes('event:bi:yearleft'), false, '持久化数据中已移除')

await browser.close()
console.log('\nALL V27 TESTS PASSED')

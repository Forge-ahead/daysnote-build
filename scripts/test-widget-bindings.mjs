/**
 * 组件绑定回归测试（v25）：
 *  - 指定事件 / 多选分类 两种来源
 *  - 未绑定默认全部事件、打开默认 category 模式
 *  - 临近日期排序、过期自动顺延、多选分类合并去重
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const dir = mkdtempSync(join(tmpdir(), 'bind-'))
const out = join(dir, 'bind.mjs')
await build({ entryPoints: ['src/widgetBindings.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' })

const now = new Date()
const y = now.getFullYear()
const iso = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ev = (id, title, date, categoryId, repeat = 'none') => ({
  id, title, date, categoryId, repeat, lunar: false, icon: '📌', color: '#fff', note: '',
  order: 0, createdAt: 1, updatedAt: 1,
})
const events = [
  ev('e1', '远的事件', iso(11, 1), 'c1'),
  ev('e2', '近的事件', iso(12, 1), 'c1'),
  ev('e3', '最近事件', iso(11, 30), 'c2'),
  ev('e4', '别的分类', iso(12, 15), 'c2'),
]
const categories = [
  { id: 'c1', name: '分类一', color: '#f00', order: 0 },
  { id: 'c2', name: '分类二', color: '#0f0', order: 1 },
]

const { loadBindings, emptyBinding, resolveBindingEvents, templateEvents } = await import(out)
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`); console.log('  ok', msg) }

console.log('== 反序列化兼容历史格式 ==')
eq(loadBindings(JSON.stringify({ t1: ['e1', 'e2'] })).t1.mode, 'events', 'v22 数组 -> events')
eq(loadBindings(JSON.stringify({ t1: 'e1' })).t1.eventIds[0], 'e1', 'v21 单 id 字符串')
const legacy = loadBindings(JSON.stringify({ t1: { mode: 'category', categoryId: 'c1', eventIds: [] } }))
eq(legacy.t1.categoryIds[0], 'c1', 'v24 单 categoryId -> categoryIds 数组')

console.log('== 默认规则 ==')
eq(emptyBinding().mode, 'category', '空绑定默认 category 模式')
eq(resolveBindingEvents(undefined, events, categories).length, 4, '未绑定默认加载全部事件')
eq(resolveBindingEvents(emptyBinding(), events, categories).length, 4, '空绑定加载全部事件')

console.log('== 指定事件：按临近排序 ==')
const picked = resolveBindingEvents({ mode: 'events', eventIds: ['e1', 'e2'], categoryIds: [] }, events, categories)
eq(picked[0].title, '近的事件', '12/1 排在 11/1 前')
eq(picked.length, 2, '只取勾选的事件')

console.log('== 多选分类：合并 + 去重 + 排序 ==')
const multi = resolveBindingEvents({ mode: 'category', eventIds: [], categoryIds: ['c1', 'c2'] }, events, categories)
eq(multi.length, 4, '多选两个分类合并 4 个事件')
eq(multi[0].title, '最近事件', '11/30 最近排最前')

console.log('== 系统「全部」分类 ==')
eq(resolveBindingEvents({ mode: 'category', eventIds: [], categoryIds: ['cat:all'] }, events, categories).length, 4, '选全部返回所有事件')

console.log('== 过期事件自动顺延 ==')
const past = ev('e5', '已过一次性', '2020-01-01', 'c1')
const yearly = ev('e6', '每年重复', '2000-12-25', 'c1', 'yearly')
const mix = resolveBindingEvents({ mode: 'events', eventIds: ['e5', 'e6'], categoryIds: [] }, [past, yearly], categories)
eq(mix[0].title, '每年重复', '每年重复滚到下一次，排在过期事件前')

console.log('== 模板格数截断 ==')
const tpl = { id: 't', slots: 2 }
eq(templateEvents(tpl, { t: { mode: 'category', eventIds: [], categoryIds: ['c2'] } }, events, categories).length, 2, '按 slots 截断到 2 个')

console.log('\nALL BINDING TESTS PASSED')

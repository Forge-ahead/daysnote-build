/**
 * v30 回归：回收站（删除→入站→恢复）与两个强制覆盖按钮
 */
import puppeteer from 'puppeteer-core'

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
})
const p = await b.newPage()
await p.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))

const SEED = {
  _schema: 7, _appVersion: '2.1.0',
  categories: [
    { id: 'cat:all', name: '全部', color: '#f3b8c2', order: 0, builtin: true },
    { id: 'cat:misc', name: '杂事', color: '#a8d3d2', order: 1 },
  ],
  events: [
    { id: 'event:t1', title: '测试事件甲', date: '2026-12-01', lunar: false, icon: '🧪', color: '#dfe9db', categoryId: 'cat:all', repeat: 'none', displayMode: 'countdown', note: '', order: 0, showInTimeline: true, createdAt: 1, updatedAt: 1 },
    { id: 'event:t2', title: '测试事件乙', date: '2025-01-01', lunar: false, icon: '🧪', color: '#f0c8c4', categoryId: 'cat:misc', repeat: 'none', displayMode: 'countup', note: '', order: 1, showInTimeline: true, createdAt: 2, updatedAt: 2 },
  ],
  settings: { syncBackend: '', enabledBackends: [], autoSync: false, showFestivals: true },
}

await p.evaluateOnNewDocument((d) => {
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('daysnote.v1', JSON.stringify(d))
    localStorage.setItem('daysnote.builtinImport.v6', '1')
    localStorage.removeItem('daysnote.trash.v1')
    localStorage.removeItem('daysnote.tombstones.v1')
    localStorage.setItem('__seeded', '1')
  }
}, SEED)

await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await wait(700)

const A = []
const eq = (cond, msg) => { if (!cond) A.push('✗ ' + msg) }

// ---------- 1) 删除一条事件 → 应进回收站 ----------
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('daysnote.v1')).events.length)

await p.evaluate(() => document.querySelector('.event-card')?.click())
await wait(500)
// 详情页右上角编辑按钮（.detail-top 内的 nav-btn，非 plain 的那个）
await p.evaluate(() => {
  const btn = document.querySelector('.detail-top .nav-btn:not(.plain)')
  btn?.click()
})
await wait(500)
const hasDelete = await p.evaluate(() => !!document.querySelector('.delete-link'))
eq(hasDelete, '编辑页应有「删除这个事件」入口')
if (hasDelete) {
  await p.evaluate(() => document.querySelector('.delete-link').click())
  await wait(700)
}

const afterDelete = await p.evaluate(() => ({
  count: JSON.parse(localStorage.getItem('daysnote.v1')).events.length,
  trash: JSON.parse(localStorage.getItem('daysnote.trash.v1') || '[]'),
}))
console.log('== 删除 → 回收站 ==')
eq(afterDelete.count === before - 1, `事件应减少 1 条（${before} → ${afterDelete.count}）`)
eq(afterDelete.trash.length === 1, `回收站应有 1 条（实际 ${afterDelete.trash.length}）`)
eq(afterDelete.trash[0]?.payload?.title != null, '回收站条目应带完整内容')

// ---------- 2) 回收站页面：勾选恢复 ----------
await p.goto('http://localhost:5173/#/trash', { waitUntil: 'networkidle2' })
await wait(800)
const pageInfo = await p.evaluate(() => ({
  title: document.querySelector('.nav-title')?.textContent?.trim(),
  items: [...document.querySelectorAll('.trash-item')].map((x) => x.textContent?.trim()),
  hasRestoreBtn: [...document.querySelectorAll('button')].some((x) => /恢复选中/.test(x.textContent || '')),
}))
console.log('== 回收站页面 ==')
eq(pageInfo.title === '回收站', `页面标题应为回收站（实际 ${pageInfo.title}）`)
eq(pageInfo.items.length >= 1, `应列出回收站条目（实际 ${pageInfo.items.length}）`)
eq(pageInfo.hasRestoreBtn, '应有「恢复选中」按钮')

if (pageInfo.items.length) {
  await p.evaluate(() => document.querySelector('.trash-item')?.click())
  await wait(200)
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => /恢复选中/.test(x.textContent || ''))
    btn?.click()
  })
  await wait(900)
}
const afterRestore = await p.evaluate(() => ({
  count: JSON.parse(localStorage.getItem('daysnote.v1')).events.length,
  trash: JSON.parse(localStorage.getItem('daysnote.trash.v1') || '[]').length,
  titles: JSON.parse(localStorage.getItem('daysnote.v1')).events.map((e) => e.title),
}))
console.log('== 恢复 ==')
eq(afterRestore.count === before, `恢复后事件数应回到 ${before}（实际 ${afterRestore.count}）`)
eq(afterRestore.trash === 0, `回收站应清空（实际 ${afterRestore.trash}）`)

// ---------- 3) 侧边栏入口 ----------
await p.goto('http://localhost:5173/#/home', { waitUntil: 'networkidle2' })
await wait(600)
await p.evaluate(() => document.querySelector('.nav-menu, .navbar button')?.click())
await wait(500)
const drawer = await p.evaluate(() => ({
  hasTrashEntry: !!document.querySelector('.drawer-trash'),
  inFooter: !!document.querySelector('.drawer-footer .drawer-trash'),
  catsSeparate: !!document.querySelector('.drawer-footer'),
  text: document.querySelector('.drawer-trash')?.textContent?.trim(),
}))
console.log('== 侧边栏入口 ==')
eq(drawer.hasTrashEntry, '侧边栏应有回收站入口')
eq(drawer.inFooter, '回收站应在独立底部区域（与分类区分）')

// ---------- 4) 两个覆盖按钮 + 风险弹窗 ----------
await p.evaluate(() => document.querySelector('.drawer-mask')?.click())
await wait(300)
await p.goto('http://localhost:5173/#/settings', { waitUntil: 'networkidle2' })
await wait(700)
await p.evaluate(() => {
  const seg = [...document.querySelectorAll('.segment button')].find((x) => x.textContent.trim() === '同步')
  seg?.click()
})
await wait(500)
const btns = await p.evaluate(() => ({
  labels: [...document.querySelectorAll('.overwrite-btn b')].map((x) => x.textContent.trim()),
}))
console.log('== 覆盖按钮 ==')
eq(btns.labels.includes('本地覆盖服务器'), '应有「本地覆盖服务器」')
eq(btns.labels.includes('服务器覆盖本地'), '应有「服务器覆盖本地」')

await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.overwrite-btn')].find((x) => /本地覆盖服务器/.test(x.textContent || ''))
  btn?.click()
})
await wait(500)
const modal = await p.evaluate(() => ({
  open: !!document.querySelector('.modal-mask .risk-box'),
  text: document.querySelector('.risk-box')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  hasCancel: [...document.querySelectorAll('.modal-actions button')].some((x) => x.textContent.trim() === '取消'),
  hasConfirm: [...document.querySelectorAll('.modal-actions button')].some((x) => /确认覆盖/.test(x.textContent || '')),
}))
console.log('== 风险确认弹窗 ==')
eq(modal.open, '点击后应弹出风险提示')
eq(/不可撤销/.test(modal.text), '提示应包含「不可撤销」风险说明')
eq(/删除/.test(modal.text), '提示应说明会删除数据')
eq(modal.hasCancel && modal.hasConfirm, '弹窗应有取消与确认按钮')

eq(errs.length === 0, `不应有运行时报错（${errs.slice(0, 2).join(' | ')}）`)

if (A.length) { console.log(A.join('\n')); process.exit(1) }
console.log('全部通过')
await b.close()

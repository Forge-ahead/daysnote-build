import puppeteer from 'puppeteer-core'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const A = []
const ok = (c, m) => A.push((c ? '✓ ' : '✗ ') + m)

const NOW = Date.now()
const RECENT_DEL = NOW - 1000
const OLD_DEL = NOW - 200 * 24 * 3600 * 1000
const fresh = { _deleted: true, deletedAt: RECENT_DEL }
const expired = { _deleted: true, deletedAt: OLD_DEL }
const body = (title) => ({
  _id: '', title, date: '1993-09-14', icon: '🐱', note: '回收站测试备注',
  categoryId: 'cat:all', displayMode: 'countdown', repeat: 'yearly',
})

const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 2, isMobile: true })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

let purgeBody = null
await page.setRequestInterception(true)
page.on('request', (req) => {
  const url = req.url()
  if (!url.includes('couch.test')) return req.continue()
  const dec = decodeURIComponent(url)
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: '' })
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) })
  if (url.includes('/_changes')) {
    return json({ results: [
      { id: 'event:recent', deleted: true, changes: [{ rev: '3-new' }] },
      { id: 'event:old', deleted: true, changes: [{ rev: '2-dead' }] },
    ] })
  }
  if (url.includes('/_purge')) {
    purgeBody = JSON.parse(req.postData() || '{}')
    return json({ purged: { 'event:recent': ['3-new'] } })
  }
  if (dec.includes('event%3Arecent') || dec.includes('event:recent')) {
    if (url.includes('rev=2-b')) return json({ ...body('老婆生日'), _revisions: { start: 2, ids: ['b', 'a'] } })
    if (url.includes('revs=true')) return json({ ...fresh, _revisions: { start: 3, ids: ['new', 'b', 'a'] } })
    return json(fresh)
  }
  if (dec.includes('event%3Aold') || dec.includes('event:old')) {
    if (url.includes('rev=1-b')) return json({ ...body('旧生日'), _revisions: { start: 1, ids: ['b', 'a'] } })
    if (url.includes('revs=true')) return json({ ...expired, _revisions: { start: 2, ids: ['dead', 'b'] } })
    return json(expired)
  }
  return json({ rows: [] })
})

await page.evaluateOnNewDocument(() => {
  localStorage.setItem('daysnote.v1', JSON.stringify({
    _schema: 7, _appVersion: '2.2.0', categories: [{ id: 'cat:all', name: '全部', color: '#f3b8c2', order: 0, builtin: true }],
    events: [{ id: 'event:keep', title: '保留事件', date: '2026-01-01', icon: '📌', color: '#eee', categoryId: 'cat:all', order: 0, repeat: 'none', displayMode: 'countup', showInTimeline: true, note: '', createdAt: 1, updatedAt: 1 }], settings: {
      syncBackend: 'couchdb', enabledBackends: ['couchdb'], couchUrl: 'https://couch.test', couchDb: 'daysnote',
      autoSync: false, showFestivals: true, themeMode: 'light', backgroundStyle: 'grid',
    },
  }))
  localStorage.setItem('daysnote.builtinImport.v6', '1')
})

await page.goto('http://localhost:5173/#/trash', { waitUntil: 'networkidle2' })
await wait(1200)
const rows = await page.$$eval('.trash-cloud-item', (xs) => xs.length)
ok(rows === 2, `云端已删除条目 2 条（实际 ${rows}）`)
const expiredMark = await page.$eval('.trash-panel', (el) => el.innerText.includes('已超过 6 个月'))
ok(expiredMark, '超过 6 个月的条目显示过期标记')

// 展开第一条，验证修订链回捞的详情
await page.click('.trash-cloud-main')
await wait(700)
const detail = await page.$eval('.trash-detail', (el) => el.innerText.replace(/\s+/g, ' '))
ok(detail.includes('老婆生日'), '展开后显示删除前的事件标题')
ok(detail.includes('1993') && detail.includes('09'), '展开后显示事件日期')
ok(detail.includes('回收站测试备注'), '展开后显示备注')
ok(detail.includes('倒数'), '展开后显示显示模式')

// 永久清除：二次确认 + _purge
await page.evaluate(() => [...document.querySelectorAll('.trash-detail .ghost-btn.danger')][0]?.click())
await wait(300)
const confirmText = await page.$eval('.trash-confirm', (el) => el.innerText)
ok(confirmText.includes('无法恢复'), '永久清除前有不可恢复警告')
await page.evaluate(() => [...document.querySelectorAll('.trash-confirm .ghost-btn.danger')][0]?.click())
await wait(700)
ok(purgeBody?.docs?.['event:recent'] === '3-new', '永久清除调用 CouchDB _purge 且携带正确 rev')
const after = await page.$$eval('.trash-cloud-item', (xs) => xs.length)
ok(after === 1, `永久清除后条目从列表移除（剩 ${after} 条）`)

// 抽屉入口上移
await page.goto('http://localhost:5173/#/home', { waitUntil: 'networkidle2' })
await wait(600)
await page.evaluate(() => document.querySelector('.nav-btn.plain')?.click())
await wait(400)
const pad = await page.$eval('.drawer-footer', (el) => parseFloat(getComputedStyle(el).paddingBottom))
ok(pad >= 40, `回收站入口距底部内边距 ${pad}px（≥40px）`)

ok(errs.length === 0, '页面无脚本错误' + (errs.length ? '：' + errs.join(' | ') : ''))
console.log(A.join('\n'))
console.log(A.some((x) => x.startsWith('✗')) ? '失败' : '全部通过')
await browser.close()

import puppeteer from 'puppeteer-core'

// UI 层验证：打开 / 新增 / 修改 / 删除 都会触发一次同步写入
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })

await page.evaluateOnNewDocument(() => {
  const realFetch = window.fetch
  let remote = []
  window.__syncStats = { bulk: 0 }
  const mk = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data), headers: { get: () => null } })
  window.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method || 'GET'
    if (u.includes('/_all_docs')) return mk({ rows: remote.map((d) => ({ id: d._id, doc: d })) })
    if (u.includes('/_bulk_docs')) {
      window.__syncStats.bulk++
      const body = JSON.parse(init.body)
      for (const d of body.docs) {
        if (d._deleted) { remote = remote.filter((x) => x._id !== d._id); continue }
        const i = remote.findIndex((x) => x._id === d._id)
        if (i >= 0) remote[i] = { ...d }; else remote.push({ ...d })
      }
      return mk(body.docs.map((d) => ({ id: d._id, ok: true })))
    }
    return realFetch(url, init)
  }

  const settings = {
    enabledBackends: ['couchdb'], syncBackend: 'couchdb',
    couchUrl: 'http://mock', couchDb: 'daysnote', couchUser: '', couchPassword: '',
    webdavUrl: '', webdavUser: '', webdavPassword: '', backupFolder: '', autoBackup: false,
    aiBaseUrl: '', aiKey: '', aiModel: '', autoSync: true,
  }
  localStorage.setItem('daysnote.v1', JSON.stringify({
    categories: [{ id: 'cat:all', name: '全部', color: '#e3e9d5', order: 0, builtin: true, updatedAt: 1000 }],
    events: [{ id: 'event:seed', title: '原始事件', date: '2026-12-25', lunar: false, categoryId: 'cat:all', icon: '🎂', color: '#fff', note: '', order: 0, repeat: 'none', createdAt: 1000, updatedAt: 1000 }],
    settings,
  }))
  localStorage.removeItem('daysnote.syncbase.v1')
  localStorage.removeItem('daysnote.tombstones.v1')
  localStorage.removeItem('daysnote.lastBackup.v1')
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = (text) => page.evaluate((t) => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t))
  if (btn) btn.click()
  return Boolean(btn)
}, text)
const editTab = async () => {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '内容')
    if (b) b.click()
  })
  await wait(200)
}
const openEditFromDetail = async () => {
  // 新增/保存后 eventId 已写入 App 状态，直接切 hash 进入同一事件的编辑页
  await page.evaluate(() => { location.hash = '/edit' })
  await wait(400)
}

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await wait(1500)
const afterOpen = await page.evaluate(() => window.__syncStats.bulk)

// 新增
await page.evaluate(() => { location.hash = '/edit' })
await wait(300)
await editTab()
await page.type('input[placeholder="例如：周年庆"]', '自动同步测试事件')
await clickText('创建事件')
await wait(1500)
const afterAdd = await page.evaluate(() => window.__syncStats.bulk)

// 修改
await openEditFromDetail()
await editTab()
await page.click('input[placeholder="例如：周年庆"]', { clickCount: 3 })
await page.keyboard.press('Backspace')
await page.type('input[placeholder="例如：周年庆"]', '已修改标题')
await clickText('保存修改')
await wait(1500)
const afterUpdate = await page.evaluate(() => window.__syncStats.bulk)

// 删除
await openEditFromDetail()
await page.evaluate(() => {
  const b = document.querySelector('.delete-link')
  if (b) b.click()
})
await wait(1500)
const afterDelete = await page.evaluate(() => window.__syncStats.bulk)

const out = {
  afterOpen, afterAdd, afterUpdate, afterDelete,
  openTriggered: afterOpen >= 1,
  addTriggered: afterAdd > afterOpen,
  updateTriggered: afterUpdate > afterAdd,
  deleteTriggered: afterDelete > afterUpdate,
}
console.log(JSON.stringify(out, null, 2))
await browser.close()

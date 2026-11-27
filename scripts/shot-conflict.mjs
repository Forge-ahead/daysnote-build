import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage()
await p.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })

await p.evaluateOnNewDocument(() => {
  const seed = [{ id: 'event:a', title: '示例纪念日', date: '2020-05-20', lunar: false, categoryId: 'cat:love', icon: '💕', color: '#f0c8c4', note: '永远快乐', order: 0, repeat: 'yearly', createdAt: 1000, updatedAt: 2000 }]
  const cats = [
    { id: 'cat:all', name: '全部', color: '#a8d3d2', order: 0, builtin: true, updatedAt: 1 },
    { id: 'cat:love', name: '纪念日', color: '#f3b8c2', order: 1, updatedAt: 1 },
  ]
  localStorage.setItem('daysnote.v1', JSON.stringify({
    categories: cats, events: seed,
    settings: { syncBackend: 'couchdb', couchUrl: 'http://mock', couchDb: 'daysnote', couchUser: '', couchPassword: '', webdavUrl: '', webdavUser: '', webdavPassword: '', aiBaseUrl: '', aiKey: '', aiModel: '', autoSync: false },
  }))
  const stable = (v) => Array.isArray(v) ? v.map(stable) : (v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o }, {}) : v)
  const hash = (doc) => { const { _rev, updatedAt, ...rest } = doc; const j = JSON.stringify(stable(rest)); let h = 0; for (let i = 0; i < j.length; i++) h = (h * 31 + j.charCodeAt(i)) | 0; return h + ':' + j.length }
  const old = { ...seed[0], title: '原标题', updatedAt: 1000 }
  localStorage.setItem('daysnote.syncbase.v1', JSON.stringify({ 'event:a': { hash: hash(old), updatedAt: 1000 } }))
  localStorage.removeItem('daysnote.tombstones.v1')
  const remote = [{ _id: 'event:a', id: 'event:a', title: '示例纪念日（对方设备修改）', date: '2020-05-20', lunar: false, categoryId: 'cat:love', icon: '💕', color: '#f0c8c4', note: '', order: 0, repeat: 'yearly', createdAt: 1000, updatedAt: 3000, _rev: '1-x' }]
  const real = window.fetch.bind(window)
  window.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET'
    const mk = (d, ok = true, st = 200) => ({ ok, status: st, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } })
    if (u.includes('/_all_docs')) return mk({ rows: remote.map(d => ({ id: d._id, doc: d })) })
    if (u.includes('/_bulk_docs')) return mk([])
    if (u.endsWith('/daysnote') && m === 'GET') return mk({ db_name: 'daysnote' })
    return real(url, init)
  }
})

await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 600))
await p.evaluate(() => { location.hash = '#/settings' })
await new Promise(r => setTimeout(r, 300))
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('立即同步'))
  btn?.click()
})
await new Promise(r => setTimeout(r, 700))
await p.screenshot({ path: 'previews/v4-conflict.png' })
console.log('saved v4-conflict.png')
await b.close()

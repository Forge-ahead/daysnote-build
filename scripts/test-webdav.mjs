import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 500))

const result = await p.evaluate(async () => {
  const { syncAll } = await import('/src/sync.ts')
  let file = { docs: [], updatedAt: 0 }
  let etag = '"v1"'
  const realFetch = window.fetch
  window.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET'
    const mk = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data), headers: { get: (k) => k === 'ETag' ? etag : null } })
    if (method === 'GET') return mk(file)
    if (method === 'PUT') {
      if (init.headers?.['If-Match'] && init.headers['If-Match'] !== etag) return mk({}, false, 412)
      file = JSON.parse(init.body)
      etag = '"v' + (Date.now()) + '"'
      return mk({}, true, 204)
    }
    return realFetch(url, init)
  }
  const s = { syncBackend: 'webdav', couchUrl: '', couchDb: '', couchUser: '', couchPassword: '',
    webdavUrl: 'http://mock/daysnote.json', webdavUser: '', webdavPassword: '',
    aiBaseUrl: '', aiKey: '', aiModel: '', autoSync: false }
  const out = {}
  const ev = (id, title, ts) => ({ _id: `event:${id}`, id: `event:${id}`, title, date: '2026-01-01', lunar: false, categoryId: 'cat:all', icon: '🎉', color: '#fff', note: '', order: 0, repeat: 'none', createdAt: ts, updatedAt: ts })

  let base = {}
  let local = [ev('x', '初始', 1000)]
  let r = await syncAll(s, local, base)
  base = r.base
  out.push = { pushed: r.pushed, fileDocs: file.docs.length, etagPresent: Boolean(etag) }

  // 远端被另一台设备改
  file = { docs: [{ ...ev('x', '远端改', 2000) }], updatedAt: 2000 }
  etag = '"remote"'
  local = [ev('x', '初始', 1000)]
  r = await syncAll(s, local, base)
  base = r.base
  out.pull = { pulled: r.pulled, merged: r.docs[0].title }

  // 双方改 → 冲突
  file = { docs: [{ ...ev('x', '远端又改', 3000) }], updatedAt: 3000 }
  local = [ev('x', '本地又改', 3000)]
  r = await syncAll(s, local, base)
  out.conflict = { count: r.conflicts.length, remoteAfter: file.docs[0].title }

  window.fetch = realFetch
  return out
})
console.log(JSON.stringify(result, null, 2))
await b.close()

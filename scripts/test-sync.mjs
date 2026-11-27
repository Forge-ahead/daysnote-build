import puppeteer from 'puppeteer-core'

// 用内存 mock 模拟远程后端，通过覆盖 window.fetch 拦截 /_all_docs 等请求
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 500))

const result = await p.evaluate(async () => {
  // 动态 import 打包后的同步模块不可行（生产构建），改为在页面内重写一份最小实现测试核心算法
  // 直接读取源码模块：开发服务器下可通过 /src/sync.ts 动态导入
  const mod = await import('/src/sync.ts')
  const { syncAll, docHash, loadBase, saveBase } = mod

  // ---- mock fetch：内存 CouchDB ----
  let remote = []
  const realFetch = window.fetch
  window.fetch = async (url, init = {}) => {
    const u = String(url)
    const method = init.method || 'GET'
    const mk = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data), headers: { get: () => null } })
    if (u.includes('/_all_docs')) return mk({ rows: remote.map(d => ({ id: d._id, doc: d })) })
    if (u.includes('/_bulk_docs')) {
      const body = JSON.parse(init.body)
      for (const d of body.docs) {
        if (d._deleted) { remote = remote.filter(x => x._id !== d._id); continue }
        const i = remote.findIndex(x => x._id === d._id)
        if (i >= 0) remote[i] = d; else remote.push(d)
      }
      return mk(body.docs.map(d => ({ id: d._id, ok: true })))
    }
    if (u.endsWith('/daysnote') && method === 'GET') return mk({ db_name: 'daysnote' })
    return realFetch(url, init)
  }

  const settings = {
    syncBackend: 'couchdb', couchUrl: 'http://mock', couchDb: 'daysnote',
    couchUser: '', couchPassword: '', webdavUrl: '', webdavUser: '', webdavPassword: '',
    aiBaseUrl: '', aiKey: '', aiModel: '', autoSync: false,
  }
  const out = {}
  const ev = (id, title, date, ts) => ({ _id: `event:${id}`, id: `event:${id}`, title, date, lunar: false, categoryId: 'cat:all', icon: '🎉', color: '#fff', note: '', order: 0, repeat: 'none', createdAt: ts, updatedAt: ts })

  // 1) 首次同步：本地 2 条推上去
  localStorage.removeItem('daysnote.syncbase.v1')
  let base = {}
  let local = [ev('a', '生日', '2026-01-01', 1000), ev('b', '考试', '2026-06-01', 1000)]
  let r = await syncAll(settings, local, base)
  base = r.base
  out.firstPush = { pushed: r.pushed, conflicts: r.conflicts.length, remoteCount: remote.length }

  // 2) 本地改 a，远端未改 → 自动 push
  local = [ev('a', '生日（本地改）', '2026-01-01', 2000), ev('b', '考试', '2026-06-01', 1000)]
  r = await syncAll(settings, local, base)
  base = r.base
  out.localOnly = { pushed: r.pushed, conflicts: r.conflicts.length, remoteA: remote.find(x => x._id.endsWith(':a')).title }

  // 3) 远端改 b（模拟另一设备），本地未改 → 自动 pull
  remote = remote.map(d => d._id.endsWith(':b') ? { ...d, title: '考试（远端改）', updatedAt: 3000 } : d)
  local = [ev('a', '生日（本地改）', '2026-01-01', 2000), ev('b', '考试', '2026-06-01', 1000)]
  r = await syncAll(settings, local, base)
  base = r.base
  out.remoteOnly = { pulled: r.pulled, conflicts: r.conflicts.length, mergedB: r.docs.find(x => x._id.endsWith(':b')).title }

  // 4) 双方同时改 a，内容不同 → 冲突
  remote = remote.map(d => d._id.endsWith(':a') ? { ...d, title: '生日（远端又改）', updatedAt: 4000 } : d)
  local = [ev('a', '生日（本地又改）', '2026-01-01', 4000), ev('b', '考试（远端改）', '2026-06-01', 3000)]
  r = await syncAll(settings, local, base)
  base = r.base
  out.conflict = { conflicts: r.conflicts.length, title: r.conflicts[0]?.title, keptLocal: r.docs.find(x => x._id.endsWith(':a')).title }

  // 5) 裁决：保留远程
  out.beforeResolveRemoteA = remote.find(x => x._id.endsWith(':a')).title
  out.beforeResolveLocalA = local.find(x => x._id.endsWith(':a')).title
  r = await syncAll(settings, local, base, { 'event:a': 'remote' })
  base = r.base  // 裁决后 base 更新为远程版本
  out.resolvedRemote = { conflicts: r.conflicts.length, mergedA: r.docs.find(x => x._id.endsWith(':a')).title, remoteA: remote.find(x => x._id.endsWith(':a')).title }

  // 6) 删除同步：本地删 a → 远端也应删（tombstone）
  local = local.filter(x => !x._id.endsWith(':a'))
  const tombs = ['event:a']
  r = await syncAll(settings, local, base, {}, tombs)
  out.deleted = { remoteHasA: remote.some(x => x._id.endsWith(':a')) }

  window.fetch = realFetch
  return out
})

console.log(JSON.stringify(result, null, 2))
await b.close()

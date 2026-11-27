import puppeteer from 'puppeteer-core'

// 综合测试：双后端并存 / CouchDB 优先 / 版本控制 / 月度备份
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 500))

const result = await page.evaluate(async () => {
  const mod = await import('/src/sync.ts')
  const { syncAll, backupDue, runBackup, docHash } = mod

  let couchRemote = []
  let davRemote = []
  let davWrites = 0
  const backupCalls = []

  const mk = (data, ok = true, status = 200, etag = null) => ({
    ok, status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: { get: (k) => (k.toLowerCase() === 'etag' ? etag : null) },
  })

  const realFetch = window.fetch
  window.fetch = async (url, init = {}) => {
    const u = String(url)
    const method = init.method || 'GET'
    if (u.includes('/_all_docs')) return mk({ rows: couchRemote.map((d) => ({ id: d._id, doc: d })) })
    if (u.includes('/_bulk_docs')) {
      const body = JSON.parse(init.body)
      for (const d of body.docs) {
        if (d._deleted) { couchRemote = couchRemote.filter((x) => x._id !== d._id); continue }
        const i = couchRemote.findIndex((x) => x._id === d._id)
        if (i >= 0) couchRemote[i] = { ...d }; else couchRemote.push({ ...d })
      }
      return mk(body.docs.map((d) => ({ id: d._id, ok: true })))
    }
    if (u.includes('/backups/') && method === 'PUT') {
      backupCalls.push({ url: u, body: JSON.parse(init.body) })
      return mk({}, true, 201)
    }
    if (u === 'http://mockdav/data.json' && method === 'GET') return mk({ docs: davRemote, updatedAt: Date.now() }, true, 200, 'etag-1')
    if (u === 'http://mockdav/data.json' && method === 'PUT') {
      davRemote = JSON.parse(init.body).docs
      davWrites++
      return mk({}, true, 204)
    }
    if (u.endsWith('/daysnote') && method === 'GET') return mk({ db_name: 'daysnote' })
    return realFetch(url, init)
  }

  const settings = {
    enabledBackends: ['couchdb', 'webdav'],
    syncBackend: 'couchdb',
    couchUrl: 'http://mock', couchDb: 'daysnote', couchUser: '', couchPassword: '',
    webdavUrl: 'http://mockdav/data.json', webdavUser: '', webdavPassword: '',
    backupFolder: 'http://mockdav/backups/',
    autoBackup: true, autoSync: false,
    aiBaseUrl: '', aiKey: '', aiModel: '',
  }

  const ev = (id, title, ts) => ({
    _id: `event:${id}`, id: `event:${id}`, title, date: '2026-01-01', lunar: false,
    categoryId: 'cat:all', icon: '🎉', color: '#fff', note: '', order: 0,
    repeat: 'none', createdAt: ts, updatedAt: ts,
  })
  const get = (docs, id) => docs.find((x) => x._id === `event:${id}`)?.title

  const out = {}

  // 1) 首次同步：本地两条同时写入两个后端
  localStorage.removeItem('daysnote.syncbase.v1')
  let base = {}
  let local = [ev('a', '生日', 1000), ev('b', '考试', 1000)]
  let r = await syncAll(settings, local, base)
  base = r.base
  out.step1_dualWrite = { couch: couchRemote.length, dav: davRemote.length, pushed: r.pushed, conflicts: r.conflicts.length }

  // 2) CouchDB 与 WebDAV 内容冲突（DAV 时间更晚）→ CouchDB 覆盖 WebDAV
  couchRemote = couchRemote.map((d) => d._id.endsWith(':a') ? { ...d, title: 'Couch版', updatedAt: 2000 } : d)
  davRemote = davRemote.map((d) => d._id.endsWith(':a') ? { ...d, title: 'DAV版', updatedAt: 3000 } : d)
  local = [ev('a', '旧本地', 1000), ev('b', '考试', 1000)]
  r = await syncAll(settings, local, base)
  base = r.base
  out.step2_couchWins = {
    couchWins: r.couchWins,
    mergedA: get(r.docs, 'a'),
    davA: get(davRemote, 'a'),
    davWasOverwritten: get(davRemote, 'a') === 'Couch版',
    conflicts: r.conflicts.length,
  }

  // 3) 版本控制：本地离线修改（updatedAt 更大）→ 下次同步保留本地新版
  local = [ev('a', '本地离线新版', 5000), ev('b', '考试', 1000)]
  r = await syncAll(settings, local, base)
  base = r.base
  out.step3_versionControl = {
    mergedA: get(r.docs, 'a'),
    couchA: get(couchRemote, 'a'),
    davA: get(davRemote, 'a'),
    keptNewerLocal: get(r.docs, 'a') === '本地离线新版',
  }

  // 4) 真冲突：双方同版本号、内容不同 → 列出冲突且不覆盖远端
  couchRemote = couchRemote.map((d) => d._id.endsWith(':a') ? { ...d, title: '远端6000', updatedAt: 6000 } : d)
  davRemote = davRemote.map((d) => d._id.endsWith(':a') ? { ...d, title: '远端6000', updatedAt: 6000 } : d)
  local = [ev('a', '本地6000', 6000), ev('b', '考试', 1000)]
  r = await syncAll(settings, local, base)
  out.step4_realConflict = {
    conflicts: r.conflicts.length,
    title: r.conflicts[0]?.title,
    remoteUntouched: get(couchRemote, 'a') === '远端6000',
  }

  // 5) 月度备份：日期文件名 / 指定目录 / 精简字段
  localStorage.removeItem('daysnote.lastBackup.v1')
  const dueBefore = backupDue()
  const bk = await runBackup(
    settings,
    [{ id: 'cat:all', name: '全部', color: '#fff', order: 0, updatedAt: 999, _rev: '2-abc' }],
    [ev('a', '备份事件', 7000)],
  )
  const call = backupCalls[0] || {}
  out.step5_backup = {
    dueBefore,
    ok: bk.ok,
    message: bk.message,
    url: call.url,
    filenameIsDate: /\/backups\/\d{4}-\d{2}-\d{2}\.json$/.test(call.url || ''),
    categoryKeys: Object.keys(call.body?.categories?.[0] || {}),
    eventKeys: Object.keys(call.body?.events?.[0] || {}),
    hasNoRev: !JSON.stringify(call.body || {}).includes('_rev'),
    hasNoSyncMeta: !JSON.stringify(call.body || {}).includes('updatedAtLocal'),
    payloadKB: (JSON.stringify(call.body || '').length / 1024).toFixed(2),
    dueAfter: backupDue(),
  }

  window.fetch = realFetch
  return out
})

console.log(JSON.stringify(result, null, 2))
await browser.close()

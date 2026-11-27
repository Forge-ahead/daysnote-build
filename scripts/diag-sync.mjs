/**
 * 同步诊断：复现「云端有数据但拉不下来」的两条可疑路径
 * 1) v28 的 tombstone 清理逻辑会不会把云端文档标记删除
 * 2) 云端 _id 不以 event:/category: 开头时会不会被本地静默丢弃
 */
import { createRequire } from 'module'
const require = createRequire('/workspace/countdown-app/')
const puppeteer = require('puppeteer-core')

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
})
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const out = await p.evaluate(async () => {
  const sync = await import('/src/sync.ts')

  const settings = {
    couchUrl: 'https://example.com:5984', couchDb: 'daysnote', couchUser: 'u', couchPassword: 'p',
    webdavUrl: '', webdavUser: '', webdavPassword: '', enabledBackends: ['couchdb'],
    autoSync: true, autoBackup: false, backupFolder: '', syncBackend: 'couchdb',
  }

  // 捕获写入到 CouchDB 的内容
  let written = []
  const realFetch = window.fetch
  window.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('_bulk_docs')) {
      written.push(JSON.parse(init.body))
      return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    if (u.includes('_all_docs')) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('{}', { status: 200 })
  }
  // 用自定义 driver 不好注入，改为直接 mock _all_docs 返回云端数据
  const cloudDocs = [
    { _id: 'event:bi:birthday', _rev: '1-a', title: '生日', date: '1993-09-14', repeat: 'yearly', updatedAt: 1000 },
    { _id: 'event:bi:marriage', _rev: '1-b', title: '结婚纪念日', date: '2026-08-05', repeat: 'none', updatedAt: 1000 },
    { _id: 'event:bi:lianjia', _rev: '1-c', title: '入职链家', date: '2021-03-28', repeat: 'none', updatedAt: 1000 },
  ]
  window.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('_bulk_docs')) {
      written.push(JSON.parse(init.body))
      return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    if (u.includes('_all_docs')) {
      return new Response(JSON.stringify({ rows: cloudDocs.map((d) => ({ id: d._id, doc: d })) }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200 })
  }

  const local = [{ _id: 'event:bi:together', title: '在一起', date: '2019-11-04', repeat: 'none', updatedAt: 2000 }]

  // 场景 A：本地已升级到 v28（对已删内置事件带 tombstone）
  const tombstones = ['event:bi:birthday', 'event:bi:marriage', 'event:bi:lianjia']
  const a = await sync.syncAll(settings, local, {}, {}, tombstones)
  const aWrite = written[written.length - 1] || { docs: [] }

  // 场景 B：没有 tombstone（全新安装），看是否能正常拉取
  written = []
  const bRes = await sync.syncAll(settings, local, {}, {}, [])

  window.fetch = realFetch

  return {
    caseA: {
      pulled: a.pulled, pushed: a.pushed, appliedDeletes: a.appliedDeletes,
      docsAfter: a.docs.map((d) => d._id),
      cloudDeletes: (aWrite.docs || []).filter((d) => d._deleted).map((d) => d._id),
    },
    caseB: {
      pulled: bRes.pulled, pushed: bRes.pushed, appliedDeletes: bRes.appliedDeletes,
      docsAfter: bRes.docs.map((d) => d._id),
    },
  }
})

console.log(JSON.stringify(out, null, 2))
await b.close()

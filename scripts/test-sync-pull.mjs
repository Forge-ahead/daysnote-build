/**
 * v29 同步回归：云端已有的记录必须能拉下来，绝不能被本地删除标记抹掉
 *
 * 复现的线上问题：v28 把「清理本地内置事件」做成了「连云端一起删」，
 * 用户点同步后 pulled=0，云端文档被写 _deleted。
 */
import puppeteer from 'puppeteer-core'

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await b.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const out = await page.evaluate(async () => {
  const sync = await import('/src/sync.ts')
  const mig = await import('/src/migrate.ts')

  const settings = {
    couchUrl: 'https://example.com:5984', couchDb: 'daysnote', couchUser: 'u', couchPassword: 'p',
    webdavUrl: '', webdavUser: '', webdavPassword: '', enabledBackends: ['couchdb'],
    autoSync: true, autoBackup: false, backupFolder: '', syncBackend: 'couchdb',
  }

  const cloudDocs = [
    { _id: 'event:bi:birthday', _rev: '1-a', title: '旧版倒数事件', date: '2020-01-01', repeat: 'yearly', updatedAt: 1000 },
    { _id: 'event:bi:joinlianjia', _rev: '1-b', title: '旧版正数事件', date: '2021-03-28', repeat: 'none', updatedAt: 1000 },
    { _id: 'abc123', _rev: '1-c', title: '无前缀id的事件', date: '2022-02-02', repeat: 'none', updatedAt: 1000 },
  ]

  let written = []
  const realFetch = window.fetch
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

  // 场景 1：设备上残留 v28 的删除标记（模拟已经升级过 v28 的用户）
  // 注意：v29 启动时 store 会清掉这批标记，这里直接传空 tombstone 验证合并行为
  const clean = await sync.syncAll(settings, local, {}, {}, [])
  const cleanWrite = written[written.length - 1] || { docs: [] }

  // 场景 2：极端情况——即使带上了这些删除标记，也不能把云端整片删掉
  written = []
  const legacyTombs = ['event:bi:birthday', 'event:bi:joinlianjia']
  const withTomb = await sync.syncAll(settings, local, {}, {}, legacyTombs)

  window.fetch = realFetch

  return {
    clean: {
      pulled: clean.pulled,
      ids: clean.docs.map((d) => d._id).sort(),
      cloudDeletes: (cleanWrite.docs || []).filter((d) => d._deleted).map((d) => d._id),
    },
    legacy: {
      pulled: withTomb.pulled,
      appliedDeletes: withTomb.appliedDeletes,
    },
    // 迁移层：v28 名单里的用户事件不能再被判为「应删除」；只有伪事件「今年剩余」例外
    migrateKeeps: ['event:bi:birthday', 'event:bi:joinlianjia', 'event:bi:marriage']
      .map((id) => mig.migrateEvent({ id, title: 'x', date: '2020-01-01' }, 0))
      .every((x) => x !== null),
    pseudoRemoved: mig.migrateEvent({ id: 'event:bi:yearleft', title: '今年剩余', date: '2020-12-31' }, 0) === null,
    prefixless: (() => {
      const m = mig.migrateEvent({ id: 'abc123', title: '无前缀', date: '2022-02-02' }, 0)
      return { id: m?.id, repeat: m?.repeat, displayMode: m?.displayMode, showInTimeline: m?.showInTimeline }
    })(),
  }
})

const A = []
const eq = (cond, msg) => { if (!cond) A.push('✗ ' + msg) }

console.log('== 云端已有记录必须能拉下来 ==')
eq(out.clean.pulled === 3, `应拉取 3 条（实际 ${out.clean.pulled}）`)
eq(out.clean.cloudDeletes.length === 0, `不得向云端写入任何删除（实际 ${JSON.stringify(out.clean.cloudDeletes)}）`)
eq(out.clean.ids.includes('event:bi:birthday'), '云端倒数事件应合并进本地')
eq(out.clean.ids.includes('abc123'), '无前缀 _id 的事件应保留')

console.log('== 迁移层不再丢弃旧内置 id ==')
eq(out.migrateKeeps, 'v28 名单里的用户事件不能再被判为应删除')
eq(out.pseudoRemoved, '伪事件「今年剩余」仍应从事件列表移除（由首页 hero 动态展示）')

console.log('== 无前缀 _id 的事件字段应被补全 ==')
eq(out.prefixless.repeat === 'none', 'repeat 应补 none')
eq(out.prefixless.displayMode === 'countup', 'displayMode 应推断为 countup')
eq(out.prefixless.showInTimeline === true, 'showInTimeline 应补 true')

console.log('== 删除通道仍然有效（用户主动删事件要能同步到云端）==')
eq(out.legacy.appliedDeletes.length === 2, '用户主动删除的标记仍应生效；v29 的防线是「不再自动产生这类标记」')

if (A.length) { console.log(A.join('\n')); process.exit(1) }
console.log('全部通过')
await b.close()

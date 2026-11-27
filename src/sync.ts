import type { AppSettings, ConflictItem, SyncBackend, SyncBase } from './types'

/** 远端读取结果：文档数组 + 后端版本令牌（CouchDB 不用，WebDAV 用 ETag） */
export type RemoteState = { docs: any[]; token?: string }

/** 同步后端接口：只负责远程读写，冲突判定在统一的 syncAll 里做 */
export interface SyncBackendDriver {
  configure(s: AppSettings): boolean
  test(s: AppSettings): Promise<{ ok: boolean; message: string }>
  read(s: AppSettings): Promise<RemoteState>
  write(s: AppSettings, docs: any[], token?: string): Promise<void>
  remove(s: AppSettings, id: string, rev?: string): Promise<void>
}

/** 内容指纹：忽略 _rev / updatedAt / _deleted 等元数据，只比较业务字段 */
export function docHash(doc: any): string {
  const { _rev, updatedAt, _deleted, deletedAt, ...rest } = doc || {}
  const stable = (v: any): any => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((o: any, k) => { o[k] = stable(v[k]); return o }, {})
    }
    return v
  }
  const json = JSON.stringify(stable(rest))
  let h = 0
  for (let i = 0; i < json.length; i++) { h = (h * 31 + json.charCodeAt(i)) | 0 }
  return `${h}:${json.length}`
}

function basic(s: AppSettings, user: string, pass: string): string {
  if (!user) return ''
  return 'Basic ' + btoa(unescape(encodeURIComponent(`${user}:${pass}`)))
}

// ---------------- CouchDB ----------------
const couch: SyncBackendDriver = {
  configure: (s) => Boolean(s.couchUrl.trim() && s.couchDb.trim()),
  async test(s) {
    const base = s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
    const h: any = { 'Content-Type': 'application/json', ...(basic(s, s.couchUser, s.couchPassword) ? { Authorization: basic(s, s.couchUser, s.couchPassword) } : {}) }
    try {
      const r = await fetch(base, { headers: h })
      if (r.ok) return { ok: true, message: 'CouchDB 连接成功' }
      if (r.status === 404) {
        const c = await fetch(base, { method: 'PUT', headers: h })
        return c.ok || c.status === 201 || c.status === 412 ? { ok: true, message: '数据库已创建' } : { ok: false, message: `创建失败 ${c.status}` }
      }
      return { ok: false, message: `CouchDB ${r.status}` }
    } catch (e: any) { return { ok: false, message: e?.message || String(e) } }
  },
  async read(s) {
    const base = s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
    const r = await fetch(base + '/_all_docs?include_docs=true', {
      headers: basic(s, s.couchUser, s.couchPassword) ? { Authorization: basic(s, s.couchUser, s.couchPassword) } : {},
    })
    if (!r.ok) throw new Error(`CouchDB 读取失败 ${r.status}`)
    const data = await r.json()
    const docs = (data.rows || [])
      .filter((x: any) => x.doc && !String(x.id).startsWith('_design/') && !x.doc._deleted)
      .map((x: any) => x.doc)
    return { docs }
  },
  async write(s, docs) {
    if (!docs.length) return
    const base = s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
    const r = await fetch(base + '/_bulk_docs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(basic(s, s.couchUser, s.couchPassword) ? { Authorization: basic(s, s.couchUser, s.couchPassword) } : {}),
      },
      body: JSON.stringify({ docs }),
    })
    if (!r.ok) throw new Error(`CouchDB 写入失败 ${r.status}: ${(await r.text()).slice(0, 120)}`)
  },
  async remove(s, id, rev) {
    if (!rev) return
    const base = s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
    await fetch(`${base}/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`, {
      method: 'DELETE',
      headers: basic(s, s.couchUser, s.couchPassword) ? { Authorization: basic(s, s.couchUser, s.couchPassword) } : {},
    }).catch(() => {})
  },
}

// ---------------- WebDAV ----------------
const webdav: SyncBackendDriver = {
  configure: (s) => Boolean(s.webdavUrl.trim()),
  async test(s) {
    try {
      const r = await fetch(s.webdavUrl, {
        headers: basic(s, s.webdavUser, s.webdavPassword) ? { Authorization: basic(s, s.webdavUser, s.webdavPassword) } : {},
      })
      if (r.ok) return { ok: true, message: 'WebDAV 连接成功' }
      if (r.status === 404) {
        const c = await fetch(s.webdavUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(basic(s, s.webdavUser, s.webdavPassword) ? { Authorization: basic(s, s.webdavUser, s.webdavPassword) } : {}),
          },
          body: JSON.stringify({ docs: [], updatedAt: Date.now() }),
        })
        return c.ok || c.status === 201 || c.status === 204 ? { ok: true, message: 'WebDAV 数据文件已创建' } : { ok: false, message: `创建失败 ${c.status}` }
      }
      return { ok: false, message: `WebDAV ${r.status}` }
    } catch (e: any) { return { ok: false, message: e?.message || String(e) } }
  },
  async read(s) {
    const r = await fetch(s.webdavUrl, {
      headers: basic(s, s.webdavUser, s.webdavPassword) ? { Authorization: basic(s, s.webdavUser, s.webdavPassword) } : {},
    })
    if (r.status === 404) return { docs: [] }
    if (!r.ok) throw new Error(`WebDAV 读取失败 ${r.status}`)
    const data = await r.json().catch(() => ({}))
    return { docs: Array.isArray(data.docs) ? data.docs : [], token: r.headers.get('ETag') || undefined }
  },
  async write(s, docs, token) {
    const headers: any = {
      'Content-Type': 'application/json',
      ...(basic(s, s.webdavUser, s.webdavPassword) ? { Authorization: basic(s, s.webdavUser, s.webdavPassword) } : {}),
    }
    if (token) headers['If-Match'] = token
    const r = await fetch(s.webdavUrl, { method: 'PUT', headers, body: JSON.stringify({ docs, updatedAt: Date.now() }) })
    if (!r.ok) throw new Error(`WebDAV 写入失败 ${r.status}（数据可能已被其他设备修改，请重试）`)
  },
  async remove() { /* WebDAV 通过整体 write 覆盖完成删除 */ },
}

const drivers: Record<SyncBackend, SyncBackendDriver> = { couchdb: couch, webdav }

/** 当前启用的后端（兼容旧版 syncBackend 单选字段） */
export function enabledBackends(s: AppSettings): SyncBackend[] {
  if (Array.isArray(s.enabledBackends) && s.enabledBackends.length) return s.enabledBackends.filter((b) => drivers[b].configure(s))
  const legacy = s.syncBackend ? [s.syncBackend] : (['couchdb', 'webdav'] as SyncBackend[])
  return legacy.filter((b) => drivers[b].configure(s))
}

export function isConfigured(s: AppSettings): boolean {
  return enabledBackends(s).length > 0
}

export function testBackend(s: AppSettings, b: SyncBackend) {
  return drivers[b].test(s)
}

/** 读取 CouchDB 对应数据库-info：体积（active/disk 字节）与文档数。失败返回 null。 */
export async function getCouchDbInfo(s: AppSettings): Promise<{ active: number; disk: number; docCount: number; delCount: number } | null> {
  if (!couch.configure(s)) return null
  const base = s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
  try {
    const auth = basic(s, s.couchUser, s.couchPassword)
    const headers: Record<string, string> = auth ? { Authorization: auth } : {}
    const r = await fetch(base, { headers })
    if (!r.ok) return null
    const d = await r.json()
    return {
      active: Number(d?.sizes?.active || 0),
      disk: Number(d?.sizes?.disk || 0),
      docCount: Number(d?.doc_count || 0),
      // 已删除文档仍计入 doc_count，单独列出避免「库里有记录却拉不到」的误解
      delCount: Number(d?.doc_del_count || 0),
    }
  } catch { return null }
}

/** 把字节数格式化为可读体积（B/KB/MB/GB） */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / Math.pow(1024, i)
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export async function testConnection(s: AppSettings): Promise<{ ok: boolean; message: string }> {
  const list = enabledBackends(s)
  if (!list.length) return { ok: false, message: '尚未配置任何后端' }
  const results = await Promise.all(list.map(async (b) => ({ b, r: await drivers[b].test(s) })))
  const parts = results.map(({ b, r }) => `${b === 'couchdb' ? 'CouchDB' : 'WebDAV'}：${r.message}`)
  const ok = results.every((x) => x.r.ok)
  return { ok, message: parts.join('；') }
}

export function deleteRemote(s: AppSettings, id: string, rev?: string) {
  return Promise.all(enabledBackends(s).map((b) => drivers[b].remove(s, id, rev)))
}

// ==================== 云端已删除 / 强制覆盖 ====================

const couchBase = (s: AppSettings) => s.couchUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(s.couchDb)
const couchHeaders = (s: AppSettings): Record<string, string> => {
  const b = basic(s, s.couchUser, s.couchPassword)
  return b ? { Authorization: b } : {}
}

/**
 * 列出云端被标记删除（_deleted）的文档。
 * CouchDB 的 _all_docs 不会返回它们，只能从 _changes 里捡出来。
 * WebDAV 是整文件覆盖，没有「删除标记」概念，返回空。
 */
export type RemoteDeleted = { id: string; rev: string; deletedAt?: number }

export async function listRemoteDeleted(s: AppSettings): Promise<RemoteDeleted[]> {
  if (!s.enabledBackends?.includes('couchdb') && s.syncBackend !== 'couchdb') return []
  if (!couch.configure(s)) return []
  const r = await fetch(couchBase(s) + '/_changes?since=0&style=all_docs', { headers: couchHeaders(s) })
  if (!r.ok) throw new Error(`读取云端变更失败 ${r.status}`)
  const data = await r.json()
  const list: RemoteDeleted[] = (data.results || [])
    .filter((c: any) => c.deleted && !String(c.id).startsWith('_design/'))
    .map((c: any) => ({ id: c.id, rev: c.changes?.[0]?.rev || '' }))
    .filter((x: RemoteDeleted) => x.rev)

  // 删除标记本身可以带业务字段。v31 起我们写入 deletedAt，
  // 这样回收站能按「删除时间」计算 6 个月保留期（旧标记没有该字段，显示未知）。
  await Promise.all(list.map(async (x) => {
    try {
      const rr = await fetch(`${couchBase(s)}/${encodeURIComponent(x.id)}?rev=${encodeURIComponent(x.rev)}`, { headers: couchHeaders(s) })
      if (!rr.ok) return
      const body = await rr.json()
      if (typeof body.deletedAt === 'number') x.deletedAt = body.deletedAt
    } catch { /* 读不到时间不影响列表 */ }
  }))
  return list
}

/**
 * 只读回捞某条「已标记删除」文档在删除前的正文，用于回收站展开详情。
 * 与 restoreRemoteDocs 共用修订链思路：删除叶子 -> _revisions -> 往回找第一版非删除正文。
 */
export async function fetchRemoteDeletedDetail(s: AppSettings, target: { id: string; rev: string }): Promise<{
  id: string; rev: string; deletedAt?: number; title?: string; date?: string;
  icon?: string; note?: string; categoryId?: string; displayMode?: string;
  color?: string; repeat?: string; lunar?: boolean; raw?: any; error?: string
}> {
  const out: any = { id: target.id, rev: target.rev }
  if (!couch.configure(s)) { out.error = '未配置 CouchDB'; return out }
  const enc = encodeURIComponent(target.id)
  try {
    const meta = await fetch(`${couchBase(s)}/${enc}?rev=${encodeURIComponent(target.rev)}&revs=true`, { headers: couchHeaders(s) })
    if (!meta.ok) { out.error = `读取修订链失败 ${meta.status}`; return out }
    const head = await meta.json()
    if (typeof head.deletedAt === 'number') out.deletedAt = head.deletedAt
    const revs = head._revisions
    if (!revs?.ids?.length) { out.error = '旧版本已被压缩，无法读取详情'; return out }

    const start = Number(revs.start)
    let found: any = null
    for (let n = start - 1; n > Math.max(start - 30, 0); n--) {
      const rv = `${n}-${revs.ids[start - n]}`
      const rr = await fetch(`${couchBase(s)}/${enc}?rev=${encodeURIComponent(rv)}&revs=true`, { headers: couchHeaders(s) })
      if (!rr.ok) break
      const body = await rr.json()
      if (!body._deleted) { found = body; break }
    }
    if (!found) { out.error = '旧版本已被压缩，无法读取详情'; return out }
    for (const k of ['title', 'date', 'icon', 'note', 'categoryId', 'displayMode', 'color', 'repeat', 'lunar']) {
      if (found[k] !== undefined) out[k] = found[k]
    }
    out.raw = found
    return out
  } catch (e: any) {
    out.error = e?.message || String(e)
    return out
  }
}

/**
 * 永久清除云端删除标记（CouchDB _purge，不可逆）。
 * 仅在用户确认「超过保留期」后调用；需要数据库管理员权限。
 */
export async function purgeRemoteDeleted(s: AppSettings, targets: Array<{ id: string; rev: string }>): Promise<{ purged: string[]; failed: string[]; error?: string }> {
  if (!targets.length) return { purged: [], failed: [] }
  if (!couch.configure(s)) return { purged: [], failed: targets.map((t) => t.id), error: '未配置 CouchDB' }
  const docs: Record<string, string> = {}
  for (const t of targets) docs[t.id] = t.rev
  try {
    const r = await fetch(couchBase(s) + '/_purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...couchHeaders(s) },
      body: JSON.stringify({ docs }),
    })
    if (!r.ok) {
      const msg = r.status === 401 || r.status === 403 ? '需要 CouchDB 管理员权限才能永久清除' : `永久清除失败 ${r.status}`
      return { purged: [], failed: targets.map((t) => t.id), error: msg }
    }
    const data = await r.json()
    const purged = Object.keys(data.purged || {})
    return { purged, failed: targets.map((t) => t.id).filter((id) => !purged.includes(id)) }
  } catch (e: any) {
    return { purged: [], failed: targets.map((t) => t.id), error: e?.message || String(e) }
  }
}

/**
 * 从云端回捞并复活指定文档。
 *
 * 做法：被删文档的正文虽已不可直接读取，但 CouchDB 保留了修订链（_revisions）。
 * 顺着链往回找到删除前的最后一版正文，再以 new_edits=false 写一个「非删除的同代分支」，
 * CouchDB 的胜者规则会选非删除分支，文档即复活，且内容与删除前一致。
 */
export async function restoreRemoteDocs(
  s: AppSettings,
  targets: Array<{ id: string; rev: string }>,
): Promise<{ restored: string[]; failed: string[] }> {
  const restored: string[] = []
  const failed: string[] = []
  if (!couch.configure(s)) return { restored, failed }

  const batch: any[] = []
  for (const t of targets) {
    const enc = encodeURIComponent(t.id)
    try {
      const meta = await fetch(`${couchBase(s)}/${enc}?rev=${encodeURIComponent(t.rev)}&revs=true`, { headers: couchHeaders(s) })
      if (!meta.ok) { failed.push(t.id); continue }
      const revs = (await meta.json())?._revisions
      if (!revs?.ids?.length) { failed.push(t.id); continue }

      const start = Number(revs.start)
      let found: any = null
      for (let n = start - 1; n > Math.max(start - 30, 0); n--) {
        const rv = `${n}-${revs.ids[start - n]}`
        const rr = await fetch(`${couchBase(s)}/${enc}?rev=${encodeURIComponent(rv)}&revs=true`, { headers: couchHeaders(s) })
        if (!rr.ok) break
        const body = await rr.json()
        if (!body._deleted) { found = body; break }
      }
      if (!found) { failed.push(t.id); continue }

      const content: any = {}
      for (const k of Object.keys(found)) if (!k.startsWith('_')) content[k] = found[k]
      // 新分支 hash：由内容与 id 派生，保证同内容重复执行不会产生多个分支
      const seed = t.id + JSON.stringify(content, Object.keys(content).sort())
      let h = 0
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
      const newHash = Math.abs(h).toString(16).padStart(32, '0').slice(0, 32)
      const parent = found._revisions
      batch.push({
        _id: t.id,
        _rev: `${Number(parent.start) + 1}-${newHash}`,
        _revisions: { start: Number(parent.start) + 1, ids: [newHash, ...parent.ids] },
        ...content,
      })
      restored.push(t.id)
    } catch {
      failed.push(t.id)
    }
  }

  if (batch.length) {
    const r = await fetch(couchBase(s) + '/_bulk_docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...couchHeaders(s) },
      body: JSON.stringify({ docs: batch, new_edits: false }),
    })
    if (!r.ok) throw new Error(`恢复写入失败 ${r.status}`)
  }
  return { restored, failed }
}

/** 本地全量覆盖云端：本地是什么，云端就是什么；云端多出来的记录会被删除 */
export async function forcePush(
  s: AppSettings,
  localDocs: any[],
): Promise<{ pushed: number; deletedRemote: number }> {
  const backs = enabledBackends(s)
  if (!backs.length) throw new Error('尚未配置 CouchDB 或 WebDAV')

  let deletedRemote = 0
  if (backs.includes('couchdb')) {
    const r = await fetch(couchBase(s) + '/_all_docs?include_docs=true', { headers: couchHeaders(s) })
    if (!r.ok) throw new Error(`读取云端失败 ${r.status}`)
    const rows = (await r.json()).rows || []
    const revMap = new Map<string, string>()
    for (const x of rows) {
      if (!x.doc || String(x.id).startsWith('_design/')) continue
      revMap.set(x.id, x.doc._rev)
    }
    const localIds = new Set(localDocs.map((d) => d._id))
    const docs = localDocs.map((d) => {
      const rev = revMap.get(d._id)
      const x = { ...d }
      if (rev) x._rev = rev
      else delete x._rev
      return x
    })
    for (const [id, rev] of revMap) {
      if (!localIds.has(id)) { docs.push({ _id: id, _rev: rev, _deleted: true, deletedAt: Date.now() }); deletedRemote++ }
    }
    await couch.write(s, docs)
  }
  if (backs.includes('webdav')) {
    await webdav.write(s, localDocs.map((d) => { const x = { ...d }; delete x._rev; return x }))
  }
  return { pushed: localDocs.length, deletedRemote }
}

/**
 * 云端全量覆盖本地：返回云端存活的全部文档，以及云端已标记删除的 id
 * （本地若有这些 id，需要一并移除，否则下次同步又被推上去）。
 */
export async function forcePull(s: AppSettings): Promise<{ docs: any[]; deletedIds: string[] }> {
  const backs = enabledBackends(s)
  if (!backs.length) throw new Error('尚未配置 CouchDB 或 WebDAV')

  const docs: any[] = []
  const deletedIds: string[] = []
  if (backs.includes('couchdb')) {
    const r = await fetch(couchBase(s) + '/_all_docs?include_docs=true', { headers: couchHeaders(s) })
    if (!r.ok) throw new Error(`读取云端失败 ${r.status}`)
    const rows = (await r.json()).rows || []
    for (const x of rows) {
      if (!x.doc || String(x.id).startsWith('_design/') || x.doc._deleted) continue
      docs.push(x.doc)
    }
    try {
      deletedIds.push(...(await listRemoteDeleted(s)).map((d) => d.id))
    } catch { /* 读不到删除列表不影响主流程 */ }
  }
  if (backs.includes('webdav')) {
    const st = await webdav.read(s)
    if (st.docs.length) docs.push(...st.docs)
  }
  return { docs, deletedIds }
}

export type SyncOutcome = {
  docs: any[]
  conflicts: ConflictItem[]
  base: SyncBase
  appliedDeletes: string[]
  pushed: number
  pulled: number
  unchanged: number
  /** 被 CouchDB 覆盖的 WebDAV 文档数 */
  couchWins: number
}

const TOMB_KEY = 'daysnote.tombstones.v1'

export function loadTombstones(): string[] {
  try { return JSON.parse(localStorage.getItem(TOMB_KEY) || '[]') } catch { return [] }
}
export function saveTombstones(ids: string[]) {
  localStorage.setItem(TOMB_KEY, JSON.stringify(ids))
}

const ts = (d: any) => Number(d?.updatedAt || 0)

/**
 * 三方合并同步（本地 / CouchDB / WebDAV）。
 *
 * 版本控制：以 updatedAt 为版本号，值越大越新；离线未同步的修改，下次同步按时间保留新版。
 * 后端优先级：同一文档 CouchDB 与 WebDAV 内容不同时，以 CouchDB 为准覆盖 WebDAV。
 * 冲突：仅在「本地与权威远端都改动、内容不同、且版本号相同」时才交给用户裁决。
 */
export async function syncAll(
  s: AppSettings,
  localDocs: any[],
  oldBase: SyncBase,
  resolve: Record<string, 'local' | 'remote'> = {},
  deletedIds: string[] = [],
): Promise<SyncOutcome> {
  const backs = enabledBackends(s)
  if (!backs.length) throw new Error('尚未配置 CouchDB 或 WebDAV')

  // 并行读取所有后端
  const states: Partial<Record<SyncBackend, RemoteState>> = {}
  await Promise.all(backs.map(async (b) => { states[b] = await drivers[b].read(s) }))

  const localMap = new Map(localDocs.map((d) => [d._id, d]))
  const couchMap = new Map((states.couchdb?.docs || []).map((d) => [d._id, d]))
  const davMap = new Map((states.webdav?.docs || []).map((d) => [d._id, d]))
  const tombstones = new Set(deletedIds)
  const ids = new Set([...localMap.keys(), ...couchMap.keys(), ...davMap.keys()])

  const merged: any[] = []
  const conflicts: ConflictItem[] = []
  const newBase: SyncBase = { ...oldBase }
  const appliedDeletes: string[] = []
  let pushed = 0, pulled = 0, unchanged = 0, couchWins = 0

  for (const id of ids) {
    const l = localMap.get(id)
    const c = couchMap.get(id)
    const d = davMap.get(id)
    const b = oldBase[id]
    const baseTs = b?.updatedAt || 0

    // 用户已裁决
    if (resolve[id]) {
      const pick = resolve[id] === 'local' ? l : (c || d)
      if (pick) merged.push(pick)
      if (pick) newBase[id] = { hash: docHash(pick), updatedAt: ts(pick) || Date.now() }
      pushed++
      continue
    }

    // 本地已删除：各后端都要删，不拉回
    if (!l && (c || d) && tombstones.has(id)) {
      appliedDeletes.push(id)
      delete newBase[id]
      pushed++
      continue
    }

    // 权威远端版本：CouchDB 优先，其次 WebDAV
    let remote = c || d || null
    // CouchDB 与 WebDAV 同时存在且内容不同 → CouchDB 覆盖 WebDAV（版本控制：即便 WebDAV 时间更晚也以 CouchDB 为准）
    if (c && d && docHash(c) !== docHash(d)) {
      remote = c
      couchWins++
    }

    if (!l && remote) {
      merged.push(remote)
      newBase[id] = { hash: docHash(remote), updatedAt: ts(remote) || Date.now() }
      pulled++
      continue
    }
    if (l && !remote) {
      merged.push(l)
      newBase[id] = { hash: docHash(l), updatedAt: ts(l) || Date.now() }
      pushed++
      continue
    }
    if (!l || !remote) continue

    const lNewer = ts(l) > ts(remote)
    const rNewer = ts(remote) > ts(l)
    // 相对同步基线是否发生变化：没有基线时视为双方都变
    const lChanged = b ? (ts(l) > baseTs || docHash(l) !== b.hash) : true
    const rChanged = b ? (ts(remote) > baseTs || docHash(remote) !== b.hash) : true

    if (docHash(l) === docHash(remote)) {
      // 内容一致：合并元数据，取较新时间戳
      const winner = lNewer ? l : remote
      merged.push({ ...winner, ...(c?._rev ? { _rev: c._rev } : {}) })
      newBase[id] = { hash: docHash(l), updatedAt: Math.max(ts(l), ts(remote)) || Date.now() }
      unchanged++
    } else if (lChanged && !rChanged) {
      // 仅本地修改 → 本地胜出
      merged.push({ ...l, ...(c?._rev ? { _rev: c._rev } : {}) })
      newBase[id] = { hash: docHash(l), updatedAt: ts(l) || Date.now() }
      pushed++
    } else if (rChanged && !lChanged) {
      // 仅远端修改 → 远端胜出
      merged.push(remote)
      newBase[id] = { hash: docHash(remote), updatedAt: ts(remote) || Date.now() }
      pulled++
    } else if (lNewer || rNewer) {
      // 双方都改但时间不同 → 按 updatedAt 保留新版（离线未同步的修改下次同步不会丢）
      if (lNewer) {
        merged.push({ ...l, ...(c?._rev ? { _rev: c._rev } : {}) })
        newBase[id] = { hash: docHash(l), updatedAt: ts(l) || Date.now() }
        pushed++
      } else {
        merged.push(remote)
        newBase[id] = { hash: docHash(remote), updatedAt: ts(remote) || Date.now() }
        pulled++
      }
    } else {
      // 双方都改、时间相同、内容不同 → 真冲突，交给用户裁决
      conflicts.push({
        id,
        kind: String(id).startsWith('category:') ? 'category' : 'event',
        title: (l.title || l.name || remote.title || remote.name || String(id)) as string,
        local: l,
        remote,
        localTime: ts(l),
        remoteTime: ts(remote),
      })
      merged.push(l)
    }
  }

  // 冲突项不写回远端
  const conflictIds = new Set(conflicts.map((c) => c.id))
  const finalDocs = merged.filter((d) => !conflictIds.has(d._id)).map((d) => ({ ...d }))

  // 各后端分别写入：CouchDB 用 _rev + _deleted，WebDAV 整体覆盖
  if (couchMap.size || backs.includes('couchdb')) {
    const couchDocs = finalDocs.map((d) => {
      const x = { ...d }
      const src = couchMap.get(d._id)
      if (src?._rev) x._rev = src._rev
      else delete x._rev
      delete x.updatedAtLocal
      return x
    })
    // 删除：远端存在但最终集合里没有
    const finalIds = new Set(finalDocs.map((d) => d._id))
    for (const d of couchMap.values()) {
      if (!finalIds.has(d._id) && !conflictIds.has(d._id)) couchDocs.push({ _id: d._id, _rev: d._rev, _deleted: true, deletedAt: Date.now() })
    }
    for (const id of appliedDeletes) {
      if (!couchDocs.some((x) => x._id === id && x._deleted)) couchDocs.push({ _id: id, _rev: couchMap.get(id)?._rev, _deleted: true, deletedAt: Date.now() })
    }
    if (couchDocs.length) await couch.write(s, couchDocs)
  }
  if (backs.includes('webdav')) {
    // 整体覆盖：CRC 精简，去掉 _rev 等元数据
    const davDocs = finalDocs.map((d) => { const x = { ...d }; delete x._rev; delete x.updatedAtLocal; return x })
    await webdav.write(s, davDocs, states.webdav?.token)
  }

  return { docs: merged, conflicts, base: newBase, appliedDeletes, pushed, pulled, unchanged, couchWins }
}

const BASE_KEY = 'daysnote.syncbase.v1'

export function loadBase(): SyncBase {
  try { return JSON.parse(localStorage.getItem(BASE_KEY) || '{}') } catch { return {} }
}
export function saveBase(base: SyncBase) {
  localStorage.setItem(BASE_KEY, JSON.stringify(base))
}

// ==================== 每月 WebDAV 备份 ====================
const BACKUP_KEY = 'daysnote.lastBackup.v1'

/** 生成精简备份数据：去掉同步元数据，只保留业务字段，体积最小 */
export function buildBackupPayload(categories: any[], events: any[]) {
  return {
    v: 2,
    app: 'DaysNote',
    exportedAt: new Date().toISOString(),
    categories: categories.map(({ id, name, color, order, builtin }) => ({ id, name, color, order, ...(builtin ? { builtin: true } : {}) })),
    events: events.map(({ id, title, date, lunar, categoryId, icon, color, note, order, repeat, showInTimeline, createdAt, updatedAt }) =>
      ({ id, title, date, lunar, categoryId, icon, color, note, order, repeat, ...(showInTimeline === false ? { showInTimeline: false } : {}), createdAt, updatedAt })),
  }
}

/** 判断是否需要本月备份（每月 1 号之后第一次打开/同步时执行） */
export function backupDue(): boolean {
  const last = localStorage.getItem(BACKUP_KEY) || ''
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return last !== cur
}

/** 执行备份：以日期为文件名 PUT 到用户设置的 WebDAV 备份文件夹 */
export async function runBackup(
  s: AppSettings,
  categories: any[],
  events: any[],
): Promise<{ ok: boolean; message: string }> {
  if (!s.backupFolder.trim()) return { ok: false, message: '未设置备份文件夹' }
  if (!basic(s, s.webdavUser, s.webdavPassword) && !s.webdavUrl.trim()) {
    // 允许仅配置备份目录（独立 WebDAV 凭证复用 webdavUser/Password）
  }
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const folder = s.backupFolder.replace(/\/+$/, '')
  const url = `${folder}/${day}.json`
  const payload = JSON.stringify(buildBackupPayload(categories, events))
  const headers: any = {
    'Content-Type': 'application/json',
    ...(basic(s, s.webdavUser, s.webdavPassword) ? { Authorization: basic(s, s.webdavUser, s.webdavPassword) } : {}),
  }
  try {
    const r = await fetch(url, { method: 'PUT', headers, body: payload })
    if (!r.ok) return { ok: false, message: `备份失败 HTTP ${r.status}` }
    localStorage.setItem(BACKUP_KEY, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    return { ok: true, message: `已备份至 ${day}.json（${(payload.length / 1024).toFixed(1)} KB）` }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export function lastBackup(): string {
  return localStorage.getItem(BACKUP_KEY) || '从未备份'
}

import React, { useRef, useState } from 'react'
import { useStore } from '../store'
import { testConnection, testBackend, formatBytes } from '../couchdb'
import { runAiCommand } from '../ai'
import { migrate, DATA_SCHEMA_VERSION } from '../migrate'
import { BUILTIN_EVENTS } from '../seed'
import { APP_VERSION } from '../version'
import { Switch, useToast } from './ui'
import type { AppSettings, SyncBackend, ThemeMode, BackgroundStyle } from '../types'

export function SettingsView() {
  const store = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'appearance' | 'sync' | 'ai' | 'data'>('appearance')
  const [checking, setChecking] = useState(false)
  const [backing, setBacking] = useState(false)
  const [confirm, setConfirm] = useState<null | 'push' | 'pull'>(null)
  const [aiText, setAiText] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const set = (patch: Partial<AppSettings>) => store.setSettings(patch)
  const isOn = (b: SyncBackend) => store.settings.enabledBackends.includes(b)

  const doTest = async () => {
    setChecking(true)
    try {
      const r = await testConnection(store.settings)
      toast(r.message)
    } catch (e: any) { toast(e?.message || '连接失败') }
    finally { setChecking(false) }
  }

  const doTestOne = async (b: SyncBackend) => {
    setChecking(true)
    try {
      const r = await testBackend(store.settings, b)
      toast(r.message)
    } catch (e: any) { toast(e?.message || '连接失败') }
    finally { setChecking(false) }
  }

  const doSync = async () => {
    try { await store.sync(); toast('同步完成') } catch (e: any) { toast(e?.message || '同步失败') }
  }

  /** 强制覆盖：确认后执行，结果写回提示 */
  const doOverwrite = async () => {
    const kind = confirm
    setConfirm(null)
    if (!kind) return
    try {
      if (kind === 'push') {
        const r = await store.pushAllToRemote()
        toast(`已用本地覆盖云端：写入 ${r.pushed} 条${r.deletedRemote ? `，云端多出的 ${r.deletedRemote} 条已删除` : ''}`)
      } else {
        const r = await store.pullAllFromRemote()
        toast(`已用云端覆盖本地：共 ${r.total} 条${r.removedLocal ? `，本地多出的 ${r.removedLocal} 条已移除` : ''}`)
      }
    } catch (e: any) {
      toast(e?.message || '覆盖失败')
    }
  }

  const doBackup = async () => {
    setBacking(true)
    try { await store.backup(); toast('备份完成') } catch (e: any) { toast(e?.message || '备份失败') }
    finally { setBacking(false) }
  }

  const askAi = async () => {
    if (!aiText.trim() || busy) return
    const q = aiText.trim()
    setLog((l) => [...l, { role: 'user', text: q }])
    setAiText(''); setBusy(true)
    try {
      const answer = await runAiCommand(q, store.settings, {
        createEvent: (i) => store.addEvent(i),
        updateEvent: (id, p) => store.updateEvent(id, p),
        deleteEvent: (id) => { store.removeEvent(id); return true },
        createCategory: (n, c) => store.addCategory(n, c),
        updateCategory: (id, p) => store.updateCategory(id, p),
        deleteCategory: (id) => { store.removeCategory(id); return true },
      }, { categories: store.categories, events: store.events })
      setLog((l) => [...l, { role: 'ai', text: answer }])
      setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
    } catch (e: any) { toast(e?.message || 'AI 调用失败') }
    finally { setBusy(false) }
  }

  const exportJson = () => {
    // 导出含版本信息、分类/事件与配置（含同步凭证），便于覆盖安装后完整恢复
    const data = JSON.stringify({
      _schema: DATA_SCHEMA_VERSION,
      _appVersion: APP_VERSION,
      _savedAt: Date.now(),
      categories: store.categories,
      events: store.events,
      settings: store.settings,
    }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `daysnote-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    URL.revokeObjectURL(a.href)
    toast('已导出完整备份（含配置）')
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result))
        if (!Array.isArray(raw.events) || !Array.isArray(raw.categories)) throw new Error('格式不正确')
        // 走统一迁移：任意旧版本备份都能接手
        const d = migrate(raw, APP_VERSION)
        store.replaceFromRemote([...d.categories, ...d.events])
        store.setSettings(d.settings)
        toast(`导入成功（数据版本 ${d._schema}）`)
      } catch (e: any) { toast(e?.message || '导入失败') }
    }
    reader.readAsText(file)
  }

  return (
    <div className="page">
      <div className="navbar"><div /><div className="nav-title">更多</div><div style={{ width: 34 }} /></div>
      <div className="center" style={{ margin: '18px 0 6px', fontSize: 44 }}>🌿</div>
      <div className="center h2">纪念日</div>
      <div className="center hint">手绘风 · 多端同步 · AI 管理</div>

      <div className="segment" style={{ width: '100%', marginTop: 26 }}>
        <button className={tab === 'appearance' ? 'on' : ''} style={{ ['--color' as any]: '#dfe9db' }} onClick={() => setTab('appearance')}>外观</button>
        <button className={tab === 'sync' ? 'on' : ''} style={{ ['--color' as any]: '#dfe9db' }} onClick={() => setTab('sync')}>同步</button>
        <button className={tab === 'ai' ? 'on' : ''} style={{ ['--color' as any]: '#dfe9db' }} onClick={() => setTab('ai')}>AI 助手</button>
        <button className={tab === 'data' ? 'on' : ''} style={{ ['--color' as any]: '#dfe9db' }} onClick={() => setTab('data')}>数据</button>
      </div>

      {tab === 'appearance' && (
        <>
          <div className="section-title">显示模式</div>
          <div className="card-panel">
            <div className="segment" style={{ width: '100%', marginTop: 0 }}>
              {([['light', '白天'], ['dark', '夜间'], ['auto', '自动']] as Array<[ThemeMode, string]>).map(([value, label]) => (
                <button key={value} className={store.settings.themeMode === value ? 'on' : ''}
                  style={{ ['--color' as any]: '#dfe9db' }} onClick={() => set({ themeMode: value })}>{label}</button>
              ))}
            </div>
            <div className="status-line">自动模式跟随系统深色/浅色设置，系统切换时 App 会同步变化。</div>
          </div>

          <div className="section-title">背景样式</div>
          <div className="card-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {([
                ['grid', '格纹', 'linear-gradient(#d6d3ca 1px, transparent 1px), linear-gradient(90deg, #d6d3ca 1px, transparent 1px)', '#fbfaf7'],
                ['beige', '米色', 'none', '#f3ead9'],
                ['cream', '暖白', 'none', '#fbfaf7'],
                ['gray', '浅灰', 'none', '#eeece7'],
              ] as Array<[BackgroundStyle, string, string, string]>).map(([value, label, image, color]) => (
                <button key={value} onClick={() => set({ backgroundStyle: value })}
                  style={{ padding: 10, borderRadius: 14, border: store.settings.backgroundStyle === value ? '2px solid #6f8a6a' : '1px solid var(--line)', background: '#fff', color: '#3d3b3a' }}>
                  <span style={{ display: 'block', height: 34, borderRadius: 9, marginBottom: 7, backgroundImage: image, backgroundColor: color, backgroundSize: '12px 12px', border: '1px solid var(--line)' }} />
                  <span style={{ fontSize: 13 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'sync' && (
        <>
          <div className="card-panel" style={{ marginBottom: 14 }}>
            <div className="row-between">
              <span><b>iCloud 同步</b><div className="hint" style={{ marginTop: 4 }}>同一 Apple ID 设备间同步 · 默认关闭</div></span>
              <Switch on={store.settings.icloudSync} onChange={(v) => { set({ icloudSync: v }); toast(v ? '已开启 iCloud 同步' : '已关闭 iCloud 同步') }} />
            </div>
            {store.settings.icloudSync && (
              <div className="status-line" style={{ marginTop: 10 }}>
                开启后除本地存储外，会把完整数据快照镜像到原生 Preferences，在覆盖安装或设备间迁移时作为兜底恢复源。真正的跨设备 iCloud 需在 Xcode 签名时开启 iCloud 能力。
              </div>
            )}
          </div>

          <div className="section-title">远程存储 · 多端同步</div>
          <div className="card-panel">
            <div className="status-line" style={{ marginBottom: 8 }}>
              可同时启用多个后端。同一份数据 CouchDB 与 WebDAV 不一致时，优先采用 CouchDB 并覆盖 WebDAV。
            </div>

            <div className="row-between" style={{ margin: '12px 0 8px' }}>
              <span><b>CouchDB</b> · 独立数据库（推荐）</span>
              <Switch on={isOn('couchdb')} onChange={() => store.toggleBackend('couchdb')} />
            </div>
            {isOn('couchdb') && (
              <>
                <div className="field"><label>服务器地址</label><input className="input" placeholder="https://couch.example.com" value={store.settings.couchUrl} onChange={(e) => set({ couchUrl: e.target.value })} /></div>
                <div className="field"><label>数据库名</label><input className="input" value={store.settings.couchDb} onChange={(e) => set({ couchDb: e.target.value })} /></div>
                <div className="field"><label>用户名</label><input className="input" autoComplete="off" value={store.settings.couchUser} onChange={(e) => set({ couchUser: e.target.value })} /></div>
                <div className="field"><label>密码</label><input className="input" type="password" autoComplete="off" value={store.settings.couchPassword} onChange={(e) => set({ couchPassword: e.target.value })} /></div>
                <button className="ghost-btn" style={{ marginTop: 2 }} disabled={checking} onClick={() => doTestOne('couchdb')}>测试 CouchDB</button>
              </>
            )}

            <div className="divider" />

            <div className="row-between" style={{ margin: '12px 0 8px' }}>
              <span><b>WebDAV</b> · JSON 文件</span>
              <Switch on={isOn('webdav')} onChange={() => store.toggleBackend('webdav')} />
            </div>
            {isOn('webdav') && (
              <>
                <div className="field"><label>文件地址（完整 URL）</label><input className="input" placeholder="https://dav.example.com/daysnote/data.json" value={store.settings.webdavUrl} onChange={(e) => set({ webdavUrl: e.target.value })} /></div>
                <div className="field"><label>用户名</label><input className="input" autoComplete="off" value={store.settings.webdavUser} onChange={(e) => set({ webdavUser: e.target.value })} /></div>
                <div className="field"><label>密码</label><input className="input" type="password" autoComplete="off" value={store.settings.webdavPassword} onChange={(e) => set({ webdavPassword: e.target.value })} /></div>
                <button className="ghost-btn" style={{ marginTop: 2 }} disabled={checking} onClick={() => doTestOne('webdav')}>测试 WebDAV</button>
                <div className="status-line">用一个 JSON 文件保存全部数据；文件不存在时自动创建。服务器需开放 GET / PUT 并支持 CORS 与 ETag。</div>
              </>
            )}

            <div className="divider" />
            <div className="row-between"><span>打开软件 / 增删改后自动同步</span><Switch on={store.settings.autoSync} onChange={(v) => set({ autoSync: v })} /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="ghost-btn" style={{ flex: 1 }} disabled={checking} onClick={doTest}>{checking ? '检测中…' : '测试全部连接'}</button>
              <button className="primary-btn" style={{ flex: 1, margin: 0 }} disabled={store.syncing} onClick={doSync}>{store.syncing ? '同步中…' : '立即同步'}</button>
            </div>

            {/* 强制覆盖：双向各一个，点击先弹风险确认 */}
            <div className="overwrite-row">
              <button className="overwrite-btn" disabled={store.syncing} onClick={() => setConfirm('push')}>
                <span className="overwrite-arrow">⬆️</span>
                <span><b>本地覆盖服务器</b><small>以手机为准</small></span>
              </button>
              <button className="overwrite-btn" disabled={store.syncing} onClick={() => setConfirm('pull')}>
                <span className="overwrite-arrow">⬇️</span>
                <span><b>服务器覆盖本地</b><small>以云端为准</small></span>
              </button>
            </div>
            <div className="status-line" style={{ marginTop: 8 }}>
              普通同步是双向合并，不会丢数据；这两个按钮是<b>强制单向覆盖</b>，只在数据错乱、想彻底重置某一端时使用。
            </div>
            <div className="status-line">
              最近同步：{store.lastSync}{store.conflicts?.length ? ` · 待处理冲突 ${store.conflicts.length} 项` : ''}<br />
              {store.lastSyncDetail ? (
                <>本次：从云端拉取 {store.lastSyncDetail.pulled} 条 · 向上推送 {store.lastSyncDetail.pushed} 条 · 未变 {store.lastSyncDetail.unchanged} 条{store.lastSyncDetail.deletes ? ` · 删除 ${store.lastSyncDetail.deletes} 条` : ''}，当前共 {store.lastSyncDetail.total} 条<br /></>
              ) : null}
              {store.dbSize ? (
                <>上次同步时 CouchDB 库「{store.settings.couchDb}」体积：{formatBytes(store.dbSize.active ?? store.dbSize.disk)}（磁盘 {formatBytes(store.dbSize.disk)} · {store.dbSize.docCount} 篇正常文档{store.dbSize.delCount ? ` + ${store.dbSize.delCount} 篇已删除` : ''}）<br /></>
              ) : (
                <>上次同步时 CouchDB 库体积：暂无数据（同步成功后自动读取）<br /></>
              )}
              同步是双向的：手机上没有的会从云端拉下来，手机上新增或改过的会推到云端，按 updatedAt 保留较新的版本；只有双方在同一时间改动且内容不同时才需要你裁决。凭证仅保存在本机。
            </div>
          </div>
        </>
      )}

      {tab === 'ai' && (
        <>
          <div className="section-title">AI 自然语言管理</div>
          <div className="card-panel">
            <div className="field"><label>API Base URL（OpenAI 兼容）</label><input className="input" value={store.settings.aiBaseUrl} onChange={(e) => set({ aiBaseUrl: e.target.value })} /></div>
            <div className="field"><label>API Key</label><input className="input" type="password" autoComplete="off" value={store.settings.aiKey} onChange={(e) => set({ aiKey: e.target.value })} /></div>
            <div className="field"><label>模型</label><input className="input" value={store.settings.aiModel} onChange={(e) => set({ aiModel: e.target.value })} /></div>
            <div className="hint" style={{ textAlign: 'left', marginBottom: 12 }}>试着说：“添加一个category叫旅行，再加一个事件：明年5月1日去日本，图标✈️”</div>
            <div className="chat-log" ref={logRef}>
              {log.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
              {busy && <div className="bubble ai">思考中…</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input" style={{ flex: 1 }} value={aiText} onChange={(e) => setAiText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askAi()} placeholder="用一句话添加 / 修改事件…" />
              <button className="primary-btn" style={{ width: 72, margin: 0, padding: '10px 0' }} disabled={busy} onClick={askAi}>发送</button>
            </div>
          </div>
        </>
      )}

      {tab === 'data' && (
        <>
          <div className="section-title">月度备份 · WebDAV</div>
          <div className="card-panel">
            <div className="row-between"><span>每月自动备份</span><Switch on={store.settings.autoBackup} onChange={(v) => set({ autoBackup: v })} /></div>
            <div className="field"><label>备份文件夹（完整 URL，以 / 结尾）</label><input className="input" placeholder="https://dav.example.com/daysnote/backups/" value={store.settings.backupFolder} onChange={(e) => set({ backupFolder: e.target.value })} /></div>
            <div className="field"><label>WebDAV 用户名 / 密码</label><input className="input" autoComplete="off" placeholder="复用上方 WebDAV 凭证" value={store.settings.webdavUser} onChange={(e) => set({ webdavUser: e.target.value })} /><input className="input" type="password" autoComplete="off" placeholder="密码" style={{ marginTop: 8 }} value={store.settings.webdavPassword} onChange={(e) => set({ webdavPassword: e.target.value })} /></div>
            <div className="status-line" style={{ marginTop: 8 }}>
              每月首次打开自动备份一次，文件名如 2026-06-01.json，只保存业务字段以尽量精简。上次备份：{store.lastBackupAt}
            </div>
            <button className="ghost-btn" style={{ marginTop: 12, width: '100%' }} disabled={backing || !store.settings.backupFolder.trim()} onClick={doBackup}>
              {backing ? '备份中…' : '立即备份到 WebDAV'}
            </button>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>时间轴显示</div>
          <div className="card-panel">
            <div className="row-between"><span>时间轴显示农历/法定节日</span><Switch on={store.settings.showFestivals} onChange={(v) => set({ showFestivals: v })} /></div>
            <div className="status-line">关闭后「事件」页时间轴只显示纪念日，不再混入春节、中秋、国庆等农历与法定节日。单个纪念日也可在编辑页单独设置是否显示到时间轴。</div>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>本地数据</div>
          <div className="card-panel">
            <div className="row-between"><span>当前分类 {store.categories.length} 个 · 事件 {store.events.length} 条</span></div>
            <div className="row-between"><span>数据版本</span><span style={{ color: '#8d8984' }}>schema {DATA_SCHEMA_VERSION}</span></div>
            <div className="divider" />
            <button className="ghost-btn" style={{ marginTop: 12 }} onClick={() => {
              const n = store.importBuiltin()
              toast(n ? `已导入 ${n} 条示例事件（重复项已跳过）` : '示例事件已存在，无需重复导入')
            }}>导入示例事件（{BUILTIN_EVENTS.length} 条 · 自动去重）</button>
            <button className="ghost-btn" style={{ marginTop: 10 }} onClick={exportJson}>导出完整备份（含配置）</button>
            <label className="ghost-btn" style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>从 JSON 备份恢复
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            </label>
            <div className="status-line">覆盖安装新版会自动接手旧数据与配置（含同步凭证）。导出备份为完整 JSON，可在重装后原样恢复。配置远程后端后双向同步，按 updatedAt 取较新版本；CouchDB 与 WebDAV 冲突时以 CouchDB 为准。</div>
          </div>
        </>
      )}
      <div className="center" style={{ color: '#b3afa9', fontSize: 11, marginTop: 30 }}>DaysNote v{APP_VERSION} · schema {DATA_SCHEMA_VERSION} · MIT</div>

      {confirm && (
        <div className="modal-mask" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="h2 center">{confirm === 'push' ? '本地覆盖服务器' : '服务器覆盖本地'}</div>
            <div className="risk-box">
              {confirm === 'push' ? (
                <>
                  <p>会把<b>手机上当前的全部事件和分类</b>整体写入云端，云端多出来的记录会被<b>删除</b>。</p>
                  <p>其他设备下次同步后会变成手机上这份数据；如果云端有你手机上没同步下来的旧记录，那些记录会消失。</p>
                </>
              ) : (
                <>
                  <p>会把<b>云端的全部数据</b>整体写入手机，手机上多出来的事件会被<b>删除</b>。</p>
                  <p>如果云端是空的或还没配置好，手机上所有事件都会被<b>清空</b>。执行前请先导出一份本地备份。</p>
                </>
              )}
              <p className="risk-strong">此操作不可撤销，也不会进回收站。</p>
            </div>
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setConfirm(null)}>取消</button>
              <button className="danger-btn" onClick={doOverwrite}>确认覆盖</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

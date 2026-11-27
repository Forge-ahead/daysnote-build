import React, { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { formatDateCN } from '../date'
import { BackBtn, useToast } from './ui'

/** 云端删除标记保留期：6 个月（180 天） */
const TRASH_TTL_MS = 180 * 24 * 60 * 60 * 1000

function deletedTime(t: { deletedAt?: number }) {
  if (!t.deletedAt) return '删除时间未知（旧版未记录）'
  return new Date(t.deletedAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
function isExpired(t: { deletedAt?: number }) {
  return Boolean(t.deletedAt && Date.now() - t.deletedAt > TRASH_TTL_MS)
}
function modeName(m?: string) {
  return m === 'countdown' ? '倒数' : m === 'countup' ? '正数' : m === 'both' ? '正数 + 倒数' : '—'
}

/**
 * 回收站：本地已删除 + 云端已删除。
 * 本地条目带完整内容；云端条目点击展开后从 CouchDB 修订链回捞删除前的正文。
 */
export function TrashView({ onBack }: { onBack: () => void }) {
  const store = useStore()
  const toast = useToast()
  const [localSel, setLocalSel] = useState<string[]>([])
  const [remoteSel, setRemoteSel] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    store.refreshRemoteTrash().catch(() => {})
    // 只在进入页面时读一次云端删除列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const local = store.trash
  const remote = store.remoteTrash
  const expiredIds = remote.filter(isExpired).map((t) => t.id)

  const expand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    await store.loadRemoteTrashDetail(id).catch(() => {})
  }

  const restoreLocal = async () => {
    if (!localSel.length) return
    setBusy(true)
    try {
      const n = await store.restoreTrash(localSel)
      setLocalSel([])
      toast(`已恢复 ${n} 条事件`)
    } catch (e: any) {
      toast(e?.message || '恢复失败')
    } finally {
      setBusy(false)
    }
  }

  const purgeLocal = () => {
    if (!localSel.length) return
    store.removeTrash(localSel)
    setLocalSel([])
    toast('已从回收站彻底移除')
  }

  const restoreRemote = async (ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    try {
      const r = await store.restoreRemoteTrash(ids)
      setRemoteSel((prev) => prev.filter((x) => !ids.includes(x)))
      if (ids.includes(expanded || '')) setExpanded(null)
      toast(r.failed ? `已恢复 ${r.restored} 条，${r.failed} 条无法恢复（旧版本已被压缩）` : `已从云端恢复 ${r.restored} 条`)
    } catch (e: any) {
      toast(e?.message || '云端恢复失败')
    } finally {
      setBusy(false)
    }
  }

  /** 永久清除：二次确认后调用 CouchDB _purge，不可恢复 */
  const doPurge = async (ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    try {
      const r = await store.purgeRemoteTrash(ids)
      if (r.error) toast(r.error)
      else toast(`已永久清除 ${r.purged.length} 条（不可恢复）`)
      if (r.purged.length) {
        setRemoteSel((prev) => prev.filter((x) => !r.purged.includes(x)))
        if (r.purged.includes(expanded || '')) setExpanded(null)
      }
      setConfirmPurge(null)
    } catch (e: any) {
      toast(e?.message || '永久清除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="navbar">
        <BackBtn onClick={onBack} />
        <div className="nav-title">回收站</div>
        <button
          className="icon-btn"
          aria-label="刷新云端"
          onClick={() => store.refreshRemoteTrash().catch((e) => toast(e?.message || '读取失败'))}
        >
          <RefreshCw size={18} className={store.loadingRemoteTrash ? 'spin' : ''} />
        </button>
      </div>

      <div className="trash-hint">
        删除的事件会先放进这里，随时可以恢复。云端删除标记保留 <b>6 个月</b>；超过期限可在下方永久清除（不可恢复）。
      </div>

      {/* ---------- 本机已删除 ---------- */}
      <div className="section-title">本机已删除 · {local.length}</div>
      {local.length === 0 ? (
        <div className="trash-empty">本机没有可恢复的事件</div>
      ) : (
        <div className="card-panel trash-panel">
          {local.map((t) => (
            <button
              key={t.id}
              className={`trash-item${localSel.includes(t.id) ? ' on' : ''}`}
              onClick={() => toggle(localSel, setLocalSel, t.id)}
            >
              <span className={`trash-check${localSel.includes(t.id) ? ' on' : ''}`}>{localSel.includes(t.id) ? '✓' : ''}</span>
              <span className="trash-icon">{t.icon || '📌'}</span>
              <span className="trash-main">
                <b>{t.title}</b>
                <small>{t.date ? formatDateCN(t.date) : '—'} · 删除于 {deletedTime(t)}</small>
              </span>
            </button>
          ))}
          <div className="trash-actions">
            <button className="ghost-btn" disabled={!localSel.length || busy} onClick={restoreLocal}>
              <RotateCcw size={15} /> 恢复选中（{localSel.length}）
            </button>
            <button className="ghost-btn danger" disabled={!localSel.length} onClick={purgeLocal}>
              <Trash2 size={15} /> 彻底删除
            </button>
          </div>
        </div>
      )}

      {/* ---------- 云端已删除 ---------- */}
      <div className="section-title">云端已删除 · {store.loadingRemoteTrash ? '读取中…' : remote.length}</div>
      {!remote.length && !store.loadingRemoteTrash ? (
        <div className="trash-empty">云端没有已删除的记录（未配置 CouchDB 时为空）</div>
      ) : (
        <div className="card-panel trash-panel">
          {remote.map((t) => {
            const d = store.remoteTrashDetails[t.id]
            const open = expanded === t.id
            const expired = isExpired(t)
            return (
              <div className={`trash-cloud-item${open ? ' open' : ''}`} key={t.id}>
                <div className="trash-cloud-row">
                  <button
                    className={`trash-check${remoteSel.includes(t.id) ? ' on' : ''}`}
                    aria-label="选择"
                    onClick={() => toggle(remoteSel, setRemoteSel, t.id)}
                  >{remoteSel.includes(t.id) ? '✓' : ''}</button>
                  <button className="trash-cloud-main" onClick={() => expand(t.id)}>
                    <span className="trash-icon">{d?.icon || '☁️'}</span>
                    <span className="trash-main">
                      <b>{d?.title || '云端记录'}</b>
                      <small>
                        {deletedTime(t)}
                        {expired ? ' · 已超过 6 个月' : ''}
                      </small>
                    </span>
                    <ChevronDown size={16} className={`trash-chevron${open ? ' open' : ''}`} />
                  </button>
                </div>

                {open && (
                  <div className="trash-detail">
                    {!d || d.loading ? (
                      <div className="trash-detail-note">正在从云端旧版本读取事件内容…</div>
                    ) : d.error ? (
                      <div className="trash-detail-note">⚠️ {d.error}</div>
                    ) : (
                      <>
                        <div className="trash-detail-grid">
                          <div><label>标题</label><b>{d.title || '（无标题）'}</b></div>
                          <div><label>日期</label><b>{d.date ? formatDateCN(d.date) : '—'}</b></div>
                          <div><label>图标</label><b>{d.icon || '—'}</b></div>
                          <div><label>分类</label><b>{store.categories.find((c) => c.id === d.categoryId)?.name || d.categoryId || '—'}</b></div>
                          <div><label>显示</label><b>{modeName(d.displayMode)}</b></div>
                          <div><label>重复</label><b>{d.repeat === 'yearly' ? '每年' : '不重复'}</b></div>
                          <div className="wide"><label>备注</label><b>{d.note || '—'}</b></div>
                          <div className="wide"><label>文档 ID</label><b>{t.id}</b></div>
                        </div>
                        <div className="trash-detail-actions">
                          <button className="ghost-btn" disabled={busy} onClick={() => restoreRemote([t.id])}>
                            <RotateCcw size={15} /> 恢复此条
                          </button>
                          <button className="ghost-btn danger" disabled={busy} onClick={() => setConfirmPurge(confirmPurge === t.id ? null : t.id)}>
                            <Trash2 size={15} /> 永久清除
                          </button>
                        </div>
                      </>
                    )}
                    {confirmPurge === t.id && (
                      <div className="trash-confirm">
                        <span>永久清除后<b>无法恢复</b>，确定继续？</span>
                        <button className="ghost-btn danger" disabled={busy} onClick={() => doPurge([t.id])}>确认清除</button>
                        <button className="ghost-btn" onClick={() => setConfirmPurge(null)}>取消</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <div className="trash-actions">
            <button className="ghost-btn" disabled={!remoteSel.length || busy} onClick={() => restoreRemote(remoteSel)}>
              <RotateCcw size={15} /> 恢复选中（{remoteSel.length}）
            </button>
            <button
              className="ghost-btn danger"
              disabled={!remoteSel.length || busy}
              onClick={() => setConfirmPurge(confirmPurge === 'selected' ? null : 'selected')}
            >
              <Trash2 size={15} /> 永久清除选中（{remoteSel.length}）
            </button>
          </div>
          {expiredIds.length > 0 && (
            <div className="trash-expired-row">
              <span>有 {expiredIds.length} 条云端记录已超过 6 个月保留期</span>
              <button
                className="ghost-btn danger"
                disabled={busy}
                onClick={() => setConfirmPurge(confirmPurge === 'expired' ? null : 'expired')}
              >清理过期项</button>
            </div>
          )}
          {confirmPurge === 'selected' && (
            <div className="trash-confirm">
              <span>将永久清除选中的 <b>{remoteSel.length}</b> 条云端记录，<b>无法恢复</b>。</span>
              <button className="ghost-btn danger" disabled={busy} onClick={() => doPurge(remoteSel)}>确认清除</button>
              <button className="ghost-btn" onClick={() => setConfirmPurge(null)}>取消</button>
            </div>
          )}
          {confirmPurge === 'expired' && (
            <div className="trash-confirm">
              <span>将永久清除 <b>{expiredIds.length}</b> 条超过 6 个月的云端记录，<b>无法恢复</b>。</span>
              <button className="ghost-btn danger" disabled={busy} onClick={() => doPurge(expiredIds)}>确认清除</button>
              <button className="ghost-btn" onClick={() => setConfirmPurge(null)}>取消</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

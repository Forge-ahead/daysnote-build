import React, { useState } from 'react'
import { useStore } from '../store'
import type { ConflictItem } from '../types'

function fmtTime(t: number): string {
  if (!t) return '未知时间'
  return new Date(t).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function describe(c: ConflictItem, side: 'local' | 'remote'): { primary: string; secondary: string } {
  const d = side === 'local' ? c.local : c.remote
  if (c.kind === 'event') {
    const when = d.date ? `${d.date}${d.lunar ? ' 农历' : ''}` : '未设置日期'
    return { primary: d.title || '未命名事件', secondary: `${when}${d.note ? ' · ' + d.note.slice(0, 16) : ''}` }
  }
  return { primary: d.name || '未命名分类', secondary: `${d.color || ''} · 排序 ${d.order ?? '-'}` }
}

export function ConflictDialog() {
  const store = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const list = store.conflicts || []
  if (!list.length) return null

  const choose = async (id: string, side: 'local' | 'remote') => {
    setBusy(id); setErr('')
    try { await store.resolveConflict(id, side) }
    catch (e: any) { setErr(e?.message || '处理失败，请重试') }
    finally { setBusy(null) }
  }

  return (
    <div className="modal-mask">
      <div className="modal-card conflict-modal">
        <div className="modal-head">
          <div className="modal-title">发现 {list.length} 项数据冲突</div>
          <div className="modal-sub">本机与其他设备都修改了同一条数据，请选择要保留的版本。</div>
        </div>
        <div className="conflict-scroll">
          {list.map((c) => {
            const local = describe(c, 'local')
            const remote = describe(c, 'remote')
            return (
              <div className="conflict-item" key={c.id}>
                <div className="conflict-kind">{c.kind === 'event' ? '事件' : '分类'} · {c.title}</div>
                <div className="conflict-versions">
                  <div className="conflict-ver">
                    <div className="ver-label">本机版本 <span>{fmtTime(c.localTime)}</span></div>
                    <div className="ver-primary">{local.primary}</div>
                    <div className="ver-sub">{local.secondary}</div>
                    <button className="primary-btn" style={{ margin: '8px 0 0', padding: '7px 0' }} disabled={busy === c.id} onClick={() => choose(c.id, 'local')}>
                      {busy === c.id ? '处理中…' : '保留本机'}
                    </button>
                  </div>
                  <div className="conflict-ver remote">
                    <div className="ver-label">远程版本 <span>{fmtTime(c.remoteTime)}</span></div>
                    <div className="ver-primary">{remote.primary}</div>
                    <div className="ver-sub">{remote.secondary}</div>
                    <button className="ghost-btn" style={{ margin: '8px 0 0', padding: '7px 0' }} disabled={busy === c.id} onClick={() => choose(c.id, 'remote')}>
                      保留远程
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {err && <div className="conflict-error">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={() => store.dismissConflicts()}>暂时忽略</button>
        </div>
      </div>
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import { Search, X, ChevronRight, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { toISO } from '../date'

type Props = {
  open: boolean
  currentCat: string
  onClose: () => void
  onPickCategory: (id: string) => void
  onSelectEvent: (id: string) => void
  onOpenTrash: () => void
}

/** 左上角三道杠呼出的侧边栏：顶部搜索 + 各分类及事件数 */
export function Drawer({ open, currentCat, onClose, onPickCategory, onSelectEvent, onOpenTrash }: Props) {
  const { categories, events, trash } = useStore()
  const [q, setQ] = useState('')

  // 每个分类的事件数（全部 = 事件总数）
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of events) m[e.categoryId] = (m[e.categoryId] || 0) + 1
    m['cat:all'] = events.length
    return m
  }, [events])

  // 搜索：标题 / 备注 / 日期匹配，最多 30 条
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return events
      .filter((e) => e.title.toLowerCase().includes(s) || (e.note || '').toLowerCase().includes(s) || e.date.includes(s))
      .slice(0, 30)
  }, [q, events])

  if (!open) return null

  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title">分类与搜索</span>
          <button className="drawer-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>

        {/* 顶部搜索 */}
        <div className="drawer-search">
          <Search size={17} />
          <input
            autoFocus
            className="drawer-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索事件名称、备注或日期"
          />
          {q && <button className="drawer-search-clear" onClick={() => setQ('')} aria-label="清空"><X size={15} /></button>}
        </div>

        {q.trim() ? (
          <div className="drawer-section">
            <div className="drawer-section-title">搜索结果 · {results.length}</div>
            <div className="drawer-scroll">
              {results.map((e) => (
                <button className="drawer-result" key={e.id} onClick={() => onSelectEvent(e.id)}>
                  <span className="drawer-result-icon">{e.icon}</span>
                  <span className="drawer-result-main">
                    <b>{e.title}</b>
                    <small>{toISO(new Date(e.date))}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!results.length && <div className="drawer-empty">没有匹配的事件</div>}
            </div>
          </div>
        ) : (
          <div className="drawer-section">
            <div className="drawer-section-title">全部分类</div>
            <div className="drawer-scroll">
              {categories.map((c) => (
                <button
                  className={`drawer-cat${currentCat === c.id ? ' active' : ''}`}
                  key={c.id}
                  onClick={() => onPickCategory(c.id)}
                >
                  <span className="drawer-cat-dot" style={{ background: c.color }} />
                  <span className="drawer-cat-name">{c.name}</span>
                  <span className="drawer-cat-count">{counts[c.id] || 0}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 回收站：与分类明显分隔，固定在最下方 */}
        <div className="drawer-footer">
          <button className="drawer-trash" onClick={onOpenTrash}>
            <span className="drawer-trash-icon"><Trash2 size={16} /></span>
            <span className="drawer-trash-main">
              <b>回收站</b>
              <small>已删除的事件可恢复</small>
            </span>
            {trash.length > 0 && <span className="drawer-trash-badge">{trash.length}</span>}
          </button>
        </div>
      </aside>
    </div>
  )
}

import React, { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { useStore } from '../store'
import { CATEGORY_COLORS, type Category } from '../types'
import { AddBtn, BackBtn, EditBtn, useToast } from './ui'

type GridProps = { onBack: () => void; onManage: () => void; onPick?: (id: string) => void; current?: string }

export function CategoryGrid({ onBack, onManage, onPick, current }: GridProps) {
  const { categories, addCategory } = useStore()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])

  const create = () => {
    if (!name.trim()) return toast('请输入分类名称')
    const c = addCategory(name.trim(), color)
    onPick?.(c.id)
    setCreating(false); setName(''); toast('分类已创建')
  }

  return (
    <div className="page">
      <div className="navbar">
        <BackBtn onClick={onBack} />
        <div className="nav-title">类别</div>
        <EditBtn onClick={onManage} />
      </div>
      <div className="cat-grid">
        {categories.map((c) => (
          <button key={c.id} className="cat-book" onClick={() => onPick?.(c.id)}>
            <div className="book-cover" style={{ background: c.color }}>
              {current === c.id && <span className="book-check">✓</span>}
            </div>
            <div className="book-label">{c.name}{c.builtin && <small>系统默认</small>}</div>
          </button>
        ))}
      </div>
      <button className="fab small" onClick={() => setCreating(true)}>＋</button>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="h2 center">新建分类</div>
            <div className="field" style={{ marginTop: 18 }}><label>名称</label><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：旅行" /></div>
            <div className="field"><label>封面颜色</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {CATEGORY_COLORS.map((x) => <button key={x} onClick={() => setColor(x)} style={{ width: 32, height: 32, borderRadius: 9, background: x, border: color === x ? '2px solid #444' : 'none' }} />)}
              </div>
            </div>
            <button className="primary-btn" onClick={create}>创建</button>
          </div>
        </div>
      )}
    </div>
  )
}

type ListProps = { onBack: () => void; onDone?: () => void }

export function CategoryList({ onBack, onDone }: ListProps) {
  const { categories, reorderCategories, updateCategory, removeCategory } = useStore()
  const [editing, setEditing] = useState<Category | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const onMove = (clientY: number) => {
    if (dragIndex == null || !listRef.current) return
    const rows = Array.from(listRef.current.querySelectorAll('[data-cat-row]')) as HTMLElement[]
    const target = rows.findIndex((r) => {
      const b = r.getBoundingClientRect()
      return clientY >= b.top && clientY <= b.bottom
    })
    if (target >= 0 && target !== dragIndex) {
      reorderCategories(dragIndex, target)
      setDragIndex(target)
    }
  }

  const saveEdit = () => {
    if (!editing) return
    if (!editing.name.trim()) return
    updateCategory(editing.id, { name: editing.name.trim(), color: editing.color })
    setEditing(null)
  }

  return (
    <div className="page">
      <div className="navbar">
        <BackBtn onClick={onBack} />
        <div>
          <div className="nav-title" style={{ lineHeight: 1.1 }}>类别</div>
          <div className="cat-subtitle">长按拖动排序，点击编辑</div>
        </div>
        <div style={{ width: 34 }} />
      </div>
      <div ref={listRef} onMouseMove={(e) => onMove(e.clientY)} onTouchMove={(e) => onMove(e.touches[0].clientY)} onMouseUp={() => setDragIndex(null)} onTouchEnd={() => setDragIndex(null)}>
        {categories.map((c, i) => (
          <div key={c.id} data-cat-row className={`cat-row${c.builtin ? ' builtin' : ''}`} style={{ opacity: dragIndex === i ? .55 : 1 }}>
            <button className="cat-swatch" style={{ background: c.color }} onClick={() => !c.builtin && setEditing({ ...c })} />
            <button className="cat-name" style={{ textAlign: 'left' }} onClick={() => !c.builtin && setEditing({ ...c })}>
              {c.name}{c.builtin && <small>（系统默认）</small>}
            </button>
            {!c.builtin && <span className="cat-grip" onMouseDown={() => setDragIndex(i)} onTouchStart={() => setDragIndex(i)}><GripVertical size={20} /></span>}
          </div>
        ))}
      </div>
      <button className="primary-btn" style={{ marginTop: 30 }} onClick={onDone || onBack}>完成</button>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="h2 center">编辑分类</div>
            <div className="field" style={{ marginTop: 18 }}><label>名称</label><input autoFocus className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="field"><label>封面颜色</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {CATEGORY_COLORS.map((x) => <button key={x} onClick={() => setEditing({ ...editing, color: x })} style={{ width: 32, height: 32, borderRadius: 9, background: x, border: editing.color === x ? '2px solid #444' : 'none' }} />)}
              </div>
            </div>
            <button className="primary-btn" onClick={saveEdit}>保存</button>
            <button className="delete-link" onClick={() => { removeCategory(editing.id); setEditing(null) }}>删除分类（含其中事件）</button>
          </div>
        </div>
      )}
    </div>
  )
}

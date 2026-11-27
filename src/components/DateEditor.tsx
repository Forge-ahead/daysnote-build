import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { lunarToSolar, solarToLunarParts, toISO, fromISO } from '../date'
import { CARD_COLORS, CATEGORY_COLORS, type EventItem } from '../types'
import { BackBtn, Switch, useToast } from './ui'

const ICONS = ['🦄', '🐱', '💕', '🐾', '🧦', '☀️', '🕯️', '💝', '🎂', '✈️', '🎓', '🏠', '💍', '🌸', '🍀', '⭐', '📌', '❤️']

type Props = {
  eventId?: string
  initialDate?: string
  onBack: () => void
  onSaved: (id: string) => void
}

export function DateEditor({ eventId, initialDate, onBack, onSaved }: Props) {
  const store = useStore()
  const toast = useToast()
  const existing = store.events.find((e) => e.id === eventId)
  const baseIso = existing?.date || initialDate || toISO(new Date())

  const [title, setTitle] = useState(existing?.title || '')
  const [note, setNote] = useState(existing?.note || '')
  const [icon, setIcon] = useState(existing?.icon || '🦄')
  const [color, setColor] = useState(existing?.color || CARD_COLORS[0])
  const [categoryId, setCategoryId] = useState(existing?.categoryId || 'cat:all')
  const [lunar, setLunar] = useState(existing?.lunar || false)
  const [repeat, setRepeat] = useState<EventItem['repeat']>(existing?.repeat || 'none')
  const [showInTimeline, setShowInTimeline] = useState(existing?.showInTimeline ?? true)
  const [displayMode, setDisplayMode] = useState<EventItem['displayMode']>(
    existing?.displayMode || ((existing?.repeat || 'none') === 'yearly' ? 'countdown' : 'countup'),
  )
  const [parts, setParts] = useState(() => {
    const d = fromISO(baseIso)
    return lunar ? solarToLunarParts(baseIso) : { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
  })
  const [tab, setTab] = useState<'date' | 'info'>('date')

  const years = lunar
    ? Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i)
    : Array.from({ length: 121 }, (_, i) => new Date().getFullYear() - 60 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const days = Array.from({ length: lunar ? 30 : 31 }, (_, i) => i + 1)

  const save = () => {
    if (!title.trim()) return toast('请先填写事件名称')
    let iso = ''
    if (lunar) {
      const r = lunarToSolar(parts.year, parts.month, parts.day)
      if (!r) return toast('这个农历日期不存在，请换一个')
      iso = r
    } else {
      const max = new Date(parts.year, parts.month, 0).getDate()
      iso = toISO(new Date(parts.year, parts.month - 1, Math.min(parts.day, max)))
    }
    const payload = { title: title.trim(), date: iso, note, icon: icon.trim() || '📌', color, categoryId, lunar, repeat, showInTimeline, displayMode }
    const saved = existing
      ? store.updateEvent(existing.id, payload)
      : store.addEvent(payload)
    if (saved) onSaved(saved.id)
    toast(existing ? '已保存修改' : '已新建事件')
  }

  return (
    <div className="page">
      <div className="navbar">
        <BackBtn onClick={onBack} />
        <div className="nav-title">设置日期</div>
        <button className="nav-pill" style={{ background: '#33312f', color: '#fff', border: 0 }} onClick={save}>继续</button>
      </div>

      <div className="center hint">未来日期为倒数，过去日期为正数</div>

      <div className="segment" style={{ width: 240, marginTop: 22 }}>
        <button className={tab === 'date' ? 'on' : ''} style={{ ['--color' as any]: '#e2eadd' }} onClick={() => setTab('date')}>日期</button>
        <button className={tab === 'info' ? 'on' : ''} style={{ ['--color' as any]: '#e2eadd' }} onClick={() => setTab('info')}>内容</button>
      </div>

      {tab === 'date' ? (
        <>
          <div className="picker-card">
            <div className="picker-wrap">
              <div className="picker-cols">
                <Wheel values={years} value={parts.year} onChange={(v) => setParts((p) => ({ ...p, year: v }))} suffix={lunar ? '' : '年'} />
                <Wheel values={months} value={parts.month} onChange={(v) => setParts((p) => ({ ...p, month: v }))} suffix={lunar ? '月' : '月'} />
                <Wheel values={days} value={parts.day} onChange={(v) => setParts((p) => ({ ...p, day: v }))} suffix={lunar ? '日' : '日'} />
              </div>
            </div>
          </div>
          <button className={`lunar-toggle${lunar ? ' on' : ''}`} onClick={() => {
            const next = !lunar
            setLunar(next)
            setParts(next ? solarToLunarParts(toISO(new Date(parts.year, parts.month - 1, Math.min(parts.day, 28)))) : (() => {
              const s = lunarToSolar(parts.year, parts.month, parts.day)
              const d = s ? fromISO(s) : new Date()
              return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
            })())
          }}>农</button>
          <div className="center hint" style={{ marginTop: 8 }}>{lunar ? '当前：农历（按农历每年重复）' : '当前：公历'}</div>
        </>
      ) : (
        <div style={{ marginTop: 24 }}>
          <div className="field"><label>事件名称</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：周年庆" /></div>
          <div className="field"><label>图标</label>
            <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="可直接输入任意 Emoji，例如 🌙" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {ICONS.map((x) => <button key={x} onClick={() => setIcon(x)} style={{ fontSize: 22, background: x === icon ? '#e6efe1' : 'var(--surface)', borderRadius: 12, padding: '5px 8px', border: '1px solid var(--line)' }}>{x}</button>)}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>点选快速图标，或直接在上方输入任意 Emoji；留空保存时会自动使用 📌。</div>
          </div>
          <div className="field"><label>分类</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {store.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label>卡片颜色</label>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {[...CARD_COLORS, ...CATEGORY_COLORS.slice(0, 3)].map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: 9, background: c, border: color === c ? '2px solid #555' : '1px solid rgba(0,0,0,.08)' }} />
              ))}
            </div>
          </div>
          <div className="field"><label>重复</label>
            <select className="select" value={repeat} onChange={(e) => setRepeat(e.target.value as EventItem['repeat'])}>
              <option value="none">不重复</option><option value="yearly">每年重复</option>
            </select>
          </div>
          <div className="field"><label>首页显示方式</label>
            <div className="segment" style={{ width: '100%' }}>
              {([
                ['countdown', '倒数'],
                ['countup', '正数'],
                ['both', '都显示'],
              ] as const).map(([v, label]) => (
                <button key={v} className={displayMode === v ? 'on' : ''} style={{ ['--color' as any]: '#e2eadd' }} onClick={() => setDisplayMode(v)}>{label}</button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              倒数＝还有几天；正数＝已过几天；都显示＝首页两组都出现。日期始终显示事件本身的真实年份。
            </div>
          </div>
          <div className="field row-between"><label style={{ margin: 0 }}>显示到事件时间轴</label><Switch on={showInTimeline} onChange={setShowInTimeline} /></div>
          <div className="hint" style={{ textAlign: 'left', marginTop: -4 }}>关闭后该纪念日不会出现在「事件」页的时间轴中，首页仍正常显示。</div>
          <div className="field"><label>备注</label><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="写点什么…" /></div>
        </div>
      )}

      <button className="primary-btn" style={{ marginTop: 28 }} onClick={save}>{existing ? '保存修改' : '创建事件'}</button>
      {existing && <button className="delete-link" onClick={() => { store.removeEvent(existing.id); toast('已删除事件'); onBack() }}>删除这个事件</button>}
    </div>
  )
}

function Wheel({ values, value, onChange, suffix }: { values: number[]; value: number; onChange: (v: number) => void; suffix: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const index = Math.max(0, values.indexOf(value))

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = index * 42
    // 只跟随外部值变化，不重复设置滚动
  }, [index])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / 42)))
    if (values[i] !== value) onChange(values[i])
  }

  return (
    <div className="picker-col" ref={ref} onScroll={onScroll}>
      {values.map((v, i) => (
        <div key={v} className={i === index ? 'on' : ''} onClick={() => { if (ref.current) ref.current.scrollTo({ top: i * 42, behavior: 'smooth' }) }}>
          {v}{suffix}
        </div>
      ))}
    </div>
  )
}

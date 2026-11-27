import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Menu } from 'lucide-react'
import { useStore } from '../store'
import { displayDate, formatDateCN, formatDays, homeCounts, yearRemaining } from '../date'
import type { EventItem } from '../types'
import { AddBtn, IconBtn, useToast } from './ui'

type Props = {
  catId: string
  onOpenCategoryGrid: () => void
  onSelectEvent: (id: string) => void
  onAddEvent: () => void
  onMenu: () => void
}

export function HomeView({ catId, onOpenCategoryGrid, onSelectEvent, onAddEvent, onMenu }: Props) {
  const { events, categories } = useStore()
  const [fold, setFold] = useState({ future: false, past: false })
  const toast = useToast()

  const cat = categories.find((c) => c.id === catId) || categories[0]
  // 按每个事件选择的「显示方式」分组：倒数 / 正数 / 两者都显示。
  // 日期用事件本身的真实年份（displayDate），天数由 homeCounts 分别按滚动目标与真实日期计算。
  const list = useMemo(() => {
    const filtered = catId === 'cat:all' ? events : events.filter((e) => e.categoryId === catId)
    const future: Array<{ ev: EventItem; days: number }> = []
    const past: Array<{ ev: EventItem; days: number }> = []
    for (const ev of filtered) {
      const { countdown, countup } = homeCounts(ev)
      if (countdown !== null) future.push({ ev, days: countdown })
      if (countup !== null) past.push({ ev, days: countup })
    }
    future.sort((a, b) => a.days - b.days)
    past.sort((a, b) => a.days - b.days)
    return { future, past }
  }, [events, catId])

  const renderGroup = (title: string, items: typeof list.future, key: 'future' | 'past') => (
    <>
      <div className="group-head">
        <span className="group-label">{title} · {items.length}</span>
        <button className="chev" onClick={() => setFold((s) => ({ ...s, [key]: !s[key] }))}>
          {fold[key] ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      {!fold[key] && items.map(({ ev, days }) => (
        <EventRow key={`${key}:${ev.id}`} ev={ev} days={days} onClick={() => onSelectEvent(ev.id)} onLong={() => toast(ev.note || ev.title)} />
      ))}
    </>
  )

  return (
    <div className="page">
      <div className="navbar">
        <IconBtn plain onClick={onMenu}><Menu size={21} /></IconBtn>
        <button className="category-switch" onClick={onOpenCategoryGrid}>
          {cat?.name || '纪念日'} <ChevronDown size={15} />
        </button>
        <AddBtn onClick={onAddEvent} />
      </div>
      {/* 「今年剩余」是动态展示位而非真实事件：天数按当前年份 12-31 实时计算，跨年自动切换，不进入事件列表 */}
      <div className="hero-card" style={{ background: '#f3b8c2' }}>
        <div className="hero-num"><b>{formatDays(yearRemaining())}</b><small>DAYS</small></div>
        <div className="hero-body">
          <div className="hero-title">今年剩余</div>
          <div className="hero-date">{formatDateCN(`${new Date().getFullYear()}-12-31`)}</div>
        </div>
        <span className="hero-icon">🎆</span>
      </div>
      {renderGroup('倒数', list.future, 'future')}
      {renderGroup('正数', list.past, 'past')}
    </div>
  )
}

function EventRow({ ev, days, onClick, onLong }: { ev: EventItem; days: number; onClick: () => void; onLong: () => void }) {
  const timer = React.useRef<number | undefined>(undefined)
  return (
    <button
      className="event-card"
      style={{ background: ev.color }}
      onClick={() => { window.clearTimeout(timer.current); onClick() }}
      onTouchStart={() => { timer.current = window.setTimeout(onLong, 550) }}
      onTouchEnd={() => window.clearTimeout(timer.current)}
      onContextMenu={(e) => { e.preventDefault(); onLong() }}
    >
      <span className="ev-icon">{ev.icon}</span>
      <span className="ev-main">
        <span className="ev-title">{ev.title}</span>
        <span className="ev-date">{formatDateCN(displayDate(ev))}</span>
      </span>
      <span className="ev-num"><small>{days > 365 ? 'YEARS' : 'DAYS'}</small><b>{formatDays(days)}</b></span>
    </button>
  )
}

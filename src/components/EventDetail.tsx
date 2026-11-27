import React, { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useStore } from '../store'
import { dayInfo, displayDate, formatDateCN, homeCounts, inferDisplayMode, lunarText, yearRemaining } from '../date'
import { EditBtn, IconBtn } from './ui'

type Props = { id: string; onBack: () => void; onEdit: () => void }

export function EventDetail({ id, onBack, onEdit }: Props) {
  const { events } = useStore()
  const ev = events.find((e) => e.id === id)
  const [unit, setUnit] = useState<'年' | '月' | '周' | '日'>('日')
  if (!ev) return <div className="page"><div className="center" style={{ marginTop: 60 }}>事件不存在</div></div>

  const info = dayInfo(ev)
  const mode = inferDisplayMode(ev)
  const counts = homeCounts(ev)
  // 详情默认按显示方式取数：倒数优先用倒数天数，正数用已过天数，都显示时展示倒数
  const baseDays = mode === 'countup' ? (counts.countup ?? info.days) : (counts.countdown ?? info.days)
  const value = unit === '日' ? baseDays
    : unit === '周' ? Math.floor(baseDays / 7)
    : unit === '月' ? Math.floor(baseDays / 30.44)
    : (baseDays / 365.25).toFixed(1)
  const caption = mode === 'countup'
    ? `${ev.title}已经过去`
    : (ev.repeat === 'yearly' ? `距离下一次${ev.title}还有` : `距离${ev.title}还有`)

  return (
    <div className="page">
      <div className="detail-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconBtn plain>🗓️</IconBtn>
          <button className="nav-pill" style={{ fontSize: 12 }}>写日记</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EditBtn onClick={onEdit} />
          <button className="nav-pill nav-back" onClick={onBack}>返回</button>
        </div>
      </div>

      <div className="detail-frame">
        <div className="detail-inner" style={{ background: ev.color }}>
          <div className="detail-illustration">{ev.icon}</div>
          <div className="detail-number">{value}</div>
          <div className="detail-date">{formatDateCN(displayDate(ev))}</div>
          {ev.lunar && <div className="detail-date" style={{ marginTop: 3 }}>农历 {lunarText(ev.date)}</div>}
        </div>
        <div className="detail-caption">{caption}</div>
      </div>

      <div className="segment" style={{ ['--color' as any]: ev.color }}>
        {(['年', '月', '周', '日'] as const).map((u) => (
          <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>{u}</button>
        ))}
      </div>

      {ev.note && <div className="note-card" style={{ marginTop: 26 }}>{ev.note}</div>}
      <div className="center" style={{ marginTop: 26, color: '#8f8b86', fontSize: 12 }}>
        今年剩余还有 {yearRemaining()} 天
      </div>
      <button className="nav-back" style={{ margin: '20px auto' }} onClick={onBack}>
        <ChevronLeft size={20} /> 返回列表
      </button>
    </div>
  )
}

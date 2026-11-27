import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { fromISO, getFestivalsForYear, todayStart } from '../date'
import { AddBtn, useToast } from './ui'

type Props = { onSelect: (id: string) => void; onAdd: () => void }
type Row = {
  key: string
  id: string | null
  date: Date
  title: string
  icon: string
  color: string
  diff: number
  kind: 'event' | 'lunar' | 'legal' | 'year'
  year?: number
}

const MIN_YEAR = 1970
const MAX_YEAR = 2100
const LS_SCOPE = 'daysnote.timeline.scope.v1'
const LS_CAT = 'daysnote.timeline.cat.v1'

function loadPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function savePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function TimelineView({ onSelect, onAdd }: Props) {
  const { events, categories, settings } = useStore()
  const toast = useToast()
  const now = todayStart()
  const thisYear = now.getFullYear()

  // 范围：默认当前年前后各一年；滚动到上下边缘时自动扩展。组件卸载后不保留，下次打开回到当前年。
  const [range, setRange] = useState(() => ({ from: thisYear - 1, to: thisYear + 1 }))
  // 「全部 / 仅纪念日」与分类：持久化记忆；年份不记忆。
  const [scope, setScope] = useState<'all' | 'anniv'>(() => (loadPref(LS_SCOPE, 'all') === 'anniv' ? 'anniv' : 'all'))
  const [selectedCat, setSelectedCat] = useState(() => loadPref(LS_CAT, 'all'))

  const pageRef = useRef<HTMLDivElement>(null)
  const pendingTopRef = useRef<number | null>(null)
  const didInitRef = useRef(false)
  const guardRef = useRef(false)

  const setScopeAndSave = (v: 'all' | 'anniv') => { setScope(v); savePref(LS_SCOPE, v) }
  const setCatAndSave = (v: string) => { setSelectedCat(v); savePref(LS_CAT, v) }

  const years = useMemo(() => {
    const arr: number[] = []
    for (let y = range.from; y <= range.to; y++) arr.push(y)
    return arr
  }, [range.from, range.to])

  // 年份下拉候选：当前年 ±8 年 + 事件里出现的年份 + 已加载年份（不记忆，仅本次会话）
  const pickerYears = useMemo(() => {
    const s = new Set<number>()
    for (let y = thisYear - 8; y <= thisYear + 8; y++) s.add(y)
    for (const e of events) { const y = Number(e.date.slice(0, 4)); if (y) s.add(y) }
    for (const y of years) s.add(y)
    return [...s].sort((a, b) => a - b)
  }, [events, thisYear, years])

  const jumpToYear = (y: number) => {
    setRange((r) => ({ from: Math.min(r.from, y - 1), to: Math.max(r.to, y + 1) }))
    requestAnimationFrame(() => {
      const el = pageRef.current
      if (!el) return
      const target = el.querySelector<HTMLElement>(`[data-year="${y}"]`)
      if (target) el.scrollTop = target.offsetTop - el.offsetTop - 6
    })
  }

  // 生成连续时间轴：每年一个年份标题 + 该年按日期排序的事件与节日
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = []
    for (const y of years) {
      const perYear: Row[] = []
      // 纪念日事件：尊重「显示到时间轴」开关
      for (const e of events) {
        if (e.showInTimeline === false) continue
        if (selectedCat !== 'all' && e.categoryId !== selectedCat) continue
        const base = fromISO(e.date)
        const date = new Date(y, base.getMonth(), base.getDate())
        const diff = Math.round((date.getTime() - now.getTime()) / 86400000)
        perYear.push({ key: `${e.id}-${y}`, id: e.id, date, title: e.title, icon: e.icon, color: e.color, diff, kind: 'event' })
      }
      // 节日：设置开关打开、且范围为「全部」时混入（农历节日按年份动态换算公历）
      if (settings.showFestivals && scope === 'all') {
        for (const f of getFestivalsForYear(y)) {
          const diff = Math.round((f.date.getTime() - now.getTime()) / 86400000)
          perYear.push({
            key: `festival-${f.kind}-${f.name}-${y}`, id: null, date: f.date, title: f.name,
            icon: f.icon, color: f.kind === 'lunar' ? '#c98a5b' : '#5b8f84', diff, kind: f.kind,
          })
        }
      }
      perYear.sort((a, b) => a.date.getTime() - b.date.getTime())
      list.push({ key: `year-${y}`, id: null, date: new Date(y, 0, 1), title: `${y}年`, icon: '', color: '', diff: 0, kind: 'year', year: y })
      list.push(...perYear)
    }
    return list
  }, [years, events, selectedCat, now, settings.showFestivals, scope])

  // 首次进入定位到当前年份标题，而不是顶部（上一年）
  useLayoutEffect(() => {
    const el = pageRef.current
    if (!el || didInitRef.current || !rows.length) return
    const target = el.querySelector<HTMLElement>(`[data-year="${thisYear}"]`)
    if (target) el.scrollTop = target.offsetTop - el.offsetTop - 6
    didInitRef.current = true
  }, [rows, thisYear])

  // 在顶部插入新年份后，补偿 scrollTop 让视觉位置保持不变
  useLayoutEffect(() => {
    const el = pageRef.current
    if (el && pendingTopRef.current != null) {
      el.scrollTop = el.scrollTop + (el.scrollHeight - pendingTopRef.current)
      pendingTopRef.current = null
      guardRef.current = false
    }
  }, [rows])

  const onScroll = () => {
    const el = pageRef.current
    if (!el || guardRef.current || !didInitRef.current) return
    const nearTop = el.scrollTop < 72
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 72
    if (nearTop && range.from > MIN_YEAR) {
      guardRef.current = true
      pendingTopRef.current = el.scrollHeight
      setRange((r) => ({ ...r, from: Math.max(MIN_YEAR, r.from - 1) }))
    } else if (nearBottom && range.to < MAX_YEAR) {
      guardRef.current = true
      setRange((r) => ({ ...r, to: Math.min(MAX_YEAR, r.to + 1) }))
      requestAnimationFrame(() => { guardRef.current = false })
    }
  }

  const label = (diff: number) => diff === 0 ? '0天' : diff > 0 ? `${diff}天后` : `${-diff}天前`
  const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const week = (d: Date) => '周' + '日一二三四五六'[d.getDay()]

  return (
    <div className="page timeline-page" ref={pageRef} onScroll={onScroll}>
      <div className="navbar">
        <div style={{ width: 34 }} />
        <div>
          <div className="nav-title" style={{ lineHeight: 1.1 }}>时刻</div>
          <div className="cat-subtitle">按月日排列 · 节日与纪念日</div>
        </div>
        <AddBtn onClick={onAdd} />
      </div>

      {/* 控件浮动：无限滚动时不随内容滚走。年份下拉已去掉，分类挪到「仅纪念日」旁边，整栏单行上移 */}
      <div className="tl-controls">
        <div className="tl-bar">
          <div className="segment">
            <button className={scope === 'all' ? 'on' : ''} style={{ ['--color' as any]: '#e3ecdf' }} onClick={() => setScopeAndSave('all')}>全部</button>
            <button className={scope === 'anniv' ? 'on' : ''} style={{ ['--color' as any]: '#e3ecdf' }} onClick={() => setScopeAndSave('anniv')}>仅纪念日</button>
          </div>
          <select className="select-pill" value={selectedCat} onChange={(e) => setCatAndSave(e.target.value)}>
            <option value="all">所有分类</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="timeline">
        {rows.map((r) => {
          if (r.kind === 'year') {
            return (
              <label className="tl-year" data-year={r.year} key={r.key} title="点击选择年份">
                <select value={r.year} onChange={(e) => jumpToYear(Number(e.target.value))}>
                  {pickerYears.map((y) => <option key={y} value={y}>{y}年</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
            )
          }
          const isToday = r.diff === 0
          const isFestival = r.kind !== 'event'
          return (
            <button className={`tl-row${isToday ? ' today' : ''}${isFestival ? ' festival' : ''}`} key={r.key}
              onClick={() => r.id ? onSelect(r.id) : toast(`${r.title} · ${md(r.date)}（${r.kind === 'lunar' ? '农历节日' : '法定节日'}）`)}>
              <span className="tl-diff">{label(r.diff)}</span>
              <span className="tl-line"><i style={{ background: isToday ? '#5b8f84' : (isFestival ? '#d3a778' : '#c9bfb3') }} /></span>
              <span className="tl-content">
                <span className="tl-date">{isToday ? '今天 · ' : ''}{md(r.date)} {week(r.date)}{isFestival ? ` · ${r.kind === 'lunar' ? '农历' : '节日'}` : ''}</span>
                <span className="tl-title">{r.title}</span>
              </span>
              {r.icon && <span className="tl-icon">{r.icon}</span>}
            </button>
          )
        })}
        {!rows.length && <div className="center hint" style={{ marginTop: 50 }}>这个筛选下还没有事件<br />点右上角 ＋ 添加</div>}
        <div className="tl-end">继续上下滑动，自动加载更多年份</div>
      </div>
    </div>
  )
}

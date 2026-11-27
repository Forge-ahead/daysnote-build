import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { dayInfo, displayDate, WEEKDAY_FULL } from '../date'
import {
  DEMO_EVENTS, WEEKDAYS, WIDGET_CATEGORIES, WIDGET_SHARED_KEY, WIDGET_SIZES,
  WIDGET_TEMPLATES,
  type WidgetTemplate, type WidgetSize,
} from '../widgetTemplates'
import {
  loadBindings, emptyBinding, templateEvents, categoryName,
  type Bindings, type WidgetBinding,
} from '../widgetBindings'
import { getHolidayPeriods, peekHoliday, nextHoliday, type HolidayCountdown } from '../holiday'
import type { EventItem } from '../types'
import { useToast } from './ui'
import { syncWidgetData, selectWidget } from '../widgetBridge'

type BoundEvent = {
  title: string
  date: string
  days: number
  icon: string
  weekday: number
  holiday?: boolean
}

/** 模板是否支持多事件（本版本全部支持二选一来源） */
const MULTI_SLOT = new Set(WIDGET_TEMPLATES.filter((t) => t.slots > 1).map((t) => t.id))

/** 日期短格式：slash=MM/DD，full=YYYY.MM.DD */
function shortDate(dateISO: string, style: 'slash' | 'full'): string {
  const p = dateISO.replace(/\./g, '-').split('-')
  const m = p.length >= 2 ? p[p.length - 2] : '01'
  const d = p.length >= 1 ? p[p.length - 1] : '01'
  return style === 'slash' ? `${m}/${d}` : dateISO
}

function toBound(ev: EventItem, holidayFlag: boolean): BoundEvent {
  const info = dayInfo(ev)
  const real = displayDate(ev).replace(/-/g, '.')
  return {
    title: ev.title,
    date: real,
    days: info.days,
    icon: ev.icon || '📌',
    weekday: info.target.getDay(),
    holiday: holidayFlag,
  }
}

type Props = { onBack: () => void; onSelectEvent?: (id: string) => void }

export function WidgetsView({ onBack, onSelectEvent }: Props) {
  const { events, categories } = useStore()
  const toast = useToast()
  const [category, setCategory] = useState<(typeof WIDGET_CATEGORIES)[number]>('中')
  const [selected, setSelected] = useState<WidgetTemplate | null>(null)
  const [setting, setSetting] = useState(false)
  const [bindings, setBindings] = useState<Bindings>(() => loadBindings(localStorage.getItem(WIDGET_SHARED_KEY)))
  const [holiday, setHoliday] = useState<HolidayCountdown | null>(() => peekHoliday())

  // 每月一次的节假日联网刷新（holiday.ts 内部按月份缓存）
  useEffect(() => {
    let alive = true
    void getHolidayPeriods().then((periods) => {
      if (!alive) return
      setHoliday(nextHoliday(periods))
      syncWidgetData(events, categories)
    })
    return () => { alive = false }
  }, [events, categories])

  const templates = useMemo(() => WIDGET_TEMPLATES.filter((t) => t.category === category), [category])

  // 绑定变更统一持久化并同步到原生 App Group。
  // 用函数式 setState，避免同一 tick 内连续点击两个分类时后一次覆盖前一次。
  useEffect(() => {
    try { localStorage.setItem(WIDGET_SHARED_KEY, JSON.stringify(bindings)) } catch { /* ignore */ }
    syncWidgetData(events, categories)
  }, [bindings, events, categories])

  /** 组件实际展示的事件（已按临近排序、过期自动顺延；未绑定时默认全部事件） */
  const boundEvents = (tpl: WidgetTemplate): BoundEvent[] => {
    const picked = templateEvents(tpl, bindings, events, categories)
    const list = picked.map((ev) => toBound(ev, Boolean(tpl.holiday)))
    // 仅当用户一条事件都没有时用示例兜底预览；正常情况默认已加载全部事件
    if (!list.length) {
      DEMO_EVENTS.slice(0, tpl.slots).forEach((d) => {
        list.push({
          title: d.title, date: d.date.replace(/-/g, '.'), days: d.days, icon: d.icon,
          weekday: new Date().getDay(), holiday: Boolean(tpl.holiday),
        })
      })
    }
    return list
  }

  const boundCount = (tpl: WidgetTemplate): number => templateEvents(tpl, bindings, events, categories).length

  const updateBinding = (tplId: string, patch: Partial<WidgetBinding>) => {
    setBindings((prev) => {
      const cur = prev[tplId] || emptyBinding()
      return { ...prev, [tplId]: { ...cur, ...patch } }
    })
  }

  const toggleEvent = (tplId: string, eventId: string) => {
    setBindings((prev) => {
      const cur = prev[tplId] || emptyBinding()
      const ids = cur.eventIds.includes(eventId)
        ? cur.eventIds.filter((x) => x !== eventId)
        : [...cur.eventIds, eventId]
      return { ...prev, [tplId]: { ...cur, eventIds: ids, mode: 'events' } }
    })
  }

  /** 多选分类：点击切换选中，空=默认全部（函数式更新保证连续点击不丢状态） */
  const toggleCategory = (tplId: string, catId: string) => {
    setBindings((prev) => {
      const cur = prev[tplId] || emptyBinding()
      const ids = cur.categoryIds.includes(catId)
        ? cur.categoryIds.filter((x) => x !== catId)
        : [...cur.categoryIds, catId]
      return { ...prev, [tplId]: { ...cur, categoryIds: ids, mode: 'category' } }
    })
  }

  const openTpl = (tpl: WidgetTemplate) => {
    setSelected(tpl); setSetting(false)
    selectWidget(tpl.id)
  }

  const binding = selected ? (bindings[selected.id] || emptyBinding()) : emptyBinding()

  return (
    <div className="page widgets-page">
      <div className="navbar">
        <button className="nav-back" onClick={onBack}>‹</button>
        <div className="nav-title">小组件</div>
        <div style={{ width: 34 }} />
      </div>

      <div className="widget-intro">
        按官方标准分 <b>小 2×2 · 中 4×2 · 大 4×4</b>。每个组件默认显示<b>全部事件</b>（按临近排序、过期顺延）；点「绑定事件」可改为多选分类或勾选指定事件。
      </div>

      <div className="widget-tabs">
        {WIDGET_CATEGORIES.map((c) => (
          <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <div className="widget-grid">
        {templates.map((tpl) => (
          <div key={tpl.id}>
            <button className="widget-card-btn" onClick={() => openTpl(tpl)}>
              <MiniPreview tpl={tpl} evs={boundEvents(tpl)} holiday={holiday} />
            </button>
            <div className="wt-name">{tpl.name}</div>
            <div className="wt-size">{WIDGET_SIZES[tpl.size].label} · {WIDGET_SIZES[tpl.size].grid}</div>
          </div>
        ))}
      </div>

      <button className="vip-hint" onClick={() => toast(`${WIDGET_TEMPLATES.length} 款组件已全部做进，更多样式持续更新`)}>👑 {WIDGET_TEMPLATES.length} 款组件已做进 · 更多持续更新</button>

      {selected && (
        <div className="modal-mask" onClick={() => setSelected(null)}>
          <div className="widget-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wm-head">
              <button onClick={() => setSelected(null)}>返回</button>
              <b>{selected.name}</b>
              <button className="wm-set" onClick={() => setSetting((s) => !s)}>{setting ? '收起' : '绑定事件'}</button>
            </div>
            <div className="wm-desc">{selected.desc}</div>

            {setting ? (
              <div className="wm-settings">
                {selected.kind === 'holiday' && (
                  <div className="wm-holiday-box">
                    <b>左侧法定节假日（自动获取）</b>
                    <div>当前：{holiday ? `${holiday.icon} 距离${holiday.name}${holiday.inProgress ? ' · 假期中' : `还有 ${holiday.daysLeft} 天`} · 休 ${holiday.rangeText}` : '正在获取…'}</div>
                    <small>数据来自国务院放假安排，每月自动联网更新一次；离线时使用上次缓存或农历推算。</small>
                  </div>
                )}
                <div className="hint">
                  右侧{selected.kind === 'holiday' ? '' : '组件'}事件来源（最多显示 {selected.slots} 个）：
                </div>
                <div className="wm-mode-switch">
                  <button className={binding.mode === 'events' ? 'on' : ''} onClick={() => updateBinding(selected.id, { mode: 'events' })}>① 指定事件</button>
                  <button className={binding.mode === 'category' ? 'on' : ''} onClick={() => updateBinding(selected.id, { mode: 'category' })}>② 选分类</button>
                </div>

                {binding.mode === 'events' ? (
                  <>
                    <div className="hint">勾选特定事件（可多选，按临近日期排序）。已选 {binding.eventIds.length} 个。</div>
                    <div className="wm-event-list">
                      {events.map((ev) => {
                        const on = binding.eventIds.includes(ev.id)
                        const info = dayInfo(ev)
                        return (
                          <button key={ev.id} className={`wm-event${on ? ' on' : ''}`} onClick={() => toggleEvent(selected.id, ev.id)}>
                            <span>{ev.icon}</span><span>{ev.title}</span><small>{info.dir === 'future' ? `还有${info.days}天` : `${info.days}天前`}</small>
                            <span className="wm-check">{on ? '✓' : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hint">可多选分类（点击切换）。不选任何分类则默认显示<b>全部事件</b>。所选分类下的事件按临近日期自动排入，过期后自动显示下一个。</div>
                    <div className="wm-event-list">
                      {categories.map((c) => {
                        const on = binding.categoryIds.includes(c.id)
                        const cnt = c.id === 'cat:all' ? events.length : events.filter((e) => e.categoryId === c.id).length
                        return (
                          <button key={c.id} className={`wm-event${on ? ' on' : ''}`} onClick={() => toggleCategory(selected.id, c.id)}>
                            <span style={{ color: c.color }}>●</span><span>{c.name}</span><small>{cnt} 个事件</small>
                            <span className="wm-check">{on ? '✓' : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="wm-bind-summary">
                  当前显示：{boundCount(selected)} 个事件
                  {binding.mode === 'category'
                    ? binding.categoryIds.length
                      ? `（分类：${binding.categoryIds.map((id) => categoryName(categories, id)).join('、')}）`
                      : '（未选分类 · 默认全部）'
                    : ''}
                </div>
                <button className="primary-btn" style={{ marginTop: 14 }} onClick={() => { setSetting(false); toast('已保存并同步到系统小组件') }}>完成</button>
              </div>
            ) : (
              <>
                <div className="wm-preview-block">
                  <div className="wm-preview-meta">
                    <span className="wm-size-badge">{WIDGET_SIZES[selected.size].label}</span>
                    <span>固定 {WIDGET_SIZES[selected.size].grid} · {WIDGET_SIZES[selected.size].pt} pt（此组件仅有该规格）</span>
                  </div>
                  <div className={`stage stage-${selected.size}`}>
                    <WidgetPreview tpl={selected} evs={boundEvents(selected)} holiday={holiday} size={selected.size} />
                  </div>
                </div>
                <div className="wm-note">
                  <b>关于真机系统小组件：</b>需要在 macOS 用 Xcode 编译一次带 Widget Extension 的 IPA（本项目已内置完整 Swift 源码与配置，见 README「系统小组件」一节）。编译安装后在桌面长按 → 添加小组件 → 选「纪念日」即可看到本页同款组件。
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniPreview({ tpl, evs, holiday }: { tpl: WidgetTemplate; evs: BoundEvent[]; holiday: HolidayCountdown | null }) {
  return (
    <div className={`widget-tpl kind-${tpl.kind} size-${tpl.size}`} style={{ background: tpl.skin.bg }}>
      <WidgetPreview tpl={tpl} evs={evs} holiday={holiday} size={tpl.size} mini />
    </div>
  )
}

function WidgetPreview({ tpl, evs, holiday, size, mini }: {
  tpl: WidgetTemplate; evs: BoundEvent[]; holiday: HolidayCountdown | null; size: WidgetSize; mini?: boolean
}) {
  switch (tpl.kind) {
    case 'holiday': return <HolidayPanel tpl={tpl} evs={evs} holiday={holiday} mini={mini} />
    case 'combo': return <ComboPanel tpl={tpl} evs={evs} mini={mini} />
    case 'simple': return <SimpleList tpl={tpl} evs={evs} mini={mini} withUnit={tpl.id === 'simple-day'} />
    case 'grid': return <GridPanel tpl={tpl} evs={evs} mini={mini} />
    case 'picture': return <PictureList tpl={tpl} evs={evs} mini={mini} />
    case 'listLarge': return <ListLarge tpl={tpl} evs={evs} mini={mini} />
  }
}

/** 假日组件（图2 逻辑强化版）：左侧法定节假日倒计时 + 休 + 放假区间；右侧指定分类事件 */
function HolidayPanel({ tpl, evs, holiday, mini }: { tpl: WidgetTemplate; evs: BoundEvent[]; holiday: HolidayCountdown | null; mini?: boolean }) {
  const s = tpl.skin
  const h = holiday
  const rows = evs.slice(0, tpl.slots)
  return (
    <div className="wp-combo wp-holiday" style={{ background: s.bg }}>
      <div className="wp-combo-left" style={{ background: `linear-gradient(150deg, ${s.bgAccent}, ${s.bg})`, color: s.ink }}>
        <div className="wp-c-title" style={{ color: s.brand }}>{h ? `距离${h.name}` : '距离下一个假期'}</div>
        <div className="wp-c-big" style={{ color: s.brand }}>
          {h ? (h.inProgress ? <><span className="wp-c-in">进行中</span></> : <>{h.daysLeft}<i>天</i></>) : '—'}
        </div>
        {h && (
          <div className="wp-c-holiday">
            <span style={{ background: s.chipOn, color: s.chipOnInk }}>休</span>
            <em style={{ color: s.ink }}>{h.rangeText}</em>
          </div>
        )}
        <div className="wp-c-week">
          {WEEKDAYS.map((w, i) => <span key={w} className={i === new Date().getDay() ? 'on' : ''} style={i === new Date().getDay() ? { background: s.chipOn, color: s.chipOnInk } : { color: s.inkSoft }}>{w}</span>)}
        </div>
      </div>
      <div className="wp-combo-right" style={{ background: s.rowBg }}>
        {rows.map((e, i) => (
          <div className="wp-c-row" key={i} style={{ borderColor: 'rgba(0,0,0,.06)' }}>
            <span className="wp-c-row-name" style={{ color: s.ink }}>{e.title} <em>{shortDate(e.date, 'slash')}</em></span>
            <span className="wp-c-row-days" style={{ color: s.brand }}>{e.days}天</span>
          </div>
        ))}
      </div>
      {!mini && <span className="wp-corner" style={{ borderColor: 'rgba(255,255,255,.35)' }} />}
    </div>
  )
}

/** 组合倒数面板：左主角大倒数+星期条，右事件清单 */
function ComboPanel({ tpl, evs, mini }: { tpl: WidgetTemplate; evs: BoundEvent[]; mini?: boolean }) {
  const s = tpl.skin
  const hero = evs[0]
  const rows = evs.slice(1, 5)
  return (
    <div className="wp-combo" style={{ background: s.bg }}>
      <div className="wp-combo-left" style={{ background: `linear-gradient(150deg, ${s.bgAccent}, ${s.bg})`, color: s.ink }}>
        <div className="wp-c-title" style={{ color: s.brand }}>距离{hero.title}</div>
        <div className="wp-c-big" style={{ color: s.brand }}>{hero.days}<i>天</i></div>
        <div className="wp-c-week">
          {WEEKDAYS.map((w, i) => <span key={w} className={i === hero.weekday ? 'on' : ''} style={i === hero.weekday ? { background: s.chipOn, color: s.chipOnInk } : { color: s.inkSoft }}>{w}</span>)}
        </div>
      </div>
      <div className="wp-combo-right" style={{ background: s.rowBg }}>
        {rows.map((e, i) => (
          <div className="wp-c-row" key={i} style={{ borderColor: 'rgba(0,0,0,.06)' }}>
            <span className="wp-c-row-name" style={{ color: s.ink }}>{e.title} <em>{shortDate(e.date, 'slash')}</em></span>
            <span className="wp-c-row-days" style={{ color: s.brand }}>{e.days}天</span>
          </div>
        ))}
      </div>
      {!mini && <span className="wp-corner" style={{ borderColor: 'rgba(255,255,255,.35)' }} />}
    </div>
  )
}

/** 简约列表（图3）：3 行，标题+emoji，右侧色块数字 */
function SimpleList({ tpl, evs, mini, withUnit }: { tpl: WidgetTemplate; evs: BoundEvent[]; mini?: boolean; withUnit?: boolean }) {
  const s = tpl.skin
  return (
    <div className="wp-simple" style={{ background: s.bg }}>
      {evs.slice(0, 3).map((e, i) => (
        <div className="wp-s-row" key={i} style={{ background: s.rowBg }}>
          <span className="wp-s-name" style={{ color: s.ink }}>{e.title} <i>{e.icon}</i></span>
          <span className="wp-s-num" style={{ background: i < 2 ? s.hot : s.far }}>
            <b>{e.days}</b>{withUnit && <em>天</em>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 四宫格面板（图4）：2×2 卡片 */
function GridPanel({ tpl, evs, mini }: { tpl: WidgetTemplate; evs: BoundEvent[]; mini?: boolean }) {
  const s = tpl.skin
  return (
    <div className="wp-grid" style={{ background: s.bg }}>
      {evs.slice(0, 4).map((e, i) => (
        <div className="wp-g-cell" key={i} style={{ background: s.rowBg }}>
          <div className="wp-g-head" style={{ color: s.ink }}>
            <span className="wp-g-emoji">{e.icon}</span>
            <span className="wp-g-title">{i === 1 ? '✧' : i === 0 ? '♡˙°' : ''}{e.title}{i === 1 ? '✦' : ''}</span>
          </div>
          <div className="wp-g-date" style={{ color: s.inkSoft }}>{e.date.replace(/-/g, '.')} {WEEKDAY_FULL[e.weekday]}</div>
          <div className="wp-g-days" style={{ color: s.brand }}>{e.days}</div>
        </div>
      ))}
    </div>
  )
}

/** 图文倒计时列表·大号（图5上） */
function PictureList({ tpl, evs, mini }: { tpl: WidgetTemplate; evs: BoundEvent[]; mini?: boolean }) {
  const s = tpl.skin
  const now = new Date()
  return (
    <div className="wp-picture" style={{ background: `linear-gradient(160deg, ${s.bg}, ${s.bgAccent})`, color: s.ink }}>
      <div className="wp-p-date" style={{ color: s.inkSoft }}>{now.getMonth() + 1}月{now.getDate()}日 {WEEKDAY_FULL[now.getDay()]}</div>
      <div className="wp-p-rows">
        {evs.slice(0, 5).map((e, i) => (
          <div className="wp-p-row" key={i} style={{ background: s.rowBg }}>
            <span>{e.title}</span><span>{e.days}天</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 简约倒计时列表·大号（图5下） */
function ListLarge({ tpl, evs, mini }: { tpl: WidgetTemplate; evs: BoundEvent[]; mini?: boolean }) {
  const s = tpl.skin
  const now = new Date()
  return (
    <div className="wp-listlg" style={{ background: s.bg }}>
      <div className="wp-l-head" style={{ background: s.bgAccent, color: s.chipOnInk }}>{now.getMonth() + 1}月{now.getDate()}日 {WEEKDAY_FULL[now.getDay()]}</div>
      <div className="wp-l-rows">
        {evs.slice(0, 5).map((e, i) => (
          <div className="wp-l-row" key={i} style={{ background: s.rowBg }}>
            <span className="wp-l-name" style={{ color: s.ink }}>{e.title} <i>{e.icon}</i></span>
            <span className="wp-l-num" style={{ background: i < 3 ? s.hot : s.far }}><b>{e.days}</b><em>天</em></span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { WEEKDAYS }

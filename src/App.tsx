import React, { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { StoreProvider, useStore } from './store'
import { StatusBar, ToastProvider } from './components/ui'
import { HomeView } from './components/HomeView'
import { EventDetail } from './components/EventDetail'
import { DateEditor } from './components/DateEditor'
import { CategoryGrid, CategoryList } from './components/CategoryViews'
import { TimelineView } from './components/TimelineView'
import { WidgetsView } from './components/WidgetsView'
import { SettingsView } from './components/SettingsView'
import { ConflictDialog } from './components/ConflictDialog'
import { Drawer } from './components/Drawer'
import { TrashView } from './components/TrashView'
import { syncWidgetData } from './widgetBridge'

type View = 'home' | 'detail' | 'edit' | 'catGrid' | 'catList' | 'settings' | 'events' | 'widgets' | 'trash'

const VIEWS: View[] = ['home', 'detail', 'edit', 'catGrid', 'catList', 'settings', 'events', 'widgets', 'trash']
function viewFromHash(): View {
  const h = location.hash.replace(/^#\/?/, '') as View
  return VIEWS.includes(h) ? h : 'home'
}

/**
 * 首屏底栏自检：iOS WKWebView 第一次渲染时 window.innerHeight / dvh 可能仍是错误值，
 * 仅靠 CSS 100% 链在个别机型首帧仍会算错，导致 flex 末尾的 TabBar 被裁掉。
 * 这里在首帧用 rAF 连续测量真实可视高度并写入 --app-vh，同时监听多个布局时机反复校正，
 * 一旦数值稳定即停。切后台/回前台、旋转、键盘收起都会重新触发。
 */
function useViewportFit() {
  useLayoutEffect(() => {
    const root = document.documentElement
    let raf = 0
    let settleTimer = 0
    const measure = () => {
      const vv = window.visualViewport
      const h = Math.max(
        vv?.height || 0,
        window.innerHeight || 0,
      )
      if (h > 0) root.style.setProperty('--app-vh', `${Math.round(h)}px`)
    }
    const burst = () => {
      cancelAnimationFrame(raf)
      clearTimeout(settleTimer)
      let n = 0
      const tick = () => {
        measure()
        if (++n < 8) raf = requestAnimationFrame(tick) // 首帧连续 8 帧校准
      }
      raf = requestAnimationFrame(tick)
      settleTimer = window.setTimeout(measure, 400) // 兜底：动画/字体稳定后再量一次
    }
    burst()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', burst)
    window.addEventListener('pageshow', burst)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) burst() })
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settleTimer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', burst)
      window.removeEventListener('pageshow', burst)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
}

function Shell() {
  useViewportFit()
  const [view, _setView] = useState<View>(viewFromHash)
  const setView = (v: View) => { _setView(v); if (location.hash !== `#/${v}`) location.hash = `/${v}` }
  useEffect(() => {
    const onHash = () => _setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [eventId, setEventId] = useState<string | undefined>()
  const [catId, setCatId] = useState<string>('cat:all')
  const [gridFromHome, setGridFromHome] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const store = useStore()

  // 事件增删改 / 首次启动时，把数据同步到原生 App Group，供系统小组件读取
  useEffect(() => {
    if (!store.loading) syncWidgetData(store.events, store.categories)
  }, [store.events, store.categories, store.loading])

  // 外观：白天 / 夜间 / 自动 + 背景样式，写入根节点供 CSS 变量使用
  useLayoutEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = store.settings.themeMode === 'dark' ||
        (store.settings.themeMode === 'auto' && mq.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      root.dataset.bg = store.settings.backgroundStyle || 'grid'
    }
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [store.settings.themeMode, store.settings.backgroundStyle])

  const openEvent = (id: string) => { setEventId(id); setView('detail') }
  const openEdit = (id?: string) => { setEventId(id); setView('edit') }
  // 切换页面时把滚动位置重置到顶部（滚动容器是 .page，不是 window）
  const go = (v: View) => {
    setView(v)
    const pg = document.querySelector('.page')
    if (pg) pg.scrollTop = 0
    window.scrollTo(0, 0)
  }

  const tab = view === 'settings' ? 'more' : view === 'widgets' ? 'widgets' : view === 'events' ? 'events' : 'home'
  const [isNative, setIsNative] = useState(() => Boolean((window as any).Capacitor?.isNativePlatform?.()))
  useEffect(() => {
    const recheck = () => setIsNative(Boolean((window as any).Capacitor?.isNativePlatform?.()))
    recheck()
    document.addEventListener('visibilitychange', recheck)
    return () => document.removeEventListener('visibilitychange', recheck)
  }, [])

  return (
    <>
    <div className={`app-shell${isNative ? ' native' : ''}`}>
      <StatusBar />
      {view === 'home' && <HomeView
        catId={catId}
        onOpenCategoryGrid={() => { setGridFromHome(true); go('catGrid') }}
        onSelectEvent={openEvent}
        onAddEvent={() => openEdit()}
        onMenu={() => setDrawerOpen(true)}
      />}
      {view === 'detail' && eventId && <EventDetail id={eventId} onBack={() => go('home')} onEdit={() => openEdit(eventId)} />}
      {view === 'edit' && <DateEditor
        eventId={eventId}
        onBack={() => go(eventId ? 'detail' : 'home')}
        onSaved={(id) => { setEventId(id); go('detail') }}
      />}
      {view === 'catGrid' && <CategoryGrid
        current={catId}
        onBack={() => go(gridFromHome ? 'home' : 'catGrid')}
        onManage={() => go('catList')}
        onPick={(id) => { setCatId(id); go('home') }}
      />}
      {view === 'catList' && <CategoryList onBack={() => go('catGrid')} onDone={() => go('home')} />}
      {view === 'settings' && <SettingsView />}
      {view === 'events' && <TimelineView onSelect={openEvent} onAdd={() => openEdit()} />}
      {view === 'widgets' && <WidgetsView onBack={() => go('home')} onSelectEvent={openEvent} />}
      {view === 'trash' && <TrashView onBack={() => go('home')} />}

      <ConflictDialog />
    </div>
    <TabBarPortal active={tab} onChange={(v) => go(v)} />
    <Drawer
      open={drawerOpen}
      currentCat={catId}
      onClose={() => setDrawerOpen(false)}
      onPickCategory={(id) => { setCatId(id); go('home'); setDrawerOpen(false) }}
      onSelectEvent={(id) => { setDrawerOpen(false); openEvent(id) }}
      onOpenTrash={() => { setDrawerOpen(false); go('trash') }}
    />
    </>
  )
}

/** 底栏渲染到 body 层：与 .app-shell 的高度/overflow/动画彻底解耦，
    用 fixed + 可视视口定位，WKWebView 首帧布局未稳时也不会被裁掉。 */
function TabBarPortal({ active, onChange }: { active: string; onChange: (v: View) => void }) {
  return createPortal(<TabBar active={active} onChange={onChange} />, document.body)
}

function TabBar({ active, onChange }: { active: string; onChange: (v: View) => void }) {
  const tabs: Array<{ key: string; label: string; emoji: string; view: View }> = [
    { key: 'home', label: '事件', emoji: '🗳️', view: 'home' },
    { key: 'events', label: '时间轴', emoji: '📆', view: 'events' },
    { key: 'widgets', label: '组件', emoji: '🏠', view: 'widgets' },
    { key: 'more', label: '更多', emoji: '🌱', view: 'settings' },
  ]
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <button key={t.key} className={`tab${active === t.key ? ' active' : ''}`} onClick={() => onChange(t.view)}>
          <span className="tab-emoji">{t.emoji}</span><span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider><Shell /></ToastProvider>
    </StoreProvider>
  )
}

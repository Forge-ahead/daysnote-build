import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * 原生 WebView（Capacitor）里，WKWebView 对整个 document 有橡皮筋回弹，
 * 手势落在不可滚动区域时会被系统拿去拖动整个界面。
 * 这里在捕获阶段拦截根级 touchmove：只要目标不在可滚动容器内，就阻止默认行为，
 * 让界面固定不动；.page 内部的正常滚动不受影响。
 */
function lockRootScroll() {
  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.())
  if (!isNative) return
  const scrollable = (el: EventTarget | null): boolean => {
    let node = el as HTMLElement | null
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node)
      const oy = style.overflowY
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return true
      node = node.parentElement
    }
    return false
  }
  document.addEventListener('touchmove', (e) => {
    if (!scrollable(e.target)) e.preventDefault()
  }, { passive: false, capture: true })
  // 双保险：禁止 document 级别的触摸拖拽
  document.body.addEventListener('touchstart', (e) => {
    if (!scrollable(e.target) && (e.touches.length || 0) > 1) e.preventDefault()
  }, { passive: false })
}

lockRootScroll()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)

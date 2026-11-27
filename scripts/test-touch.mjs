/**
 * 底部标签触控回归测试。
 *
 * 背景：v19 把 --tabbar-pad-b 从完整安全区砍到 safe-b*0.5（约 17pt），
 * 按钮命中区下探进 iOS Home Indicator 手势带，WKWebView 需先等系统判定
 * 上滑手势，导致「点击不能立即跳转」。本脚本模拟 iPhone 13 Pro Max 的
 * 真实安全区（headless Chromium 的 env(safe-area-inset-*) 恒为 0），
 * 断言按钮命中区完整避开手势带，且点击后路由立即切换。
 *
 * 用法：先启动 dev server（npm run dev），再 node scripts/test-touch.mjs
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.TEST_URL || 'http://localhost:5173/'
const SAFE_B = 34 // iPhone 13 Pro Max home indicator 安全区
const GESTURE_BAND = 34 // iOS 系统手势带高度
let failed = 0
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`)
  if (!cond) failed++
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await page.evaluateOnNewDocument(() => { try { localStorage.clear() } catch {} })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate((sb) => {
    const s = document.createElement('style')
    s.textContent = `:root{--safe-b:${sb}px !important;--safe-t:59px !important;}`
    document.head.appendChild(s)
  }, SAFE_B)
  await new Promise((r) => setTimeout(r, 800))

  console.log('【几何】按钮命中区 vs Home Indicator 手势带')
  const geom = await page.evaluate(() => {
    const vh = window.innerHeight
    return [...document.querySelectorAll('.tabbar .tab')].map((t) => {
      const r = t.getBoundingClientRect()
      return { label: t.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), dist: Math.round(vh - r.bottom) }
    })
  })
  geom.forEach((t) => console.log(`  ${t.label}: 命中区 ${t.top}-${t.bottom}, 高 ${t.h}px, 距屏幕底 ${t.dist}px`))
  ok(geom.length === 4, '四个底部标签都存在')
  ok(geom.every((t) => t.dist >= GESTURE_BAND), `所有按钮距屏幕底 ≥ ${GESTURE_BAND}px（避开手势带）`)
  ok(geom.every((t) => t.h >= 44), '所有按钮触控高度 ≥ 44pt')

  console.log('【命中】每个按钮中心点的 elementFromPoint')
  const hits = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => {
    const r = t.getBoundingClientRect()
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return { label: t.textContent.trim(), hit: t.contains(el) || el === t }
  }))
  hits.forEach((h) => ok(h.hit, `${h.label} 中心命中自身`))

  console.log('【路由】点击后 hash 立即切换')
  const cases = [['时间轴', '#/events'], ['组件', '#/widgets'], ['更多', '#/settings'], ['事件', '#/home']]
  for (const [label, expect] of cases) {
    const pt = await page.evaluate((l) => {
      const el = [...document.querySelectorAll('.tabbar .tab')].find((e) => e.textContent?.includes(l))
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, label)
    await page.touchscreen.tap(pt.x, pt.y)
    let hash = ''
    try {
      await page.waitForFunction((h) => location.hash === h, { timeout: 1500 }, expect)
      hash = expect
    } catch { hash = await page.evaluate(() => location.hash) }
    ok(hash === expect, `点击「${label}」→ ${expect}（实际 ${hash}）`)
  }
} finally {
  await browser.close()
}
console.log(failed === 0 ? '\n触控回归测试：全部通过' : `\n触控回归测试：${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)

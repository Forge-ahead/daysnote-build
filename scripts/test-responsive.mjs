import puppeteer from 'puppeteer-core'

// Apple HIG + Android 主流分辨率（含安全区模拟）
const DEVICES = [
  { name: 'iPhone SE (3rd)',      w: 375, h: 667, sat: 20, sab: 0 },
  { name: 'iPhone 12/13 mini',    w: 375, h: 812, sat: 47, sab: 34 },
  { name: 'iPhone X/XS',          w: 375, h: 812, sat: 44, sab: 34 },
  { name: 'iPhone 14 Pro',        w: 393, h: 852, sat: 59, sab: 34 },
  { name: 'iPhone 13 Pro Max',    w: 428, h: 926, sat: 47, sab: 34 },
  { name: 'iPhone 15 Pro Max',    w: 430, h: 932, sat: 59, sab: 34 },
  { name: 'Android 小屏',         w: 360, h: 640, sat: 24, sab: 0 },
  { name: 'Android 主流',         w: 393, h: 851, sat: 24, sab: 0 },
  { name: 'Android 大屏',         w: 412, h: 915, sat: 24, sab: 0 },
  { name: 'iPhone 横屏',          w: 844, h: 390, sat: 0, sab: 21 },
]

const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
const results = []

for (const d of DEVICES) {
  const page = await browser.newPage()
  await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1 })
  // 注入 safe-area 环境变量（浏览器不原生支持）
  await page.evaluateOnNewDocument((sat, sab) => {
    const style = document.createElement('style')
    style.textContent = `:root{--safe-t:${sat}px;--safe-b:${sab}px}`
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  }, d.sat, d.sab)
  await page.evaluateOnNewDocument(() => localStorage.clear())
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 500))

  const m = await page.evaluate(() => {
    const de = document.documentElement
    const shell = document.querySelector('.app-shell')
    const tabbar = document.querySelector('.tabbar')
    const pg = document.querySelector('.page')
    const hero = document.querySelector('.hero-card')
    const firstCard = document.querySelector('.event-card')
    const r = (el) => el ? el.getBoundingClientRect() : null
    const sr = r(shell), tr = r(tabbar)
    // 滚到底，检查最后一张卡片是否越过 tabbar
    pg.scrollTop = pg.scrollHeight
    const cards = [...pg.querySelectorAll('.event-card')]
    const last = cards[cards.length - 1]
    const lr = r(last)
    return {
      viewportW: window.innerWidth,
      docScrollW: de.scrollWidth,
      hasHScroll: de.scrollWidth > window.innerWidth + 1,
      shellW: Math.round(sr.width),
      shellLeft: Math.round(sr.left),
      shellRight: Math.round(sr.right),
      tabbarH: Math.round(tr.height),
      tabbarTop: Math.round(tr.top),
      tabbarBottom: Math.round(tr.bottom),
      heroW: hero ? Math.round(r(hero).width) : null,
      cardW: firstCard ? Math.round(r(firstCard).width) : null,
      lastCardBottom: lr ? Math.round(lr.bottom) : null,
      contentAboveTabbar: lr ? (lr.bottom <= tr.top + 2) : null,
      pageCanScroll: pg.scrollHeight > pg.clientHeight,
      safeT: getComputedStyle(document.documentElement).getPropertyValue('--safe-t').trim(),
      safeB: getComputedStyle(document.documentElement).getPropertyValue('--safe-b').trim(),
    }
  })

  const issues = []
  if (m.hasHScroll) issues.push('横向溢出')
  if (m.shellRight > m.viewportW + 1 || m.shellLeft < -1) issues.push('外壳越界')
  if (m.lastCardBottom !== null && !m.contentAboveTabbar) issues.push('底部内容被TabBar遮挡')
  results.push({ device: d.name, size: `${d.w}×${d.h}`, issues, ...m })
  await page.close()
}

console.log(JSON.stringify(results, null, 2))
const bad = results.filter(r => r.issues.length)
console.log(`\n=== 汇总：${results.length} 个分辨率，${bad.length} 个有问题 ===`)
for (const b of bad) console.log(`  ✗ ${b.device}: ${b.issues.join(', ')}`)
await browser.close()

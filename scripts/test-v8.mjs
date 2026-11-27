import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))

const out = {}
// 1) 滚动容器检查
out.scroll = await page.evaluate(() => {
  const pg = document.querySelector('.page')
  const shell = document.querySelector('.app-shell')
  const before = shell.getBoundingClientRect().top
  const info = {
    pageScrollHeight: pg.scrollHeight,
    pageClientHeight: pg.clientHeight,
    pageOverflowY: getComputedStyle(pg).overflowY,
    shellOverflow: getComputedStyle(shell).overflow,
    canScroll: pg.scrollHeight > pg.clientHeight,
  }
  pg.scrollTop = 200
  info.scrolledTo = pg.scrollTop
  info.shellTopBefore = before
  info.shellTopAfter = shell.getBoundingClientRect().top
  info.shellDidNotMove = Math.abs(before - shell.getBoundingClientRect().top) < 1
  return info
})
// 用真实滚轮事件再测一次
await page.mouse.move(214, 500)
await page.mouse.wheel({ deltaY: 300 })
await new Promise(r => setTimeout(r, 200))
out.scrollTopAfterWheel = await page.evaluate(() => document.querySelector('.page').scrollTop)

// 2) 天数显示：formatDays 函数
out.formatDays = await page.evaluate(async () => {
  const mod = await import('/src/date.ts')
  return {
    d100: mod.formatDays(100),
    d365: mod.formatDays(365),
    d366: mod.formatDays(366),
    d488: mod.formatDays(488),
    d1156: mod.formatDays(1156),
    d2576: mod.formatDays(2576),
  }
})
// 3) 首页卡片显示
out.cardLabels = await page.evaluate(() =>
  [...document.querySelectorAll('.event-card .ev-num')].map(e => ({
    small: e.querySelector('small')?.textContent,
    value: e.querySelector('b')?.textContent,
  }))
)
await page.screenshot({ path: 'previews/v8-home-years.png' })
console.log(JSON.stringify(out, null, 2))
await browser.close()

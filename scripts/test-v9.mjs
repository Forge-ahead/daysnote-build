import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))
const out = {}

// 1) 内置事件：3 倒数 + 12 正数
out.seed = await page.evaluate(async () => {
  const s = await import('/src/seed.ts')
  const d = await import('/src/date.ts')
  const future = s.BUILTIN_EVENTS.filter(e => e.repeat === 'yearly').map(e => ({ t: e.title, date: e.date, target: d.toISO(d.targetDate(e)) }))
  return { total: s.BUILTIN_EVENTS.length, future }
})

// 2) 根滚动锁定 + 页面正常滚动
out.scroll = await page.evaluate(() => {
  const html = document.documentElement, body = document.body
  const pg = document.querySelector('.page')
  return {
    htmlOverflow: getComputedStyle(html).overflow,
    bodyPosition: getComputedStyle(body).position,
    pageCanScroll: pg.scrollHeight > pg.clientHeight,
    pageOverflowY: getComputedStyle(pg).overflowY,
  }
})

// 3) 首页 hero 卡片
out.hero = await page.evaluate(() => {
  const h = document.querySelector('.hero-card')
  return h ? { title: h.querySelector('.hero-title')?.textContent, num: h.querySelector('.hero-num b')?.textContent, date: h.querySelector('.hero-date')?.textContent } : null
})
out.homeCards = await page.evaluate(() => document.querySelectorAll('.event-card').length)
await page.screenshot({ path: 'previews/v9-home.png' })

// 4) 分类筛选：进入类别页选"周年纪念"，首页只显示该分类事件
await page.evaluate(() => { location.hash = '#/catGrid' })
await new Promise(r => setTimeout(r, 350))
// 找到"周年纪念"分类按钮并点击
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.cat-book')].find(x => x.textContent.includes('周年纪念'))
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 400))
out.afterPick = await page.evaluate(() => {
  const switchBtn = document.querySelector('.category-switch')
  return {
    title: switchBtn?.textContent.trim(),
    cardCount: document.querySelectorAll('.event-card').length,
    titles: [...document.querySelectorAll('.ev-title')].map(e => e.textContent),
  }
})
await page.screenshot({ path: 'previews/v9-category-filter.png' })

console.log(JSON.stringify(out, null, 2))
await browser.close()

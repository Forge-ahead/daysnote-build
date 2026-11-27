import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })

// 注入初始数据：清空 localStorage，用默认种子（12 条内置事件）
await page.evaluateOnNewDocument(() => {
  localStorage.clear()
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))

const out = {}
// 1) 首页事件数（默认种子=12条）
out.homeEventCount = await page.evaluate(() => document.querySelectorAll('.event-row').length)

// 2) 时间轴：切到事件页，统计节日行数
await page.evaluate(() => { location.hash = '#/events' })
await new Promise(r => setTimeout(r, 500))
out.timelineRowsAll = await page.evaluate(() => document.querySelectorAll('.tl-row').length)
out.festivalRows = await page.evaluate(() => document.querySelectorAll('.tl-row.festival').length)
out.festivalTitles = await page.evaluate(() => [...document.querySelectorAll('.tl-row.festival .tl-title')].map(e => e.textContent))
await page.screenshot({ path: 'previews/v7-timeline-festivals.png' })

// 3) 关闭节日开关后，时间轴节日行应为 0
await page.evaluate(() => { location.hash = '#/settings' })
await new Promise(r => setTimeout(r, 400))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '数据')
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
// 找到"时间轴显示农历/法定节日"那一行的开关
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.row-between')]
  const row = rows.find(r => r.textContent.includes('时间轴显示农历'))
  const sw = row?.querySelector('.switch')
  if (sw) sw.click()
})
await new Promise(r => setTimeout(r, 300))
await page.evaluate(() => { location.hash = '#/events' })
await new Promise(r => setTimeout(r, 400))
out.festivalRowsAfterOff = await page.evaluate(() => document.querySelectorAll('.tl-row.festival').length)
out.rowsAnnivOnly = await page.evaluate(() => document.querySelectorAll('.tl-row').length)

// 4) 事件级开关：编辑第一条事件，关闭"显示到时间轴"
await page.evaluate(() => { location.hash = '#/' })
await new Promise(r => setTimeout(r, 300))
await page.evaluate(() => {
  const row = document.querySelector('.event-row')
  if (row) row.click()
})
await new Promise(r => setTimeout(r, 300))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent.includes('编辑') || x.querySelector('svg'))
  // 详情页编辑按钮是 nav-btn，直接点第二个 nav-btn
  const navBtns = document.querySelectorAll('.detail-top .nav-btn')
  if (navBtns[1]) navBtns[1].click()
})
await new Promise(r => setTimeout(r, 300))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '内容')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 250))
out.hasShowInTimelineSwitch = await page.evaluate(() =>
  [...document.querySelectorAll('.row-between')].some(r => r.textContent.includes('显示到事件时间轴'))
)
await page.screenshot({ path: 'previews/v7-editor-switch.png' })

console.log(JSON.stringify(out, null, 2))
await browser.close()

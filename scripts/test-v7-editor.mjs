import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))
const out = {}
out.eventCards = await page.evaluate(() => document.querySelectorAll('.event-card').length)

// 点第一个事件进详情
await page.evaluate(() => document.querySelector('.event-card')?.click())
await new Promise(r => setTimeout(r, 400))
out.detailReached = await page.evaluate(() => location.hash.includes('detail'))
// 详情页编辑按钮是第一个 .nav-btn（EditBtn）
await page.evaluate(() => {
  const btns = document.querySelectorAll('.detail-top button')
  for (const b of btns) { if (b.querySelector('svg')) { b.click(); break } }
})
await new Promise(r => setTimeout(r, 400))
out.editReached = await page.evaluate(() => location.hash.includes('edit'))
// 切到内容 tab
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '内容')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 300))
out.hasSwitch = await page.evaluate(() =>
  [...document.querySelectorAll('.row-between')].some(r => r.textContent.includes('显示到事件时间轴'))
)
await page.screenshot({ path: 'previews/v7-editor-switch.png' })

// 关闭开关并保存，验证时间轴不再显示该事件
if (out.hasSwitch) {
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.row-between')].find(r => r.textContent.includes('显示到事件时间轴'))
    row?.querySelector('.switch')?.click()
  })
  await new Promise(r => setTimeout(r, 200))
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('保存修改'))
    if (b) b.click()
  })
  await new Promise(r => setTimeout(r, 500))
  await page.evaluate(() => { location.hash = '#/events' })
  await new Promise(r => setTimeout(r, 400))
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '仅纪念日')
    if (b) b.click()
  })
  await new Promise(r => setTimeout(r, 300))
  out.annivRowsAfterHide = await page.evaluate(() => document.querySelectorAll('.tl-row').length)
  out.hiddenEventGone = await page.evaluate(() =>
    ![...document.querySelectorAll('.tl-title')].some(e => e.textContent.trim() === '__不存在的示例事件__')
  )
}
console.log(JSON.stringify(out, null, 2))
await browser.close()

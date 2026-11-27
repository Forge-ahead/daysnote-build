import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))

const views = ['home','events','widgets','settings','catgrid']
const out = {}
for (const v of views) {
  await page.evaluate((hash) => { location.hash = '#/' + hash }, v)
  await new Promise(r => setTimeout(r, 350))
  out[v] = await page.evaluate(() => {
    const pg = document.querySelector('.page')
    if (!pg) return { error: 'no .page' }
    const tabbar = document.querySelector('.tabbar')
    const tbTop = tabbar ? tabbar.getBoundingClientRect().top : 9999
    // 滚到底，检查最后一个可见内容元素是否越过 tabbar
    pg.scrollTop = pg.scrollHeight
    const kids = [...pg.querySelectorAll('button, .card-panel, .event-card, .tl-row, .widget-tpl, .section-title')]
    let lastBottom = 0
    for (const k of kids) {
      const r = k.getBoundingClientRect()
      if (r.height > 0 && r.bottom <= pg.getBoundingClientRect().bottom + 2) lastBottom = Math.max(lastBottom, r.bottom)
    }
    return {
      scrollHeight: pg.scrollHeight,
      clientHeight: pg.clientHeight,
      canScroll: pg.scrollHeight > pg.clientHeight,
      scrolledTo: pg.scrollTop,
      maxScroll: pg.scrollHeight - pg.clientHeight,
      tabbarTop: Math.round(tbTop),
      lastContentBottom: Math.round(lastBottom),
      contentAboveTabbar: lastBottom <= tbTop + 2,
    }
  })
}
// 编辑页内容 tab（最长的表单）
await page.evaluate(() => { location.hash = '#/edit' })
await new Promise(r => setTimeout(r, 350))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '内容')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 250))
out['edit-content'] = await page.evaluate(() => {
  const pg = document.querySelector('.page')
  pg.scrollTop = pg.scrollHeight
  const saveBtn = [...document.querySelectorAll('button')].find(x => x.textContent.includes('创建事件'))
  const r = saveBtn?.getBoundingClientRect()
  const tb = document.querySelector('.tabbar')?.getBoundingClientRect()
  return {
    scrollHeight: pg.scrollHeight,
    clientHeight: pg.clientHeight,
    canScroll: pg.scrollHeight > pg.clientHeight,
    saveBtnBottom: r ? Math.round(r.bottom) : null,
    tabbarTop: tb ? Math.round(tb.top) : null,
    saveBtnReachable: r ? (r.bottom <= (tb?.top || 9999) + 4 && r.top >= 0) : false,
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()

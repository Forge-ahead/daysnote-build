import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument(() => localStorage.clear())
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 900))
const out = await page.evaluate(() => {
  const pg = document.querySelector('.page')
  const shell = document.querySelector('.app-shell')
  return {
    shellHeight: getComputedStyle(shell).height,
    pageScrollHeight: pg.scrollHeight,
    pageClientHeight: pg.clientHeight,
    canScroll: pg.scrollHeight > pg.clientHeight,
    overflowY: getComputedStyle(pg).overflowY,
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()

import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 428, height: 926, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => { location.hash = '#/widgets' })
await new Promise((r) => setTimeout(r, 500))
await page.screenshot({ path: '/workspace/countdown-app/previews/v3-widgets.png' })
console.log('shot widgets')

await page.click('.widget-tpl')
await new Promise((r) => setTimeout(r, 400))
await page.screenshot({ path: '/workspace/countdown-app/previews/v3-widget-modal.png' })
console.log('shot modal')

await page.click('.wm-set')
await new Promise((r) => setTimeout(r, 400))
await page.screenshot({ path: '/workspace/countdown-app/previews/v3-widget-set.png' })
console.log('shot settings')

await browser.close()

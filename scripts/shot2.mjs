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
await new Promise((r) => setTimeout(r, 700))

const shot = async (name, hash) => {
  if (hash) {
    await page.evaluate((h) => { location.hash = h }, hash)
    await new Promise((r) => setTimeout(r, 450))
  }
  await page.screenshot({ path: `/workspace/countdown-app/previews/v2-${name}.png` })
  console.log('shot', name)
}

await shot('home')
await shot('events', '#/events')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('节日'))
  b?.click()
})
await new Promise((r) => setTimeout(r, 350))
await shot('festivals')
await page.evaluate(() => { location.hash = '#/home' }); await new Promise(r => setTimeout(r, 350)); await page.click('.event-card')
await new Promise((r) => setTimeout(r, 350))
await shot('detail')
await shot('catgrid', '#/catgrid')
await browser.close()

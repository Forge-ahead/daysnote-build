import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 700))

const shot = async (name, hash) => {
  if (hash) {
    await page.evaluate((h) => { location.hash = h }, hash)
    await new Promise((r) => setTimeout(r, 450))
  }
  await page.screenshot({ path: `/workspace/countdown-app/preview-${name}.png` })
  console.log('shot', name)
}

await shot('home')
await page.click('.event-card')
await new Promise((r) => setTimeout(r, 400))
await shot('detail')
await page.click('.detail-top > div:nth-child(2) > .nav-btn')
await new Promise((r) => setTimeout(r, 400))
await shot('date')
await shot('catgrid', '#/catgrid')
await shot('catlist', '#/catList')
await shot('settings', '#/settings')
await shot('events', '#/events')

await browser.close()

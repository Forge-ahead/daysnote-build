import { createRequire } from 'module'
const require = createRequire('/workspace/countdown-app/')
const puppeteer = require('puppeteer-core')
const OUT = '/workspace/v27'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 428, height: 926, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await wait(800)

// 全新安装首页：hero 动态、列表无「今年剩余」
await page.screenshot({ path: `${OUT}-home.png` })
const home = await page.evaluate(() => ({
  heroTitle: document.querySelector('.hero-card .hero-title')?.textContent.trim(),
  heroDate: document.querySelector('.hero-card .hero-date')?.textContent.trim(),
  heroNum: document.querySelector('.hero-card .hero-num b')?.textContent.trim(),
  groupLabels: [...document.querySelectorAll('.group-label')].map((x) => x.textContent.trim()),
  rowTitles: [...document.querySelectorAll('.ev-title')].map((x) => x.textContent.trim()),
  cards: document.querySelectorAll('.event-card').length,
  hasYearLeft: [...document.querySelectorAll('.ev-title')].some((x) => x.textContent.includes('今年剩余')),
}))

// 编辑页：无大插画、无「设置日期」大标题
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((x) => x.textContent.includes('事件'))?.click())
await wait(300)
await page.evaluate(() => {
  const nav = document.querySelector('.navbar')
  const buttons = nav ? [...nav.querySelectorAll('button')] : []
  buttons[buttons.length - 1]?.click()
})
await wait(400)
await page.screenshot({ path: `${OUT}-editor.png` })
const editor = await page.evaluate(() => ({
  title: document.querySelector('.nav-title')?.textContent.trim(),
  hasIllust: Boolean(document.querySelector('.illust-big')),
  hasH2: [...document.querySelectorAll('.h2')].some((x) => x.textContent.trim() === '设置日期'),
  hint: document.querySelector('.center.hint')?.textContent.trim(),
}))
console.log(JSON.stringify({ home, editor, errs }, null, 2))
await browser.close()

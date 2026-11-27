import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage()
await p.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => { location.hash = '#/settings' })
await new Promise(r => setTimeout(r, 500))
// 同步 tab（默认）
await p.screenshot({ path: 'previews/v6-settings-sync.png' })
// 数据 tab（备份）
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '数据')
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await p.screenshot({ path: 'previews/v6-settings-backup.png' })
console.log('saved v6-settings-sync.png, v6-settings-backup.png')
await b.close()

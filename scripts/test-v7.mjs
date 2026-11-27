import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 500))

const result = await page.evaluate(async () => {
  const mod = await import('/src/date.ts')
  const seed = await import('/src/seed.ts')
  const out = {}

  // 1) 内置事件数量与去重
  out.builtinCount = seed.BUILTIN_EVENTS.length
  out.builtinTitles = seed.BUILTIN_EVENTS.map(e => e.title)
  const keys = seed.BUILTIN_EVENTS.map(e => `${e.title}|${e.date}`)
  out.noDuplicate = new Set(keys).size === keys.length

  // 2) 农历节日按年份动态换算（春节每年公历不同）
  const f2025 = mod.getFestivalsForYear(2025)
  const f2026 = mod.getFestivalsForYear(2026)
  const fmt = (d) => `${d.getMonth()+1}-${d.getDate()}`
  const spring = (list) => list.find(x => x.name === '春节')
  out.spring2025 = fmt(spring(f2025).date)  // 应为 1-29
  out.spring2026 = fmt(spring(f2026).date)  // 应为 2-17
  out.lunarCount = f2026.filter(x => x.kind === 'lunar').length
  out.legalCount = f2026.filter(x => x.kind === 'legal').length
  out.midAutumn2026 = fmt(f2026.find(x => x.name === '中秋节').date)
  out.newYearEve2026 = fmt(f2026.find(x => x.name === '除夕').date)

  // 3) 农历换算修复验证（lunarToSolar 用正确 API）
  const solar = mod.lunarToSolar(2026, 1, 1)
  out.lunarToSolar = solar  // 应为 2026-02-17
  return out
})
console.log(JSON.stringify(result, null, 2))
await browser.close()

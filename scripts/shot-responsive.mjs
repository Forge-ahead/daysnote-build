import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
for (const [name,w,h,sat,sab] of [
  ['se',375,667,20,0],
  ['15pm',430,932,59,34],
  ['landscape',844,390,0,21],
]) {
  const p = await b.newPage()
  await p.setViewport({width:w,height:h,deviceScaleFactor:1})
  await p.evaluateOnNewDocument((sat,sab)=>{
    const s=document.createElement('style');s.textContent=`:root{--safe-t:${sat}px;--safe-b:${sab}px}`;
    document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s))
  },sat,sab)
  await p.evaluateOnNewDocument(()=>localStorage.clear())
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
  await new Promise(r=>setTimeout(r,600))
  await p.screenshot({path:`previews/resp-${name}.png`})
  await p.close()
}
console.log('done')
await b.close()

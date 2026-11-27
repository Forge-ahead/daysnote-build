import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath:'/usr/bin/chromium', headless:'new', args:['--no-sandbox','--disable-gpu'] })
for (const [name,w,h,sat,sab] of [['phone',393,852,59,34],['se',375,667,20,0],['desktop',1200,900,0,0]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:1})
  await p.evaluateOnNewDocument((sat,sab)=>{const s=document.createElement('style');s.textContent=`:root{--safe-t:${sat}px;--safe-b:${sab}px}`;document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s))},sat,sab)
  await p.evaluateOnNewDocument(()=>localStorage.clear())
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
  await new Promise(r=>setTimeout(r,600))
  const m=await p.evaluate(()=>{const sh=document.querySelector('.app-shell').getBoundingClientRect();const tb=document.querySelector('.tabbar').getBoundingClientRect();const hc=document.querySelector('.hero-card')?.getBoundingClientRect();return{shellW:Math.round(sh.width),shellLeft:Math.round(sh.left),tabW:Math.round(tb.width),tabLeft:Math.round(tb.left),heroW:hc?Math.round(hc.width):null,hScroll:document.documentElement.scrollWidth>window.innerWidth+1}})
  console.log(name, JSON.stringify(m))
  await p.screenshot({path:`previews/narrow-${name}.png`})
  await p.close()
}
await b.close()

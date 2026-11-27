import puppeteer from 'puppeteer-core'
const DEVICES = [
  ['iPhone SE',375,667,20,0],['iPhone 13 mini',375,812,47,34],['iPhone X',375,812,44,34],
  ['iPhone 14 Pro',393,852,59,34],['iPhone 13 Pro Max',428,926,47,34],['iPhone 15 Pro Max',430,932,59,34],
  ['安卓小屏',360,640,24,0],['安卓主流',393,851,24,0],['安卓大屏',412,915,24,0],['横屏',844,390,0,21],
  ['桌面',1280,900,0,0],
]
const b = await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:'new',args:['--no-sandbox','--disable-gpu']})
const res=[]
for(const [name,w,h,sat,sab] of DEVICES){
  const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:1})
  await p.evaluateOnNewDocument((sat,sab)=>{const s=document.createElement('style');s.textContent=`:root{--safe-t:${sat}px;--safe-b:${sab}px}`;document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s))},sat,sab)
  await p.evaluateOnNewDocument(()=>localStorage.clear())
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,450))
  const m=await p.evaluate(()=>{
    const de=document.documentElement, pg=document.querySelector('.page')
    const sh=document.querySelector('.app-shell').getBoundingClientRect()
    const tb=document.querySelector('.tabbar').getBoundingClientRect()
    // 检查每张卡片内是否有元素重叠（ev-date 与 ev-num）
    const overlaps=[...document.querySelectorAll('.event-card')].filter(c=>{
      const d=c.querySelector('.ev-date')?.getBoundingClientRect(), n=c.querySelector('.ev-num')?.getBoundingClientRect()
      return d&&n&&!(d.right<=n.left||n.right<=d.left||d.bottom<=n.top||n.bottom<=d.top)
    }).length
    pg.scrollTop=pg.scrollHeight
    const cards=[...pg.querySelectorAll('.event-card')], last=cards[cards.length-1]?.getBoundingClientRect()
    return {
      shellW:Math.round(sh.width),
      centered:Math.abs(sh.left-(window.innerWidth-sh.width)/2)<2,
      hScroll:de.scrollWidth>window.innerWidth+1,
      overlapCards:overlaps,
      lastCardAboveTab:last?last.bottom<=tb.top+2:null,
    }
  })
  const issues=[]
  if(w<600 && m.shellW<w-2)issues.push('手机竖屏宽度异常')
  if(!m.centered)issues.push('未居中')
  if(m.hScroll)issues.push('横向溢出')
  if(m.overlapCards>0)issues.push(`${m.overlapCards}张卡片文字重叠`)
  if(m.lastCardAboveTab===false)issues.push('内容被TabBar遮挡')
  res.push({device:name,size:`${w}×${h}`,shellW:m.shellW,issues})
  await p.close()
}
console.log(JSON.stringify(res,null,2))
const bad=res.filter(x=>x.issues.length)
console.log(`\n=== ${res.length} 种分辨率，${bad.length} 个有问题 ===`)
bad.forEach(x=>console.log(`  ✗ ${x.device}: ${x.issues.join(', ')}`))
await b.close()

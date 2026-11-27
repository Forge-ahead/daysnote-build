import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath:'/usr/bin/chromium', headless:'new', args:['--no-sandbox','--disable-gpu'] })
const p = await b.newPage()
await p.setViewport({width:320,height:568,deviceScaleFactor:1}) // 最小安卓屏
await p.evaluateOnNewDocument(()=>localStorage.clear())
await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,600))
const out={}
// 编辑页
await p.evaluate(()=>{location.hash='#/edit'})
await new Promise(r=>setTimeout(r,400))
await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='内容');if(b)b.click()})
await new Promise(r=>setTimeout(r,250))
out.edit=await p.evaluate(()=>{
  const pg=document.querySelector('.page')
  const inputs=[...pg.querySelectorAll('input,textarea,select')]
  const de=document.documentElement
  return {
    hScroll: de.scrollWidth>window.innerWidth+1,
    inputFont: getComputedStyle(inputs[0]||document.body).fontSize,
    saveReachable: (()=>{pg.scrollTop=pg.scrollHeight;const s=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('创建事件'));if(!s)return null;const tb=document.querySelector('.tabbar').getBoundingClientRect();return s.getBoundingClientRect().bottom<=tb.top+3})(),
  }
})
// 设置页
await p.evaluate(()=>{location.hash='#/settings'})
await new Promise(r=>setTimeout(r,400))
out.settings=await p.evaluate(()=>{
  const pg=document.querySelector('.page');pg.scrollTop=pg.scrollHeight
  const de=document.documentElement
  return {hScroll:de.scrollWidth>window.innerWidth+1, canScroll:pg.scrollHeight>pg.clientHeight}
})
console.log(JSON.stringify(out,null,2))
await b.close()

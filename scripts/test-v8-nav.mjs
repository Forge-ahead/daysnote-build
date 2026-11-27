import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu'] })
const p = await b.newPage()
await p.setViewport({ width: 428, height: 926, deviceScaleFactor: 1 })
await p.evaluateOnNewDocument(()=>localStorage.clear())
await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,900))
// 在首页滚到底
await p.evaluate(()=>{document.querySelector('.page').scrollTop=400})
const before = await p.evaluate(()=>document.querySelector('.page').scrollTop)
// 切到事件页再切回
await p.evaluate(()=>{location.hash='#/events'})
await new Promise(r=>setTimeout(r,300))
await p.evaluate(()=>{location.hash='#/'})
await new Promise(r=>setTimeout(r,300))
const after = await p.evaluate(()=>document.querySelector('.page').scrollTop)
console.log(JSON.stringify({before, after, resetOnNav: after===0}))
await b.close()

import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:'new',args:['--no-sandbox','--disable-gpu']})
const page = await b.newPage()
await page.evaluateOnNewDocument(()=>localStorage.clear())
await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,700))
// 模拟"导出备份"结构（v12 导出格式），验证 migrate 能原样接手
const result = await page.evaluate(async()=>{
  const mig = await import('/src/migrate.ts')
  const backup = {
    _schema:4,_appVersion:'1.1.2',_savedAt:Date.now(),
    categories:[{id:'cat:all',name:'全部',color:'#f3b8c2',order:0,builtin:true,updatedAt:1}],
    events:[{id:'event:x',title:'旅行',date:'2025-06-01',lunar:false,categoryId:'cat:all',icon:'✈️',color:'#dbe7f1',note:'東京',order:1,repeat:'none',showInTimeline:false,createdAt:1,updatedAt:2}],
    settings:{enabledBackends:['couchdb','webdav'],couchUrl:'https://couch.x',couchDb:'mydb',couchUser:'u',couchPassword:'p',webdavUrl:'https://dav.x/d.json',backupFolder:'https://dav.x/backups/',autoBackup:false,autoSync:true,showFestivals:false,aiKey:'sk-1',aiModel:'gpt-4o',themeMode:'auto',backgroundStyle:'beige'}
  }
  const m = mig.migrate(backup,'1.1.2')
  return {
    schema:m._schema, version:m._appVersion,
    events:m.events.map(e=>({id:e.id,title:e.title,showInTimeline:e.showInTimeline,updatedAt:e.updatedAt})),
    backends:m.settings.enabledBackends,
    couchUrl:m.settings.couchUrl, db:m.settings.couchDb, pass:m.settings.couchPassword,
    webdav:m.settings.webdavUrl, backupFolder:m.settings.backupFolder,
    autoBackup:m.settings.autoBackup, showFestivals:m.settings.showFestivals,
    aiKey:m.settings.aiKey, aiModel:m.settings.aiModel,
    themeMode:m.settings.themeMode, backgroundStyle:m.settings.backgroundStyle,
  }
})
const A=[];const eq=(c,m)=>{if(!c)A.push('✗ '+m)}
eq(result.schema===7&&result.version==='1.1.2','版本信息应保留（schema 升到 7）')
eq(result.events[0]?.showInTimeline===false,'showInTimeline=false 应保留（不被默认 true 覆盖）')
eq(result.events[0]?.updatedAt===2,'updatedAt 应保留')
eq(JSON.stringify(result.backends)===JSON.stringify(['couchdb','webdav']),'双后端配置应保留')
eq(result.couchUrl==='https://couch.x'&&result.db==='mydb'&&result.pass==='p','CouchDB 配置应保留')
eq(result.webdav==='https://dav.x/d.json'&&result.backupFolder==='https://dav.x/backups/','WebDAV+备份目录应保留')
eq(result.autoBackup===false&&result.showFestivals===false,'用户关闭的开关应保持 false')
eq(result.aiKey==='sk-1'&&result.aiModel==='gpt-4o','AI 配置应保留')
eq(result.themeMode==='auto'&&result.backgroundStyle==='beige','外观配置应保留')
console.log(JSON.stringify(result,null,2))
console.log('\n=== 备份往返断言 ===')
console.log(A.length?A.join('\n'):'✓ 全部通过：导出备份含配置，导入后原样恢复')
await b.close()

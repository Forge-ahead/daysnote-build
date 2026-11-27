import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:'new',args:['--no-sandbox','--disable-gpu']})
const page = await b.newPage()
await page.setViewport({width:428,height:926,deviceScaleFactor:1})

// 构造"旧版本"数据：v1 结构，缺少新字段，settings 是旧的单后端格式
const OLD_DATA = {
  categories: [
    { id:'cat:all', name:'全部', color:'#f3b8c2', order:0, builtin:true },
    { id:'cat:misc', name:'杂事', color:'#a8d3d2', order:1 },
    { id:'cat:anniv', name:'周年纪念', color:'#e8786d', order:2 },
  ],
  events: [
    // v29：旧版内置事件属于用户数据，必须原样保留（不能被迁移删掉）
    { id:'event:bi:yearleft', title:'今年剩余', date:'12-31', icon:'🦄', color:'#f3b8c2', categoryId:'cat:all', note:'', order:0, repeat:'yearly' },
    { id:'event:bi:birthday', title:'示例倒数事件', date:'2020-01-01', icon:'🐱', color:'#c9d8ef', categoryId:'cat:all', note:'', order:0, repeat:'yearly' },
    { id:'event:bi:joinlianjia', title:'示例正数事件', date:'2021-03-28', icon:'📝', color:'#c3b6a5', categoryId:'cat:anniv', note:'', order:0 },
    // 老数据：无 showInTimeline、无 lunar、无 updatedAt、repeat 非法值
    { id:'event:old1', title:'我的婚礼', date:'2020-05-20', icon:'💕', color:'#f0c8c4', categoryId:'cat:anniv', note:'最重要的日子', order:1 },
    { id:'event:old2', title:'搬家', date:'2023-01-01', icon:'🏠', color:'#dbe7f1', categoryId:'cat:misc', note:'', order:2, repeat:'yearly', lunar:true },
    { id:'event:old3', title:'重复项', date:'2022-03-03', icon:'📌', color:'#e3e9d5', categoryId:'cat:misc', note:'', order:3 },
    { id:'event:old3', title:'重复项', date:'2022-03-03', icon:'📌', color:'#e3e9d5', categoryId:'cat:misc', note:'', order:3 }, // 重复 id
  ],
  settings: {
    // 旧版单选后端
    syncBackend:'webdav',
    webdavUrl:'https://dav.example.com/daysnote/data.json',
    webdavUser:'olduser', webdavPassword:'oldpass',
    aiKey:'sk-old-key', autoSync:false,
    // 缺 enabledBackends / showFestivals / backupFolder 等新字段
  },
}

// 注入旧数据到 localStorage（模拟覆盖安装前已存在的旧版数据）
await page.evaluateOnNewDocument((data)=>{
  localStorage.setItem('daysnote.v1', JSON.stringify(data))
  localStorage.setItem('daysnote.builtinImport.v6','1') // 老用户已导入过，避免这次又加内置事件干扰断言
  // v28 遗留的删除标记：v29 启动时必须自动清掉，否则同步会继续删云端
  localStorage.setItem('daysnote.tombstones.v1', JSON.stringify(['event:bi:birthday','event:bi:yearleft','event:user:keep']))
}, OLD_DATA)

await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,700))

const out = await page.evaluate(async()=>{
  const raw = JSON.parse(localStorage.getItem('daysnote.v1'))
  const mig = await import('/src/migrate.ts')
  const m = mig.migrate(raw, '1.1.0')
  return {
    schema: m._schema,
    appVersion: m._appVersion,
    // 数据完整性
    categories: m.categories.map(c=>({id:c.id,name:c.name,color:c.color,builtin:!!c.builtin})),
    events: m.events.map(e=>({id:e.id,title:e.title,date:e.date,lunar:e.lunar,showInTimeline:e.showInTimeline,displayMode:e.displayMode,repeat:e.repeat,note:e.note,createdAt:!!e.createdAt,updatedAt:!!e.updatedAt})),
    // v29：v28 遗留的内置事件删除标记应被清理，用户自己的删除标记保留
    tombstones: JSON.parse(localStorage.getItem('daysnote.tombstones.v1') || '[]'),
    // 配置接手
    settings: {
      enabledBackends: m.settings.enabledBackends,
      syncBackend: m.settings.syncBackend,
      webdavUrl: m.settings.webdavUrl,
      webdavUser: m.settings.webdavUser,
      webdavPassword: m.settings.webdavPassword,
      aiKey: m.settings.aiKey,
      autoSync: m.settings.autoSync,
      showFestivals: m.settings.showFestivals,
      backupFolder: m.settings.backupFolder,
    },
  }
})

// 断言
const A=[]
const eq=(cond,msg)=>{if(!cond)A.push('✗ '+msg)}
eq(out.schema===7,'schema 应为 7')
eq(out.events.some(e=>e.id==='event:bi:birthday'),'旧版内置事件必须保留（v29 不再删除用户数据）')
eq(out.events.some(e=>e.id==='event:bi:joinlianjia'),'旧版内置正数事件必须保留')
eq(!out.tombstones.includes('event:bi:birthday'),'v28 遗留的内置事件删除标记应被清除')
eq(out.tombstones.includes('event:user:keep'),'用户自己的删除标记必须保留')
eq(out.events.some(e=>e.id==='event:old1'),'用户自建事件必须保留')
eq(out.categories.length===3,'分类应完整 3 个（实际 '+out.categories.length+'）')
eq(out.categories.find(c=>c.id==='cat:anniv')?.color==='#e8786d','分类颜色应保留')
eq(out.events.length===5,'内置事件保留（今年剩余伪事件被移除）、去重后应为 5 条（实际 '+out.events.length+'）')
const w=out.events.find(e=>e.id==='event:old1')
eq(w?.title==='我的婚礼'&&w?.note==='最重要的日子','事件标题/备注应保留')
eq(w?.lunar===false,'缺失 lunar 应补默认 false')
eq(w?.showInTimeline===true,'缺失 showInTimeline 应补默认 true')
eq(w?.repeat==='none','非法 repeat 应纠正为 none')
eq(w?.createdAt&&w?.updatedAt,'时间戳应补全')
eq(w?.displayMode==='countup','过去一次性事件 displayMode 应补 countup')
const mv=out.events.find(e=>e.id==='event:old2')
eq(mv?.repeat==='yearly'&&mv?.lunar===true,'合法 repeat/lunar 应保留')
eq(mv?.displayMode==='countdown','yearly 事件 displayMode 应补 countdown')
eq(out.settings.enabledBackends?.includes('webdav'),'旧 syncBackend=webdav 应迁移到 enabledBackends')
eq(out.settings.webdavUrl==='https://dav.example.com/daysnote/data.json','WebDAV URL 应保留')
eq(out.settings.webdavUser==='olduser'&&out.settings.webdavPassword==='oldpass','WebDAV 凭证应保留')
eq(out.settings.aiKey==='sk-old-key','AI Key 应保留')
eq(out.settings.autoSync===false,'用户关闭的 autoSync 应保持 false')
eq(out.settings.showFestivals===true,'缺失 showFestivals 应补默认 true')
eq(out.settings.backupFolder==='','缺失字段应补默认')

console.log(JSON.stringify(out,null,2))
console.log('\n=== 覆盖升级断言 ===')
console.log(A.length? A.join('\n') : '✓ 全部通过：事件/分类/配置无损接手，缺失字段补全，重复数据去重')
// UI 层确认页面正常渲染
const ui = await page.evaluate(()=>({cards:document.querySelectorAll('.event-card').length, crash:!document.querySelector('.page')}))
console.log('UI:',JSON.stringify(ui))
await b.close()

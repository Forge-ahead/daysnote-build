# DaysNote · 手绘风倒数日 / 纪念日

一套代码生成 **iOS IPA** 与 **Android APK** 的开源倒数日 App。界面按提供的 5 张效果图实现：网格纸背景、马卡龙色卡片、分类笔记本封面、公历/农历滚轮、事件详情大数字。

## 功能对照

| 效果图 | 实现位置 | 说明 |
|---|---|---|
| 图 5 主界面 | `HomeView` | 顶部分类下拉、倒数/正数分组可折叠、彩色事件卡片、底部 4 Tab |
| 图 4 分类封面 | `CategoryGrid` | 双列笔记本封面、选中勾选、右上编辑、右下新建 |
| 图 3 类别管理 | `CategoryList` | 长按拖动排序、点击编辑名称/颜色、删除分类 |
| 图 1 事件详情 | `EventDetail` | 相框式卡片、大数字、年月日星期、年/月/周/日切换、写日记入口 |
| 图 2 日期编辑 | `DateEditor` | 三列滚轮、公历/农历切换、图标/颜色/分类/重复/备注编辑 |

额外功能：

- **远程同步（CouchDB / WebDAV 双后端可同时启用）**：在「更多 → 同步」分别用开关启用 CouchDB 与/或 WebDAV，并填写各自凭证。
  - **CouchDB**：服务器 URL、库名、账号密码；每个事件/分类是一个文档。
  - **WebDAV**：一个 JSON 文件的完整 URL（如 `https://dav.example.com/daysnote/data.json`）、账号密码；全部数据存在一个文件里，用 ETag 做乐观锁。文件不存在时自动创建。
  - **自动同步**：打开软件时、从后台切回前台时、以及**每次新增 / 修改 / 删除事件或分类后**（800ms 防抖）都会自动同步一次，不再每分钟轮询。也可手动点「立即同步」。
  - **版本控制**：以每条记录的 `updatedAt` 为版本号。设备离线期间的修改会保留更大的时间戳，下次同步按时间保留新版数据，不会被旧版覆盖。
  - **后端优先级**：同一条数据在 CouchDB 与 WebDAV 内容不一致时，以 **CouchDB 为准**并覆盖 WebDAV（CouchDB 是权威数据源）。
  - **冲突处理**：本地与权威远端版本号相同但内容都改动时，不自动覆盖，弹出冲突面板逐条列出本机版与远程版（含修改时间与内容摘要），由你选择「保留本机」或「保留远程」；也可「暂时忽略」。删除操作通过 tombstone 同步，不会被另一端拉回。
- **月度 WebDAV 备份**：在「更多 → 数据」开启「每月自动备份」并填写备份文件夹 URL（如 `https://dav.example.com/daysnote/backups/`），每月首次打开自动备份一次。文件以当天日期命名（如 `2026-06-01.json`），只保留业务字段、剔除同步元数据以尽量减小体积，复用 WebDAV 凭证。也可手动点「立即备份」。
- **AI 自然语言增删**：「更多 → AI 助手」填入任意 OpenAI 兼容 API（OpenAI / DeepSeek / 通义 / 自建代理等）。通过 function calling 直接创建/修改/删除事件和分类，例如：`把纪念日改成农历八月初五，每年重复` / `删除在一起`。
- **JSON 导入导出**：导出文件包含 `_schema`、`_appVersion`、`categories`、`events` 和完整 `settings`（CouchDB / WebDAV 地址与凭证、备份目录、AI 配置、时间轴开关等）；导入时统一走迁移框架，旧版备份可直接恢复，用户主动关闭的开关会保持关闭。
- **日期显示真实年份（v26）**：倒数事件的日期始终显示事件**本身保存的日期**，不再显示按年滚动后的目标年份；天数仍按 yearly 滚动到的下一次目标日期计算。
- **显示方式三选一（v26）**：新增/编辑事件时可指定首页显示为 **倒数 / 正数 / 都显示**（`EventItem.displayMode`）。倒数＝距离下一次还有几天；正数＝从事件日期到今天已过几天；都显示＝两组都出现。老数据按 yearly=倒数、过去日期=正数自动推断，升级前后首页分组不变。
- **小组件模板系统（v26 精简为 6 款）**：按你 5 张设计图拆解组件（一张图含多个组件）。分类标签 + 模板网格 + 预览弹窗。**每个组件只保留它该有的专属尺寸，不再提供尺寸切换、也不会扩展出其它规格**；组件分类按 **小 / 中 / 大** 分组。**v26 移除「简约列表·纯数字」，2×2 只保留「带天」一款**：
  - **小 2×2**：简约列表·带"天"（紧凑三行、色块放大）
  - **中 4×2**：假日·法定节假日 / 假日·清新绿 / 四宫格面板
  - **大 4×4**：图文列表·青绿 / 简约列表·大号
  - **事件来源二选一，分类可多选**：每个多事件组件既能「① 勾选指定事件」，也能「② 选分类」——分类**支持多选**（同时选多个分类时事件合并去重），点开绑定默认就停在「选分类」。**未做任何绑定时默认加载全部纪念日事件**。统一按**临近日期排序**，每年重复事件到期自动滚到下一次，过期的一次性事件排到末尾（即"这个过了就显示下一个"）。选系统「全部」分类等同首页全部事件。
  - **「假日」分类（v23 新增）**：左侧显示「距离下一个法定节假日还剩几天 + 休 + 放假区间（几号休到几号）」，数据来自 **holiday-cn（国务院放假安排）**，按你的要求**每月自动联网更新一次**，跨月才刷新、网络失败用缓存、离线用农历推算兜底（`src/holiday.ts`）；右侧显示所选分类事件，同样按临近排序。
  - 模板定义集中在 `src/widgetTemplates.ts`（kind 决定布局逻辑、skin 决定配色），绑定解析在 `src/widgetBindings.ts`，新增模板追加一项即可。原生 WidgetKit 实现与编译方式见「系统小组件」章节。
- **内置示例事件**：公开发行版只内置 **1 条示例事件**「在一起」（正数、2019-11-04），用于首次打开时演示效果，可随时删除或修改。旧版曾内置的个人纪念日已从代码中删除，不再随安装包分发；**但已存在于你手机或云端的这些事件不会被删除**（v29 起明确不做任何越权删除）。
- **时间轴节日**：「事件」页时间轴把**农历节日**（春节/元宵/端午/七夕/中秋/重阳/腊八/除夕等，按所选年份动态换算公历）与**法定节日**（元旦/劳动节/国庆节等）和纪念日一起按月日混排，节日用橙色节点和「农历/节日」标签区分。「更多 → 数据 → 时间轴显示」可一键关掉节日，只显示纪念日；时间轴顶部也可切「全部 / 仅纪念日」。
- **事件级时间轴开关**：每个纪念日在「编辑 → 内容」里有「显示到事件时间轴」开关，关闭后该事件不进入时间轴（首页仍正常显示）。
- **滚动与天数显示**：根级 `html/body/#root` 固定为 `height:100%; overflow:hidden`，原生平台额外在捕获阶段拦截非滚动区的 touchmove，彻底消除下拉拖拽整个界面的橡皮筋；每个页面 `.page` 独立滚动。首页天数超过 365 天时自动显示为「x.xx年」（如 7.06年），365 天以内仍显示天数。
- **内置事件**：仅 1 条示例事件「在一起」。旧版本升级时，代码中曾内置的个人事件会按内置 id 精确删除并写入 tombstone（同步时一并清除远端副本），用户自建事件不受影响。
- **「今年剩余」动态展示位（v27）**：不再是真实事件、不进入事件列表/时间轴/小组件，只在首页顶部大卡片展示。天数按**当前年份**的 12-31 实时计算（`yearRemaining()`），跨年自动切换为新一年的剩余天数。老数据中的内置 `event:bi:yearleft` 升级时自动移除并补 tombstone（同步时清掉远端那份）。老用户升级后首次打开会自动清理旧内置事件（按 id 精确匹配），并在「更多 → 数据」里可手动导入示例事件（`daysnote.builtinImport.v6`，重复项自动跳过）。
- **分类筛选**：首页点顶部分类下拉进入类别页，选中某分类后首页只显示该分类下的事件（标题同步显示分类名）。
- **全宽界面 + 顶部导航置顶 + 底部 TabBar 常驻**：已回退 v11 的 40% 窄栏方案，恢复 v10 全宽布局（`--app-w:100%; max-width:428px`）。v19 收紧上下留白并做全机型适配：Web 预览顶部由仿真状态栏自身占位（`--top-offset:0`，不再叠加 44px 造成 74px 空白带），原生环境 `.app-shell.native` 用真实 `--safe-t` 贴合刘海/状态栏下沿（iPhone 13 Pro Max 刘海无灵动岛 ≈59px，安卓按各自状态栏高度自动适配），仿真状态栏在原生下隐藏；所有页面的 `.navbar`（含添加、编辑、继续按钮）改为 `position:sticky`，滚动内容时不跟随滚动。底部标签为「事件 🗳️ / 时间轴 📆 / 组件 🏠 / 更多 🌱」。底部 TabBar 渲染到 `document.body` 层并用 `position:fixed;bottom:0`，彻底脱离 `.app-shell` 的高度/`overflow`/动画；v19 曾把 `--tabbar-pad-b` 砍到 `max(4px,safe-b/2)` 试图收紧 home-indicator 空白；v21 修复由此引入的触控回归——恢复完整 `safe-b`，按钮命中区回到 Home Indicator 手势带之上（距底 34pt），背景仍延伸到屏幕底不留白，并为 `.tab` 加 `touch-action:manipulation`（见「底部标签触控回归」）；同时保留桌面/横屏预览下 `bottom:auto` 使 fixed 标签栏掉出视口的问题（改为 `bottom:16px` 贴手机框底）；同时移除渲染阻塞的 Google 字体 `@import`，并在首帧用 rAF 连续 8 帧测量真实可视高度写入 `--app-vh`，监听 `pageshow`/`visibilitychange`/`orientationchange` 反复校准，解决 iOS 首帧布局未稳导致「首次打开无底栏、切后台回来才出现」。继续保留四向安全区令牌、`clamp()` 流式字号与间距、44pt/48dp 触控目标和 16px 输入框字号。
- **时间轴连续滚动 + 偏好记忆**：时间轴默认加载当前年前后各一年，滑动到顶部/底部会自动扩展上一年/下一年（年份范围 1970–2100，顶部插入时补偿 `scrollTop` 保持视觉位置）；进入时定位到当前年份，年份选择**不记忆**，每次打开回到现在。「全部 / 仅纪念日」和分类筛选写入 localStorage（`daysnote.timeline.scope.v1`、`daysnote.timeline.cat.v1`）下次打开保持。节日清单已从时间轴移除妇女节、劳动节、建党节、建军节、教师节、国庆节；筛选控件浮动常驻，年份胶囊可点击直接选年；v18 将年份下拉从控件栏移除，分类筛选挪到「仅纪念日」同行并排，控件栏收成单行、变短上移贴近导航标题。
- **夜间模式与背景**：「更多 → 外观」提供**白天 / 夜间 / 自动**三种模式；自动模式跟随系统 `prefers-color-scheme`，夜间下卡片保持可读的深色文字。背景可选**格纹 / 米色 / 暖白 / 浅灰**四种样式，夜间下会自动切换到对应深色背景。
- **自定义事件图标**：日期编辑页「内容」除了快速图标，还可直接输入任意 Emoji；留空保存自动使用 📌。
- **侧边栏 + 系统字体 + 数据库体积（v20）**：左上角三道杠改为呼出侧边栏（`src/components/Drawer.tsx`），顶部为搜索框（按标题/备注/日期实时过滤事件，点击结果进详情），下方为各分类及事件数（点击分类回到首页并筛选）；全站字体改为系统默认（iOS SF Pro / 安卓 Roboto，无衬线），不再用楷体；设置 → 同步「最近同步」下方新增一行，显示上次同步时读到的 CouchDB 对应库体积（`GET /{db}` 的 `sizes.active/disk` 与 `doc_count`，`sync.ts` 的 `getCouchDbInfo` + `formatBytes`，不阻塞同步主流程）。
- **底部标签触控回归（v21）**：新增 `scripts/test-touch.mjs`，模拟 iPhone 13 Pro Max 真实安全区（`safe-b=34pt`，headless Chromium 默认 `env(safe-area-inset-*)` 恒为 0，因此常规命中测试无法复现真机问题），断言四个标签命中区距屏幕底 ≥34pt、触控高度 ≥44pt、中心点命中自身、点击后 hash 立即切换。根因是 v19 把 `--tabbar-pad-b` 从完整安全区砍半，使按钮下探进 iOS Home Indicator 手势带，WKWebView 需先等系统判定上滑手势才处理点击，表现为「v18 正常、v19 起点击不能立即跳转」。
- **覆盖安装版本控制**：应用版本为 **1.3.1（build 20）**，数据 schema 为 **4**。启动时通过 `migrate.ts` 自动识别并升级旧版结构，保留旧事件、分类、CouchDB / WebDAV 凭证、备份目录、AI 配置和所有用户开关；缺失字段补默认值，重复事件按 id / 标题+日期去重，非法 `repeat` 值回退为 `none`。`persist.ts` 同时写 localStorage 与 Capacitor Preferences：若覆盖安装后 WebView localStorage 丢失，会从原生 Preferences 镜像恢复，不会用空数据反向覆盖旧配置。
- **事件数据模型**：`id, title, date, lunar, categoryId, icon, color, note, order, repeat, showInTimeline, createdAt, updatedAt`。

## 技术栈

React 18 + TypeScript + Vite + Capacitor 7。Web 代码一次构建，Capacitor 分别生成 `ios/` 与 `android/` 原生壳。农历计算用 `lunar-javascript`，图标用 `lucide-react`。

```
src/
  App.tsx                 页面路由与底部 Tab
  store.tsx               全局状态、本地持久化、同步编排
  sync.ts                 统一同步层：CouchDB / WebDAV 后端 + 冲突检测 + 删除标记（无 PouchDB 依赖）
  couchdb.ts              兼容导出层（保留旧引用）
  ai.ts                   OpenAI 兼容 function calling
  date.ts / seed.ts       农历换算、天数计算、初始数据
  version.ts              应用版本与 build 号的单一来源（1.1.0 / 11）
  migrate.ts              数据 schema 版本与旧版数据迁移
  persist.ts              localStorage 主存储 + Capacitor Preferences 原生镜像
  components/             5 张效果图对应的页面
ios/App/                   Xcode 工程（由 cap add ios 生成）
android/                   Android Studio 工程
.github/workflows/         macOS 自动构建 IPA
```

## 本地运行（预览 / Web / PWA）

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # 产出 dist/
npm run preview
```

浏览器预览时可用 hash 直接跳页：`#/catgrid`、`#/catList`、`#/settings`。

## 出 iOS IPA

> Linux 沙箱无法编译 iOS：需要 macOS + Xcode + 签名材料。本项目已把可自动化的部分全部配好。仓库内也提供 `scripts/build_ipa.py`，可在已有有效 Capacitor IPA 二进制壳的基础上替换 `dist/` web 资源、修复图标、写入 `CFBundleShortVersionString` / `CFBundleVersion`，重新生成未签名 IPA。

### 方式 A：GitHub Actions 自动出包（推荐）

1. 把项目推到你自己的 GitHub 仓库。
2. 准备 Apple 开发者账号的 **P12 证书 + 包含你设备 UDID 的 Provisioning Profile**（Ad-hoc/Development 分发）。转 base64：
   ```bash
   openssl base64 -in cert.p12 -A
   openssl base64 -in profile.mobileprovision -A
   ```
3. 在仓库 `Settings → Secrets and variables → Actions` 添加：
   `BUILD_CERTIFICATE_BASE64`、`P12_PASSWORD`、`BUILD_PROVISION_PROFILE_BASE64`、`KEYCHAIN_PASSWORD`。
4. 修改 `ios/ExportOptions.plist` 中的 `teamID` 与 profile 名称。
5. 在 Actions 页手动运行 **Build IPA**，或推送 `v*` 标签。完成后从 Artifacts 下载 IPA。

### 方式 B：本地 Mac 手动出包

```bash
npm install
npm run build
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

Xcode 中选择 `App` target → Signing & Capabilities 里选你的 Team → `Product → Archive` → `Distribute App → Development/Ad-hoc` → 导出 IPA。
安装可用 Finder / Apple Configurator / 爱思助手（Ad-hoc 时设备 UDID 必须在 profile 内）。免费 Apple ID 签名的证书 7 天过期，需重签；付费开发者账号有效期 1 年。

## 出 Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

正式包用 `./gradlew assembleRelease` 并配置 `android/app/build.gradle` 里的签名。

## CouchDB 配置要点

数据库**专用一个库**（建议名 `daysnote`），不要与其他笔记混用。文档按 `event:<uuid>` / `category:<uuid>` 存，AI 和 App 共用同一份数据。

1. 建库（需管理员）：
   ```bash
   curl -X PUT -u admin:密码 http://your-server:5984/daysnote
   ```
2. 开启 CORS（在 Fauxton → Configuration → cors，或 `local.ini`）：
   ```ini
   [cors]
   origins = *
   credentials = true
   methods = GET,PUT,POST,DELETE,HEAD
   headers = content-type,authorization
   ```
3. iOS 若用 http 明文地址，需在 `capacitor.config.ts` 把 `allowMixedContent` 设为 `true`（建议使用 HTTPS）。
4. 凭证只存在 App 本地（localStorage / Capacitor Preferences），不写入 CouchDB 文档。

## 同步机制（怎么理解「同步」）

**同步是双向的**，一次同步 = 「拉取 + 推送 + 合并」，不是单纯上传备份：

| 情况 | 结果 |
| --- | --- |
| 云端有、手机没有 | **拉下来**存到手机 |
| 手机有、云端没有 | **推上去**存到云端 |
| 两边都有且内容一致 | 跳过（不计入变更） |
| 两边都有但内容不同 | 按 `updatedAt` 保留较新的一版；时间完全相同才让你裁决 |
| 你在手机上删了 | 推一个删除标记到云端，云端对应文档被删 |
| 你在云端删了 | 手机下次同步时同步移除 |

几个容易误解的点：

- **`doc_count` 不等于「有效记录数」**。CouchDB 把已删除文档也计入 `doc_count`，所以库里显示 40 篇、App 里只有 16 条是可能的。真正的有效条数以同步明细里的「当前共 N 条」为准，设置页也会单独显示「+ N 篇已删除」。
- **只在手机里删掉、没同步出去**的记录，下次同步时云端会把它拉回来（因为云端才是存活的那份）。要让删除生效，删完要等自动同步跑完。
- **云端文档的 `_id` 不必带 `event:` 前缀**。通过 AI 或其他客户端直接写库时，只要文档有 `title` + `date`，同步会按事件处理并补全缺失字段（v29 起；此前这类记录会被静默丢弃）。
- **同步不会「以手机为准整体覆盖云端」**。v29 起任何本地清理都不会把云端对应记录一并删掉。

设置页「最近同步」下面会显示本次明细：`从云端拉取 N 条 · 向上推送 M 条 · 未变 K 条 · 当前共 X 条`，可直接判断同步到底做了什么。

### 云端数据被误删后的恢复

`scripts/couch_inspect.py` 是只读体检工具，可在不写库的前提下盘点云端现状：

```bash
# 只看：库体积、正常文档、已删除文档清单
python3 scripts/couch_inspect.py --check \
  --url https://你的服务器:5984 --db daysnote --user 用户名 --password 密码

# 抢救：用删除前仍保留的旧修订把文档复活（CouchDB 压缩前有效）
python3 scripts/couch_inspect.py --rescue --dry --url ... 
python3 scripts/couch_inspect.py --rescue --apply --url ...
```

### 强制覆盖同步与回收站（v30）

- **本地覆盖服务器 / 服务器覆盖本地**：设置页「同步」面板新增两个强制单向覆盖按钮。普通同步永远是双向合并、不会丢数据；这两个按钮只在数据错乱、想彻底重置某一端时使用。点击后会弹出风险确认，明确告知后果（覆盖方向另一端多出的记录会被删除、**不可撤销、不进回收站**），确认后才执行。
- **回收站**：侧边栏（左上角三道杠）最底部的独立入口，与上方分类明显区分。删除事件会先进回收站（保留原事件的标题、图标、日期与完整内容）。页面分两区：**本机已删除**（可勾选恢复 / 彻底删除）与**云端已删除**（从 CouchDB `_changes` 读取，可勾选恢复到本地，恢复时一并复活云端记录）。回收站最多保留 300 条。

- **v31 增强**：抽屉底部回收站入口上移 44px，更好点按；云端已删除项可**点开展开**，从 CouchDB 修订链回捞删除前的标题、日期、图标、备注、分类与显示模式（旧版本已被服务器压缩时显示「无法读取详情」）；删除标记现在写入 `deletedAt`，回收站按 **6 个月保留期**标记过期项，并提供「永久清除」（调用 CouchDB `_purge`，不可逆、需管理员权限，带二次确认）。历史删除标记没有 `deletedAt`，显示「删除时间未知」。

## WebDAV 配置要点

- 填一个** JSON 文件的完整 URL**（App 会用 GET 读取、PUT 写回整个文件）。文件不存在时自动创建一个空文件。
- 服务器需支持标准 GET / PUT、Basic Auth，并返回 `ETag` 响应头（用于乐观锁）。CORS 需允许 `GET, PUT`，并暴露 `ETag` 头。
- 以常见的 nginx WebDAV 为例，确保对该目录开放写权限，并在响应中带上 ETag。用支持 WebDAV 的网盘（如 Nextcloud）时，直接复制文件的分享直链即可。
- 由于是单文件整体读写，多设备同时写入时用 ETag 检测：若服务端 ETag 已变会返回 412，App 会提示重试，重试时走正常冲突检测流程。

## AI 配置要点

任意 OpenAI Chat Completions 兼容服务均可，填写 Base URL（含 `/v1`）、Key、模型名即可。若直接用 OpenAI 官方地址，浏览器端可能受 CORS 与 Key 暴露限制，建议自建一层代理并把 Base URL 指向代理。AI 所需工具函数定义在 `src/ai.ts`，可自行增删。

## 系统小组件（v26）

按你提供的 5 张设计图，逐张拆解（**一张图里可能包含多个独立组件**），共做出 **6 款组件**（v26 移除「简约列表·纯数字」，2×2 只留「带天」），并全部内置了原生 WidgetKit 实现。原「热门」分类已按你的要求改名为「**假日**」。

**v24 尺寸修正（重要）**：每个组件只保留它该有的专属尺寸，App 内不再有尺寸切换按钮，系统桌面也不会让一个组件扩展出其它规格。做法是把原来的单一 Widget 拆成 **3 个独立 Widget**，各自只声明一种 family：`DaysNoteSmallWidget`（仅 2×2，简约列表）、`DaysNoteMediumWidget`（仅 4×2，假日/四宫格）、`DaysNoteLargeWidget`（仅 4×4，图文/大号）。用户添加时看到三个条目，各自固定尺寸；`SharedStore.config(for family:)` 也已改为严格按尺寸匹配，杜绝串尺寸渲染。

**v25 视觉与绑定修正**：
- 组件分类改为「**小 / 中 / 大**」三档，不再按假日/简约/清新/图文划分（见上表）。
- 绑定事件时默认进入「**选分类**」，分类**可多选**；未绑定时默认加载全部事件。Swift 数据模型 `WidgetBindingInfo.categoryIds: [String]` 兼容旧单值 `categoryId`。
- 修正 2×2 简约列表：此前 `.wp-simple{width:100%;height:100%}` 覆盖了外框 158×158、父容器又无确定高度，导致它被渲染成 344×157 的 4×2 扁条；现在外框先锁定确定尺寸、内部用 100% 铺满，并删掉三行中间空白、放大色块，缩略图与详情均为完美 1:1。Swift `SimpleView` 同为 3 行紧凑布局。
- 多选分类改为函数式 state 更新，避免同一 tick 内连续点击丢状态。

**v26 精简**：移除「简约列表·纯数字」模板，2×2 仅保留「带天」一款（`simple-day`）；Swift demo 兜底也改为 `simple-day`，组件总数 7→6。

| 模板 | 来源 | 尺寸 | 设计逻辑 |
|---|---|---|---|
| 假日 · 法定节假日 | 图2 | 中 4×2 | 左侧「距离下一个法定节假日还剩几天 + 休 + 放假区间」（联网国务院安排，每月更新），右侧所选分类事件 |
| 假日 · 清新绿 | 图1 | 中 4×2 | 同上假日组件清新绿皮肤；左侧法定节假日，右侧分类事件 |
| 简约列表 · 带「天」 | 图3右 | 小 2×2 | 同布局，数字与「天」分格显示 |
| 四宫格面板 · 柔粉 | 图4 | 中 4×2 | 2×2 卡片，emoji + 装饰标题 + 日期 + 大数字 |
| 图文列表 · 青绿 | 图5上 | 大 4×4 | 青绿背景 + 顶部日期 + 5 行半透明卡片 |
| 简约列表 · 大号 | 图5下 | 大 4×4 | 白底蓝头 + 5 行色块数字（近蓝远橙） |

**v23 组件逻辑升级**：

- **多事件来源二选一**：每个组件在「绑定事件」里可选「① 指定事件」（勾选具体事件）或「② 选分类」（该分类下全部事件自动排入）。统一按临近日期排序，每年重复事件到期自动滚到下一年，过期的一次性事件排末尾——即"这个过了就显示下一个"。
- **法定节假日联网**：「假日」组件左侧数据取自 [holiday-cn](https://github.com/NateScarlet/holiday-cn)（源自国务院办公厅放假安排），可准确给出"春节 2/15–2/23 共9天"这类区间。按你的要求**每月更新一次**（`src/holiday.ts` 按月份缓存，跨月才重新联网）；网络失败用上次缓存，完全没有缓存时用内置农历推算兜底。

**为什么之前系统桌面看不到组件？** 之前的"小组件"只是 App 内一个网页预览页，iOS 工程里**没有 Widget Extension**（无 PlugIns、无组件二进制），所以系统小组件列表里根本不会出现。v22 起已补齐全部原生实现，v23 同步更新了 Swift 数据模型（HolidayInfo、绑定来源）与假日视图：

- `ios/App/DaysNoteWidget/DaysNoteWidget.swift`：WidgetBundle 含 **3 个独立 Widget**（小/中/大各一个、各只声明一种 family）+ TimelineProvider + 6 种布局视图（含假日视图 HolidayView：左侧节假日倒计时 + 休 + 区间，右侧分类事件）
- `ios/App/WidgetShared/SharedStore.swift`：App Group（`group.com.daysnote.app`）共享数据模型，App 与 Widget 共用同一份
- `ios/App/WidgetBridge.swift` + `WidgetKitReload.swift`：Capacitor 自定义插件，App 内绑定事件后写入共享存储并刷新时间线
- `ios/App/App/App.entitlements`、`ios/App/DaysNoteWidget/DaysNoteWidget.entitlements`：App Group 权限
- `ios/App/App.xcodeproj/project.pbxproj`：已手工注入 Widget target、Embed App Extensions 阶段、target 依赖
- `.github/workflows/build-ipa.yml`：已改为不运行 `cap sync`（会覆盖原生配置），直接复制 Web 资源后连 Widget 一起编译，并校验 PlugIns 目录

**如何得到"系统桌面能显示"的包（二选一）**：

1. **本地 macOS + Xcode**（推荐，无需 GitHub 额度）：
   ```bash
   cd countdown-app
   bash scripts/build_widget_ipa.sh        # 产出 DaysNote-v31-with-widget-unsigned.ipa
   # 再用你的证书重签后安装
   ```
2. **GitHub Actions**：推送到 `main` 或手动触发 `Build Unsigned IPA (with Widget Extension)`，从 Artifacts 下载带 Widget 的 IPA。

安装后：桌面长按 → 添加小组件 → 选择「纪念日」→ 选小/中/大尺寸即可看到对应组件。在 App「组件」页点开模板可切换系统组件优先展示的样式；绑定事件后数据自动同步到组件。

> Android 侧：目前为 Web 预览 + 配置入口；真正的桌面组件可用 Android App Widget / Glance 实现，数据与 iOS 共用同一套配置结构，需要时可按 `WidgetConfig` 结构接入。

## 已知边界

- **系统小组件（重要，见专门章节）**：底部「组件」Tab 既是预览页，也是系统小组件的配置入口。真正的 iOS Widget Extension 源码与工程配置已全部内置（v22 起），但**必须用 macOS + Xcode 编译一次**才会出现在系统桌面——Linux 环境无法编译 Swift/WidgetKit，因此下方直接交付的 `DaysNote-v31-unsigned.ipa` 是"替换 Web 资源的壳"，其中**不含 Widget 二进制，系统桌面看不到组件**。请在 Mac 上执行 `scripts/build_widget_ipa.sh`，或触发 GitHub Actions `Build Unsigned IPA (with Widget Extension)`，得到真正带小组件的 IPA 后重签安装。详见「系统小组件」章节。
- **AI 图片插画**：效果图中的手绘插画用系统 emoji 代替，避免引入第三方版权素材；替换为自己的图片资源即可。
- **同步冲突**：单方修改自动同步；双方以相同版本号改动同一条且内容不同时，弹出冲突面板让用户逐条选择保留本机或远程版本，不做逐字段自动合并。CouchDB 与 WebDAV 之间的分歧不弹窗，直接以 CouchDB 为准。
- **未签名 IPA**：仓库里的 `DaysNote-v31-unsigned.ipa`（2.3.0 / build 30）为未签名包，需用你自己的证书重签后再安装（见「出 iOS IPA」）。此包含新版组件预览页，但不含系统 Widget 二进制（见上一条）。旧版本 IPA 可作为历史版本保留，但建议以 v31 为升级基线。

## 协议

MIT

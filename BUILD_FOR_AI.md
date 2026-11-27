# 编译交接说明（给接手的 AI / 开发者）

## 项目是什么

DaysNote —— 手绘风倒数日 / 纪念日 App。React 18 + TypeScript + Vite 写 Web 层，Capacitor 7 打包成 iOS / Android 原生壳。

- 首页：正数/倒数分组、分类下拉、彩色卡片；添加事件按钮在右上角，右下角已移除
- 分类管理：封面颜色、拖动排序、新建/编辑/删除
- 事件详情：大数字、年/月/周/日切换、农历显示
- 日期编辑：三列滚轮、公历农历切换
- 事件页：时刻/节日时间轴，年月筛选，全部事件按月日排布，今天高亮
- 小组件页（v26 升级）：按 5 张设计图拆解出 6 款组件（v26 移除「简约列表·纯数字」，2×2 只留「带天」）；原「热门」分类改名「假日」（左侧法定节假日倒计时+休+放假区间，数据来自 holiday-cn 国务院安排、每月联网更新，右侧分类事件）；所有组件事件来源支持「指定事件 / 选分类」二选一，按临近日期排序、过期自动顺延；v24 起每个组件只保留专属尺寸、不再提供尺寸切换：假日/四宫格=中 4×2，简约列表=小 2×2，图文/大号=大 4×4；Swift 侧拆成 3 个独立 Widget 各声明一种 family。**v25：组件分类改为「小/中/大」三档；绑定默认进入「选分类」且分类可多选（`WidgetBinding.categoryIds: string[]`，兼容旧 `categoryId`）；未绑定默认加载全部事件；2×2 简约列表修正为完美 1:1（stage 外框须先锁定确定尺寸，内部 `.wp-*` 才能用 100% 铺满，否则高度塌陷成 4×2 扁条）**
- 模板扩展：新模板在 `src/widgetTemplates.ts` 的 `WIDGET_TEMPLATES` 追加一项（kind 决定布局逻辑、skin 决定配色、size 决定尺寸），UI 自动归类显示
- **原生 Widget Extension（已内置）**：`ios/App/DaysNoteWidget/`（WidgetBundle + 5 种布局 + TimelineProvider）、`ios/App/WidgetShared/SharedStore.swift`（App Group 共享模型）、`ios/App/WidgetBridge.swift` + `WidgetKitReload.swift`（Capacitor 插件桥接）、两处 `.entitlements`、`project.pbxproj` 已注入 Widget target/Embed 阶段/依赖。App Group id：`group.com.daysnote.app`
- App 图标：日历样式，已替换 iOS / Android / PWA 全套资源。**关键坑**：IPA 的 `Info.plist` 里若保留 `CFBundleIconName`，iOS 会优先用 `Assets.car` 里的旧图标导致桌面图标不更新——出包脚本会删除该键，强制使用 `CFBundleIconFiles` 指向的 `AppIcon60x60@2x.png` / `AppIcon76x76@2x~ipad.png`（这两张 PNG 角落纯黑需先刷成背景色）
- 布局：已回退 v11 的 40% 窄栏，恢复 v10 全宽界面（`--app-w:100%; --app-max-w:428px`）；顶部起点 `--top-offset:max(44px, calc(var(--safe-t) - 12px))`，低于状态栏但贴近刘海/灵动岛下沿，Web 仿真 statusbar 不再重复累加 safe-area；`clamp()` 流式字号/间距；触控目标 --tap-min:44px；输入框 16px 防 iOS 缩放。`App.tsx` 原生环境给 app-shell 加 `.native` 类。
- 顶部导航置顶：所有页面 `.navbar`（含添加/编辑/继续等按钮）必须保持 `position:sticky; top:0; z-index:6`，并用负 margin + 同量 padding 铺满 `.page` 的内容宽度，滚动事件列表时按钮不跟随滚动。
- 底部 TabBar（v21 触控修复后的现行实现，勿回退）：`App.tsx` 用 `createPortal` 把 TabBar 渲染到 `document.body`，`position:fixed; bottom:0`，脱离 `.app-shell` 的 `overflow`/高度/动画，避免祖先裁剪。命中区必须避开 iOS Home Indicator 手势带：`--tabbar-pad-b` 用**完整** `safe-b`（v19 曾砍半，导致点击要等系统手势判定、标签点击延迟），`.tab` 加 `touch-action:manipulation`，背景延伸到底但按钮不上探；桌面预览 `--tabbar-pad-b:8px`、`bottom:16px` 贴手机框底。针对 WKWebView 首帧视口不稳，`useViewportFit()` 用 rAF 连续测量写入 `--app-vh`，并监听 `pageshow`/`visibilitychange`/`orientationchange` 反复校准——这是「首次打开无底栏、切后台回来才出现」的修复。底部标签为「事件 🗳️ / 时间轴 📆 / 组件 🏠 / 更多 🌱」。
- 夜间模式与背景：`settings.themeMode`（light/dark/auto）和 `settings.backgroundStyle`（grid/beige/cream/gray）由 `App.tsx` 写入 `document.documentElement.dataset.theme/bg`；`auto` 监听 `prefers-color-scheme`。CSS 用 `--ink/--paper/--surface/--nav-bg/--grid-line` 等变量切换，彩色事件卡在夜间强制深色字。设置页「外观」tab 提供选择。
- 自定义图标：`DateEditor` 内容 tab 除 `ICONS` 快速项外，必须有可输入任意 Emoji 的文本框；保存时 `icon.trim() || '📌'` 兜底。
- 布局滚动：根 `html/body/#root` 固定 `height:100%; overflow:hidden` + `body{position:fixed}`，`src/main.tsx` 在原生平台捕获阶段拦截非滚动区的 touchmove（消除 WKWebView 橡皮筋拖拽）；`.app-shell` 为 flex 列容器 + `overflow:hidden`，`.page` 为独立滚动容器（`flex:1; min-height:0; overflow-y:auto; overscroll-behavior-y:contain`）
- 首页天数：`src/date.ts` 的 `formatDays()`，超过 365 天显示「x.xx年」（如 7.06年），否则显示整数天数
- 内置事件（公开发行版）：**只有 1 条示例事件「在一起」**（`src/seed.ts` 的 `BUILTIN_EVENTS`）。旧版内置的个人纪念日已从代码中删除。**v29 起 `migrateEvent` 不再按 `REMOVED_BUILTIN_IDS` 丢弃事件**——那会越权删掉用户已有数据（v28 曾因此把云端记录一起删掉）。现在该名单只用于清除 v28 遗留的删除标记；唯一例外是伪事件 `event:bi:yearleft`（由首页 hero 动态替代）。导入标记 `daysnote.builtinImport.v6`
- v27：「今年剩余」不再是事件（不进列表/时间轴/组件），由首页 hero 动态展示（`date.ts` 的 `yearRemaining()` 按当前年份 12-31 计算，跨年自动切换）；老数据的 `event:bi:yearleft` 在 `migrateEvent` 中移除（schema 7），`store.load()` 会补 tombstone 防止同步拉回
- v26 日期与显示模式：事件日期始终显示事件本身保存的日期（`displayDate(ev)` 返回 `ev.date`），天数仍按 `dayInfo()` 滚动目标算。`EventItem.displayMode`（countup/countdown/both）由 `DateEditor`「内容」tab 三选一；`homeCounts()` 分别为倒数（滚动目标）与正数（真实日期）计算；老数据 `inferDisplayMode()` 按 yearly/日期推断，升级分组不变。`DATA_SCHEMA_VERSION=7`。
- 分类筛选：首页分类下拉选中某类后只显示该类事件——`App.tsx` 的 `catId` 必须作为 prop 传入 `HomeView`（曾因 HomeView 内部独立 state 导致筛选失效）
- 时间轴节日：`src/date.ts` 的 `getFestivalsForYear(year)` 动态计算农历节日公历日期（春节/中秋/除夕等）+ 法定节日；法定节日清单**不含**妇女节/劳动节/建党节/建军节/教师节/国庆节；`AppSettings.showFestivals` 控制是否混入时间轴，「全部/仅纪念日」分段切换
- 时间轴连续滚动：`TimelineView.tsx` 默认加载当前年 ±1，`onScroll` 到上/下边缘 72px 时以 `setRange` 扩展年份（上限 1970–2100），顶部插入时 `pendingTopRef` 记录旧 scrollHeight 并在 `useLayoutEffect` 里补偿 scrollTop 保持视觉位置；进入时 `data-year` 定位当前年。偏好记忆用 localStorage `daysnote.timeline.scope.v1`（all/anniv）与 `daysnote.timeline.cat.v1`（分类 id），**年份不记忆**，每次打开用 `new Date().getFullYear()`；控件 `.tl-controls` 用 `position:sticky;top:52px` 浮动，年份胶囊 `.tl-year` 是可点击 `<select>` 直接选年
- 事件级开关：`EventItem.showInTimeline`（默认 true），DateEditor「内容」tab 可关，TimelineView 据此过滤
- 远程同步双后端：CouchDB（每文档一条）与 WebDAV（单 JSON 文件 + ETag 乐观锁），可**同时启用**，REST 实现不依赖 PouchDB
- 自动同步：打开软件、回到前台、以及**新增 / 修改 / 删除事件或分类后**（800ms 防抖）各触发一次；可关闭
- 版本控制：以 `updatedAt` 为版本号，离线期间的修改保留更大时间戳，下次同步按时间保留新版
- 覆盖安装升级：应用版本 `2.3.0`（build 30），数据 schema `7`。`src/version.ts` 是版本单一来源；`src/migrate.ts` 在加载时迁移旧版 categories/events/settings，保留同步凭证、备份目录、AI 配置、时间轴开关和事件级 `showInTimeline`，补缺失字段并去重；`src/persist.ts` 同时写 localStorage 与 Capacitor Preferences，覆盖安装后 WebView 存储丢失时从原生镜像恢复
- 完整备份：`SettingsView` 导出的 JSON 含 `_schema`、`_appVersion`、`categories`、`events`、`settings`；导入走同一套 `migrate()`，旧备份可直接恢复，用户关闭的开关不会被默认值重置
- 出包版本号：`scripts/build_ipa.py` 从 `src/version.ts` 读取版本写入 IPA `Info.plist`；`package.json`、`ios/App/App.xcodeproj/project.pbxproj`、`android/app/build.gradle` 已同步为 2.3.0 / build 30（主 App 与 Widget 两个 target 共 4 组配置）
- 后端优先级：同一条 CouchDB 与 WebDAV 内容不一致时，以 CouchDB 为准覆盖 WebDAV
- 月度备份：每月首次打开自动备份到指定 WebDAV 备份文件夹，文件名如 `2026-06-01.json`，只保留业务字段精简体积，可手动触发
- 同步冲突：本地与权威远端同版本号但都改动时，弹出冲突面板逐条选择保留本机/远程；删除用 tombstone 同步防拉回
- OpenAI 兼容 function calling，AI 直接增删事件和分类

## 目录结构

```
src/                  前端源码（全部 UI 与逻辑）
  version.ts          APP_VERSION / APP_BUILD 单一来源
  migrate.ts          schema 7 数据迁移（含 displayMode）、旧配置兼容（含外观设置）；v29 起不再删除用户已有事件
  persist.ts          localStorage + Capacitor Preferences 双写持久化
ios/App/              Xcode 工程（App.xcworkspace，已由 cap add ios 生成）
android/              Android Studio 工程（已由 cap add android 生成）
dist/                 Web 构建产物（可直接部署为静态站）
.github/workflows/    build-ipa.yml（macOS 自动出 IPA）、deploy-pages.yml
package.json          依赖与脚本
capacitor.config.ts   Capacitor 配置（appId: com.daysnote.app）
README.md             完整说明
previews/             5 张效果截图（还原用户提供的设计稿）
```

## 本地预览（任意平台）

```bash
npm install
npm run dev        # http://localhost:5173
```

## 出 iOS IPA（必须 macOS）

Linux / Windows 无法生成 IPA，必须有 macOS + Xcode + 签名材料。

```bash
npm install
# 一键编译「带系统小组件」的未签名 IPA（推荐）：
bash scripts/build_widget_ipa.sh        # 产出 DaysNote-v31-with-widget-unsigned.ipa
```

脚本内部：构建 Web → 直接复制 dist 到原生工程（**不运行 `npx cap sync ios`**）→ pod install → xcodebuild 连 Widget 一起编译 → 校验 PlugIns → 打包 IPA。

> ⚠️ **不要运行 `npx cap sync ios`**：本项目已手工注入 Widget target、`capacitor.config.json` 的 `packageClassList`、两处 entitlements 与 pbxproj 配置，`cap sync` 会用模板重新生成这些文件并覆盖掉 Widget 配置。若确需 sync，完成后必须重新执行注入脚本并核对上述文件。

带签名出包：在 Xcode 打开 `ios/App/App.xcworkspace` → 选 `App` scheme（其依赖会自动 embed `DaysNoteWidgetExtension`）→ `App` target 与 `DaysNoteWidgetExtension` target 分别选 Team → `Product → Archive` → `Distribute App → Development / Ad-hoc` → 导出 IPA。Ad-hoc 需设备 UDID 在 Provisioning Profile 中；免费 Apple ID 签名 7 天过期。两个 target 都必须开启 App Group capability（`group.com.daysnote.app`）。

自动出包：把 `ios/ExportOptions.plist` 的 teamID 和 profile 名改成实际值，把证书设为 GitHub Secrets（`BUILD_CERTIFICATE_BASE64`、`P12_PASSWORD`、`BUILD_PROVISION_PROFILE_BASE64`、`KEYCHAIN_PASSWORD`），在 Actions 运行 `Build IPA`，从 Artifacts 下载 IPA。

## 出 Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

## 注意事项

- `capacitor.config.ts` 中 `appId` 为 `com.daysnote.app`，若使用自己的 Provisioning Profile，需改成对应 Bundle ID。
- CouchDB 必须开启 CORS；明文 http 地址在 iOS 上需把 `allowMixedContent` 改为 `true`，建议直接用 HTTPS。
- AI 功能需要 OpenAI 兼容 API；直连官方地址可能受浏览器 CORS 限制，建议走自建代理。
- 全站字体为系统默认无衬线（iOS -apple-system / SF Pro，安卓 Roboto），不依赖任何外部字体。
- 系统小组件原生实现已全部内置（见「创建真正的 iOS Widget Extension」一节列出的文件）。Linux 无法编译 Swift，直接交付的 `DaysNote-v31-unsigned.ipa` 是 Web 资源替换壳，**不含 Widget 二进制，系统桌面看不到组件**；必须按上面脚本在 macOS 编译才能产出带小组件的包。GitHub Actions `Build Unsigned IPA (with Widget Extension)` 已改为不跑 `cap sync` 并校验 PlugIns 目录。
- 同步核心算法在 `src/sync.ts` 的 `syncAll()`（三方合并：本地 / CouchDB / WebDAV），`store.tsx` 用 `stateRef` 保证防抖同步读取最新 state。相关测试：`scripts/test-v6.mjs`（核心逻辑）、`scripts/test-ui-sync.mjs`（UI 增删改触发）、`scripts/test-backup-roundtrip.mjs`（完整备份往返）。
- 覆盖升级验证：`scripts/test-upgrade.mjs` 会注入缺字段、重复 id、非法 repeat、旧 `syncBackend` 结构，断言迁移后事件/分类/凭证/开关不丢失，UI 不被内置事件覆盖；出包前必须跑通。
- 未签名出包：`scripts/build_ipa.py` 从已有有效 IPA 复用 arm64 二进制壳，替换 `dist/` web 资源，修复日历图标，删除 `CFBundleIconName`，写入版本号，输出 `DaysNote-v31-unsigned.ipa`（含新版组件预览页，但无 Widget 二进制）。带系统小组件的包请用 `scripts/build_widget_ipa.sh` 在 macOS 编译。接手方按需重签。

- 底部标签触控：`src/styles.css` 的 `--tabbar-pad-b` 必须为 `max(4px, var(--safe-b))`（完整安全区），不要改回 `safe-b*0.5`——那会让按钮命中区下探进 iOS Home Indicator 手势带，导致点击延迟/丢失。`scripts/test-touch.mjs` 是回归测试（需先 `npm run dev`，再 `node scripts/test-touch.mjs`）。

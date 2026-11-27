/**
 * 小组件模板库（v22 按用户提供的 5 张设计图重做）。
 *
 * 设计逻辑说明（重要）：一张设计图里往往包含「多个独立组件」，不是一整张图算一个模板：
 *  - 图1 / 图2：同一类「组合面板」，左半是主角大倒数 + 星期条，右半是 N 行事件清单。
 *    图2 是同模板的另一套数据，多了「假期区间」「休」角标 —— v23 起独立为 holiday 类型，
 *    左侧固定显示「距离下一个法定节假日还剩几天 + 休 + 放假区间」，数据联网获取、每月更新。
 *  - 图3：两个独立的「简约列表·小」，一个是纯数字、一个是数字+天分格 —— 两个模板。
 *  - 图4：一个「四宫格面板·中」，2×2 卡片，emoji + 装饰标题 + 日期 + 大数字。
 *  - 图5：两个独立的「大号列表」，上为青绿图文、下为白底蓝头色块 —— 两个模板。
 *
 * 因此这里用 kind 描述「布局逻辑」，用 skin 描述配色皮肤，一个 (kind, skin) 即一个可选模板。
 * v23 起所有多事件组件的事件来源支持二选一：勾选事件 / 选分类显示其下全部事件，
 * 并按临近日期排序、过期自动显示下一个（见 widgetBindings.ts）。
 * 新增模板只需在 WIDGET_TEMPLATES 追加一项，UI 按 category 归类、按 kind 渲染真实布局。
 */

export type WidgetSize = 'small' | 'medium' | 'large'
/** holiday = 左侧法定节假日倒计时 + 右侧分类事件 */
export type WidgetKind = 'holiday' | 'combo' | 'simple' | 'grid' | 'picture' | 'listLarge'
/** v25：组件分类按尺寸分组「小/中/大」，不再按风格标签划分 */
export type WidgetCategory = '小' | '中' | '大'

/** 配色皮肤：字段语义统一，供前端预览与 Swift Widget 共用同一套色值 */
export type WidgetSkin = {
  bg: string          // 卡片背景
  bgAccent?: string   // 渐变/装饰第二色
  ink: string         // 主文字
  inkSoft: string     // 次文字（日期/注释）
  brand: string       // 品牌色（大数字/标题）
  rowBg: string       // 列表行背景
  hot: string         // "近" 数字块（蓝）
  far: string         // "远" 数字块（橙）
  chipOn: string      // 星期/角标高亮底
  chipOnInk: string   // 高亮文字
}

export type WidgetTemplate = {
  id: string
  name: string
  category: WidgetCategory
  kind: WidgetKind
  size: WidgetSize
  skin: WidgetSkin
  /** 该模板需要绑定的事件数量（组合面板/列表需要多个） */
  slots: number
  /** 简短说明，强调设计逻辑 */
  desc: string
  /** 图2 那套「休 / 假期区间」数据特性 */
  holiday?: boolean
}

export const WIDGET_CATEGORIES: WidgetCategory[] = ['小', '中', '大']

/** 尺寸 -> 分类名，便于模板按 size 归类 */
export const SIZE_CATEGORY: Record<WidgetSize, WidgetCategory> = { small: '小', medium: '中', large: '大' }

export const WIDGET_SIZES: Record<WidgetSize, { grid: string; pt: string; label: string }> = {
  small: { grid: '2×2', pt: '158×158', label: '小' },
  medium: { grid: '4×2', pt: '338×158', label: '中' },
  large: { grid: '4×4', pt: '338×338', label: '大' },
}

const SKIN_FRESH: WidgetSkin = {
  bg: '#eef0e6', bgAccent: '#e3e8d8', ink: '#4a6141', inkSoft: '#93a488',
  brand: '#5c8a4a', rowBg: '#ffffff', hot: '#5b9bd5', far: '#e79a45',
  chipOn: '#6f9a5d', chipOnInk: '#ffffff',
}
const SKIN_CLASSIC: WidgetSkin = {
  bg: '#fbfaf7', bgAccent: '#f2f0ea', ink: '#3a3835', inkSoft: '#a6a29a',
  brand: '#4a4844', rowBg: '#ffffff', hot: '#5b9bd5', far: '#e79a45',
  chipOn: '#4a4844', chipOnInk: '#ffffff',
}
const SKIN_MINIMAL: WidgetSkin = {
  bg: '#f2f2f0', bgAccent: '#ffffff', ink: '#4a4844', inkSoft: '#a6a29a',
  brand: '#4a4844', rowBg: '#ffffff', hot: '#4a90d9', far: '#f0a04b',
  chipOn: '#4a4844', chipOnInk: '#ffffff',
}
const SKIN_ROSE: WidgetSkin = {
  bg: '#fbedef', bgAccent: '#f7dfe3', ink: '#a05a68', inkSoft: '#c2949e',
  brand: '#b46876', rowBg: '#f8d7de', hot: '#d98a99', far: '#c9818e',
  chipOn: '#b46876', chipOnInk: '#ffffff',
}
const SKIN_TEAL: WidgetSkin = {
  bg: '#5c9e96', bgAccent: '#6aaba2', ink: '#ffffff', inkSoft: '#cfe6e1',
  brand: '#ffffff', rowBg: 'rgba(255,255,255,.20)', hot: '#4a90d9', far: '#f0a04b',
  chipOn: '#ffffff', chipOnInk: '#5c9e96',
}
const SKIN_BLUEHEAD: WidgetSkin = {
  bg: '#ffffff', bgAccent: '#3b82d6', ink: '#4a4844', inkSoft: '#a6a29a',
  brand: '#4a4844', rowBg: '#f5f6f8', hot: '#4a90d9', far: '#f0a04b',
  chipOn: '#3b82d6', chipOnInk: '#ffffff',
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  // ===== 中 4×2 =====
  // 左侧法定节假日倒计时（联网获取国务院放假安排，每月更新）+ 右侧指定分类事件
  { id: 'holiday-official', name: '假日 · 法定节假日', category: '中', kind: 'holiday', size: 'medium', skin: SKIN_CLASSIC, slots: 4, holiday: true,
    desc: '左侧显示距离下一个法定节假日还剩几天 + 「休」+ 放假区间（每月联网更新国务院安排）；右侧显示指定分类的事件，按临近日期排序' },
  { id: 'holiday-fresh', name: '假日 · 清新绿', category: '中', kind: 'holiday', size: 'medium', skin: SKIN_FRESH, slots: 4, holiday: true,
    desc: '同上假日组件的清新绿皮肤，左侧法定节假日 + 右侧分类事件' },
  // 图4：四宫格面板
  { id: 'grid-rose', name: '四宫格面板 · 柔粉', category: '中', kind: 'grid', size: 'medium', skin: SKIN_ROSE, slots: 4,
    desc: '图4同款：2×2 卡片，emoji + 标题 + 日期 + 大数字' },
  // ===== 小 2×2（紧凑三行）=====
  // 图3右：简约列表 · 数字带天（v26 移除纯数字款，只保留带天）
  { id: 'simple-day', name: '简约列表 · 带“天”', category: '小', kind: 'simple', size: 'small', skin: SKIN_MINIMAL, slots: 3,
    desc: '图3右同款：2×2 紧凑三行，数字与「天」分格显示' },
  // ===== 大 4×4 =====
  // 图5上：图文倒计时列表 · 大号
  { id: 'picture-teal', name: '图文列表 · 青绿', category: '大', kind: 'picture', size: 'large', skin: SKIN_TEAL, slots: 5,
    desc: '图5上同款：青绿背景 + 顶部日期 + 5 行半透明卡片' },
  // 图5下：简约倒计时列表 · 大号
  { id: 'list-bluehead', name: '简约列表 · 大号', category: '大', kind: 'listLarge', size: 'large', skin: SKIN_BLUEHEAD, slots: 5,
    desc: '图5下同款：白底蓝头 + 5 行色块数字' },
]

/** 星期条（组合面板用） */
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 模板预览的兜底示例事件 */
export const DEMO_EVENTS = [
  { title: '元旦', date: '2026-01-01', icon: '🎍', days: 37 },
  { title: '生日', date: '2026-05-20', icon: '🎂', days: 296 },
  { title: '考试', date: '2026-06-07', icon: '📚', days: 119 },
  { title: '圣诞节', date: '2026-12-25', icon: '🎄', days: 344 },
  { title: '在一起', date: '2024-03-14', icon: '❤️', days: 2015 },
]

export function templateById(id: string): WidgetTemplate | undefined {
  return WIDGET_TEMPLATES.find((t) => t.id === id)
}

export const WIDGET_SHARED_KEY = 'daysnote.widgets.v2'
export const WIDGET_APP_GROUP = 'group.com.daysnote.app'

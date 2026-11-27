import Foundation
import WidgetKit

// MARK: - 主 App 与 Widget 共享的数据模型
// 主 App（Capacitor 插件）把组件配置与事件写入 App Group UserDefaults，
// Widget 从同一个 suite 读取。两侧编译同一份文件，保证结构一致。

struct WidgetEvent: Codable, Hashable {
    var title: String
    var icon: String
    var date: String      // YYYY-MM-DD（目标公历日期）
    var days: Int         // 距今天数（主 App 计算好，Widget 直接显示）
}

/// 法定节假日倒计时（web 侧 holiday.ts 计算好传入，Widget 直接显示）
struct HolidayInfo: Codable, Hashable {
    var name: String
    var icon: String
    var daysLeft: Int
    var inProgress: Bool
    var rangeText: String      // "2/15 - 2/23"
    var holidayDays: Int
    var source: String         // official | estimated
}

struct WidgetBindingInfo: Codable, Hashable {
    var mode: String              // events | category
    var categoryIds: [String]     // v25：多选分类
    var eventCount: Int

    enum CodingKeys: String, CodingKey {
        case mode, categoryIds, categoryId, eventCount
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mode = try c.decodeIfPresent(String.self, forKey: .mode) ?? "category"
        if let ids = try c.decodeIfPresent([String].self, forKey: .categoryIds) {
            categoryIds = ids
        } else if let one = try c.decodeIfPresent(String.self, forKey: .categoryId), !one.isEmpty {
            categoryIds = [one]   // 兼容旧单分类
        } else {
            categoryIds = []
        }
        eventCount = try c.decodeIfPresent(Int.self, forKey: .eventCount) ?? 0
    }
}

struct WidgetConfig: Codable, Hashable {
    var id: String
    var kind: String      // holiday | combo | simple | grid | picture | listLarge
    var size: String      // small | medium | large
    var slots: Int
    // 皮肤色（十六进制，带 #），Widget 侧转 UIColor
    var bg: String
    var bgAccent: String
    var ink: String
    var inkSoft: String
    var brand: String
    var rowBg: String
    var hot: String
    var far: String
    var chipOn: String
    var chipOnInk: String
    var holiday: Bool
    var events: [WidgetEvent]
    // v23 新增：假日数据与事件来源说明（可选，兼容旧缓存）
    var holidayInfo: HolidayInfo?
    var binding: WidgetBindingInfo?

    // 自定义解码：新增字段缺失时用默认值，保证旧版本 payload 也能解析
    enum CodingKeys: String, CodingKey {
        case id, kind, size, slots, bg, bgAccent, ink, inkSoft, brand, rowBg, hot, far, chipOn, chipOnInk, holiday, events, holidayInfo, binding
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        size = try c.decode(String.self, forKey: .size)
        slots = try c.decodeIfPresent(Int.self, forKey: .slots) ?? 5
        bg = try c.decode(String.self, forKey: .bg)
        bgAccent = try c.decodeIfPresent(String.self, forKey: .bgAccent) ?? bg
        ink = try c.decode(String.self, forKey: .ink)
        inkSoft = try c.decodeIfPresent(String.self, forKey: .inkSoft) ?? ink
        brand = try c.decode(String.self, forKey: .brand)
        rowBg = try c.decodeIfPresent(String.self, forKey: .rowBg) ?? "#FFFFFF"
        hot = try c.decodeIfPresent(String.self, forKey: .hot) ?? "#4A90D9"
        far = try c.decodeIfPresent(String.self, forKey: .far) ?? "#F0A04B"
        chipOn = try c.decodeIfPresent(String.self, forKey: .chipOn) ?? brand
        chipOnInk = try c.decodeIfPresent(String.self, forKey: .chipOnInk) ?? "#FFFFFF"
        holiday = try c.decodeIfPresent(Bool.self, forKey: .holiday) ?? false
        events = try c.decodeIfPresent([WidgetEvent].self, forKey: .events) ?? []
        holidayInfo = try c.decodeIfPresent(HolidayInfo.self, forKey: .holidayInfo)
        binding = try c.decodeIfPresent(WidgetBindingInfo.self, forKey: .binding)
    }
    // 合成构造器（供 demoConfig 使用；新字段带默认 nil）
    init(id: String, kind: String, size: String, slots: Int, bg: String, bgAccent: String, ink: String,
         inkSoft: String, brand: String, rowBg: String, hot: String, far: String, chipOn: String,
         chipOnInk: String, holiday: Bool, events: [WidgetEvent], holidayInfo: HolidayInfo? = nil,
         binding: WidgetBindingInfo? = nil) {
        self.id = id; self.kind = kind; self.size = size; self.slots = slots
        self.bg = bg; self.bgAccent = bgAccent; self.ink = ink; self.inkSoft = inkSoft
        self.brand = brand; self.rowBg = rowBg; self.hot = hot; self.far = far
        self.chipOn = chipOn; self.chipOnInk = chipOnInk; self.holiday = holiday
        self.events = events; self.holidayInfo = holidayInfo; self.binding = binding
    }
}

struct WidgetPayload: Codable {
    var version: Int
    var updatedAt: Double
    var configs: [WidgetConfig]
}

enum SharedStore {
    static let appGroup = "group.com.daysnote.app"
    static let key = "daysnote.widgets.v2"
    /// 当前选中的要展示的组件配置 id（用户在小组件设置里选），缺省用第一个
    static let selectedIdKey = "daysnote.widget.selected"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    static func load() -> WidgetPayload? {
        guard let d = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: d)
    }

    static func save(_ payload: WidgetPayload) {
        guard let d = try? JSONEncoder().encode(payload) else { return }
        defaults?.set(d, forKey: key)
    }

    /// 取出用于某尺寸展示的组件配置。v24 起严格按尺寸匹配：
    /// 每个 Widget 只声明一种 family，绝不能拿到其它尺寸的配置，否则会渲染错乱。
    /// 优先用户在该尺寸里选中的模板，否则取该尺寸的第一个；该尺寸无配置则返回 nil。
    static func config(for family: WidgetFamily) -> WidgetConfig? {
        guard let payload = load(), !payload.configs.isEmpty else { return nil }
        let wanted = family.sizeName
        let selectedId = defaults?.string(forKey: selectedIdKey)
        if let sel = selectedId, let c = payload.configs.first(where: { $0.id == sel && $0.size == wanted }) {
            return c
        }
        if let c = payload.configs.first(where: { $0.size == wanted }) { return c }
        return nil
    }
}

extension WidgetFamily {
    var sizeName: String {
        switch self {
        case .systemSmall: return "small"
        case .systemMedium: return "medium"
        case .systemLarge, .systemExtraLarge: return "large"
        @unknown default: return "medium"
        }
    }
}

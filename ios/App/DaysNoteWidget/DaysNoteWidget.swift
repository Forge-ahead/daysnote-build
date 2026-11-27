import WidgetKit
import SwiftUI

// MARK: - Widget 入口
// v24：每个组件只保留它该有的尺寸，拆成 3 个独立 Widget，各自只声明一种 family。
// 用户在系统桌面添加时会看到 3 个条目，每个只能选自己的固定尺寸，不会出现其它规格。
// 具体显示哪个模板由 App 内 selectWidget(id) 决定，SharedStore.config(for family:) 会在
// 同一尺寸的模板里取选中项（假日/四宫格=中，简约列表=小，图文/大号=大）。
@main
struct DaysNoteWidgetBundle: WidgetBundle {
    var body: some Widget {
        DaysNoteSmallWidget()
        DaysNoteMediumWidget()
        DaysNoteLargeWidget()
    }
}

/// 简约倒数列表：仅 2×2（systemSmall），3 行紧凑
struct DaysNoteSmallWidget: Widget {
    let kind = "DaysNoteSmallWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WidgetRootView(entry: entry)
        }
        .configurationDisplayName("纪念日 · 简约列表")
        .description("2×2 紧凑三行，显示最近的日子")
        .supportedFamilies([.systemSmall])
    }
}

/// 假日 / 四宫格倒数面板：仅 4×2（systemMedium）
struct DaysNoteMediumWidget: Widget {
    let kind = "DaysNoteMediumWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WidgetRootView(entry: entry)
        }
        .configurationDisplayName("纪念日 · 倒数面板")
        .description("4×2 面板，左侧大倒数 + 右侧清单")
        .supportedFamilies([.systemMedium])
    }
}

/// 图文列表 / 简约大号列表：仅 4×4（systemLarge）
struct DaysNoteLargeWidget: Widget {
    let kind = "DaysNoteLargeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WidgetRootView(entry: entry)
        }
        .configurationDisplayName("纪念日 · 大号列表")
        .description("4×4 大号列表，一目了然")
        .supportedFamilies([.systemLarge])
    }
}

// MARK: - Timeline
struct WidgetEntry: TimelineEntry {
    let date: Date
    let config: WidgetConfig?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), config: demoConfig(for: context.family))
    }
    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        completion(WidgetEntry(date: Date(), config: SharedStore.config(for: context.family) ?? demoConfig(for: context.family)))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let cfg = SharedStore.config(for: context.family) ?? demoConfig(for: context.family)
        let now = Date()
        // 每天 00:05 刷新一次；同时 15 分钟后补一次，确保跨天及时
        var cur = Calendar.current.dateInterval(of: .day, for: now)?.end ?? now.addingTimeInterval(3600)
        cur = cur.addingTimeInterval(300)
        let next = Calendar.current.date(byAdding: .day, value: 1, to: cur) ?? now.addingTimeInterval(86400)
        let timeline = Timeline(entries: [
            WidgetEntry(date: now, config: cfg),
            WidgetEntry(date: cur, config: cfg),
            WidgetEntry(date: next, config: cfg),
        ], policy: .after(next))
        completion(timeline)
    }

    private func demoConfig(for family: WidgetFamily) -> WidgetConfig {
        let demo = [
            WidgetEvent(title: "元旦", icon: "🎍", date: "2026-01-01", days: 37),
            WidgetEvent(title: "春节", icon: "🧧", date: "2026-02-17", days: 84),
            WidgetEvent(title: "生日", icon: "🎂", date: "2026-05-20", days: 176),
            WidgetEvent(title: "圣诞节", icon: "🎄", date: "2026-12-25", days: 395),
            WidgetEvent(title: "在一起", icon: "❤️", date: "2024-03-14", days: 981),
        ]
        return WidgetConfig(
            id: "simple-day", kind: family == .systemSmall ? "simple" : "combo",
            size: family.sizeName, slots: 5,
            bg: "#EEF0E6", bgAccent: "#E3E8D8", ink: "#4A6141", inkSoft: "#93A488",
            brand: "#5C8A4A", rowBg: "#FFFFFF", hot: "#5B9BD5", far: "#E79A45",
            chipOn: "#6F9A5D", chipOnInk: "#FFFFFF", holiday: false, events: demo
        )
    }
}

// MARK: - 根视图：按 kind 分派
struct WidgetRootView: View {
    let entry: WidgetEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        Group {
            if let cfg = entry.config {
                switch cfg.kind {
                case "holiday": HolidayView(cfg: cfg)
                case "combo": ComboView(cfg: cfg)
                case "simple": SimpleView(cfg: cfg)
                case "grid": GridView(cfg: cfg)
                case "picture": PictureView(cfg: cfg)
                case "listLarge": ListLargeView(cfg: cfg)
                default: ComboView(cfg: cfg)
                }
            } else {
                Text("打开 App 添加事件").font(.caption).foregroundColor(.secondary)
            }
        }
        .widgetURL(URL(string: "daysnote://open"))
    }
}

// MARK: - 颜色工具
private func col(_ hex: String, _ fallback: Color = .primary) -> Color {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = Int(h, radix: 16) else { return fallback }
    return Color(red: Double((v >> 16) & 0xFF)/255, green: Double((v >> 8) & 0xFF)/255, blue: Double(v & 0xFF)/255)
}

private let weekCN = ["日","一","二","三","四","五","六"]
private func weekIdx(for iso: String) -> Int {
    let p = iso.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return 0 }
    var cal = Calendar.current
    cal.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let d = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return 0 }
    return cal.component(.weekday, from: d) - 1
}
private func slash(_ iso: String) -> String {
    let p = iso.split(separator: "-")
    return p.count >= 3 ? "\(p[1])/\(p[2])" : iso
}
private func dateText(_ iso: String) -> String {
    let p = iso.split(separator: "-")
    return p.count >= 3 ? "\(p[0]).\(p[1]).\(p[2])" : iso
}

// MARK: - 「假日」组件：左侧法定节假日倒计时 + 休 + 放假区间，右侧分类事件
private struct HolidayView: View {
    let cfg: WidgetConfig
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading) {
                if let h = cfg.holidayInfo {
                    Text("距离\(h.name)").font(.system(size: 12, weight: .semibold)).foregroundColor(col(cfg.brand))
                    Spacer(minLength: 2)
                    if h.inProgress {
                        Text("进行中").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundColor(col(cfg.brand))
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text("\(h.daysLeft)").font(.system(size: 40, weight: .heavy, design: .rounded))
                            Text("天").font(.system(size: 12))
                        }
                        .foregroundColor(col(cfg.brand))
                    }
                    HStack(spacing: 3) {
                        Text("休").font(.system(size: 9, weight: .bold)).foregroundColor(col(cfg.chipOnInk)).padding(.horizontal, 3).background(col(cfg.chipOn)).cornerRadius(3)
                        Text(h.rangeText).font(.system(size: 9)).foregroundColor(col(cfg.inkSoft)).lineLimit(1)
                    }
                } else {
                    Text("距离下一个假期").font(.system(size: 12, weight: .semibold)).foregroundColor(col(cfg.brand))
                    Spacer(minLength: 2)
                    Text("—").font(.system(size: 36, weight: .heavy, design: .rounded)).foregroundColor(col(cfg.brand))
                    Text("打开 App 更新节假日").font(.system(size: 8)).foregroundColor(col(cfg.inkSoft))
                }
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        let today = Calendar.current.component(.weekday, from: Date()) - 1
                        Text(weekCN[i]).font(.system(size: 9))
                            .frame(width: 15, height: 15)
                            .background(i == today ? col(cfg.chipOn) : Color.clear)
                            .foregroundColor(i == today ? col(cfg.chipOnInk) : col(cfg.inkSoft))
                            .clipShape(Circle())
                    }
                }
            }
            .padding(.leading, 14).padding(.vertical, 12)
            .background(LinearGradient(gradient: Gradient(colors: [col(cfg.bgAccent), col(cfg.bg)]), startPoint: .topLeading, endPoint: .bottomTrailing))
            VStack(spacing: 0) {
                ForEach(cfg.events.prefix(4).indices, id: \.self) { i in
                    let e = cfg.events[i]
                    HStack {
                        HStack(spacing: 2) {
                            Text(e.title).font(.system(size: 11, weight: .medium)).foregroundColor(col(cfg.ink)).lineLimit(1)
                            Text(slash(e.date)).font(.system(size: 10)).foregroundColor(col(cfg.inkSoft))
                        }
                        Spacer(minLength: 2)
                        Text("\(e.days)天").font(.system(size: 11, weight: .bold)).foregroundColor(col(cfg.brand))
                    }
                    .padding(.vertical, 6)
                    if i < 3 { Divider().background(Color.black.opacity(0.06)) }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(col(cfg.rowBg))
        }
        .background(col(cfg.bg))
    }
}

// MARK: - 图1/图2 组合倒数面板
private struct ComboView: View {
    let cfg: WidgetConfig
    var body: some View {
        HStack(spacing: 0) {
            // 左：主角大倒数 + 星期条
            VStack(alignment: .leading) {
                Text("距离\(cfg.events.first?.title ?? "")")
                    .font(.system(size: 12, weight: .semibold)).foregroundColor(col(cfg.brand))
                Spacer(minLength: 2)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(cfg.events.first?.days ?? 0)").font(.system(size: 40, weight: .heavy, design: .rounded))
                    Text("天").font(.system(size: 12))
                }
                .foregroundColor(col(cfg.brand))
                if cfg.holiday {
                    HStack(spacing: 3) {
                        Text("休").font(.system(size: 9, weight: .bold)).foregroundColor(col(cfg.chipOnInk)).padding(.horizontal, 3).background(col(cfg.chipOn)).cornerRadius(3)
                        Text("02/15 - 02/23").font(.system(size: 9)).foregroundColor(col(cfg.inkSoft))
                    }
                }
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        Text(weekCN[i]).font(.system(size: 9))
                            .frame(width: 15, height: 15)
                            .background(i == weekIdx(for: cfg.events.first?.date ?? "") ? col(cfg.chipOn) : Color.clear)
                            .foregroundColor(i == weekIdx(for: cfg.events.first?.date ?? "") ? col(cfg.chipOnInk) : col(cfg.inkSoft))
                            .clipShape(Circle())
                    }
                }
            }
            .padding(.leading, 14).padding(.vertical, 12)
            .background(LinearGradient(gradient: Gradient(colors: [col(cfg.bgAccent), col(cfg.bg)]), startPoint: .topLeading, endPoint: .bottomTrailing))
            // 右：事件清单
            VStack(spacing: 0) {
                ForEach(cfg.events.dropFirst().prefix(4).indices, id: \.self) { i in
                    let e = cfg.events.dropFirst().prefix(4)[i]
                    HStack {
                        HStack(spacing: 2) {
                            Text(e.title).font(.system(size: 11, weight: .medium)).foregroundColor(col(cfg.ink)).lineLimit(1)
                            Text(slash(e.date)).font(.system(size: 10)).foregroundColor(col(cfg.inkSoft))
                            if cfg.holiday && i == 1 {
                                Text("休").font(.system(size: 8, weight: .bold)).foregroundColor(col(cfg.chipOnInk)).padding(.horizontal, 2).background(col(cfg.chipOn)).cornerRadius(2)
                            }
                        }
                        Spacer(minLength: 2)
                        Text("\(e.days)天").font(.system(size: 11, weight: .bold)).foregroundColor(col(cfg.brand))
                    }
                    .padding(.vertical, 6)
                    if i < 3 { Divider().background(Color.black.opacity(0.06)) }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(col(cfg.rowBg))
        }
        .background(col(cfg.bg))
    }
}

// MARK: - 图3 简约列表（小）
private struct SimpleView: View {
    let cfg: WidgetConfig
    var body: some View {
        VStack(spacing: 5) {
            ForEach(cfg.events.prefix(3).indices, id: \.self) { i in
                let e = cfg.events[i]
                HStack {
                    HStack(spacing: 3) {
                        Text(e.title).font(.system(size: 12, weight: .semibold)).foregroundColor(col(cfg.ink)).lineLimit(1)
                        Text(e.icon).font(.system(size: 12))
                    }
                    Spacer()
                    HStack(spacing: 1) {
                        Text("\(e.days)").font(.system(size: 18, weight: .bold, design: .rounded)).foregroundColor(.white)
                        if cfg.id == "simple-day" { Text("天").font(.system(size: 10)).foregroundColor(.white) }
                    }
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(i < 2 ? col(cfg.hot) : col(cfg.far)).cornerRadius(7)
                }
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(col(cfg.rowBg)).cornerRadius(8)
            }
        }
        .padding(8).background(col(cfg.bg))
    }
}

// MARK: - 图4 四宫格面板
private struct GridView: View {
    let cfg: WidgetConfig
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 5) {
            ForEach(cfg.events.prefix(4).indices, id: \.self) { i in
                let e = cfg.events[i]
                VStack(alignment: .leading) {
                    HStack(spacing: 2) {
                        Text(e.icon).font(.system(size: 14))
                        Text(e.title).font(.system(size: 10, weight: .bold)).foregroundColor(col(cfg.ink)).lineLimit(1)
                    }
                    Text("\(dateText(e.date)) 周\(weekCN[weekIdx(for: e.date)])").font(.system(size: 8)).foregroundColor(col(cfg.inkSoft))
                    Spacer()
                    HStack { Spacer(); Text("\(e.days)").font(.system(size: 24, weight: .heavy, design: .rounded)).foregroundColor(col(cfg.brand)) }
                }
                .padding(8).background(col(cfg.rowBg)).cornerRadius(9)
            }
        }
        .padding(6).background(col(cfg.bg))
    }
}

// MARK: - 图5上 图文列表（大）
private struct PictureView: View {
    let cfg: WidgetConfig
    var body: some View {
        VStack(spacing: 6) {
            let now = Date()
            Text("\(Calendar.current.component(.month, from: now))月\(Calendar.current.component(.day, from: now))日 星期\(weekCN[Calendar.current.component(.weekday, from: now)-1])")
                .font(.system(size: 11)).foregroundColor(col(cfg.inkSoft))
            ForEach(cfg.events.prefix(5).indices, id: \.self) { i in
                let e = cfg.events[i]
                HStack {
                    Text(e.title).font(.system(size: 12)).foregroundColor(col(cfg.ink))
                    Spacer()
                    Text("\(e.days)天").font(.system(size: 12, weight: .bold)).foregroundColor(col(cfg.ink))
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(col(cfg.rowBg)).cornerRadius(7)
            }
        }
        .padding(14)
        .background(LinearGradient(gradient: Gradient(colors: [col(cfg.bg), col(cfg.bgAccent)]), startPoint: .topLeading, endPoint: .bottomTrailing))
    }
}

// MARK: - 图5下 简约列表（大）
private struct ListLargeView: View {
    let cfg: WidgetConfig
    var body: some View {
        VStack(spacing: 0) {
            let now = Date()
            Text("\(Calendar.current.component(.month, from: now))月\(Calendar.current.component(.day, from: now))日 星期\(weekCN[Calendar.current.component(.weekday, from: now)-1])")
                .font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 8)
                .background(col(cfg.bgAccent))
            VStack(spacing: 5) {
                ForEach(cfg.events.prefix(5).indices, id: \.self) { i in
                    let e = cfg.events[i]
                    HStack {
                        HStack(spacing: 3) {
                            Text(e.title).font(.system(size: 12, weight: .semibold)).foregroundColor(col(cfg.ink)).lineLimit(1)
                            Text(e.icon).font(.system(size: 12))
                        }
                        Spacer()
                        HStack(spacing: 2) {
                            Text("\(e.days)").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("天").font(.system(size: 10)).foregroundColor(.white)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(i < 3 ? col(cfg.hot) : col(cfg.far)).cornerRadius(6)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(col(cfg.rowBg)).cornerRadius(7)
                }
            }
            .padding(8)
        }
        .background(col(cfg.bg))
    }
}

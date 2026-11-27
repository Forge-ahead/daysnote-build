import Foundation
import WidgetKit

/// 通知 WidgetKit 重新拉取时间线（主 App 数据变更后调用）
enum WidgetKitReload {
    static func reloadAll() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

import Foundation
import Capacitor

/// Capacitor 插件：Web 侧调用 DaysNoteWidget.sync(json) 时，
/// 把组件配置写入 App Group，并通知 WidgetKit 刷新时间线。
@objc(DaysNoteWidgetPlugin)
public class DaysNoteWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DaysNoteWidgetPlugin"
    public let jsName = "DaysNoteWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
    ]

    @objc public func sync(_ call: CAPPluginCall) {
        let json = call.getString("value") ?? call.getString("json") ?? ""
        guard !json.isEmpty, let data = json.data(using: .utf8) else {
            call.reject("empty payload")
            return
        }
        guard let ud = UserDefaults(suiteName: SharedStore.appGroup) else {
            call.reject("app group unavailable")
            return
        }
        ud.set(data, forKey: SharedStore.key)
        WidgetKitReload.reloadAll()
        call.resolve(["ok": true])
    }

    @objc public func select(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        guard let ud = UserDefaults(suiteName: SharedStore.appGroup) else {
            call.reject("app group unavailable")
            return
        }
        ud.set(id, forKey: SharedStore.selectedIdKey)
        WidgetKitReload.reloadAll()
        call.resolve(["ok": true])
    }
}

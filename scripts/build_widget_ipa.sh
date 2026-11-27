#!/usr/bin/env bash
# 在 macOS + Xcode 上一键编译「带系统小组件」的未签名 IPA。
# 这是让真机系统小组件出现的唯一途径（Linux 无法编译 Swift / WidgetKit）。
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="${1:-$ROOT/DaysNote-v26-with-widget-unsigned.ipa}"

echo "==> 1/5 构建 Web 资源"
npm run build

echo "==> 2/5 复制 Web 资源到原生工程（不运行 cap sync，避免覆盖 Widget 配置）"
rm -rf ios/App/App/public
cp -R dist ios/App/App/public

echo "==> 3/5 安装 CocoaPods"
(cd ios/App && pod install)

echo "==> 4/5 编译 App + Widget Extension（未签名，arm64 真机）"
DERIVED="$ROOT/.build-derived"
rm -rf "$DERIVED"
(cd ios/App && xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  build)

APP="$DERIVED/Build/Products/Release-iphoneos/App.app"
echo "==> 校验 Widget 已嵌入"
if [ ! -d "$APP/PlugIns/DaysNoteWidget.appex" ]; then
  echo "ERROR: Widget 未嵌入，检查 pbxproj 的 Embed App Extensions 阶段"; exit 1
fi
ls -la "$APP/PlugIns/DaysNoteWidget.appex"

echo "==> 5/5 打包 IPA"
TMP="$(mktemp -d)"
mkdir -p "$TMP/Payload"
cp -R "$APP" "$TMP/Payload/"
(cd "$TMP" && zip -qr "$OUT" Payload)
rm -rf "$TMP"

echo "OK: $OUT"
echo "把这个 IPA 用你的证书重签后安装，桌面上长按即可添加「纪念日」小组件。"

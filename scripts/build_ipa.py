#!/usr/bin/env python3
"""
通用 IPA 出包脚本（二进制壳替换 web 资源方式）
------------------------------------------------
用法: python3 scripts/build_ipa.py <基础IPA> <输出IPA>

做四件事：
1. 解包基础 IPA（复用已签名的 arm64 二进制壳）
2. 用 dist/ 替换 public/ 下的 web 资源
3. 把版本号写进 Info.plist（CFBundleShortVersionString / CFBundleVersion）
4. 重新打包并校验资源引用一致性

注意：替换 bundle 内资源会使原签名失效，输出的是未签名 IPA，需用户重签。
"""
import sys, os, shutil, zipfile, plistlib, re
from PIL import Image
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
WEB = os.path.join(ROOT, 'dist')
ICON = os.path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
# 下载页与源码包只服务 Git Pages / 下载页，不需要装进 App bundle，避免 IPA 变大
IPA_EXCLUDE = {'daysnote-source.bin', 'download.html'}

# 版本号单一来源：从 src/version.ts 读取
def read_version():
    txt = open(os.path.join(ROOT, 'src/version.ts'), encoding='utf-8').read()
    v = re.search(r"APP_VERSION\s*=\s*'([^']+)'", txt).group(1)
    b = re.search(r"APP_BUILD\s*=\s*(\d+)", txt).group(1)
    return v, b

def build(src, out):
    APP_VERSION, APP_BUILD = read_version()
    WORK = '/tmp/ipa-build-work'
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    with zipfile.ZipFile(src) as z:
        z.extractall(WORK)
    app = os.path.join(WORK, 'Payload/App.app')

    # 1) web 资源
    pub = os.path.join(app, 'public')
    shutil.rmtree(pub, ignore_errors=True)
    shutil.copytree(WEB, pub, ignore=lambda _dir, names: [n for n in names if n in IPA_EXCLUDE])
    assets = sorted(os.listdir(os.path.join(pub, 'assets')))
    print('web assets:', assets)

    # 2) 图标：刷掉不透明黑角 + 替换
    im = Image.open(ICON).convert('RGBA')
    bg = Image.new('RGBA', im.size, (246, 238, 226, 255))
    bg.alpha_composite(im)
    arr = np.array(bg)
    H, W = arr.shape[:2]
    ys, xs = np.ogrid[:H, :W]
    edge = (xs < 90) | (xs >= W - 90) | (ys < 90) | (ys >= H - 90)
    black = arr[:,:,0].astype(int) + arr[:,:,1].astype(int) + arr[:,:,2].astype(int) < 60
    arr[edge & black] = (246, 238, 226, 255)
    opaque = Image.fromarray(arr, 'RGBA').convert('RGB')
    for name in ['AppIcon60x60@2x.png', 'AppIcon76x76@2x~ipad.png']:
        opaque.save(os.path.join(app, name), 'PNG')

    # 3) plist：版本号 + 删除 CFBundleIconName（强制用独立 PNG 图标）
    plist = os.path.join(app, 'Info.plist')
    with open(plist, 'rb') as f:
        info = plistlib.load(f)
    info['CFBundleShortVersionString'] = APP_VERSION
    info['CFBundleVersion'] = APP_BUILD
    for key in ['CFBundleIcons', 'CFBundleIcons~ipad']:
        d = info.get(key)
        if isinstance(d, dict) and isinstance(d.get('CFBundlePrimaryIcon'), dict):
            d['CFBundlePrimaryIcon'].pop('CFBundleIconName', None)
    with open(plist, 'wb') as f:
        plistlib.dump(info, f)
    print(f'version: {APP_VERSION} ({APP_BUILD})')

    # 4) 打包
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(os.path.join(WORK, 'Payload')):
            for fn in files:
                fp = os.path.join(root, fn)
                z.write(fp, os.path.relpath(fp, WORK))

    # 5) 校验
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None, 'zip damaged'
        names = set(z.namelist())
        idx = z.read('Payload/App.app/public/index.html').decode()
        refs = re.findall(r'assets/[^"\']+', idx)
        for r in refs:
            assert ('Payload/App.app/public/' + r) in names, f'missing asset {r}'
        pl = plistlib.loads(z.read('Payload/App.app/Info.plist'))
        assert pl['CFBundleShortVersionString'] == APP_VERSION
    print(f'OK: {out} ({os.path.getsize(out)} bytes), version {APP_VERSION}, assets {refs}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('usage: build_ipa.py <base-ipa> <out-ipa>')
        sys.exit(1)
    build(sys.argv[1], sys.argv[2])

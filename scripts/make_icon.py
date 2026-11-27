from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BG = '#F6EEE2'
RED = '#E8786D'
DARK_RED = '#C4645A'
INK = '#4A4744'
GREEN = '#7FA87A'
DOT = '#DCD6CC'


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except Exception:
        return ImageFont.load_default()


def draw_calendar(size: int, transparent=False):
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not transparent:
        d.rounded_rectangle((0, 0, S, S), radius=224, fill=BG)

    # 日历纸
    d.rounded_rectangle((170, 210, 854, 858), radius=72, fill='#FFFFFF')
    # 顶部色条
    d.rounded_rectangle((170, 210, 854, 372), radius=72, fill=RED)
    d.rectangle((170, 300, 854, 372), fill=RED)
    # 装订环
    for x in (346, 678):
        d.rounded_rectangle((x - 27, 158, x + 27, 286), radius=27, fill=DARK_RED)
    # 顶部标签
    d.text((512, 292), 'DAYS', font=font(62), fill='#FFFFFF', anchor='mm')
    # 大号日期数字
    d.text((512, 560), '13', font=font(276), fill=INK, anchor='mm')
    # 日历格子圆点
    for row in range(2):
        for col in range(5):
            x = 286 + col * 114
            y = 738 + row * 62
            fill = GREEN if (row == 1 and col == 1) else DOT
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=fill)
    # 底部绿色短线
    d.rounded_rectangle((424, 866, 600, 886), radius=10, fill=GREEN)

    if size != S:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def save_all():
    # iOS
    ios = ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
    draw_calendar(1024).convert('RGB').save(ios, optimize=True)

    # Android legacy / round / adaptive foreground
    densities = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for density, size in densities.items():
        folder = ROOT / f'android/app/src/main/res/mipmap-{density}'
        draw_calendar(size).convert('RGB').save(folder / 'ic_launcher.png', optimize=True)
        # 圆形图标：裁成圆形
        icon = draw_calendar(size)
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(icon, (0, 0), mask)
        out.convert('RGB').save(folder / 'ic_launcher_round.png', optimize=True)
        # adaptive 前景层：透明底，图形缩小到安全区
        fg = draw_calendar(int(size * 2.25), transparent=True).resize((int(size * 2.25), int(size * 2.25)))
        fg.save(folder / 'ic_launcher_foreground.png', optimize=True)

    # PWA / Web
    draw_calendar(192).save(ROOT / 'public/icon-192.png', optimize=True)
    draw_calendar(512).save(ROOT / 'public/icon-512.png', optimize=True)
    draw_calendar(180).save(ROOT / 'public/apple-touch-icon.png', optimize=True)
    draw_calendar(64).save(ROOT / 'public/favicon.png', optimize=True)
    print('icons generated')


if __name__ == '__main__':
    save_all()

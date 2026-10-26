# 封面：GPT 底圖（work/cover_*.png）＋程式排的標題字 → cover.jpg（分享預覽 1200×630）、cover_story.jpg（直式 1080×1920）、assets/cover_tall.jpg（開機畫面底圖）
# python3 tools/cover.py
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), '..')
PF = '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc'
BOLD, MED = 10, 6   # PingFang TC Semibold / Medium
RED = (217, 20, 28)

def font(size, idx=BOLD): return ImageFont.truetype(PF, size, index=idx)

def cover_crop(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))

def chrome(size):
    """鍍鉻漸層（上亮下暗、中間一道反光）"""
    w, h = size
    g = Image.new('RGB', (1, h))
    stops = [(0, (250, 251, 252)), (.38, (160, 164, 172)), (.5, (238, 240, 243)), (.72, (104, 108, 116)), (1, (205, 208, 213))]
    for y in range(h):
        t = y / max(1, h - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                k = (t - a) / (b - a); g.putpixel((0, y), tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))); break
    return g.resize((w, h))

def chrome_text(base, xy, text, f, glow=True):
    """把鍍鉻字貼到 base：深紅硬陰影＋紅光暈＋鍍鉻本體"""
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=f, fill=255)
    if glow:
        g = mask.filter(ImageFilter.GaussianBlur(f.size * .18))
        base.paste(Image.new('RGB', base.size, (255, 30, 40)), (0, 0), g.point(lambda v: int(v * .55)))
    sh = ImageChops.offset(mask, 0, max(3, f.size // 22))
    base.paste(Image.new('RGB', base.size, (90, 3, 6)), (0, 0), sh)
    bbox = mask.getbbox()
    ch = Image.new('RGB', base.size, 0)
    ch.paste(chrome((bbox[2] - bbox[0], bbox[3] - bbox[1])), bbox[:2])
    base.paste(ch, (0, 0), mask)

def mark(draw, x, y, s):
    """紅分子標誌：紅方塊、四個圓圈節點、斜線"""
    draw.rounded_rectangle((x, y, x + s, y + s), radius=s * .075, fill=RED)
    nodes = [(.255, .27), (.69, .27), (.255, .72), (.69, .72)]
    lw = max(2, round(s * .032)); r = (.095 + .063) / 2 * s
    for nx, ny in nodes:
        cx, cy = x + nx * s, y + ny * s
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline='white', width=max(2, round((.095 - .063) * s)))
    def seg(p, q, e1, e2):
        (x1, y1), (x2, y2) = p, q
        L = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5; ux, uy = (x2 - x1) / L, (y2 - y1) / L
        draw.line((x1 + ux * e1, y1 + uy * e1, x2 - ux * e2, y2 - uy * e2), fill='white', width=lw)
    P = lambda a, b: (x + a * s, y + b * s)
    ro = .091 * s
    seg(P(*nodes[0]), P(.6, 0), ro, 0)
    seg(P(*nodes[1]), P(*nodes[2]), ro, ro)
    seg(P(*nodes[3]), P(1, .98), ro, 0)

def shade(img, fn):
    """依位置把畫面壓暗（fn 回傳 0~1 的暗度）"""
    w, h = img.size
    m = Image.new('L', (w, h))
    m.putdata([int(255 * fn(i % w / w, i // w / h)) for i in range(w * h)])
    img.paste(Image.new('RGB', (w, h), (0, 0, 0)), (0, 0), m)

# ---- 橫式 1200×630 ----
wide = cover_crop(Image.open(os.path.join(ROOT, 'work/cover_wide.png')).convert('RGB'), 1200, 630)
shade(wide, lambda u, v: max(0, min(.88, (0.62 - u) * 1.9)))
d = ImageDraw.Draw(wide)
mark(d, 64, 70, 54)
d.text((132, 80), '紅分子 HJAEC', font=font(30, MED), fill=(236, 237, 240))
chrome_text(wide, (58, 150), '水珠', font(150))
chrome_text(wide, (58, 318), '聚一顆', font(150))
d = ImageDraw.Draw(wide)
d.text((66, 520), '鍍膜撥水 × 節奏小遊戲', font=font(30, MED), fill=(245, 200, 202))
d.rectangle((0, 0, 1200, 6), fill=RED)
wide.save(os.path.join(ROOT, 'cover.jpg'), quality=86)

# ---- 直式 1080×1920 ----
tall_src = Image.open(os.path.join(ROOT, 'work/cover_tall.png')).convert('RGB')
cover_crop(tall_src, 720, 1280).save(os.path.join(ROOT, 'assets/cover_tall.jpg'), quality=80)
tall = cover_crop(tall_src, 1080, 1920)
shade(tall, lambda u, v: max(0, min(.9, (0.56 - v) * 2.2)) + max(0, (v - .84) * 3.5) * .8)
d = ImageDraw.Draw(tall)
mark(d, 380, 170, 64)
d.text((460, 182), '紅分子 HJAEC', font=font(34, MED), fill=(236, 237, 240))
f = font(210)
for i, t in enumerate(['水珠', '聚一顆']):
    w = d.textlength(t, font=f)
    chrome_text(tall, ((1080 - w) / 2, 270 + i * 240), t, f)
d = ImageDraw.Draw(tall)
t = '鍍膜撥水 × 節奏小遊戲'; f2 = font(40, MED)
d.text(((1080 - d.textlength(t, font=f2)) / 2, 790), t, font=f2, fill=(255, 225, 226), stroke_width=3, stroke_fill=(20, 0, 2))
t = 'pokemonida99.github.io/hjaec-beads'; f3 = font(30, MED)
d.text(((1080 - d.textlength(t, font=f3)) / 2, 1810), t, font=f3, fill=(220, 220, 224))
tall.save(os.path.join(ROOT, 'cover_story.jpg'), quality=86)
print('ok')

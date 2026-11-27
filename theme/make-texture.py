# Draws the tab-strip texture: a faint current of ASCII characters on the
# frame colour, periodic in x so it tiles seamlessly. Run with python3 and
# Pillow; writes images/frame.png. (Chrome themes take one image per slot at
# normal resolution; the two-resolution form is ignored.)
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf'
BG = (15, 15, 15)  # theme frame, #0f0f0f
W, H = 1200, 120   # 1x tile; width is the period of every wave below
CW, CH = 10, 14    # character cell at 1x

def field(x, y):
    # A few slow waves whose x frequencies divide the tile width, so it repeats.
    t = 2 * math.pi * x / W
    return (math.sin(3 * t + y / 23) + 0.6 * math.sin(7 * t - y / 17 + 1.3) + 0.35 * math.sin(13 * t + y / 9 + 0.4)) / 1.95

def draw(scale):
    img = Image.new('RGB', (W * scale, H * scale), BG)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 11 * scale)
    for row in range(H // CH + 1):
        for col in range(W // CW):
            x, y = col * CW, row * CH
            v = field(x, y)
            if v < 0.25:
                continue
            ch = '.' if v < 0.45 else '·' if v < 0.62 else '-' if v < 0.78 else '~'
            # Brightest at the top of the strip, fading to nothing where the tabs sit.
            fade = max(0.0, 1 - y / H)
            # Small glyphs lose most of their brightness to anti-aliasing at
            # normal resolution, so they're drawn brighter than they end up.
            lift = int((16 + 22 * (v - 0.25)) * fade)
            if lift <= 0:
                continue
            c = tuple(min(255, b + lift) for b in BG)
            d.text((x * scale, y * scale), ch, font=font, fill=c)
    return img

(HERE / 'images').mkdir(exist_ok=True)
draw(1).save(HERE / 'images' / 'frame.png', optimize=True)
print('ok')

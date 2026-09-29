"""Draws the PWA icons into src/public/.

Run from src/:  python scripts/make-icons.py   (needs Pillow)

The committed PNGs are the output; this script is only here so the icons can be
redrawn or recolored. The mark is a hockey puck on the app's slate-900 ground,
in the ice-blue accent (--c-ice-400 / -600 / -800 from index.css).

Two families:
  - "any"      : rounded tile with transparent corners (Android/desktop install).
  - "maskable" : full-bleed square, artwork inside the central 60% so any OS
                 mask (circle, squircle) still shows the whole puck.
  - apple-touch-icon: full-bleed square, no transparency (iOS rounds it itself).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public'
OUT.mkdir(exist_ok=True)

BG = (15, 23, 42)          # slate-900
BG_GLOW = (12, 74, 110)    # ice-900
TOP = (56, 189, 248)       # ice-400
SIDE = (2, 132, 199)       # ice-600
SIDE_DARK = (7, 89, 133)   # ice-800
SHINE = (224, 242, 254)    # ice-100

SS = 4  # supersample factor


def ground(size, rounded):
    """Slate ground with a soft ice-blue glow behind the puck."""
    s = size * SS
    img = Image.new('RGBA', (s, s), BG + (255,))
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(s * 0.42)
    gd.ellipse((s // 2 - r, int(s * 0.52) - r, s // 2 + r, int(s * 0.52) + r), fill=BG_GLOW + (200,))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.12))
    img = Image.alpha_composite(img, glow)
    if rounded:
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s, s), radius=int(s * 0.22), fill=255)
        img.putalpha(mask)
    return img


def puck(img, scale):
    """Draw the puck centered, `scale` = puck width as a fraction of the canvas."""
    s = img.size[0]
    d = ImageDraw.Draw(img)
    w = s * scale
    h = w * 0.30            # ellipse height (top face)
    thick = w * 0.20        # side wall height
    cx = s / 2
    cy = s / 2 - thick / 2  # top face center
    left, right = cx - w / 2, cx + w / 2

    # side wall: bottom ellipse + rectangle body
    bottom_box = (left, cy + thick - h / 2, right, cy + thick + h / 2)
    d.ellipse(bottom_box, fill=SIDE_DARK)
    d.rectangle((left, cy, right, cy + thick), fill=SIDE)
    d.ellipse(bottom_box, fill=SIDE_DARK)
    d.rectangle((left, cy, right, cy + thick), fill=SIDE)
    # re-round the lower lip so the wall reads as a cylinder
    d.pieslice(bottom_box, 0, 180, fill=SIDE)

    # top face
    d.ellipse((left, cy - h / 2, right, cy + h / 2), fill=TOP)
    # inner rim highlight
    inset = w * 0.06
    d.ellipse((left + inset, cy - h / 2 + inset * 0.45, right - inset, cy + h / 2 - inset * 0.45),
              outline=SHINE + (120,), width=max(2, int(s * 0.006)))
    return img


def finish(img, size, name):
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print('wrote', name)


def make(size, name, rounded, scale):
    finish(puck(ground(size, rounded), scale), size, name)


make(192, 'icon-192.png', rounded=True, scale=0.62)
make(512, 'icon-512.png', rounded=True, scale=0.62)
make(512, 'icon-maskable-512.png', rounded=False, scale=0.46)
make(180, 'apple-touch-icon.png', rounded=False, scale=0.60)
make(64, 'favicon-64.png', rounded=True, scale=0.70)

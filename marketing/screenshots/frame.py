"""Wrap a 1320x2868 screenshot in an iPhone Pro-style frame (transparent PNG).

Usage: python3 marketing/screenshots/frame.py <in.png> <out.png>
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor for anti-aliased edges

SCREEN_W, SCREEN_H = 1320, 2868
SCREEN_RADIUS = 186
BEZEL = 34  # black glass border around the display
BAND = 22  # metal band
BUTTON_DEPTH = 9  # how far the buttons stick out
MARGIN = BUTTON_DEPTH + 4

BODY_W = SCREEN_W + 2 * (BEZEL + BAND)
BODY_H = SCREEN_H + 2 * (BEZEL + BAND)
CANVAS_W = BODY_W + 2 * MARGIN
CANVAS_H = BODY_H + 2 * MARGIN

ISLAND_W, ISLAND_H, ISLAND_TOP = 372, 108, 34

# Graphite band: light rim fading to dark inside, then a thin highlight.
BAND_RINGS = [
    (0, (58, 60, 64)),
    (2, (120, 123, 128)),
    (5, (88, 90, 95)),
    (10, (64, 66, 70)),
    (16, (44, 45, 48)),
    (20, (98, 100, 104)),
]


def rrect_mask(size, box, radius):
    w, h = size
    mask = Image.new("L", (w * SS, h * SS), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(mask).rounded_rectangle(
        (x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1), radius * SS, fill=255
    )
    return mask.resize(size, Image.LANCZOS)


def fill(canvas, mask, color):
    canvas.paste(Image.new("RGBA", canvas.size, (*color, 255)), (0, 0), mask)


def main(src, dst):
    shot = Image.open(src).convert("RGBA")
    if shot.size != (SCREEN_W, SCREEN_H):
        sys.exit(f"expected {SCREEN_W}x{SCREEN_H}, got {shot.size}")

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    size = canvas.size
    bx0, by0 = MARGIN, MARGIN
    bx1, by1 = MARGIN + BODY_W, MARGIN + BODY_H
    body_radius = SCREEN_RADIUS + BEZEL + BAND

    # Side buttons (drawn first, the body covers their inner half).
    left = [(560, 640), (770, 940), (990, 1160)]  # action, volume up, volume down
    right = [(860, 1120), (2060, 2240)]  # side button, camera control
    for y0, y1 in left:
        box = (bx0 - BUTTON_DEPTH, by0 + y0, bx0 + 10, by0 + y1)
        fill(canvas, rrect_mask(size, box, 5), (72, 74, 78))
    for y0, y1 in right:
        box = (bx1 - 10, by0 + y0, bx1 + BUTTON_DEPTH, by0 + y1)
        fill(canvas, rrect_mask(size, box, 5), (72, 74, 78))

    # Metal band as concentric rings.
    for inset, color in BAND_RINGS:
        box = (bx0 + inset, by0 + inset, bx1 - inset, by1 - inset)
        fill(canvas, rrect_mask(size, box, body_radius - inset), color)

    # Black glass.
    glass = (bx0 + BAND, by0 + BAND, bx1 - BAND, by1 - BAND)
    fill(canvas, rrect_mask(size, glass, SCREEN_RADIUS + BEZEL), (6, 6, 8))

    # Display.
    sx, sy = bx0 + BAND + BEZEL, by0 + BAND + BEZEL
    screen_mask = rrect_mask(
        size, (sx, sy, sx + SCREEN_W, sy + SCREEN_H), SCREEN_RADIUS
    )
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.paste(shot, (sx, sy))
    canvas.paste(layer, (0, 0), screen_mask)

    # Dynamic Island.
    ix = sx + (SCREEN_W - ISLAND_W) // 2
    iy = sy + ISLAND_TOP
    fill(
        canvas,
        rrect_mask(size, (ix, iy, ix + ISLAND_W, iy + ISLAND_H), ISLAND_H // 2),
        (0, 0, 0),
    )

    # Faint glass reflection along the top-left edge of the bezel.
    sheen = Image.new("L", size, 0)
    ImageDraw.Draw(sheen).rounded_rectangle(glass, SCREEN_RADIUS + BEZEL, outline=40, width=2)
    sheen = sheen.filter(ImageFilter.GaussianBlur(1))
    canvas.paste(Image.new("RGBA", size, (255, 255, 255, 255)), (0, 0), sheen)

    canvas.save(dst, optimize=True)
    print(f"{dst}: {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

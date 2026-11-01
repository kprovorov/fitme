"""Wrap a simulator screenshot in a drawn iPhone Pro-style frame.

Usage: python3 marketing/screenshots/frame.py <in.png> <out.png>
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

SS = 4  # supersampling factor for anti-aliased edges

SCREEN_W, SCREEN_H = 1206, 2622
SCREEN_RADIUS = 170
BEZEL = 31  # black glass border around the display
BAND = 20  # metal band
BUTTON_DEPTH = 8  # how far the buttons stick out
MARGIN = BUTTON_DEPTH + 4

BODY_W = SCREEN_W + 2 * (BEZEL + BAND)
BODY_H = SCREEN_H + 2 * (BEZEL + BAND)
CANVAS_W = BODY_W + 2 * MARGIN
CANVAS_H = BODY_H + 2 * MARGIN

ISLAND_W, ISLAND_H, ISLAND_TOP = 340, 99, 31

# Black band with restrained highlights for separation from the black glass.
BAND_RINGS = [
    (0, (24, 24, 26)),
    (2, (57, 57, 60)),
    (5, (37, 37, 40)),
    (10, (23, 23, 25)),
    (15, (14, 14, 16)),
    (18, (39, 39, 42)),
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
    left = [(512, 585), (704, 859), (905, 1060)]  # action, volume up, volume down
    right = [(786, 1023), (1882, 2047)]  # side button, camera control
    for y0, y1 in left:
        box = (bx0 - BUTTON_DEPTH, by0 + y0, bx0 + 10, by0 + y1)
        fill(canvas, rrect_mask(size, box, 5), (36, 36, 39))
    for y0, y1 in right:
        box = (bx1 - 10, by0 + y0, bx1 + BUTTON_DEPTH, by0 + y1)
        fill(canvas, rrect_mask(size, box, 5), (36, 36, 39))

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

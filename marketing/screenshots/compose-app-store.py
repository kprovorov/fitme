"""Combine caption-only Figma exports with the existing framed captures.

Usage: python3 marketing/screenshots/compose-app-store.py <captions> <framed> <out>
Captions are 01.png through 10.png, exported at 1x with the phone layer hidden.
"""

import pathlib
import sys

from PIL import Image, ImageChops

SCENES = (
    "arnold-generated-plan",
    "workout-log-set",
    "workout-summary-prs",
    "arnold-plan-change",
    "exercise-progress",
    "next-workout",
    "update-plan",
    "exercise-video",
    "history",
    "arnold-model-picker",
)


def compose(captions, framed, out):
    prepared = []
    for position, scene in enumerate(SCENES, start=1):
        name = f"{position:02}.png"
        with Image.open(captions / name) as image:
            canvas = image.convert("RGBA")
        if canvas.size != (1320, 2868):
            sys.exit(f"{name}: expected a 1320x2868 caption export")

        # Refuse an export with a phone still in it: compositing a second phone
        # over that image would hide stale capture pixels behind its bezel.
        area = canvas.crop((0, 820, 1320, 2868))
        empty = Image.new("RGBA", area.size, area.getpixel((0, 0)))
        if ImageChops.difference(area, empty).convert("RGB").getbbox():
            sys.exit(f"{name}: hide the Figma phone layer before exporting")

        with Image.open(framed / f"{scene}.png") as image:
            phone = image.convert("RGBA")
        if phone.size != (1332, 2748):
            sys.exit(f"{scene}: expected a 1332x2748 framed capture")
        # The existing App Store layout: 962px phone, centered at x=179, y=820.
        # Only the framed export is scaled; the native capture is never resized.
        phone = phone.resize((962, 1985), Image.Resampling.LANCZOS)
        canvas.alpha_composite(phone, (179, 820))
        flattened = Image.new("RGB", canvas.size, (0, 0, 0))
        flattened.paste(canvas, mask=canvas.getchannel("A"))
        prepared.append((name, flattened))

    out.mkdir(parents=True, exist_ok=True)
    for name, image in prepared:
        image.save(out / name, optimize=True)
        print(out / name)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    compose(*(pathlib.Path(argument) for argument in sys.argv[1:]))

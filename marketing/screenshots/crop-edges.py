"""Crop the four edges of each App Store screenshot, to review its framing.

The check in scripts/app-store-screenshots.mjs proves an image's size and that
it decodes, never what it shows: a screen sitting outside its drawn phone
passes it. A whole 1320x2868 export is downscaled by anything that reads it,
which is how the misaligned #458 sets got through, so each edge is cut into
tiles short enough to be looked at magnified.

Usage: python3 marketing/screenshots/crop-edges.py [--out <dir>] [--band <px>] [--tile <px>] <image.png>...
"""

import argparse
import math
import pathlib
import tempfile

from PIL import Image

DEFAULT_BAND = 400  # how deep into the image each edge crop reaches: the phone
# is inset by roughly 180 px in a 1320x2868 export, so a shallower band catches
# only background and the outer bezel, never the screen edge that can overflow.
DEFAULT_TILE = 1000  # longest edge of a tile, so a reader magnifies it

EDGES = ("top", "bottom", "left", "right")


def crop_name(path: pathlib.Path) -> str:
    """A crop basename that stays unique across device and Listing locale folders."""
    resolved = path.resolve()
    device, locale = resolved.parent.parent.name, resolved.parent.name
    return "-".join(part for part in (device, locale, path.stem) if part)


def edge_boxes(width: int, height: int, band: int) -> "dict[str, tuple[int, int, int, int]]":
    """The four edge bands, each clamped to the axis it reaches along."""
    down = min(band, height)
    across = min(band, width)
    return {
        "top": (0, 0, width, down),
        "bottom": (0, height - down, width, height),
        "left": (0, 0, across, height),
        "right": (width - across, 0, width, height),
    }


def tiles(box: "tuple[int, int, int, int]", tile: int) -> "list[tuple[int, int, int, int]]":
    """Split a band along its longer axis into tiles of at most `tile` px."""
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    horizontal = width >= height
    length = width if horizontal else height
    count = max(1, math.ceil(length / tile))
    step = math.ceil(length / count)

    cut = []
    for index in range(count):
        start = index * step
        end = min(start + step, length)
        if start >= end:
            break
        if horizontal:
            cut.append((left + start, top, left + end, bottom))
        else:
            cut.append((left, top + start, right, top + end))
    return cut


def crop_edges(
    path: pathlib.Path, out_dir: pathlib.Path, band: int, tile: int
) -> "list[pathlib.Path]":
    """Write the edge tiles of `path` into `out_dir` and return their paths."""
    name = crop_name(path)
    written = []
    with Image.open(path) as image:
        boxes = edge_boxes(image.width, image.height, band)
        for edge in EDGES:
            cut = tiles(boxes[edge], tile)
            for index, box in enumerate(cut, start=1):
                suffix = f"{edge}-{index}" if len(cut) > 1 else edge
                target = out_dir / f"{name}-{suffix}.png"
                image.crop(box).save(target)
                written.append(target)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", type=pathlib.Path)
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        help="directory for the crops (default: a new temporary directory)",
    )
    parser.add_argument(
        "--band",
        type=int,
        default=DEFAULT_BAND,
        help=f"how deep into the image each edge reaches, in pixels (default {DEFAULT_BAND})",
    )
    parser.add_argument(
        "--tile",
        type=int,
        default=DEFAULT_TILE,
        help=f"longest edge of one tile, in pixels (default {DEFAULT_TILE})",
    )
    args = parser.parse_args()

    for name in ("band", "tile"):
        if getattr(args, name) < 1:
            parser.error(f"--{name} must be at least 1")

    out_dir = args.out or pathlib.Path(tempfile.mkdtemp(prefix="app-store-edges-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    for image in args.images:
        for crop in crop_edges(image, out_dir, args.band, args.tile):
            print(crop)


if __name__ == "__main__":
    main()

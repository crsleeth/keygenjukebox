#!/usr/bin/env python3
"""Render the pixel-art cover and icons into site/img/ (no dependencies).

    python3 tools/make-cover.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "img"

GREEN = (31, 254, 7)
DARK = (40, 40, 41)
RAY = (45, 45, 45)

# The mascot on a 25x16 grid, as (x, y, width, height) blocks.
MASCOT = [
    (8, 0, 9, 2),                                    # headband
    (6, 2, 2, 2), (17, 2, 2, 2),
    (4, 4, 2, 12), (19, 4, 2, 12),                   # ear cups
    (2, 6, 2, 8), (21, 6, 2, 8),
    (0, 8, 2, 4), (23, 8, 2, 4),
    (7, 9, 1, 1), (17, 9, 1, 1),                     # eyes
    (7, 12, 11, 1), (7, 13, 1, 2), (17, 13, 1, 2),   # mouth
    (8, 15, 9, 1),
]
GRID_W, GRID_H = 25, 16


def box_blur(rows, radius):
    """One horizontal + vertical box blur pass using running sums."""
    size = len(rows)
    span = 2 * radius + 1
    for _ in range(2):
        blurred = []
        for row in rows:
            padded = [0.0] * radius + row + [0.0] * radius
            total = sum(padded[:span])
            out = [total / span]
            for i in range(1, size):
                total += padded[i + span - 1] - padded[i - 1]
                out.append(total / span)
            blurred.append(out)
        rows = [list(col) for col in zip(*blurred)]  # transpose; twice = back to normal
    return rows


def render(size, unit, rays=True, glow=0.5, corner=0):
    """Return rows of RGBA pixels. `unit` is the size of one mascot pixel."""
    left = (size - GRID_W * unit) // 2
    top = (size - GRID_H * unit) // 2
    mask = [[0.0] * size for _ in range(size)]
    for x, y, w, h in MASCOT:
        for py in range(top + y * unit, top + (y + h) * unit):
            mask[py][left + x * unit:left + (x + w) * unit] = [1.0] * (w * unit)

    halo = mask
    if glow:
        # Three box blurs are a close match for a Gaussian of this sigma.
        sigma = 18 * size / 400
        radius = max(1, round((math.sqrt(12 * sigma * sigma / 3 + 1) - 1) / 2))
        for _ in range(3):
            halo = box_blur(halo, radius)

    centre = size / 2
    samples = [(i + 0.5) / 3 for i in range(3)]
    pixels = []
    for py in range(size):
        row = []
        for px in range(size):
            if mask[py][px]:
                rgb = GREEN
            else:
                # 16 rays, antialiased by supersampling the wedge edges.
                lit = 0
                if rays:
                    for sy in samples:
                        for sx in samples:
                            angle = math.degrees(math.atan2(py + sy - centre, px + sx - centre))
                            lit += (angle - 4) % 22.5 < 11.25
                # The rays fade out towards the middle so the face stays clean.
                reach = (math.hypot(px + 0.5 - centre, py + 0.5 - centre) * 400 / size - 40) / 70
                reach = min(1.0, max(0.0, reach))
                shade = lit / 9 * reach * reach * (3 - 2 * reach)
                amount = halo[py][px] * glow if glow else 0
                rgb = []
                for dark, ray, green in zip(DARK, RAY, GREEN):
                    base = (dark + (ray - dark) * shade) / 255
                    rgb.append(round(255 * (1 - (1 - base) * (1 - amount * green / 255))))  # screen blend
            alpha = 255
            if corner:
                # Rounded corners, antialiased the same way.
                inside = 0
                for sy in samples:
                    for sx in samples:
                        dx = max(corner - (px + sx), (px + sx) - (size - corner), 0)
                        dy = max(corner - (py + sy), (py + sy) - (size - corner), 0)
                        inside += dx * dx + dy * dy <= corner * corner
                alpha = round(255 * inside / 9)
            row.append((*rgb, alpha))
        pixels.append(row)
    return pixels


def write_png(path, pixels):
    size = len(pixels)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in pixels)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    print(f"wrote {path.relative_to(OUT.parent.parent)} ({size}x{size})")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "cover.png", render(512, 12))
    write_png(OUT / "icon-180.png", render(180, 5))
    write_png(OUT / "icon-64.png", render(64, 2, rays=False, glow=0, corner=12))

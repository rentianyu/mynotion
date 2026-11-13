#!/usr/bin/env python3
"""生成 MyNotion 桌面版图标（圆角方块 + 几何 N），输出 Tauri 需要的多尺寸 PNG 与 .ico。"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons")
SS = 4  # 超采样倍数


def glyph(size: int) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(s * 0.055)
    radius = int(s * 0.22)
    d.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        fill=(251, 251, 250, 255),
        outline=(31, 31, 31, 255),
        width=max(2, int(s * 0.022)),
    )

    # N 的几何轮廓：盒子 0.52 宽 × 0.58 高，居中
    box_w, box_h = int(s * 0.50), int(s * 0.56)
    x0, y0 = (s - box_w) // 2, (s - box_h) // 2
    x1, y1 = x0 + box_w, y0 + box_h
    stem = int(box_w * 0.20)
    ink = (31, 31, 31, 255)

    d.polygon(
        [(x0, y1), (x0 + stem, y1), (x0 + stem, y0), (x0, y0)], fill=ink
    )
    d.polygon(
        [(x1 - stem, y1), (x1, y1), (x1, y0), (x1 - stem, y0)], fill=ink
    )
    d.line(
        [(x0 + stem // 2, y0 + stem // 2), (x1 - stem // 2, y1 - stem // 2)],
        fill=ink,
        width=int(stem * 1.02),
    )
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    big = glyph(1024)
    big.save(os.path.join(OUT, "icon.png"))
    for name, size in [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon-256.png", 256),
    ]:
        glyph(size).save(os.path.join(OUT, name))
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    big.save(os.path.join(OUT, "icon.ico"), sizes=ico_sizes)
    print("icons:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / "previews" / "enhanced-v1"

BACKGROUND = (5, 14, 23)
HEADER = (9, 29, 43)
BORDER = (38, 68, 84)
TEXT = (226, 237, 243)
MUTED = (139, 163, 177)
ACCENT = (35, 196, 173)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


TITLE = load_font(38, bold=True)
SUBTITLE = load_font(18)
LABEL = load_font(22, bold=True)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    source = image.convert("RGB")
    source.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, BACKGROUND)
    canvas.paste(source, ((size[0] - source.width) // 2, (size[1] - source.height) // 2))
    return canvas


def main() -> None:
    entries = [
        ("01  完整正常状态", "01_full_normal.png"),
        ("02  联轴器防护罩显示", "02_coupling_guard_visible.png"),
        ("03  联轴器防护罩隐藏", "03_coupling_guard_hidden.png"),
        ("04  机壳透明", "04_casing_transparent.png"),
        ("05  叶轮高亮", "05_impeller_highlight.png"),
        ("06  驱动端轴承高亮", "06_drive_bearing_highlight.png"),
        ("07  联轴器与主轴高亮", "07_coupling_shaft_highlight.png"),
        ("08  全节点着色", "08_all_nodes_colored.png"),
        ("09  旋转轴线验证", "09_rotation_axis_validation.png"),
        ("10  GLB重新导入完整模型", "10_reimported_full_model.png"),
    ]
    missing = [filename for _, filename in entries if not (PREVIEW_DIR / filename).exists()]
    if missing:
        raise FileNotFoundError(f"缺少验证预览: {missing}")
    width, height = 1800, 2860
    canvas = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, width, 112), fill=HEADER)
    draw.rectangle((0, 0, 9, 112), fill=ACCENT)
    draw.text((30, 17), "引风机增强版 v1 · 正式GLB离线验证", fill=TEXT, font=TITLE)
    draw.text((32, 70), "无Draco · 16/16关键节点 · glTF extras保留 · 尚未替换网站模型", fill=MUTED, font=SUBTITLE)

    tile_width, tile_height = 855, 520
    for index, (label, filename) in enumerate(entries):
        column = index % 2
        row = index // 2
        x = 25 + column * 890
        y = 135 + row * 540
        tile = contain(Image.open(PREVIEW_DIR / filename), (tile_width, tile_height))
        canvas.paste(tile, (x, y))
        draw.rectangle((x, y, x + tile_width, y + 48), fill=HEADER)
        draw.rectangle((x, y, x + 6, y + 48), fill=ACCENT)
        draw.text((x + 18, y + 8), label, fill=TEXT, font=LABEL)
        draw.rectangle((x, y, x + tile_width, y + tile_height), outline=BORDER, width=2)
    output = PREVIEW_DIR / "final_validation_montage.png"
    canvas.save(output)
    print(output)


if __name__ == "__main__":
    main()

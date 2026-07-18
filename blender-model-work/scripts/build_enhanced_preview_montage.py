from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / "previews" / "enhanced-model"
RAW_DIR = PREVIEW_DIR / "raw"

BACKGROUND = (7, 17, 27)
PANEL = (12, 28, 42)
TEXT = (225, 234, 240)
MUTED = (143, 163, 178)
ACCENT = (40, 198, 172)
ORANGE = (255, 112, 32)
RED = (239, 68, 68)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


FONT_TITLE = font(34, bold=True)
FONT_SUBTITLE = font(22)
FONT_CARD = font(26, bold=True)
FONT_BODY = font(19)
FONT_SMALL = font(16)


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, BACKGROUND)
    offset = ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2)
    canvas.paste(copy, offset)
    return canvas


def header(canvas: Image.Image, title: str, subtitle: str, accent: tuple[int, int, int] = ACCENT) -> None:
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, canvas.width, 92), fill=PANEL)
    draw.rectangle((0, 0, 8, 92), fill=accent)
    draw.text((28, 14), title, fill=TEXT, font=FONT_TITLE)
    draw.text((30, 57), subtitle, fill=MUTED, font=FONT_SMALL)


def build_comparison() -> None:
    left = contain(Image.open(RAW_DIR / "01_original.png"), (790, 850))
    right = contain(Image.open(RAW_DIR / "01_enhanced.png"), (790, 850))
    canvas = Image.new("RGB", (1600, 1000), BACKGROUND)
    header(canvas, "原模型与语义增强模型对比", "原始27个Mesh全部保留；右侧仅增加低面数传动系统和语义定位节点")
    canvas.paste(left, (5, 130))
    canvas.paste(right, (805, 130))
    draw = ImageDraw.Draw(canvas)
    draw.line((800, 125, 800, 980), fill=(45, 65, 80), width=2)
    draw.rounded_rectangle((28, 112, 226, 158), radius=8, fill=(25, 40, 52), outline=(61, 79, 91))
    draw.text((48, 121), "原始输入模型", fill=TEXT, font=FONT_BODY)
    draw.rounded_rectangle((828, 112, 1125, 158), radius=8, fill=(14, 64, 67), outline=ACCENT)
    draw.text((848, 121), "轻量化语义增强预览", fill=TEXT, font=FONT_BODY)
    canvas.save(PREVIEW_DIR / "01_original_vs_enhanced.png")


def build_fault_overview() -> None:
    items = [
        ("正常运行", RAW_DIR / "fault_normal.png", ACCENT, "基础装配与运行状态"),
        ("叶轮不平衡", RAW_DIR / "fault_impeller.png", ORANGE, "叶轮候选高亮与旋转联动"),
        ("轴承温升", RAW_DIR / "fault_bearing.png", RED, "驱动端轴承座与语义定位环"),
        ("联轴器不对中", RAW_DIR / "fault_coupling.png", RED, "联轴器高亮与轴线偏差表达"),
    ]
    canvas = Image.new("RGB", (1600, 1000), BACKGROUND)
    header(canvas, "四种故障场景语义总览", "用于比赛原型的定位、高亮、剖视和动画联动，不代表厂家精确机械结构")
    draw = ImageDraw.Draw(canvas)
    tile_width, tile_height = 770, 410
    for index, (title, path, accent, subtitle) in enumerate(items):
        column = index % 2
        row = index // 2
        x = 20 + column * 790
        y = 112 + row * 430
        tile = contain(Image.open(path), (tile_width, tile_height))
        canvas.paste(tile, (x, y))
        draw.rectangle((x, y, x + tile_width, y + 48), fill=(10, 25, 38))
        draw.rectangle((x, y, x + 6, y + 48), fill=accent)
        draw.text((x + 20, y + 8), title, fill=TEXT, font=FONT_CARD)
        draw.text((x + 220, y + 15), subtitle, fill=MUTED, font=FONT_SMALL)
        draw.rectangle((x, y, x + tile_width, y + tile_height), outline=(38, 61, 76), width=2)
    canvas.save(PREVIEW_DIR / "08_fault_scenarios_overview.png")


def build_hierarchy() -> None:
    base = contain(Image.open(RAW_DIR / "09_hierarchy_base.png"), (970, 900))
    canvas = Image.new("RGB", (1600, 1000), BACKGROUND)
    header(canvas, "增强模型节点层级", "现有Mesh按候选语义分组；新增节点使用唯一英文名称，推测名称不写回原对象")
    canvas.paste(base, (610, 95))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((18, 112, 600, 980), radius=10, fill=PANEL, outline=(39, 65, 80), width=2)
    lines = [
        ("Fan_Digital_Twin", 0, ACCENT, True),
        ("EXISTING_CASING", 1, TEXT, True),
        ("casing_group → SHELL, SHELL002", 2, MUTED, False),
        ("EXISTING_IMPELLER", 1, TEXT, True),
        ("impeller_group → SHELL001, SHELL008", 2, MUTED, False),
        ("EXISTING_INTERNAL_PARTS", 1, TEXT, True),
        ("SHELL003—SHELL025（已确认候选）", 2, MUTED, False),
        ("ADDED_DRIVE_SYSTEM", 1, TEXT, True),
        ("motor / motor_shaft", 2, MUTED, False),
        ("coupling_input / element / output", 2, MUTED, False),
        ("main_shaft / bearing housings / drive_base", 2, MUTED, False),
        ("SEMANTIC_LOCATORS", 1, TEXT, True),
        ("bearing_drive_locator", 2, ORANGE, False),
        ("bearing_non_drive_locator / rotation_axis", 2, ORANGE, False),
        ("UNRESOLVED_PARTS", 1, TEXT, True),
        ("Cube（保持未解析）", 2, MUTED, False),
    ]
    y = 142
    for label, indent, color, bold in lines:
        x = 40 + indent * 28
        if indent:
            draw.line((x - 16, y + 12, x - 4, y + 12), fill=(53, 78, 91), width=2)
        draw.text((x, y), label, fill=color, font=FONT_BODY if bold else FONT_SMALL)
        y += 48 if indent <= 1 else 39
    canvas.save(PREVIEW_DIR / "09_node_hierarchy.png")


def build_montage() -> None:
    entries = [
        ("01  原始 / 增强对比", "01_original_vs_enhanced.png"),
        ("02  完整装配等轴测", "02_full_assembly_isometric.png"),
        ("03  机壳半透明", "03_casing_transparent.png"),
        ("04  叶轮高亮", "04_impeller_highlight.png"),
        ("05  驱动端轴承高亮", "05_drive_bearing_highlight.png"),
        ("06  联轴器与主轴高亮", "06_coupling_shaft_highlight.png"),
        ("07  电机与传动系统", "07_drive_system_only.png"),
        ("08  四种故障场景", "08_fault_scenarios_overview.png"),
        ("09  节点层级", "09_node_hierarchy.png"),
        ("10  旋转轴线校验", "10_rotation_axis_validation.png"),
    ]
    tile_size = (760, 475)
    canvas = Image.new("RGB", (1600, 2570), BACKGROUND)
    header(canvas, "引风机轻量化语义数字孪生增强版", "Blender分析预览 · 未导出正式GLB · 未替换网站模型")
    draw = ImageDraw.Draw(canvas)
    for index, (title, filename) in enumerate(entries):
        column = index % 2
        row = index // 2
        x = 25 + column * 790
        y = 115 + row * 490
        tile = contain(Image.open(PREVIEW_DIR / filename), tile_size)
        canvas.paste(tile, (x, y))
        draw.rectangle((x, y, x + tile_size[0], y + 40), fill=(9, 25, 38))
        draw.text((x + 16, y + 8), title, fill=TEXT, font=FONT_BODY)
        draw.rectangle((x, y, x + tile_size[0], y + tile_size[1]), outline=(36, 61, 77), width=2)
    canvas.save(PREVIEW_DIR / "enhanced_model_montage.png")


def main() -> None:
    build_comparison()
    build_fault_overview()
    build_hierarchy()
    build_montage()
    outputs = [
        PREVIEW_DIR / "01_original_vs_enhanced.png",
        PREVIEW_DIR / "08_fault_scenarios_overview.png",
        PREVIEW_DIR / "09_node_hierarchy.png",
        PREVIEW_DIR / "enhanced_model_montage.png",
    ]
    print("\n".join(str(path) for path in outputs))


if __name__ == "__main__":
    main()

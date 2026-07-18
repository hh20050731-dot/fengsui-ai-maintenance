"""为 Blender 隔离渲染添加文字、局部放大图，生成联系表与离线 HTML 索引。"""

from __future__ import annotations

import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / "previews"
ISOLATION_DIR = PREVIEW_DIR / "object-isolation"
DETAIL_DIR = ISOLATION_DIR / "_detail"
IDENTIFICATION = ROOT / "reports" / "object_identification.json"
FONT_PATH = Path("C:/Windows/Fonts/msyh.ttc")


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    return ImageFont.truetype(str(FONT_PATH), size) if FONT_PATH.is_file() else ImageFont.load_default()


def annotate_images(objects: list[dict]) -> None:
    title_font = font(30)
    body_font = font(21)
    small_font = font(18)
    for index, item in enumerate(objects, 1):
        name = item["originalName"]
        path = ISOLATION_DIR / f"{index:03d}_{name}.png"
        detail_path = DETAIL_DIR / f"{index:03d}_{name}.png"
        image = Image.open(path).convert("RGBA")
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.rounded_rectangle((24, 22, 675, 178), radius=12, fill=(6, 14, 24, 222), outline=(63, 224, 183, 210), width=2)
        metrics = item["metrics"]
        dimensions = " × ".join(f"{value:.3f}" for value in metrics["dimensions"])
        draw.text((45, 37), f"对象：{name}", font=title_font, fill=(235, 248, 250, 255))
        draw.text((45, 84), f"顶点：{metrics['vertexCount']:,}    三角面：{metrics['triangleCount']:,}", font=body_font, fill=(196, 218, 224, 255))
        draw.text((45, 123), f"包围盒尺寸：{dimensions}", font=body_font, fill=(196, 218, 224, 255))
        image = Image.alpha_composite(image, overlay)

        if detail_path.is_file():
            detail = Image.open(detail_path).convert("RGB")
            detail.thumbnail((420, 270), Image.Resampling.LANCZOS)
            inset_width, inset_height = detail.size
            inset_x = image.width - inset_width - 34
            inset_y = image.height - inset_height - 34
            framed = Image.new("RGBA", (inset_width + 12, inset_height + 44), (7, 15, 24, 242))
            framed_draw = ImageDraw.Draw(framed)
            framed_draw.rectangle((5, 37, inset_width + 6, inset_height + 38), outline=(255, 141, 52, 255), width=3)
            framed_draw.text((12, 7), "局部放大（保持空间参照）", font=small_font, fill=(255, 220, 188, 255))
            framed.paste(detail, (6, 38))
            image.alpha_composite(framed, (inset_x - 6, inset_y - 38))
        image.convert("RGB").save(path, quality=96)


def contact_sheets(objects: list[dict]) -> list[Path]:
    sheet_paths: list[Path] = []
    tile_width, tile_height = 600, 400
    for page_index in range(3):
        page_objects = objects[page_index * 9:(page_index + 1) * 9]
        canvas = Image.new("RGB", (tile_width * 3, tile_height * 3), (8, 15, 24))
        for slot, item in enumerate(page_objects):
            index = page_index * 9 + slot + 1
            image = Image.open(ISOLATION_DIR / f"{index:03d}_{item['originalName']}.png").convert("RGB")
            image = image.resize((tile_width, tile_height), Image.Resampling.LANCZOS)
            canvas.paste(image, ((slot % 3) * tile_width, (slot // 3) * tile_height))
        path = PREVIEW_DIR / f"object_contact_sheet_{page_index + 1:02d}.png"
        canvas.save(path, quality=96)
        sheet_paths.append(path)
    return sheet_paths


def write_html(objects: list[dict]) -> Path:
    cards = []
    for index, item in enumerate(objects, 1):
        filename = f"{index:03d}_{item['originalName']}.png"
        cards.append(f"""
        <a class="card" href="object-isolation/{html.escape(filename)}" target="_blank" rel="noopener">
          <img src="object-isolation/{html.escape(filename)}" alt="{html.escape(item['originalName'])}">
          <div><strong>{index:03d} · {html.escape(item['originalName'])}</strong><span>{html.escape(item['candidateCategory'])} · {item['confidence']:.0%}</span></div>
        </a>""")
    document = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>引风机对象隔离识别图册</title><style>
body{{margin:0;background:#0a111b;color:#dce8ec;font-family:'Microsoft YaHei',sans-serif}}main{{max-width:1500px;margin:auto;padding:32px}}
h1{{font-size:28px;margin:0 0 8px}}p{{color:#91a6af;margin:0 0 28px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}}
.card{{display:block;color:inherit;text-decoration:none;background:#111d29;border:1px solid #263847;border-radius:6px;overflow:hidden}}.card:hover{{border-color:#36d9b0}}
.card img{{display:block;width:100%;aspect-ratio:3/2;object-fit:cover}}.card div{{display:flex;justify-content:space-between;gap:12px;padding:13px 15px}}.card span{{color:#8ea6af}}
</style></head><body><main><h1>引风机对象隔离识别图册</h1><p>共27个Mesh。点击缩略图查看1200×800原图；候选分类仅供人工复核，不写回模型。</p><div class="grid">{''.join(cards)}</div></main></body></html>"""
    path = PREVIEW_DIR / "object_catalog.html"
    path.write_text(document, encoding="utf-8")
    return path


def main() -> None:
    payload = json.loads(IDENTIFICATION.read_text(encoding="utf-8"))
    objects = payload["objects"]
    if len(objects) != 27:
        raise RuntimeError(f"预期27个对象，实际{len(objects)}个")
    annotate_images(objects)
    sheets = contact_sheets(objects)
    html_path = write_html(objects)
    print(json.dumps({"annotated": len(objects), "contactSheets": [str(path) for path in sheets], "html": str(html_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

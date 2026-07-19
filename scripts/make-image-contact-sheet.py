from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--thumb-width", type=int, default=360)
    args = parser.parse_args()
    images = [Image.open(path).convert("RGB") for path in args.inputs]
    margin = 18
    label_height = 28
    rendered = []
    for source, path in zip(images, args.inputs):
        height = round(source.height * args.thumb_width / source.width)
        thumb = source.resize((args.thumb_width, height), Image.Resampling.LANCZOS)
        rendered.append((thumb, Path(path).name))
    cell_height = max(image.height for image, _ in rendered) + label_height
    rows = (len(rendered) + args.columns - 1) // args.columns
    sheet = Image.new("RGB", (margin + args.columns * (args.thumb_width + margin), margin + rows * (cell_height + margin)), "#e8edf2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (image, label) in enumerate(rendered):
        col = index % args.columns
        row = index // args.columns
        x = margin + col * (args.thumb_width + margin)
        y = margin + row * (cell_height + margin)
        sheet.paste(image, (x, y))
        draw.text((x, y + image.height + 7), label, fill="#1f2937", font=font)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=92)
    print(output.resolve())


if __name__ == "__main__":
    main()

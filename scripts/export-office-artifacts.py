from __future__ import annotations

import argparse
from pathlib import Path

import win32com.client


def export_docx(source: Path, target: Path) -> None:
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    document = None
    try:
        document = word.Documents.Open(str(source.resolve()), ReadOnly=True)
        document.ExportAsFixedFormat(str(target.resolve()), 17)
    finally:
        if document is not None:
            document.Close(False)
        word.Quit()


def export_pptx(source: Path, target: Path) -> None:
    powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
    presentation = None
    try:
        presentation = powerpoint.Presentations.Open(str(source.resolve()), WithWindow=False)
        presentation.SaveAs(str(target.resolve()), 32)
    finally:
        if presentation is not None:
            presentation.Close()
        powerpoint.Quit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["docx", "pptx"])
    parser.add_argument("source")
    parser.add_argument("target")
    args = parser.parse_args()
    source = Path(args.source)
    target = Path(args.target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if args.kind == "docx":
        export_docx(source, target)
    else:
        export_pptx(source, target)
    print(target.resolve())


if __name__ == "__main__":
    main()

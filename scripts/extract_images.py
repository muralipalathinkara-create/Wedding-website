#!/usr/bin/env python3
"""One-time: extract base64 data-URI images from index.html into images/.

Dedupes by content hash; names by first-occurrence order. Rewrites index.html
in place to reference images/<name>. Self-checks that each written file
re-encodes to the exact original base64 (lossless round-trip).
"""
import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
IMG_DIR = ROOT / "images"

# Names assigned to unique blobs in first-occurrence order.
NAMES = ["logo", "hero", "sunset", "ring", "proposal", "seated"]

PATTERN = re.compile(r'data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)')


def main() -> int:
    html = HTML.read_text(encoding="utf-8")
    IMG_DIR.mkdir(exist_ok=True)

    hash_to_path: dict[str, str] = {}
    order: list[str] = []

    def replace(m: re.Match) -> str:
        ext = "jpg" if m.group(1) in ("jpeg", "jpg") else "png"
        data = m.group(2)
        h = hashlib.md5(data.encode()).hexdigest()
        if h not in hash_to_path:
            if len(order) >= len(NAMES):
                raise SystemExit(f"More unique images ({len(order)+1}) than names ({len(NAMES)})")
            name = f"{NAMES[len(order)]}.{ext}"
            raw = base64.b64decode(data)
            (IMG_DIR / name).write_bytes(raw)
            # Lossless round-trip self-check.
            if base64.b64encode(raw).decode() != data:
                raise SystemExit(f"Round-trip mismatch for {name}")
            hash_to_path[h] = f"images/{name}"
            order.append(name)
        return hash_to_path[h]

    new_html = PATTERN.sub(replace, html)
    HTML.write_text(new_html, encoding="utf-8")
    print(f"Extracted {len(order)} unique images: {order}")
    print(f"Remaining data:image URIs: {len(PATTERN.findall(new_html))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

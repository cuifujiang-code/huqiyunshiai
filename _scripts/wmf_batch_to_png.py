#!/usr/bin/env python3
"""批量 WMF/EMF → PNG base64（stdin/stdout JSON）"""
import base64
import json
import os
import sys
import tempfile

def convert_one(raw: bytes) -> str | None:
    try:
        from PIL import Image
    except ImportError:
        sys.stderr.write('Pillow not installed\n')
        sys.exit(2)
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.wmf', delete=False) as f:
            f.write(raw)
            path = f.name
        img = Image.open(path)
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii')
    except Exception:
        return None
    finally:
        if path and os.path.exists(path):
            os.unlink(path)

def main():
    payload = json.load(sys.stdin)
    items = payload if isinstance(payload, list) else payload.get('items', [])
    out = []
    for item in items:
        idx = item.get('i', len(out))
        b64 = item.get('b64', '')
        if not b64:
            out.append({'i': idx, 'png': None})
            continue
        try:
            raw = base64.b64decode(b64)
        except Exception:
            out.append({'i': idx, 'png': None})
            continue
        png = convert_one(raw)
        out.append({'i': idx, 'png': png})
    json.dump(out, sys.stdout)

if __name__ == '__main__':
    main()

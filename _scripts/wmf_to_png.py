#!/usr/bin/env python3
"""WMF/EMF → PNG stdout（供 Node 脚本调用）"""
import sys
from io import BytesIO

def main():
    if len(sys.argv) < 2:
        sys.stderr.write('usage: wmf_to_png.py <input.wmf>\n')
        sys.exit(1)
    path = sys.argv[1]
    try:
        from PIL import Image
    except ImportError:
        sys.stderr.write('Pillow not installed\n')
        sys.exit(2)
    try:
        img = Image.open(path)
        buf = BytesIO()
        img.save(buf, format='PNG')
        sys.stdout.buffer.write(buf.getvalue())
    except Exception as e:
        sys.stderr.write(str(e) + '\n')
        sys.exit(3)

if __name__ == '__main__':
    main()
